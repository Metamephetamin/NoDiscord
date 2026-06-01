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

    [HttpPost("server/{serverId}/roles", Order = -1)]
    public async Task<IActionResult> CreateServerRole(
        [FromRoute] string serverId,
        [FromBody] UpsertServerRoleRequest request,
        CancellationToken cancellationToken)
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

        var validation = ValidateRoleMutation(snapshot, currentUser.UserId, null, request, isCreate: true);
        if (validation is not null)
        {
            return validation;
        }

        var isOwner = string.Equals(snapshot.OwnerId, currentUser.UserId, StringComparison.Ordinal);
        var actorPriority = ServerPermissionEvaluator.GetUserRolePriority(snapshot, currentUser.UserId);
        var nextPriority = isOwner
            ? Math.Min(350, Math.Max(110, snapshot.Roles.Where(role => role.Id != "owner").Select(role => role.Priority).DefaultIfEmpty(100).Max() + 10))
            : Math.Max(101, actorPriority - 1);

        var role = new ServerRoleSnapshot
        {
            Id = $"role-{Guid.NewGuid():N}",
            Name = request.Name ?? string.Empty,
            Color = request.Color ?? string.Empty,
            Priority = nextPriority,
            Permissions = request.Permissions ?? new List<string>()
        };
        var updatedSnapshot = _serverState.SaveRole(snapshot.Id, role, create: true);
        await RecordRolesAuditAsync(updatedSnapshot, currentUser.UserId, "server.roles.create", role.Id, role.Name, cancellationToken);
        return Ok(updatedSnapshot);
    }

    [HttpPatch("server/{serverId}/roles/{roleId}", Order = -1)]
    public async Task<IActionResult> UpdateServerRole(
        [FromRoute] string serverId,
        [FromRoute] string roleId,
        [FromBody] UpsertServerRoleRequest request,
        CancellationToken cancellationToken)
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

        var existingRole = snapshot.Roles.FirstOrDefault(role => string.Equals(role.Id, roleId, StringComparison.Ordinal));
        var validation = ValidateRoleMutation(snapshot, currentUser.UserId, existingRole, request, isCreate: false);
        if (validation is not null)
        {
            return validation;
        }

        var role = new ServerRoleSnapshot
        {
            Id = roleId,
            Name = request.Name ?? string.Empty,
            Color = request.Color ?? string.Empty,
            Priority = existingRole?.Priority ?? 0,
            Permissions = string.Equals(roleId, "owner", StringComparison.Ordinal)
                ? existingRole?.Permissions ?? new List<string>()
                : request.Permissions ?? new List<string>()
        };
        var updatedSnapshot = _serverState.SaveRole(snapshot.Id, role, create: false);
        await RecordRolesAuditAsync(updatedSnapshot, currentUser.UserId, "server.roles.update", role.Id, role.Name, cancellationToken);
        return Ok(updatedSnapshot);
    }

    [HttpDelete("server/{serverId}/roles/{roleId}", Order = -1)]
    public async Task<IActionResult> DeleteServerRole(
        [FromRoute] string serverId,
        [FromRoute] string roleId,
        CancellationToken cancellationToken)
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

        if (IsProtectedRoleId(roleId))
        {
            return BadRequest(new { message = "System role cannot be deleted." });
        }

        if (!ServerPermissionEvaluator.CanManageRoles(snapshot, currentUser.UserId))
        {
            return Forbid();
        }

        var existingRole = snapshot.Roles.FirstOrDefault(role => string.Equals(role.Id, roleId, StringComparison.Ordinal));
        if (existingRole is null)
        {
            return NotFound(new { message = "Role not found." });
        }

        if (!CanTouchRole(snapshot, currentUser.UserId, existingRole))
        {
            return Forbid();
        }

        var updatedSnapshot = _serverState.DeleteRole(snapshot.Id, roleId);
        await RecordRolesAuditAsync(updatedSnapshot, currentUser.UserId, "server.roles.delete", roleId, existingRole.Name, cancellationToken);
        return Ok(updatedSnapshot);
    }

    [HttpPatch("server/{serverId}/members/{memberUserId}/role", Order = -1)]
    public async Task<IActionResult> UpdateServerMemberRole(
        [FromRoute] string serverId,
        [FromRoute] string memberUserId,
        [FromBody] UpdateServerMemberRoleRequest request,
        CancellationToken cancellationToken)
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

        var nextRoleId = request?.RoleId?.Trim() ?? string.Empty;
        if (!ServerPermissionEvaluator.CanAssignRole(snapshot, currentUser.UserId, memberUserId, nextRoleId))
        {
            return Forbid();
        }

        try
        {
            var updatedSnapshot = _serverState.UpdateMemberRole(snapshot.Id, memberUserId, nextRoleId);
            await RecordRolesAuditAsync(updatedSnapshot, currentUser.UserId, "server.member.role.update", nextRoleId, memberUserId, cancellationToken);
            return Ok(updatedSnapshot);
        }
        catch (KeyNotFoundException error)
        {
            return NotFound(new { message = error.Message });
        }
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

        var existingStatusByChannelId = GetVoiceChannelStatusesByChannelId(existingSnapshot);
        var snapshotToSave = request.ServerSnapshot;
        if (existingSnapshot is not null && !ServerPermissionEvaluator.CanManageServer(existingSnapshot, currentUser.UserId))
        {
            snapshotToSave = existingSnapshot;
            snapshotToSave.ChannelCategories = request.ServerSnapshot.ChannelCategories ?? new List<ChannelCategorySnapshot>();
            snapshotToSave.TextChannels = request.ServerSnapshot.TextChannels ?? new List<ChannelSnapshot>();
            snapshotToSave.VoiceChannels = request.ServerSnapshot.VoiceChannels ?? new List<ChannelSnapshot>();
        }
        if (existingSnapshot is not null &&
            !string.Equals(existingSnapshot.OwnerId, currentUser.UserId, StringComparison.Ordinal))
        {
            PreserveVoiceChannelStatusesForNonOwner(existingStatusByChannelId, snapshotToSave);
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

    private static IReadOnlyDictionary<string, string> GetVoiceChannelStatusesByChannelId(ServerSnapshot? existingSnapshot)
    {
        return (existingSnapshot?.VoiceChannels ?? new List<ChannelSnapshot>())
            .Where(channel => !string.IsNullOrWhiteSpace(channel.Id))
            .GroupBy(channel => channel.Id.Trim(), StringComparer.Ordinal)
            .ToDictionary(group => group.Key, group => group.First().Status ?? string.Empty, StringComparer.Ordinal);
    }

    private static void PreserveVoiceChannelStatusesForNonOwner(IReadOnlyDictionary<string, string> existingStatusByChannelId, ServerSnapshot snapshotToSave)
    {
        foreach (var channel in snapshotToSave.VoiceChannels ?? new List<ChannelSnapshot>())
        {
            var channelId = channel.Id?.Trim() ?? string.Empty;
            if (existingStatusByChannelId.TryGetValue(channelId, out var existingStatus))
            {
                channel.Status = existingStatus;
                continue;
            }

            channel.Status = string.Empty;
        }
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

    private IActionResult? ValidateRoleMutation(
        ServerSnapshot snapshot,
        string actorUserId,
        ServerRoleSnapshot? existingRole,
        UpsertServerRoleRequest request,
        bool isCreate)
    {
        if (request is null)
        {
            return BadRequest(new { message = "Role payload is required." });
        }

        if (!ServerPermissionEvaluator.CanManageRoles(snapshot, actorUserId))
        {
            return Forbid();
        }

        var roleName = request.Name?.Trim() ?? string.Empty;
        if (string.IsNullOrWhiteSpace(roleName))
        {
            return BadRequest(new { message = "Role name is required." });
        }

        if (!isCreate)
        {
            if (existingRole is null)
            {
                return NotFound(new { message = "Role not found." });
            }

            if (IsProtectedRoleId(existingRole.Id) &&
                !(string.Equals(existingRole.Id, "owner", StringComparison.Ordinal) &&
                  string.Equals(snapshot.OwnerId, actorUserId, StringComparison.Ordinal)))
            {
                return BadRequest(new { message = "System role cannot be edited." });
            }

            if (!CanTouchRole(snapshot, actorUserId, existingRole))
            {
                return Forbid();
            }
        }

        var isOwner = string.Equals(snapshot.OwnerId, actorUserId, StringComparison.Ordinal);
        var permissions = request.Permissions ?? new List<string>();
        if (!isOwner && permissions.Any(permission =>
                string.Equals(permission, "manage_server", StringComparison.Ordinal) ||
                string.Equals(permission, "manage_roles", StringComparison.Ordinal)))
        {
            return StatusCode(403, new { message = "Only server owner can grant server or role management permissions." });
        }

        if (!isOwner && isCreate && ServerPermissionEvaluator.GetUserRolePriority(snapshot, actorUserId) <= 101)
        {
            return Forbid();
        }

        return null;
    }

    private static bool CanTouchRole(ServerSnapshot snapshot, string actorUserId, ServerRoleSnapshot role)
    {
        if (string.Equals(snapshot.OwnerId, actorUserId, StringComparison.Ordinal))
        {
            return true;
        }

        var actorPriority = ServerPermissionEvaluator.GetUserRolePriority(snapshot, actorUserId);
        return actorPriority > 0 && actorPriority > role.Priority;
    }

    private static bool IsProtectedRoleId(string? roleId)
    {
        return string.Equals(roleId, "owner", StringComparison.Ordinal) ||
               string.Equals(roleId, "member", StringComparison.Ordinal);
    }

    private Task RecordRolesAuditAsync(
        ServerSnapshot snapshot,
        string actorUserId,
        string actionType,
        string roleId,
        string? roleName,
        CancellationToken cancellationToken)
    {
        return _auditLog.RecordAsync(
            snapshot.Id,
            actorUserId,
            actionType,
            metadata: new Dictionary<string, string?>
            {
                ["serverName"] = snapshot.Name,
                ["roleId"] = roleId,
                ["roleName"] = roleName
            },
            cancellationToken: cancellationToken);
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

public class UpsertServerRoleRequest
{
    public string? Name { get; set; }
    public string? Color { get; set; }
    public List<string>? Permissions { get; set; }
}

public class UpdateServerMemberRoleRequest
{
    public string? RoleId { get; set; }
}
