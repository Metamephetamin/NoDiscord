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

        var subject = "Код MAX";
        var expiresLocal = expiresAt.ToLocalTime().ToString("HH:mm");
        var plainTextBody =
            $"Код MAX: {verificationCode}{Environment.NewLine}" +
            $"Действует до {expiresLocal}.{Environment.NewLine}{Environment.NewLine}" +
            "Если вы не запрашивали код, просто проигнорируйте письмо.";

        var htmlBody = $$"""
            <!doctype html>
            <html>
            <head>
              <meta name="color-scheme" content="light dark">
              <meta name="supported-color-schemes" content="light dark">
              <style>
                .mail-bg { background:#eef2f9 !important; color:#101827 !important; }
                .mail-card { background:#ffffff !important; border-color:#dce3f0 !important; box-shadow:0 24px 70px rgba(31,42,68,0.14) !important; }
                .mail-brand { color:#5a48ea !important; }
                .mail-title { color:#121827 !important; }
                .mail-text { color:#3d4659 !important; }
                .mail-muted { color:#7a8496 !important; }
                .mail-code { color:#ffffff !important; background:linear-gradient(135deg,#5b5cff 0%,#8748ee 48%,#e052a6 100%) !important; }
                .mail-chip { background:#eef1ff !important; color:#5a48ea !important; }

                @media (prefers-color-scheme: dark) {
                  .mail-bg { background:#0e1119 !important; color:#f3f5ff !important; }
                  .mail-card { background:#171b26 !important; border-color:#2a3142 !important; box-shadow:none !important; }
                  .mail-brand { color:#aebcff !important; }
                  .mail-title { color:#f7f8ff !important; }
                  .mail-text { color:#dbe1f2 !important; }
                  .mail-muted { color:#98a2b8 !important; }
                  .mail-code { color:#ffffff !important; background:linear-gradient(135deg,#6366ff 0%,#8c4bff 48%,#e052a6 100%) !important; }
                  .mail-chip { background:#202845 !important; color:#b8c4ff !important; }
                }
              </style>
            </head>
            <body style="margin:0;padding:0;">
              <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">Код MAX: {{verificationCode}}</div>
              <div class="mail-bg" style="font-family:Arial,Helvetica,sans-serif;background:#eef2f9;color:#101827;padding:34px 18px;">
                <div class="mail-card" style="max-width:520px;margin:0 auto;background:#ffffff;border-radius:22px;padding:0;border:1px solid #dce3f0;box-shadow:0 24px 70px rgba(31,42,68,0.14);overflow:hidden;">
                  <div class="mail-code" style="height:7px;background:linear-gradient(135deg,#5b5cff 0%,#8748ee 48%,#e052a6 100%);"></div>
                  <div style="padding:30px;">
                  <div class="mail-brand" style="font-size:13px;font-weight:800;letter-spacing:0.18em;text-transform:uppercase;color:#5a48ea;margin-bottom:18px;">MAX</div>
                  <h1 class="mail-title" style="margin:0 0 10px;font-size:26px;line-height:1.18;color:#121827;">Ваш код</h1>
                  <p class="mail-text" style="margin:0 0 20px;color:#3d4659;font-size:15px;line-height:1.55;">Введите его в приложении, чтобы продолжить.</p>
                  <div class="mail-code" style="margin:0 0 18px;padding:20px 18px;border-radius:18px;background:linear-gradient(135deg,#5b5cff 0%,#8748ee 48%,#e052a6 100%);color:#ffffff;font-size:36px;font-weight:800;letter-spacing:0.28em;text-align:center;">
                    {{verificationCode}}
                  </div>
                  <div class="mail-chip" style="display:inline-block;margin:0 0 18px;padding:8px 12px;border-radius:999px;background:#eef1ff;color:#5a48ea;font-size:13px;font-weight:700;">Действует до {{expiresLocal}}</div>
                  <p class="mail-muted" style="margin:0;color:#7a8496;font-size:13px;line-height:1.55;">Если вы не запрашивали код, просто проигнорируйте письмо.</p>
                  </div>
                </div>
              </div>
            </body>
            </html>
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

        Socket? socket = new(preferredAddress.AddressFamily, SocketType.Stream, ProtocolType.Tcp);
        try
        {
            await socket.ConnectAsync(preferredAddress, port, cancellationToken);
            await client.ConnectAsync(socket, host, port, socketOptions, cancellationToken);
            socket = null;
        }
        finally
        {
            socket?.Dispose();
        }
    }
}
