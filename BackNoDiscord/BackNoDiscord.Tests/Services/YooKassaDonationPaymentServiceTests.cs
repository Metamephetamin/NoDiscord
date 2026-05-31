using System.Net;
using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using BackNoDiscord.Services;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging.Abstractions;

namespace BackNoDiscord.Tests.Services;

public sealed class YooKassaDonationPaymentServiceTests
{
    [Fact]
    public async Task CreatePaymentAsync_PostsAllowedAmountToYooKassa()
    {
        var handler = new RecordingHandler("""
            {
              "id": "2f101c10-000f-5000-9000-1f2a8d9f7f33",
              "status": "pending",
              "confirmation": {
                "type": "redirect",
                "confirmation_url": "https://yoomoney.ru/checkout/payments/v2/contract?orderId=abc"
              }
            }
            """);
        var service = new YooKassaDonationPaymentService(
            new HttpClient(handler),
            BuildConfiguration(new Dictionary<string, string?>
            {
                ["YooKassa:ShopId"] = "123456",
                ["YooKassa:SecretKey"] = "secret_key",
                ["YooKassa:ReturnUrl"] = "https://lanaya.space/donations/return",
                ["YooKassa:ApiBaseUrl"] = "https://api.yookassa.ru"
            }),
            NullLogger<YooKassaDonationPaymentService>.Instance);

        var result = await service.CreatePaymentAsync(300, CancellationToken.None);

        Assert.True(result.IsConfigured);
        Assert.NotNull(result.Payment);
        Assert.Equal("2f101c10-000f-5000-9000-1f2a8d9f7f33", result.Payment.PaymentId);
        Assert.Equal("pending", result.Payment.Status);
        Assert.Equal("https://yoomoney.ru/checkout/payments/v2/contract?orderId=abc", result.Payment.ConfirmationUrl);
        Assert.Equal(HttpMethod.Post, handler.Request?.Method);
        Assert.Equal("https://api.yookassa.ru/v3/payments", handler.Request?.RequestUri?.ToString());
        Assert.NotNull(handler.Request?.Headers.Authorization);
        Assert.Equal("Basic", handler.Request.Headers.Authorization.Scheme);
        Assert.Equal(
            Convert.ToBase64String(Encoding.UTF8.GetBytes("123456:secret_key")),
            handler.Request.Headers.Authorization.Parameter);
        Assert.True(handler.Request.Headers.Contains("Idempotence-Key"));

        var payload = JsonDocument.Parse(handler.Body);
        Assert.Equal("300.00", payload.RootElement.GetProperty("amount").GetProperty("value").GetString());
        Assert.Equal("RUB", payload.RootElement.GetProperty("amount").GetProperty("currency").GetString());
        Assert.True(payload.RootElement.GetProperty("capture").GetBoolean());
        Assert.Equal("redirect", payload.RootElement.GetProperty("confirmation").GetProperty("type").GetString());
        Assert.Equal(
            "https://lanaya.space/donations/return",
            payload.RootElement.GetProperty("confirmation").GetProperty("return_url").GetString());
    }

    [Fact]
    public async Task CreatePaymentAsync_ReturnsNotConfiguredWithoutCredentials()
    {
        var service = new YooKassaDonationPaymentService(
            new HttpClient(new RecordingHandler("{}")),
            BuildConfiguration(new Dictionary<string, string?>()),
            NullLogger<YooKassaDonationPaymentService>.Instance);

        var result = await service.CreatePaymentAsync(100, CancellationToken.None);

        Assert.False(result.IsConfigured);
        Assert.Null(result.Payment);
    }

    private static IConfiguration BuildConfiguration(Dictionary<string, string?> values) =>
        new ConfigurationBuilder()
            .AddInMemoryCollection(values)
            .Build();

    private sealed class RecordingHandler : HttpMessageHandler
    {
        private readonly string _responseBody;

        public RecordingHandler(string responseBody)
        {
            _responseBody = responseBody;
        }

        public HttpRequestMessage? Request { get; private set; }
        public string Body { get; private set; } = "";

        protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
        {
            Request = request;
            Body = request.Content is null ? "" : await request.Content.ReadAsStringAsync(cancellationToken);
            return new HttpResponseMessage(HttpStatusCode.OK)
            {
                Content = new StringContent(_responseBody, Encoding.UTF8, "application/json")
            };
        }
    }
}
