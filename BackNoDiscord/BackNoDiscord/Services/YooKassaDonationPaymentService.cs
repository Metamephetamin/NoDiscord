using System.Globalization;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;

namespace BackNoDiscord.Services;

public interface IDonationPaymentService
{
    bool IsAllowedAmount(int amount);
    Task<DonationPaymentCreateResult> CreatePaymentAsync(int amount, CancellationToken cancellationToken);
}

public sealed record DonationPaymentResponse(
    string PaymentId,
    string Status,
    string ConfirmationUrl);

public sealed record DonationPaymentCreateResult(
    bool IsConfigured,
    DonationPaymentResponse? Payment,
    string? ErrorMessage)
{
    public static DonationPaymentCreateResult NotConfigured() =>
        new(false, null, "Онлайн-оплата через ЮKassa пока не настроена.");

    public static DonationPaymentCreateResult Configured(DonationPaymentResponse payment) =>
        new(true, payment, null);

    public static DonationPaymentCreateResult Failed(string message) =>
        new(true, null, message);
}

public sealed class YooKassaDonationPaymentService : IDonationPaymentService
{
    private static readonly HashSet<int> AllowedAmounts = new() { 100, 300, 500, 1000 };
    private static readonly JsonSerializerOptions SerializerOptions = new(JsonSerializerDefaults.Web)
    {
        DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull
    };

    private readonly HttpClient _httpClient;
    private readonly IConfiguration _configuration;
    private readonly ILogger<YooKassaDonationPaymentService> _logger;

    public YooKassaDonationPaymentService(
        HttpClient httpClient,
        IConfiguration configuration,
        ILogger<YooKassaDonationPaymentService> logger)
    {
        _httpClient = httpClient;
        _configuration = configuration;
        _logger = logger;
    }

    public bool IsAllowedAmount(int amount) => AllowedAmounts.Contains(amount);

    public async Task<DonationPaymentCreateResult> CreatePaymentAsync(int amount, CancellationToken cancellationToken)
    {
        if (!IsAllowedAmount(amount))
        {
            return DonationPaymentCreateResult.Failed("Выберите одну из доступных сумм доната.");
        }

        var shopId = _configuration["YooKassa:ShopId"]?.Trim();
        var secretKey = _configuration["YooKassa:SecretKey"]?.Trim();
        if (string.IsNullOrWhiteSpace(shopId) || string.IsNullOrWhiteSpace(secretKey))
        {
            return DonationPaymentCreateResult.NotConfigured();
        }

        var request = new YooKassaCreatePaymentRequest(
            new YooKassaAmount(amount.ToString("F2", CultureInfo.InvariantCulture), "RUB"),
            new YooKassaConfirmation("redirect", ResolveReturnUrl()),
            true,
            $"Поддержка Lanaya на {amount} RUB",
            new Dictionary<string, string>
            {
                ["source"] = "lanaya-donation",
                ["amount_rub"] = amount.ToString(CultureInfo.InvariantCulture)
            });

        var endpoint = new Uri(new Uri(ResolveApiBaseUrl()), "/v3/payments");
        using var httpRequest = new HttpRequestMessage(HttpMethod.Post, endpoint)
        {
            Content = JsonContent.Create(request, options: SerializerOptions)
        };
        httpRequest.Headers.Authorization = new AuthenticationHeaderValue(
            "Basic",
            Convert.ToBase64String(Encoding.UTF8.GetBytes($"{shopId}:{secretKey}")));
        httpRequest.Headers.Add("Idempotence-Key", Guid.NewGuid().ToString("N"));

        try
        {
            using var response = await _httpClient.SendAsync(httpRequest, cancellationToken);
            var responseBody = await response.Content.ReadAsStringAsync(cancellationToken);
            if (!response.IsSuccessStatusCode)
            {
                _logger.LogWarning("YooKassa payment creation failed with status {StatusCode}", (int)response.StatusCode);
                return DonationPaymentCreateResult.Failed("ЮKassa не приняла запрос на оплату.");
            }

            var payment = JsonSerializer.Deserialize<YooKassaPaymentResponse>(responseBody, SerializerOptions);
            var confirmationUrl = payment?.Confirmation?.ConfirmationUrl?.Trim();
            if (string.IsNullOrWhiteSpace(payment?.Id) || string.IsNullOrWhiteSpace(confirmationUrl))
            {
                _logger.LogWarning("YooKassa payment response did not include confirmation_url.");
                return DonationPaymentCreateResult.Failed("ЮKassa не вернула ссылку на оплату.");
            }

            return DonationPaymentCreateResult.Configured(new DonationPaymentResponse(
                payment.Id,
                payment.Status ?? "pending",
                confirmationUrl));
        }
        catch (OperationCanceledException)
        {
            throw;
        }
        catch (Exception exception)
        {
            _logger.LogWarning(exception, "YooKassa payment creation request failed.");
            return DonationPaymentCreateResult.Failed("Не удалось связаться с ЮKassa.");
        }
    }

    private string ResolveApiBaseUrl()
    {
        var configuredUrl = _configuration["YooKassa:ApiBaseUrl"]?.Trim();
        return string.IsNullOrWhiteSpace(configuredUrl) ? "https://api.yookassa.ru" : configuredUrl.TrimEnd('/');
    }

    private string ResolveReturnUrl()
    {
        var configuredReturnUrl = _configuration["YooKassa:ReturnUrl"]?.Trim();
        if (!string.IsNullOrWhiteSpace(configuredReturnUrl))
        {
            return configuredReturnUrl;
        }

        var publicAppUrl = _configuration["ND_PUBLIC_APP_URL"]?.Trim();
        return string.IsNullOrWhiteSpace(publicAppUrl)
            ? "https://lanaya.space"
            : publicAppUrl.TrimEnd('/');
    }

    private sealed record YooKassaCreatePaymentRequest(
        YooKassaAmount Amount,
        YooKassaConfirmation Confirmation,
        bool Capture,
        string Description,
        IReadOnlyDictionary<string, string> Metadata);

    private sealed record YooKassaAmount(string Value, string Currency);

    private sealed record YooKassaConfirmation(string Type, [property: JsonPropertyName("return_url")] string ReturnUrl);

    private sealed record YooKassaPaymentResponse(
        string? Id,
        string? Status,
        YooKassaPaymentConfirmation? Confirmation);

    private sealed record YooKassaPaymentConfirmation(
        string? Type,
        [property: JsonPropertyName("confirmation_url")] string? ConfirmationUrl);
}
