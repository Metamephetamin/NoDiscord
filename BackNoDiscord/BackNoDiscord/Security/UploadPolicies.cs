using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.StaticFiles;

namespace BackNoDiscord.Security;

public static class UploadPolicies
{
    private static readonly FileExtensionContentTypeProvider ContentTypeProvider = new();

    private static readonly HashSet<string> AllowedAvatarExtensions = new(StringComparer.OrdinalIgnoreCase)
    {
        ".jpg",
        ".jpeg",
        ".png",
        ".webp"
    };

    private static readonly HashSet<string> AllowedChatExtensions = new(StringComparer.OrdinalIgnoreCase)
    {
        ".jpg",
        ".jpeg",
        ".png",
        ".webp",
        ".gif",
        ".bmp",
        ".pdf",
        ".txt",
        ".md",
        ".zip",
        ".rar",
        ".7z",
        ".mp3",
        ".wav",
        ".ogg",
        ".mp4",
        ".webm"
    };

    public static string SanitizeIdentifier(string? value, string fallback = "user")
    {
        var sanitized = new string((value ?? string.Empty)
            .Trim()
            .Where(character => char.IsLetterOrDigit(character) || character is '-' or '_')
            .ToArray());

        return string.IsNullOrWhiteSpace(sanitized) ? fallback : sanitized;
    }

    public static string SanitizeRelativeAssetUrl(string? value, string expectedPrefix)
    {
        var sanitized = (value ?? string.Empty).Trim();
        if (string.IsNullOrWhiteSpace(sanitized) ||
            sanitized.Length > 260 ||
            !sanitized.StartsWith(expectedPrefix, StringComparison.OrdinalIgnoreCase) ||
            sanitized.Contains("..", StringComparison.Ordinal))
        {
            return string.Empty;
        }

        return sanitized;
    }

    public static string SanitizeDisplayFileName(string? value)
    {
        var fileName = Path.GetFileName((value ?? string.Empty).Trim());
        if (string.IsNullOrWhiteSpace(fileName))
        {
            return "file";
        }

        var invalidCharacters = Path.GetInvalidFileNameChars().ToHashSet();
        var sanitized = new string(fileName
            .Select(character => invalidCharacters.Contains(character) ? '_' : character)
            .ToArray())
            .Trim();

        return string.IsNullOrWhiteSpace(sanitized) ? "file" : TrimToLength(sanitized, 120);
    }

    public static string TrimToLength(string? value, int maxLength)
    {
        var sanitized = (value ?? string.Empty).Trim();
        if (sanitized.Length <= maxLength)
        {
            return sanitized;
        }

        return sanitized[..maxLength];
    }

    public static bool TryValidateAvatar(IFormFile file, out string extension, out string contentType, out string error)
    {
        extension = NormalizeExtension(file.FileName, ".png");
        contentType = GetContentType(extension);
        error = string.Empty;

        if (!AllowedAvatarExtensions.Contains(extension))
        {
            error = "Only JPG, PNG, and WEBP avatars are allowed.";
            return false;
        }

        if (!string.IsNullOrWhiteSpace(file.ContentType) &&
            !file.ContentType.StartsWith("image/", StringComparison.OrdinalIgnoreCase))
        {
            error = "Avatar must be an image.";
            return false;
        }

        return true;
    }

    public static bool TryValidateChatFile(IFormFile file, out string extension, out string contentType, out string error)
    {
        extension = NormalizeExtension(file.FileName, ".bin");
        contentType = GetContentType(extension);
        error = string.Empty;

        if (!AllowedChatExtensions.Contains(extension))
        {
            error = "This file type is not allowed.";
            return false;
        }

        return true;
    }

    private static string NormalizeExtension(string? fileName, string fallback)
    {
        var extension = Path.GetExtension(fileName ?? string.Empty);
        if (string.IsNullOrWhiteSpace(extension))
        {
            return fallback;
        }

        return extension.Trim().ToLowerInvariant();
    }

    private static string GetContentType(string extension)
    {
        return ContentTypeProvider.TryGetContentType($"file{extension}", out var contentType)
            ? contentType
            : "application/octet-stream";
    }
}
