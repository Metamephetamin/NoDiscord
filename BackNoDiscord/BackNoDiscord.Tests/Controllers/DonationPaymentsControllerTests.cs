using BackNoDiscord.Controllers;
using BackNoDiscord.Services;
using Microsoft.AspNetCore.Mvc;

namespace BackNoDiscord.Tests.Controllers;

public sealed class DonationPaymentsControllerTests
{
    [Fact]
    public async Task Create_ReturnsBadRequestForUnsupportedAmount()
    {
        var controller = new DonationPaymentsController(new StubDonationPaymentService());

        var result = await controller.Create(new DonationPaymentCreateRequest(250), CancellationToken.None);

        var badRequest = Assert.IsType<BadRequestObjectResult>(result);
        Assert.Contains("сумм", badRequest.Value?.ToString(), StringComparison.OrdinalIgnoreCase);
    }

    private sealed class StubDonationPaymentService : IDonationPaymentService
    {
        public bool IsAllowedAmount(int amount) => amount is 100 or 300 or 500 or 1000;

        public Task<DonationPaymentCreateResult> CreatePaymentAsync(int amount, CancellationToken cancellationToken) =>
            Task.FromResult(DonationPaymentCreateResult.Configured(new DonationPaymentResponse("id", "pending", "https://example.com/pay")));
    }
}
