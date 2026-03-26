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
        if (existingSnapshot is not null && !ServerPermissionEvaluator.CanManageServer(existingSnapshot, currentUser.UserId))
        {
            return Forbid();
        }

        var syncedSnapshot = _serverState.UpsertSnapshot(request.ServerSnapshot, currentUser.UserId);
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

    [HttpGet("server/{serverId}")]
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
        if (existingSnapshot is not null && !ServerPermissionEvaluator.CanManageServer(existingSnapshot, currentUser.UserId))
        {
            return Forbid();
        }

        var snapshot = _serverState.UpsertSnapshot(request.ServerSnapshot, currentUser.UserId);
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
