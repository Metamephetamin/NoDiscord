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
}
