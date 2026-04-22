namespace BackNoDiscord;

public static class ConversationChannels
{
    public const string ChatPrefix = "conversation:";
    public const string VoiceSuffix = "::voice:main";

    public static string BuildChatChannelId(int conversationId)
    {
        return conversationId > 0 ? $"{ChatPrefix}{conversationId}" : string.Empty;
    }

    public static string BuildVoiceChannelName(int conversationId)
    {
        return conversationId > 0 ? $"{ChatPrefix}{conversationId}{VoiceSuffix}" : string.Empty;
    }

    public static bool TryParseChatChannelId(string? channelId, out int conversationId)
    {
        conversationId = 0;

        var normalizedChannelId = channelId?.Trim() ?? string.Empty;
        if (!normalizedChannelId.StartsWith(ChatPrefix, StringComparison.OrdinalIgnoreCase))
        {
            return false;
        }

        var suffix = normalizedChannelId[ChatPrefix.Length..].Trim();
        if (suffix.Contains("::", StringComparison.Ordinal) ||
            !int.TryParse(suffix, out conversationId) ||
            conversationId <= 0)
        {
            conversationId = 0;
            return false;
        }

        return true;
    }

    public static bool TryParseVoiceChannelName(string? channelName, out int conversationId)
    {
        conversationId = 0;

        var normalizedChannelName = channelName?.Trim() ?? string.Empty;
        if (!normalizedChannelName.EndsWith(VoiceSuffix, StringComparison.OrdinalIgnoreCase))
        {
            return false;
        }

        var chatChannelId = normalizedChannelName[..^VoiceSuffix.Length];
        return TryParseChatChannelId(chatChannelId, out conversationId);
    }

    public static string NormalizeChatChannelId(string? channelId)
    {
        return TryParseChatChannelId(channelId, out var conversationId)
            ? BuildChatChannelId(conversationId)
            : (channelId?.Trim() ?? string.Empty);
    }
}
