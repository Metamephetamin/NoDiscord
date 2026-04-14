using Microsoft.EntityFrameworkCore;

namespace BackNoDiscord.Security;

public static class DirectCallAuthorization
{
    private const string DirectCallPrefix = "direct-call::";

    public static bool TryParseChannelName(string? rawChannelName, out int lowUserId, out int highUserId)
    {
        lowUserId = 0;
        highUserId = 0;

        var normalizedChannelName = UploadPolicies.TrimToLength(rawChannelName, 160);
        if (string.IsNullOrWhiteSpace(normalizedChannelName) ||
            !normalizedChannelName.StartsWith(DirectCallPrefix, StringComparison.OrdinalIgnoreCase))
        {
            return false;
        }

        var parts = normalizedChannelName.Split("::", StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
        if (parts.Length != 3 ||
            !int.TryParse(parts[1], out lowUserId) ||
            !int.TryParse(parts[2], out highUserId))
        {
            lowUserId = 0;
            highUserId = 0;
            return false;
        }

        if (lowUserId <= 0 || highUserId <= 0 || lowUserId >= highUserId)
        {
            lowUserId = 0;
            highUserId = 0;
            return false;
        }

        return true;
    }

    public static async Task<bool> CanAccessChannelAsync(
        AppDbContext context,
        string? rawChannelName,
        AuthenticatedUser currentUser,
        CancellationToken cancellationToken = default)
    {
        if (!TryParseChannelName(rawChannelName, out var lowUserId, out var highUserId) ||
            !int.TryParse(currentUser.UserId, out var currentUserId))
        {
            return false;
        }

        if (currentUserId != lowUserId && currentUserId != highUserId)
        {
            return false;
        }

        return await context.Friendships
            .AsNoTracking()
            .AnyAsync(item => item.UserLowId == lowUserId && item.UserHighId == highUserId, cancellationToken);
    }
}
