using BackNoDiscord.Services;

namespace BackNoDiscord.Security;

public static class ServerChannelAuthorization
{
    private const string ChatServerPrefix = "server:";
    private const string ChatChannelMarker = "::channel:";
    private const string PersonalServerPrefix = "server-main-";
    private const string PrivateServerPrefix = "server-";

    public static bool TryGetServerIdFromChatChannelId(string? channelId, out string serverId)
    {
        serverId = string.Empty;
        var normalizedChannelId = (channelId ?? string.Empty).Trim();

        if (!normalizedChannelId.StartsWith(ChatServerPrefix, StringComparison.Ordinal) ||
            !normalizedChannelId.Contains(ChatChannelMarker, StringComparison.Ordinal))
        {
            return false;
        }

        var separatorIndex = normalizedChannelId.IndexOf(ChatChannelMarker, StringComparison.Ordinal);
        if (separatorIndex <= ChatServerPrefix.Length)
        {
            return false;
        }

        serverId = normalizedChannelId[ChatServerPrefix.Length..separatorIndex].Trim();
        return !string.IsNullOrWhiteSpace(serverId);
    }

    public static bool TryGetServerIdFromVoiceChannelName(string? channelName, out string serverId)
    {
        serverId = string.Empty;
        var normalizedChannelName = (channelName ?? string.Empty).Trim();
        var separatorIndex = normalizedChannelName.IndexOf("::", StringComparison.Ordinal);

        if (separatorIndex <= 0)
        {
            return false;
        }

        serverId = normalizedChannelName[..separatorIndex].Trim();
        return !string.IsNullOrWhiteSpace(serverId);
    }

    public static bool CanAccessServer(string serverId, AuthenticatedUser currentUser, ServerSnapshot? snapshot)
    {
        if (string.IsNullOrWhiteSpace(serverId) || string.IsNullOrWhiteSpace(currentUser.UserId))
        {
            return false;
        }

        return IsPersonalDefaultServerForUser(serverId, currentUser.UserId) ||
               IsPrivateServerForUser(serverId, currentUser.UserId) ||
               ServerPermissionEvaluator.CanReadServer(snapshot, currentUser.UserId);
    }

    private static bool IsPersonalDefaultServerForUser(string serverId, string userId)
    {
        return string.Equals(
            serverId.Trim(),
            $"{PersonalServerPrefix}{SanitizeUserScope(userId)}",
            StringComparison.OrdinalIgnoreCase);
    }

    private static bool IsPrivateServerForUser(string serverId, string userId)
    {
        var normalizedUserScope = SanitizeUserScope(userId);
        return serverId.StartsWith(
                   $"{PrivateServerPrefix}{normalizedUserScope}-",
                   StringComparison.OrdinalIgnoreCase) &&
               !serverId.StartsWith(PersonalServerPrefix, StringComparison.OrdinalIgnoreCase);
    }

    private static string SanitizeUserScope(string value)
    {
        var sanitized = new string((value ?? string.Empty)
            .Trim()
            .ToLowerInvariant()
            .Where(character => char.IsLetterOrDigit(character) || character is '-' or '_')
            .ToArray());

        return string.IsNullOrWhiteSpace(sanitized) ? "guest" : sanitized;
    }
}
