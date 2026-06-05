namespace BackNoDiscord.Services;

public static class ChatFileUploadLimitPolicy
{
    public const string PersonalLimitEmail = "andrey1689123@gmail.com";
    public const long PersonalMaxFileSizeBytes = 30L * 1024 * 1024 * 1024;

    public static StreamedChatFileUploadLimits ApplyPersonalLimits(
        string? email,
        StreamedChatFileUploadLimits configuredLimits)
    {
        if (!string.Equals(
                email?.Trim(),
                PersonalLimitEmail,
                StringComparison.OrdinalIgnoreCase))
        {
            return configuredLimits;
        }

        return configuredLimits with
        {
            MaxFileSizeBytes = Math.Max(configuredLimits.MaxFileSizeBytes, PersonalMaxFileSizeBytes),
            MaxUserStorageBytes = Math.Max(configuredLimits.MaxUserStorageBytes, PersonalMaxFileSizeBytes)
        };
    }
}
