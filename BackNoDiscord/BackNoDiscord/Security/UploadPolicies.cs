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
        ".bin",
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

        if (!HasExpectedFileSignature(file, extension))
        {
            error = "Avatar content does not match the selected file type.";
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

        if (!HasExpectedFileSignature(file, extension))
        {
            error = "File content does not match the selected file type.";
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

    private static bool HasExpectedFileSignature(IFormFile file, string extension)
    {
        using var stream = file.OpenReadStream();
        Span<byte> buffer = stackalloc byte[512];
        var bytesRead = stream.Read(buffer);
        var header = buffer[..bytesRead];

        return extension switch
        {
            ".jpg" or ".jpeg" => StartsWith(header, 0xFF, 0xD8, 0xFF),
            ".png" => StartsWith(header, 0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A),
            ".webp" => StartsWithAscii(header, "RIFF") && HasAsciiAt(header, 8, "WEBP"),
            ".gif" => StartsWithAscii(header, "GIF87a") || StartsWithAscii(header, "GIF89a"),
            ".bmp" => StartsWithAscii(header, "BM"),
            ".pdf" => StartsWithAscii(header, "%PDF"),
            ".zip" => StartsWith(header, 0x50, 0x4B, 0x03, 0x04) || StartsWith(header, 0x50, 0x4B, 0x05, 0x06) || StartsWith(header, 0x50, 0x4B, 0x07, 0x08),
            ".rar" => StartsWith(header, 0x52, 0x61, 0x72, 0x21, 0x1A, 0x07, 0x00) || StartsWith(header, 0x52, 0x61, 0x72, 0x21, 0x1A, 0x07, 0x01, 0x00),
            ".7z" => StartsWith(header, 0x37, 0x7A, 0xBC, 0xAF, 0x27, 0x1C),
            ".mp3" => StartsWithAscii(header, "ID3") || StartsWith(header, 0xFF, 0xFB) || StartsWith(header, 0xFF, 0xF3) || StartsWith(header, 0xFF, 0xF2),
            ".wav" => StartsWithAscii(header, "RIFF") && HasAsciiAt(header, 8, "WAVE"),
            ".ogg" => StartsWithAscii(header, "OggS"),
            ".mp4" => HasAsciiAt(header, 4, "ftyp"),
            ".webm" => StartsWith(header, 0x1A, 0x45, 0xDF, 0xA3),
            ".txt" or ".md" => LooksLikeText(header),
            ".bin" => true,
            _ => false
        };
    }

    private static bool StartsWith(ReadOnlySpan<byte> buffer, params byte[] signature)
    {
        return buffer.Length >= signature.Length && buffer[..signature.Length].SequenceEqual(signature);
    }

    private static bool StartsWithAscii(ReadOnlySpan<byte> buffer, string signature)
    {
        return HasAsciiAt(buffer, 0, signature);
    }

    private static bool HasAsciiAt(ReadOnlySpan<byte> buffer, int offset, string signature)
    {
        if (buffer.Length < offset + signature.Length)
        {
            return false;
        }

        for (var index = 0; index < signature.Length; index++)
        {
            if (buffer[offset + index] != signature[index])
            {
                return false;
            }
        }

        return true;
    }

    private static bool LooksLikeText(ReadOnlySpan<byte> buffer)
    {
        if (buffer.Length == 0)
        {
            return false;
        }

        foreach (var value in buffer)
        {
            if (value == 0)
            {
                return false;
            }

            var isAllowedControl = value is 0x09 or 0x0A or 0x0D;
            if (!isAllowedControl && value < 0x20)
            {
                return false;
            }
        }

        return true;
    }
}
