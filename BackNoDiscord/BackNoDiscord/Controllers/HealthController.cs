using BackNoDiscord.Observability;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace BackNoDiscord.Controllers;

[ApiController]
[AllowAnonymous]
[Route("api/health")]
public sealed class HealthController : ControllerBase
{
    private readonly ProductionHealthService _healthService;
    private readonly ProductionMetrics _metrics;

    public HealthController(ProductionHealthService healthService, ProductionMetrics metrics)
    {
        _healthService = healthService;
        _metrics = metrics;
    }

    [HttpGet("live")]
    public IActionResult Live()
    {
        return Ok(new
        {
            status = "ok",
            timeUtc = DateTimeOffset.UtcNow,
            metrics = _metrics.Snapshot()
        });
    }

    [HttpGet("ready")]
    public async Task<IActionResult> Ready(CancellationToken cancellationToken)
    {
        var result = await _healthService.CheckReadinessAsync(cancellationToken);
        var payload = new
        {
            status = result.Ready ? "ok" : "degraded",
            checks = result.Checks,
            timeUtc = DateTimeOffset.UtcNow
        };

        return result.Ready ? Ok(payload) : StatusCode(StatusCodes.Status503ServiceUnavailable, payload);
    }
}
