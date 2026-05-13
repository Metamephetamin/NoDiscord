using System.Text.Json;
using BackNoDiscord.Observability;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;

namespace BackNoDiscord.Controllers;

[ApiController]
[AllowAnonymous]
[EnableRateLimiting("client-diagnostics")]
[Route("api/diagnostics")]
public sealed class ClientDiagnosticsController : ControllerBase
{
    private const int MaxDiagnosticPayloadBytes = 8 * 1024;

    private readonly ILogger<ClientDiagnosticsController> _logger;
    private readonly ProductionMetrics _metrics;

    public ClientDiagnosticsController(
        ILogger<ClientDiagnosticsController> logger,
        ProductionMetrics metrics)
    {
        _logger = logger;
        _metrics = metrics;
    }

    [HttpPost("client-events")]
    [RequestSizeLimit(MaxDiagnosticPayloadBytes)]
    public IActionResult RecordClientEvent([FromBody] JsonElement payload)
    {
        if (!ClientDiagnosticEventSanitizer.TrySanitize(payload, out var diagnostic, out var reason))
        {
            _metrics.RecordRejectedClientDiagnostic();
            _logger.LogWarning(
                "Rejected client diagnostic from {RemoteIp}: {Reason} correlationId={CorrelationId}",
                HttpContext.Connection.RemoteIpAddress?.ToString() ?? "unknown",
                reason,
                HttpContext.TraceIdentifier);
            return BadRequest(new { error = "invalid_diagnostic_payload" });
        }

        _metrics.RecordClientDiagnostic(diagnostic);
        _logger.LogInformation(
            "Client diagnostic {Type} surface={Surface} route={Route} errorName={ErrorName} phase={Phase} status={Status} correlationId={CorrelationId}",
            diagnostic.Type,
            diagnostic.Surface,
            diagnostic.Route,
            diagnostic.ErrorName,
            diagnostic.Phase,
            diagnostic.Status,
            HttpContext.TraceIdentifier);

        return Accepted(new { status = "accepted" });
    }
}
