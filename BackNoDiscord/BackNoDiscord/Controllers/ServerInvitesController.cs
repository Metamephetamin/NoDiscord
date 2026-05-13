using BackNoDiscord.Security;
using BackNoDiscord.Services;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace BackNoDiscord.Controllers;

[ApiController]
[Route("api/server-invites")]
[Authorize(AuthenticationSchemes = JwtBearerDefaults.AuthenticationScheme)]
public class ServerInvitesController : ControllerBase
{
    private readonly ServerInviteService _invites;
    private readonly ServerStateService _serverState;
    private readonly AuditLogService _auditLog;
    private readonly ModerationService _moderation;

    public ServerInvitesController(ServerInviteService invites, ServerStateService serverState, AuditLogService auditLog, ModerationService moderation)
    {
        _invites = invites;
        _serverState = serverState;
        _auditLog = auditLog;
        _moderation = moderation;
    }

    [HttpPost("create")]
    public async Task<IActionResult> CreateInvite([FromBody] CreateServerInviteRequest request, CancellationToken cancellationToken)
    {
        if (!AuthenticatedUserAccessor.TryGetAuthenticatedUser(User, out var currentUser))
        {
            return Unauthorized();
        }

        if (request?.ServerSnapshot is null)
        {
            return BadRequest(new { message = "Server snapshot is required." });
        }

        if (IsReservedPersonalServer(request.ServerSnapshot.Id))
        {
            return BadRequest(new { message = "Default personal servers cannot be shared." });
        }

        var existingSnapshot = _serverState.GetSnapshot(request.ServerSnapshot.Id);
        if (!ServerPermissionEvaluator.CanCreateInvite(existingSnapshot, request.ServerSnapshot, currentUser.UserId))
        {
            return StatusCode(403, new { message = "Недостаточно прав для создания приглашения." });
        }

        var inviteSource = existingSnapshot is not null &&
            ServerPermissionEvaluator.CanReadServer(existingSnapshot, currentUser.UserId) &&
            !ServerPermissionEvaluator.CanManageServer(existingSnapshot, currentUser.UserId)
                ? existingSnapshot
                : request.ServerSnapshot;
        var syncedSnapshot = _serverState.UpsertSnapshot(inviteSource, currentUser.UserId);
        var result = _invites.CreateInvite(currentUser.UserId, syncedSnapshot);
        await _auditLog.RecordAsync(
            syncedSnapshot.Id,
            currentUser.UserId,
            "server.invite.create",
            metadata: new Dictionary<string, string?>
            {
                ["serverName"] = syncedSnapshot.Name,
                ["expiresAt"] = result.ExpiresAt.ToString("O")
            },
            cancellationToken: cancellationToken);

        return Ok(new
        {
            result.InviteCode,
            result.ExpiresAt,
            serverId = syncedSnapshot.Id
        });
    }

    [HttpPost("redeem")]
    public async Task<IActionResult> RedeemInvite([FromBody] RedeemServerInviteRequest request, CancellationToken cancellationToken)
    {
        if (!AuthenticatedUserAccessor.TryGetAuthenticatedUser(User, out var currentUser))
        {
            return Unauthorized();
        }

        if (request is null || string.IsNullOrWhiteSpace(request.InviteCode))
        {
            return BadRequest(new { message = "Invite code is required." });
        }

        var displayName = string.IsNullOrWhiteSpace(request.Name)
            ? currentUser.DisplayName
            : UploadPolicies.TrimToLength(request.Name, 80);
        var avatarUrl = UploadPolicies.SanitizeRelativeAssetUrl(request.Avatar, "/avatars/");

        try
        {
            var preview = _invites.GetInvitePreview(request.InviteCode, currentUser.UserId);
            var activeBan = await _moderation.GetActiveActionAsync(
                preview.ServerId,
                currentUser.UserId,
                ["ban"],
                cancellationToken);
            if (activeBan is not null)
            {
                return StatusCode(403, new { message = "Вы заблокированы на этом сервере." });
            }

            var result = _invites.RedeemInvite(request.InviteCode, currentUser.UserId, displayName, avatarUrl);
            var syncedSnapshot = _serverState.AddMember(result.Snapshot.Id, currentUser.UserId, displayName, avatarUrl);

            return Ok(new
            {
                result.InviteCode,
                Snapshot = syncedSnapshot
            });
        }
        catch (KeyNotFoundException)
        {
            return NotFound(new { message = "Invite not found." });
        }
        catch (InvalidOperationException error)
        {
            return Conflict(new { message = error.Message });
        }
    }

    [AllowAnonymous]
    [HttpGet("{inviteCode}")]
    public IActionResult GetInvitePreview([FromRoute] string inviteCode)
    {
        var currentUserId = AuthenticatedUserAccessor.TryGetAuthenticatedUser(User, out var currentUser)
            ? currentUser.UserId
            : string.Empty;

        try
        {
            var preview = _invites.GetInvitePreview(inviteCode, currentUserId);
            return Ok(preview);
        }
        catch (KeyNotFoundException)
        {
            return NotFound(new { message = "Invite not found." });
        }
        catch (InvalidOperationException error)
        {
            return BadRequest(new { message = error.Message });
        }
    }

    [HttpPost("{inviteCode}/redeem")]
    public Task<IActionResult> RedeemInviteByLink([FromRoute] string inviteCode, [FromBody] RedeemServerInviteRequest? request, CancellationToken cancellationToken)
    {
        return RedeemInvite(new RedeemServerInviteRequest
        {
            InviteCode = inviteCode,
            Name = request?.Name,
            Avatar = request?.Avatar
        }, cancellationToken);
    }

    [HttpGet("server/{serverId}", Order = -1)]
    public IActionResult GetServerSnapshot([FromRoute] string serverId)
    {
        if (!AuthenticatedUserAccessor.TryGetAuthenticatedUser(User, out var currentUser))
        {
            return Unauthorized();
        }

        var snapshot = _serverState.GetSnapshot(serverId);
        if (snapshot is not null && !ServerPermissionEvaluator.CanReadServer(snapshot, currentUser.UserId))
        {
            return Forbid();
        }

        return snapshot is null
            ? NotFound(new { message = "Server snapshot not found." })
            : Ok(snapshot);
    }

    [HttpDelete("server/{serverId}", Order = -1)]
    public async Task<IActionResult> DeleteServerSnapshot([FromRoute] string serverId, CancellationToken cancellationToken)
    {
        if (!AuthenticatedUserAccessor.TryGetAuthenticatedUser(User, out var currentUser))
        {
            return Unauthorized();
        }

        var snapshot = _serverState.GetSnapshot(serverId);
        if (snapshot is null)
        {
            return NotFound(new { message = "Server snapshot not found." });
        }

        if (!string.Equals(snapshot.OwnerId, currentUser.UserId, StringComparison.Ordinal))
        {
            return Forbid();
        }

        _invites.DeleteInvitesForServer(snapshot.Id, currentUser.UserId);
        await _auditLog.RecordAsync(
            snapshot.Id,
            currentUser.UserId,
            "server.delete",
            metadata: new Dictionary<string, string?> { ["serverName"] = snapshot.Name },
            cancellationToken: cancellationToken);
        _serverState.DeleteSnapshot(snapshot.Id);
        return NoContent();
    }

    [HttpGet("server/{serverId}/audit-log", Order = -1)]
    public async Task<IActionResult> GetServerAuditLog([FromRoute] string serverId, [FromQuery] int? limit, CancellationToken cancellationToken)
    {
        if (!AuthenticatedUserAccessor.TryGetAuthenticatedUser(User, out var currentUser))
        {
            return Unauthorized();
        }

        var snapshot = _serverState.GetSnapshot(serverId);
        if (snapshot is null)
        {
            return NotFound(new { message = "Server snapshot not found." });
        }

        if (!ServerPermissionEvaluator.CanReadServer(snapshot, currentUser.UserId))
        {
            return Forbid();
        }

        var entries = await _auditLog.GetRecentAsync(snapshot.Id, limit.GetValueOrDefault(50), cancellationToken);
        return Ok(entries);
    }

    [HttpGet("my-servers", Order = -1)]
    public IActionResult GetMyServers()
    {
        if (!AuthenticatedUserAccessor.TryGetAuthenticatedUser(User, out var currentUser))
        {
            return Unauthorized();
        }

        var snapshots = _serverState.GetSnapshotsForUser(currentUser.UserId);
        return Ok(snapshots);
    }

    [HttpGet("memberships", Order = -1)]
    public IActionResult GetServerMemberships()
    {
        return GetMyServers();
    }

    [HttpPost("server-sync")]
    public async Task<IActionResult> SyncServerSnapshot([FromBody] SyncServerSnapshotRequest request, CancellationToken cancellationToken)
    {
        if (!AuthenticatedUserAccessor.TryGetAuthenticatedUser(User, out var currentUser))
        {
            return Unauthorized();
        }

        if (request?.ServerSnapshot is null)
        {
            return BadRequest(new { message = "Server snapshot is required." });
        }

        if (IsReservedPersonalServer(request.ServerSnapshot.Id))
        {
            return BadRequest(new { message = "Default personal servers cannot be synced as shared servers." });
        }

        var existingSnapshot = _serverState.GetSnapshot(request.ServerSnapshot.Id);
        if (existingSnapshot is not null &&
            !ServerPermissionEvaluator.CanManageServer(existingSnapshot, currentUser.UserId) &&
            !ServerPermissionEvaluator.CanManageChannels(existingSnapshot, currentUser.UserId))
        {
            return Forbid();
        }

        var snapshotToSave = request.ServerSnapshot;
        if (existingSnapshot is not null && !ServerPermissionEvaluator.CanManageServer(existingSnapshot, currentUser.UserId))
        {
            snapshotToSave = existingSnapshot;
            snapshotToSave.ChannelCategories = request.ServerSnapshot.ChannelCategories ?? new List<ChannelCategorySnapshot>();
            snapshotToSave.TextChannels = request.ServerSnapshot.TextChannels ?? new List<ChannelSnapshot>();
            snapshotToSave.VoiceChannels = request.ServerSnapshot.VoiceChannels ?? new List<ChannelSnapshot>();
        }

        var snapshot = _serverState.UpsertSnapshot(snapshotToSave, currentUser.UserId);
        await _auditLog.RecordAsync(
            snapshot.Id,
            currentUser.UserId,
            ResolveSnapshotAuditAction(existingSnapshot, snapshot),
            metadata: new Dictionary<string, string?>
            {
                ["serverName"] = snapshot.Name,
                ["textChannelCount"] = snapshot.TextChannels.Count.ToString(),
                ["voiceChannelCount"] = snapshot.VoiceChannels.Count.ToString(),
                ["roleCount"] = snapshot.Roles.Count.ToString()
            },
            cancellationToken: cancellationToken);
        return Ok(snapshot);
    }

    private static string ResolveSnapshotAuditAction(ServerSnapshot? previous, ServerSnapshot next)
    {
        if (previous is null)
        {
            return "server.create";
        }

        if (!string.Equals(
                string.Join('|', previous.Roles.Select(role => $"{role.Id}:{role.Name}:{role.Priority}:{string.Join(',', role.Permissions)}")),
                string.Join('|', next.Roles.Select(role => $"{role.Id}:{role.Name}:{role.Priority}:{string.Join(',', role.Permissions)}")),
                StringComparison.Ordinal))
        {
            return "server.roles.update";
        }

        if (previous.TextChannels.Count != next.TextChannels.Count ||
            previous.VoiceChannels.Count != next.VoiceChannels.Count)
        {
            return "server.channels.update";
        }

        return "server.settings.update";
    }

    private static bool IsReservedPersonalServer(string? serverId)
    {
        return !string.IsNullOrWhiteSpace(serverId)
               && serverId.StartsWith("server-main", StringComparison.OrdinalIgnoreCase);
    }
}

public class CreateServerInviteRequest
{
    public string OwnerUserId { get; set; } = string.Empty;
    public ServerSnapshot? ServerSnapshot { get; set; }
}

public class RedeemServerInviteRequest
{
    public string InviteCode { get; set; } = string.Empty;
    public string UserId { get; set; } = string.Empty;
    public string? Name { get; set; }
    public string? Avatar { get; set; }
}

public class SyncServerSnapshotRequest
{
    public string ActorUserId { get; set; } = string.Empty;
    public ServerSnapshot? ServerSnapshot { get; set; }
}
