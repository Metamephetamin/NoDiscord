using BackNoDiscord.Services;
using Microsoft.AspNetCore.Mvc;

namespace BackNoDiscord.Controllers;

[ApiController]
[Route("api/server-invites")]
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
        if (request?.ServerSnapshot is null || string.IsNullOrWhiteSpace(request.OwnerUserId))
        {
            return BadRequest(new { message = "Owner user id and server snapshot are required." });
        }

        var syncedSnapshot = _serverState.UpsertSnapshot(request.ServerSnapshot, request.OwnerUserId);
        var result = _invites.CreateInvite(request.OwnerUserId, syncedSnapshot);
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
        if (request is null ||
            string.IsNullOrWhiteSpace(request.InviteCode) ||
            string.IsNullOrWhiteSpace(request.UserId))
        {
            return BadRequest(new { message = "Invite code and user id are required." });
        }

        try
        {
            var result = _invites.RedeemInvite(request.InviteCode, request.UserId, request.Name ?? "User", request.Avatar ?? string.Empty);
            var syncedSnapshot = _serverState.AddMember(result.Snapshot.Id, request.UserId, request.Name ?? "User", request.Avatar ?? string.Empty);
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
        var snapshot = _serverState.GetSnapshot(serverId);
        return snapshot is null
            ? NotFound(new { message = "Server snapshot not found." })
            : Ok(snapshot);
    }

    [HttpPost("server-sync")]
    public IActionResult SyncServerSnapshot([FromBody] SyncServerSnapshotRequest request)
    {
        if (request?.ServerSnapshot is null || string.IsNullOrWhiteSpace(request.ActorUserId))
        {
            return BadRequest(new { message = "Actor user id and server snapshot are required." });
        }

        var snapshot = _serverState.UpsertSnapshot(request.ServerSnapshot, request.ActorUserId);
        return Ok(snapshot);
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
