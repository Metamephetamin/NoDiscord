using System.Net;
using System.Net.Sockets;
using MailKit.Net.Smtp;
using MailKit.Security;
using Microsoft.Extensions.Options;
using MimeKit;

namespace BackNoDiscord.Services;

public interface IEmailVerificationSender
{
    Task SendVerificationCodeAsync(string email, string verificationCode, DateTimeOffset expiresAt, CancellationToken cancellationToken = default);
}

public sealed class EmailDeliveryException : Exception
{
    public EmailDeliveryException(string message, Exception? innerException = null)
        : base(message, innerException)
    {
    }
}

public sealed class EmailOptions
{
    public string Mode { get; set; } = "smtp";
    public string FromAddress { get; set; } = string.Empty;
    public string FromName { get; set; } = "MAX";
    public EmailSmtpOptions Smtp { get; set; } = new();
}

public sealed class EmailSmtpOptions
{
    public string Host { get; set; } = string.Empty;
    public int Port { get; set; } = 587;
    public string Username { get; set; } = string.Empty;
    public string Password { get; set; } = string.Empty;
    public bool EnableSsl { get; set; } = true;
}

public sealed class SmtpEmailVerificationSender : IEmailVerificationSender
{
    private readonly IOptionsMonitor<EmailOptions> _optionsMonitor;
    private readonly ILogger<SmtpEmailVerificationSender> _logger;

    public SmtpEmailVerificationSender(IOptionsMonitor<EmailOptions> optionsMonitor, ILogger<SmtpEmailVerificationSender> logger)
    {
        _optionsMonitor = optionsMonitor;
        _logger = logger;
    }

    public async Task SendVerificationCodeAsync(string email, string verificationCode, DateTimeOffset expiresAt, CancellationToken cancellationToken = default)
    {
        var options = _optionsMonitor.CurrentValue;
        var deliveryMode = (options.Mode ?? string.Empty).Trim().ToLowerInvariant();

        if (string.Equals(deliveryMode, "mock", StringComparison.OrdinalIgnoreCase))
        {
            _logger.LogInformation(
                "Email verification code for {Email}: {VerificationCode}. Expires at {ExpiresAt}.",
                email,
                verificationCode,
                expiresAt);
            return;
        }

        if (!string.Equals(deliveryMode, "smtp", StringComparison.OrdinalIgnoreCase))
        {
            throw new EmailDeliveryException($"Unsupported email delivery mode: {options.Mode}.");
        }

        if (string.IsNullOrWhiteSpace(options.FromAddress))
        {
            throw new EmailDeliveryException("Email:FromAddress is not configured.");
        }

        if (string.IsNullOrWhiteSpace(options.Smtp.Host))
        {
            throw new EmailDeliveryException("Email:Smtp:Host is not configured.");
        }

        if (options.Smtp.Port <= 0)
        {
            throw new EmailDeliveryException("Email:Smtp:Port must be greater than zero.");
        }

        var subject = "Подтверждение почты MAX";
        var expiresLocal = expiresAt.ToLocalTime().ToString("HH:mm");
        var plainTextBody =
            $"Код подтверждения MAX: {verificationCode}{Environment.NewLine}{Environment.NewLine}" +
            $"Введите этот код в приложении, чтобы подтвердить адрес почты.{Environment.NewLine}" +
            $"Код действует до {expiresLocal}.{Environment.NewLine}{Environment.NewLine}" +
            "Если вы не запрашивали этот код, просто проигнорируйте письмо.";

        var htmlBody = $"""
            <div style="font-family:Arial,sans-serif;background:#0f1117;color:#f3f5ff;padding:24px;">
              <div style="max-width:520px;margin:0 auto;background:#171b24;border-radius:18px;padding:28px;border:1px solid rgba(255,255,255,0.08);">
                <div style="font-size:12px;letter-spacing:0.14em;text-transform:uppercase;color:#9ea7bb;margin-bottom:16px;">MAX</div>
                <h1 style="margin:0 0 14px;font-size:24px;line-height:1.2;">Подтвердите адрес почты</h1>
                <p style="margin:0 0 18px;color:#c8d0e2;line-height:1.6;">Введите этот код в приложении, чтобы завершить регистрацию.</p>
                <div style="margin:0 0 18px;padding:18px 20px;border-radius:16px;background:linear-gradient(135deg, rgba(111,44,255,0.58) 0%, rgba(177,62,246,0.48) 52%, rgba(255,77,184,0.58) 100%);font-size:32px;font-weight:700;letter-spacing:0.24em;text-align:center;">
                  {verificationCode}
                </div>
                <p style="margin:0 0 8px;color:#c8d0e2;line-height:1.6;">Код действует до {expiresLocal}.</p>
                <p style="margin:0;color:#8f98ae;line-height:1.6;">Если вы не запрашивали это письмо, просто проигнорируйте его.</p>
              </div>
            </div>
            """;

        var message = new MimeMessage();
        message.From.Add(new MailboxAddress(options.FromName, options.FromAddress));
        message.To.Add(MailboxAddress.Parse(email));
        message.Subject = subject;

        var bodyBuilder = new BodyBuilder
        {
            TextBody = plainTextBody,
            HtmlBody = htmlBody
        };

        message.Body = bodyBuilder.ToMessageBody();

        using var client = new MailKit.Net.Smtp.SmtpClient();

        try
        {
            var socketOptions = ResolveSocketOptions(options.Smtp.Port, options.Smtp.EnableSsl);
            await ConnectUsingPreferredAddressAsync(client, options.Smtp.Host, options.Smtp.Port, socketOptions, cancellationToken);

            if (!string.IsNullOrWhiteSpace(options.Smtp.Username))
            {
                await client.AuthenticateAsync(options.Smtp.Username, options.Smtp.Password, cancellationToken);
            }

            await client.SendAsync(message, cancellationToken);
            await client.DisconnectAsync(true, cancellationToken);

            _logger.LogInformation("Email verification message sent to {Email}.", email);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to send email verification message to {Email}.", email);
            throw new EmailDeliveryException("Не удалось отправить письмо с кодом подтверждения.", ex);
        }
    }

    private static SecureSocketOptions ResolveSocketOptions(int port, bool enableSsl)
    {
        if (!enableSsl)
        {
            return SecureSocketOptions.None;
        }

        return port == 465
            ? SecureSocketOptions.SslOnConnect
            : SecureSocketOptions.StartTls;
    }

    private static async Task ConnectUsingPreferredAddressAsync(
        MailKit.Net.Smtp.SmtpClient client,
        string host,
        int port,
        SecureSocketOptions socketOptions,
        CancellationToken cancellationToken)
    {
        var addresses = await Dns.GetHostAddressesAsync(host, cancellationToken);
        var preferredAddress =
            addresses.FirstOrDefault(address => address.AddressFamily == AddressFamily.InterNetwork)
            ?? addresses.FirstOrDefault();

        if (preferredAddress == null)
        {
            await client.ConnectAsync(host, port, socketOptions, cancellationToken);
            return;
        }

        using var socket = new Socket(preferredAddress.AddressFamily, SocketType.Stream, ProtocolType.Tcp);
        await socket.ConnectAsync(preferredAddress, port, cancellationToken);
        await client.ConnectAsync(socket, host, port, socketOptions, cancellationToken);
    }
}
