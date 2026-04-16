namespace BackNoDiscord;

public static class DirectMessageChannels
{
    public const string Prefix = "dm:";
    public const string SelfSegment = "self";

    public static string BuildChannelId(int firstUserId, int secondUserId)
    {
        if (firstUserId <= 0 || secondUserId <= 0)
        {
            return string.Empty;
        }

        if (firstUserId == secondUserId)
        {
            return $"{Prefix}{SelfSegment}:{firstUserId}";
        }

        var lowId = Math.Min(firstUserId, secondUserId);
        var highId = Math.Max(firstUserId, secondUserId);
        return $"{Prefix}{lowId}:{highId}";
    }

    public static bool TryParse(string? channelId, out int firstUserId, out int secondUserId, out bool isSelfChannel)
    {
        firstUserId = 0;
        secondUserId = 0;
        isSelfChannel = false;

        var normalizedChannelId = channelId?.Trim() ?? string.Empty;
        if (!normalizedChannelId.StartsWith(Prefix, StringComparison.OrdinalIgnoreCase))
        {
            return false;
        }

        var parts = normalizedChannelId.Split(':', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
        if (parts.Length != 3)
        {
            return false;
        }

        if (string.Equals(parts[1], SelfSegment, StringComparison.OrdinalIgnoreCase))
        {
            if (!int.TryParse(parts[2], out firstUserId) || firstUserId <= 0)
            {
                return false;
            }

            secondUserId = firstUserId;
            isSelfChannel = true;
            return true;
        }

        if (!int.TryParse(parts[1], out firstUserId) ||
            !int.TryParse(parts[2], out secondUserId) ||
            firstUserId <= 0 ||
            secondUserId <= 0)
        {
            return false;
        }

        isSelfChannel = firstUserId == secondUserId;
        return true;
    }

    public static string NormalizeChannelId(string? channelId)
    {
        return TryParse(channelId, out var firstUserId, out var secondUserId, out _)
            ? BuildChannelId(firstUserId, secondUserId)
            : (channelId?.Trim() ?? string.Empty);
    }

    public static IReadOnlyCollection<string> GetEquivalentChannelIds(string? channelId)
    {
        var normalizedChannelId = channelId?.Trim() ?? string.Empty;
        if (!TryParse(normalizedChannelId, out var firstUserId, out var secondUserId, out var isSelfChannel))
        {
            return string.IsNullOrWhiteSpace(normalizedChannelId)
                ? Array.Empty<string>()
                : new[] { normalizedChannelId };
        }

        var equivalentIds = new HashSet<string>(StringComparer.OrdinalIgnoreCase)
        {
            BuildChannelId(firstUserId, secondUserId),
            $"{Prefix}{firstUserId}:{secondUserId}"
        };

        if (!isSelfChannel)
        {
            equivalentIds.Add($"{Prefix}{secondUserId}:{firstUserId}");
        }

        return equivalentIds.ToArray();
    }
}
