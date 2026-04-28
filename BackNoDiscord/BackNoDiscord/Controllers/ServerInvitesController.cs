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

    public ServerInvitesController(ServerInviteService invites, ServerStateService serverState)
    {
        _invites = invites;
        _serverState = serverState;
    }

    [HttpPost("create")]
    public IActionResult CreateInvite([FromBody] CreateServerInviteRequest request)
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

        return Ok(new
        {
            result.InviteCode,
            result.ExpiresAt,
            serverId = syncedSnapshot.Id
        });
    }

    [HttpPost("redeem")]
    public IActionResult RedeemInvite([FromBody] RedeemServerInviteRequest request)
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
    public IActionResult RedeemInviteByLink([FromRoute] string inviteCode, [FromBody] RedeemServerInviteRequest? request)
    {
        return RedeemInvite(new RedeemServerInviteRequest
        {
            InviteCode = inviteCode,
            Name = request?.Name,
            Avatar = request?.Avatar
        });
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
    public IActionResult DeleteServerSnapshot([FromRoute] string serverId)
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
        _serverState.DeleteSnapshot(snapshot.Id);
        return NoContent();
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
    public IActionResult SyncServerSnapshot([FromBody] SyncServerSnapshotRequest request)
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
        return Ok(snapshot);
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
