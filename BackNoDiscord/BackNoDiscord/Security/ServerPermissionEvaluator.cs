using BackNoDiscord.Services;

namespace BackNoDiscord.Security;

public static class ServerPermissionEvaluator
{
    public static bool CanReadServer(ServerSnapshot? snapshot, string userId)
    {
        if (snapshot is null || string.IsNullOrWhiteSpace(userId))
        {
            return false;
        }

        return IsOwner(snapshot, userId) || IsMember(snapshot, userId);
    }

    public static bool CanManageServer(ServerSnapshot? snapshot, string userId)
    {
        if (snapshot is null || string.IsNullOrWhiteSpace(userId))
        {
            return false;
        }

        if (IsOwner(snapshot, userId))
        {
            return true;
        }

        return GetPermissions(snapshot, userId).Contains("manage_server", StringComparer.Ordinal);
    }

    public static bool CanInviteMembers(ServerSnapshot? snapshot, string userId)
    {
        if (snapshot is null || string.IsNullOrWhiteSpace(userId))
        {
            return false;
        }

        if (IsOwner(snapshot, userId))
        {
            return true;
        }

        var permissions = GetPermissions(snapshot, userId);
        return permissions.Contains("invite_members", StringComparer.Ordinal) ||
               permissions.Contains("manage_server", StringComparer.Ordinal);
    }

    public static bool CanManageChannels(ServerSnapshot? snapshot, string userId)
    {
        if (snapshot is null || string.IsNullOrWhiteSpace(userId))
        {
            return false;
        }

        if (IsOwner(snapshot, userId))
        {
            return true;
        }

        var permissions = GetPermissions(snapshot, userId);
        return permissions.Contains("manage_channels", StringComparer.Ordinal) ||
               permissions.Contains("manage_server", StringComparer.Ordinal);
    }

    public static bool CanCreateInvite(ServerSnapshot? existingSnapshot, ServerSnapshot? requestedSnapshot, string userId)
    {
        if (requestedSnapshot is null || string.IsNullOrWhiteSpace(userId))
        {
            return false;
        }

        if (existingSnapshot is not null)
        {
            if (CanReadServer(existingSnapshot, userId))
            {
                return true;
            }

            var hasStoredOwner = !string.IsNullOrWhiteSpace(existingSnapshot.OwnerId);
            var hasStoredMembers = existingSnapshot.Members?.Any(member => !string.IsNullOrWhiteSpace(member.UserId)) == true;
            return !hasStoredOwner && !hasStoredMembers && CanInviteMembers(requestedSnapshot, userId);
        }

        return CanInviteMembers(requestedSnapshot, userId);
    }

    public static bool CanManageVoiceState(ServerSnapshot? snapshot, string actorUserId, string targetUserId, string permission)
    {
        if (snapshot is null ||
            string.IsNullOrWhiteSpace(actorUserId) ||
            string.IsNullOrWhiteSpace(targetUserId) ||
            string.IsNullOrWhiteSpace(permission) ||
            string.Equals(actorUserId, targetUserId, StringComparison.Ordinal))
        {
            return false;
        }

        if (IsOwner(snapshot, actorUserId))
        {
            return !string.Equals(snapshot.OwnerId, targetUserId, StringComparison.Ordinal);
        }

        var actorMember = snapshot.Members?.FirstOrDefault(member =>
            string.Equals(member.UserId, actorUserId, StringComparison.Ordinal));
        var targetMember = snapshot.Members?.FirstOrDefault(member =>
            string.Equals(member.UserId, targetUserId, StringComparison.Ordinal));

        if (actorMember is null || targetMember is null)
        {
            return false;
        }

        var actorPermissions = GetPermissions(snapshot, actorUserId);
        if (!actorPermissions.Contains(permission, StringComparer.Ordinal))
        {
            return false;
        }

        return GetRolePriority(snapshot, actorMember.RoleId) > GetRolePriority(snapshot, targetMember.RoleId);
    }

    public static bool IsMember(ServerSnapshot? snapshot, string userId)
    {
        return snapshot?.Members?.Any(member => string.Equals(member.UserId, userId, StringComparison.Ordinal)) == true;
    }

    private static bool IsOwner(ServerSnapshot snapshot, string userId)
    {
        return string.Equals(snapshot.OwnerId, userId, StringComparison.Ordinal);
    }

    private static List<string> GetPermissions(ServerSnapshot snapshot, string userId)
    {
        var roleId = snapshot.Members?
            .FirstOrDefault(member => string.Equals(member.UserId, userId, StringComparison.Ordinal))
            ?.RoleId;

        return snapshot.Roles?
            .FirstOrDefault(role => string.Equals(role.Id, roleId, StringComparison.Ordinal))
            ?.Permissions
            ?.ToList() ?? new List<string>();
    }

    private static int GetRolePriority(ServerSnapshot snapshot, string? roleId)
    {
        return snapshot.Roles?
            .FirstOrDefault(role => string.Equals(role.Id, roleId, StringComparison.Ordinal))
            ?.Priority ?? 0;
    }
}
