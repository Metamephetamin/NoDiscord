namespace BackNoDiscord.Services;

public interface IClientUpdateService
{
    ClientUpdateDescriptor GetDescriptor(string? clientVersion, string? platform, string? arch);
}

public sealed class ClientUpdateService : IClientUpdateService
{
    private readonly IConfiguration _configuration;

    public ClientUpdateService(IConfiguration configuration)
    {
        _configuration = configuration;
    }

    public ClientUpdateDescriptor GetDescriptor(string? clientVersion, string? platform, string? arch)
    {
        var normalizedPlatform = NormalizePlatform(platform);
        var normalizedArch = NormalizeArch(arch);
        var latestVersion = NormalizeVersion(_configuration["ClientUpdates:LatestVersion"]);
        var minimumVersion = NormalizeVersion(_configuration["ClientUpdates:MinimumVersion"]) ?? latestVersion;
        var currentVersion = NormalizeVersion(clientVersion);
        var updateAvailable = CompareVersions(currentVersion, latestVersion) < 0;
        var required = CompareVersions(currentVersion, minimumVersion) < 0;

        var downloadUrl = ResolvePlatformValue(normalizedPlatform, normalizedArch, "DownloadUrl");
        var sha256 = NormalizeSha256(ResolvePlatformValue(normalizedPlatform, normalizedArch, "Sha256"));
        var releaseNotes = _configuration["ClientUpdates:ReleaseNotes"]?.Trim() ?? string.Empty;
        var autoInstallOnQuit = bool.TryParse(_configuration["ClientUpdates:AutoInstallOnQuit"], out var parsedAutoInstallOnQuit)
            ? parsedAutoInstallOnQuit
            : true;

        return new ClientUpdateDescriptor
        {
            Platform = normalizedPlatform,
            Arch = normalizedArch,
            CurrentVersion = currentVersion,
            LatestVersion = latestVersion,
            MinimumVersion = minimumVersion,
            UpdateAvailable = updateAvailable,
            Required = required,
            IsCompatible = !required,
            DownloadAvailable = updateAvailable && !string.IsNullOrWhiteSpace(downloadUrl) && !string.IsNullOrWhiteSpace(sha256),
            DownloadUrl = downloadUrl,
            Sha256 = sha256,
            ReleaseNotes = releaseNotes,
            AutoInstallOnQuit = autoInstallOnQuit,
            CheckedAtUtc = DateTimeOffset.UtcNow
        };
    }

    private string ResolvePlatformValue(string platform, string arch, string field)
    {
        return _configuration[$"ClientUpdates:{platform}:{arch}:{field}"]?.Trim()
            ?? _configuration[$"ClientUpdates:{platform}:{field}"]?.Trim()
            ?? _configuration[$"ClientUpdates:{field}"]?.Trim()
            ?? string.Empty;
    }

    private static string NormalizeSha256(string? value)
    {
        var normalized = value?.Trim().ToLowerInvariant() ?? string.Empty;
        return normalized.Length == 64 && normalized.All(Uri.IsHexDigit)
            ? normalized
            : string.Empty;
    }

    internal static string NormalizePlatform(string? value)
    {
        return string.Equals(value?.Trim(), "win32", StringComparison.OrdinalIgnoreCase)
            ? "windows"
            : string.IsNullOrWhiteSpace(value)
                ? "windows"
                : value.Trim().ToLowerInvariant();
    }

    internal static string NormalizeArch(string? value)
    {
        return string.Equals(value?.Trim(), "x86_64", StringComparison.OrdinalIgnoreCase)
            ? "x64"
            : string.IsNullOrWhiteSpace(value)
                ? "x64"
                : value.Trim().ToLowerInvariant();
    }

    internal static string NormalizeVersion(string? value)
    {
        var trimmed = value?.Trim() ?? string.Empty;
        if (string.IsNullOrWhiteSpace(trimmed))
        {
            return string.Empty;
        }

        var normalized = trimmed;
        var prereleaseIndex = normalized.IndexOfAny(['-', '+']);
        if (prereleaseIndex >= 0)
        {
            normalized = normalized[..prereleaseIndex];
        }

        return normalized.Trim();
    }

    public static int CompareVersions(string? left, string? right)
    {
        var leftSegments = ParseVersionSegments(left);
        var rightSegments = ParseVersionSegments(right);

        if (leftSegments.Count == 0 && rightSegments.Count == 0)
        {
            return 0;
        }

        if (leftSegments.Count == 0)
        {
            return string.IsNullOrWhiteSpace(right) ? 0 : -1;
        }

        if (rightSegments.Count == 0)
        {
            return 1;
        }

        var maxLength = Math.Max(leftSegments.Count, rightSegments.Count);
        for (var index = 0; index < maxLength; index += 1)
        {
            var leftValue = index < leftSegments.Count ? leftSegments[index] : 0;
            var rightValue = index < rightSegments.Count ? rightSegments[index] : 0;
            var comparison = leftValue.CompareTo(rightValue);
            if (comparison != 0)
            {
                return comparison;
            }
        }

        return 0;
    }

    private static IReadOnlyList<int> ParseVersionSegments(string? value)
    {
        var normalized = NormalizeVersion(value);
        if (string.IsNullOrWhiteSpace(normalized))
        {
            return [];
        }

        var result = new List<int>();
        foreach (var segment in normalized.Split('.', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries))
        {
            if (!int.TryParse(segment, out var parsedSegment) || parsedSegment < 0)
            {
                return [];
            }

            result.Add(parsedSegment);
        }

        return result;
    }
}

public sealed class ClientUpdateDescriptor
{
    public string Platform { get; set; } = "windows";
    public string Arch { get; set; } = "x64";
    public string CurrentVersion { get; set; } = string.Empty;
    public string LatestVersion { get; set; } = string.Empty;
    public string MinimumVersion { get; set; } = string.Empty;
    public bool UpdateAvailable { get; set; }
    public bool Required { get; set; }
    public bool IsCompatible { get; set; } = true;
    public bool DownloadAvailable { get; set; }
    public string DownloadUrl { get; set; } = string.Empty;
    public string Sha256 { get; set; } = string.Empty;
    public string ReleaseNotes { get; set; } = string.Empty;
    public bool AutoInstallOnQuit { get; set; } = true;
    public DateTimeOffset CheckedAtUtc { get; set; }
}
