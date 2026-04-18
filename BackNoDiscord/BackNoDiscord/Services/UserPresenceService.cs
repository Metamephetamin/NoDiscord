using System.Collections.Concurrent;

namespace BackNoDiscord.Services;

public class UserPresenceService
{
    private readonly ConcurrentDictionary<string, int> _connectionCountsByUserId = new();

    public bool MarkConnected(string userId)
    {
        var normalizedUserId = NormalizeUserId(userId);
        if (string.IsNullOrWhiteSpace(normalizedUserId))
        {
            return false;
        }

        var becameOnline = false;
        _connectionCountsByUserId.AddOrUpdate(
            normalizedUserId,
            _ =>
            {
                becameOnline = true;
                return 1;
            },
            (_, currentCount) => Math.Max(1, currentCount + 1));

        return becameOnline;
    }

    public bool MarkDisconnected(string userId, out DateTimeOffset lastSeenAt)
    {
        lastSeenAt = DateTimeOffset.UtcNow;
        var normalizedUserId = NormalizeUserId(userId);
        if (string.IsNullOrWhiteSpace(normalizedUserId))
        {
            return false;
        }

        while (_connectionCountsByUserId.TryGetValue(normalizedUserId, out var currentCount))
        {
            if (currentCount > 1)
            {
                if (_connectionCountsByUserId.TryUpdate(normalizedUserId, currentCount - 1, currentCount))
                {
                    return false;
                }

                continue;
            }

            if (_connectionCountsByUserId.TryRemove(normalizedUserId, out _))
            {
                return true;
            }
        }

        return false;
    }

    public bool IsOnline(string userId)
    {
        var normalizedUserId = NormalizeUserId(userId);
        return !string.IsNullOrWhiteSpace(normalizedUserId)
            && _connectionCountsByUserId.TryGetValue(normalizedUserId, out var connectionCount)
            && connectionCount > 0;
    }

    private static string NormalizeUserId(string? userId) => (userId ?? string.Empty).Trim();
}
