using BackNoDiscord.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;

namespace BackNoDiscord.Controllers;

[ApiController]
[AllowAnonymous]
[EnableRateLimiting("donations")]
[Route("api/donations/payments")]
public sealed class DonationPaymentsController : ControllerBase
{
    private readonly IDonationPaymentService _payments;

    public DonationPaymentsController(IDonationPaymentService payments)
    {
        _payments = payments;
    }

    [HttpPost]
    public async Task<IActionResult> Create([FromBody] DonationPaymentCreateRequest request, CancellationToken cancellationToken)
    {
        if (!_payments.IsAllowedAmount(request.Amount))
        {
            return BadRequest(new { message = "Выберите одну из доступных сумм доната." });
        }

        var result = await _payments.CreatePaymentAsync(request.Amount, cancellationToken);
        if (!result.IsConfigured)
        {
            return StatusCode(StatusCodes.Status503ServiceUnavailable, new { message = result.ErrorMessage });
        }

        if (result.Payment is null)
        {
            return StatusCode(StatusCodes.Status502BadGateway, new { message = result.ErrorMessage ?? "Не удалось создать платеж." });
        }

        return Ok(result.Payment);
    }
}

public sealed record DonationPaymentCreateRequest(int Amount);
