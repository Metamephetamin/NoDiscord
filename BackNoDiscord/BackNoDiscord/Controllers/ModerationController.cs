using BackNoDiscord.Security;
using BackNoDiscord.Services;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace BackNoDiscord.Controllers;

[ApiController]
[Authorize(AuthenticationSchemes = JwtBearerDefaults.AuthenticationScheme)]
[Route("api/moderation")]
public sealed class ModerationController : ControllerBase
{
    private readonly ModerationService _moderation;
    private readonly ServerStateService _serverState;
    private readonly AuditLogService _auditLog;

    public ModerationController(
        ModerationService moderation,
        ServerStateService serverState,
        AuditLogService auditLog)
    {
        _moderation = moderation;
        _serverState = serverState;
        _auditLog = auditLog;
    }

    [HttpPost("reports")]
    public async Task<IActionResult> CreateReport([FromBody] CreateModerationReportRequest? request, CancellationToken cancellationToken)
    {
        if (!AuthenticatedUserAccessor.TryGetAuthenticatedUser(User, out var currentUser))
        {
            return Unauthorized();
        }

        if (request is null)
        {
            return BadRequest(new { message = "Report payload is required." });
        }

        var snapshot = _serverState.GetSnapshot(request.ServerId);
        if (!ServerPermissionEvaluator.CanReadServer(snapshot, currentUser.UserId))
        {
            return Forbid();
        }

        var report = await _moderation.CreateReportAsync(
            snapshot!.Id,
            request.ChannelId,
            currentUser.UserId,
            request.TargetUserId,
            request.MessageId,
            request.Reason,
            cancellationToken);

        await _auditLog.RecordAsync(
            snapshot.Id,
            currentUser.UserId,
            "moderation.report.create",
            targetId: report.TargetUserId,
            metadata: new Dictionary<string, string?>
            {
                ["reportId"] = report.Id.ToString(),
                ["channelId"] = report.ChannelId
            },
            cancellationToken: cancellationToken);

        return Ok(ToReportDto(report));
    }

    [HttpGet("servers/{serverId}/reports")]
    public async Task<IActionResult> GetReports([FromRoute] string serverId, [FromQuery] string? status, [FromQuery] int? limit, CancellationToken cancellationToken)
    {
        if (!AuthenticatedUserAccessor.TryGetAuthenticatedUser(User, out var currentUser))
        {
            return Unauthorized();
        }

        var snapshot = _serverState.GetSnapshot(serverId);
        if (!ServerPermissionEvaluator.CanManageMessages(snapshot, currentUser.UserId))
        {
            return Forbid();
        }

        var reports = await _moderation.GetReportsAsync(snapshot!.Id, status, limit.GetValueOrDefault(50), cancellationToken);
        return Ok(reports.Select(ToReportDto).ToList());
    }

    [HttpPatch("reports/{reportId:int}/status")]
    public async Task<IActionResult> UpdateReportStatus([FromRoute] int reportId, [FromBody] UpdateModerationReportStatusRequest? request, CancellationToken cancellationToken)
    {
        if (!AuthenticatedUserAccessor.TryGetAuthenticatedUser(User, out var currentUser))
        {
            return Unauthorized();
        }

        var existingReport = await _moderation.GetReportAsync(reportId, cancellationToken);
        if (existingReport is null)
        {
            return NotFound(new { message = "Report not found." });
        }

        var snapshot = _serverState.GetSnapshot(existingReport.ServerId);
        if (!ServerPermissionEvaluator.CanManageMessages(snapshot, currentUser.UserId))
        {
            return Forbid();
        }

        var report = await _moderation.UpdateReportStatusAsync(reportId, request?.Status, currentUser.UserId, cancellationToken);
        if (report is null)
        {
            return NotFound(new { message = "Report not found." });
        }

        await _auditLog.RecordAsync(
            report.ServerId,
            currentUser.UserId,
            "moderation.report.status",
            targetId: report.TargetUserId,
            metadata: new Dictionary<string, string?>
            {
                ["reportId"] = report.Id.ToString(),
                ["status"] = report.Status
            },
            cancellationToken: cancellationToken);

        return Ok(ToReportDto(report));
    }

    [HttpPost("servers/{serverId}/actions")]
    public async Task<IActionResult> ApplyAction([FromRoute] string serverId, [FromBody] ApplyModerationActionRequest? request, CancellationToken cancellationToken)
    {
        if (!AuthenticatedUserAccessor.TryGetAuthenticatedUser(User, out var currentUser))
        {
            return Unauthorized();
        }

        if (request is null)
        {
            return BadRequest(new { message = "Action payload is required." });
        }

        var snapshot = _serverState.GetSnapshot(serverId);
        if (!ServerPermissionEvaluator.CanManageMessages(snapshot, currentUser.UserId))
        {
            return Forbid();
        }

        DateTimeOffset? expiresAt = request.DurationMinutes.GetValueOrDefault() > 0
            ? DateTimeOffset.UtcNow.AddMinutes(Math.Min(request.DurationMinutes!.Value, 60 * 24 * 30))
            : null;
        var action = await _moderation.ApplyActionAsync(
            snapshot!.Id,
            currentUser.UserId,
            request.TargetUserId,
            request.ActionType,
            request.Reason,
            expiresAt,
            cancellationToken);

        await _auditLog.RecordAsync(
            snapshot.Id,
            currentUser.UserId,
            $"moderation.{action.ActionType}.apply",
            targetId: action.TargetUserId,
            metadata: new Dictionary<string, string?>
            {
                ["actionId"] = action.Id.ToString(),
                ["expiresAt"] = action.ExpiresAt?.ToString("O")
            },
            cancellationToken: cancellationToken);

        return Ok(ToActionDto(action));
    }

    [HttpDelete("actions/{actionId:int}")]
    public async Task<IActionResult> RevokeAction([FromRoute] int actionId, CancellationToken cancellationToken)
    {
        if (!AuthenticatedUserAccessor.TryGetAuthenticatedUser(User, out var currentUser))
        {
            return Unauthorized();
        }

        var existingAction = await _moderation.GetActionAsync(actionId, cancellationToken);
        if (existingAction is null)
        {
            return NotFound(new { message = "Action not found." });
        }

        var snapshot = _serverState.GetSnapshot(existingAction.ServerId);
        if (!ServerPermissionEvaluator.CanManageMessages(snapshot, currentUser.UserId))
        {
            return Forbid();
        }

        var action = await _moderation.RevokeActionAsync(actionId, currentUser.UserId, cancellationToken);
        if (action is null)
        {
            return NotFound(new { message = "Action not found." });
        }

        await _auditLog.RecordAsync(
            action.ServerId,
            currentUser.UserId,
            $"moderation.{action.ActionType}.revoke",
            targetId: action.TargetUserId,
            metadata: new Dictionary<string, string?> { ["actionId"] = action.Id.ToString() },
            cancellationToken: cancellationToken);

        return Ok(ToActionDto(action));
    }

    private static ModerationReportDto ToReportDto(ChatModerationReportRecord report)
    {
        return new ModerationReportDto
        {
            Id = report.Id,
            ServerId = report.ServerId,
            ChannelId = report.ChannelId,
            MessageId = report.MessageId,
            ReporterUserId = report.ReporterUserId,
            TargetUserId = report.TargetUserId,
            Reason = report.Reason,
            Status = report.Status,
            CreatedAt = report.CreatedAt,
            ReviewedAt = report.ReviewedAt,
            ReviewedByUserId = report.ReviewedByUserId
        };
    }

    private static ModerationActionDto ToActionDto(ChatModerationActionRecord action)
    {
        return new ModerationActionDto
        {
            Id = action.Id,
            ServerId = action.ServerId,
            ActorUserId = action.ActorUserId,
            TargetUserId = action.TargetUserId,
            ActionType = action.ActionType,
            Reason = action.Reason,
            CreatedAt = action.CreatedAt,
            ExpiresAt = action.ExpiresAt,
            RevokedAt = action.RevokedAt,
            RevokedByUserId = action.RevokedByUserId
        };
    }
}

public sealed class CreateModerationReportRequest
{
    public string ServerId { get; set; } = string.Empty;
    public string ChannelId { get; set; } = string.Empty;
    public int? MessageId { get; set; }
    public string TargetUserId { get; set; } = string.Empty;
    public string Reason { get; set; } = string.Empty;
}

public sealed class UpdateModerationReportStatusRequest
{
    public string Status { get; set; } = string.Empty;
}

public sealed class ApplyModerationActionRequest
{
    public string TargetUserId { get; set; } = string.Empty;
    public string ActionType { get; set; } = string.Empty;
    public string Reason { get; set; } = string.Empty;
    public int? DurationMinutes { get; set; }
}

public sealed class ModerationReportDto
{
    public int Id { get; set; }
    public string ServerId { get; set; } = string.Empty;
    public string ChannelId { get; set; } = string.Empty;
    public int? MessageId { get; set; }
    public string ReporterUserId { get; set; } = string.Empty;
    public string TargetUserId { get; set; } = string.Empty;
    public string Reason { get; set; } = string.Empty;
    public string Status { get; set; } = string.Empty;
    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset? ReviewedAt { get; set; }
    public string? ReviewedByUserId { get; set; }
}

public sealed class ModerationActionDto
{
    public int Id { get; set; }
    public string ServerId { get; set; } = string.Empty;
    public string ActorUserId { get; set; } = string.Empty;
    public string TargetUserId { get; set; } = string.Empty;
    public string ActionType { get; set; } = string.Empty;
    public string Reason { get; set; } = string.Empty;
    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset? ExpiresAt { get; set; }
    public DateTimeOffset? RevokedAt { get; set; }
    public string? RevokedByUserId { get; set; }
}
