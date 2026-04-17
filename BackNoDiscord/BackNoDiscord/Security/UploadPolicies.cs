using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.StaticFiles;
using System.Buffers.Binary;

namespace BackNoDiscord.Security;

public static class UploadPolicies
{
    private static readonly FileExtensionContentTypeProvider ContentTypeProvider = new();

    private static readonly HashSet<string> AllowedAvatarExtensions = new(StringComparer.OrdinalIgnoreCase)
    {
        ".jpg",
        ".jpeg",
        ".png",
        ".webp",
        ".gif",
        ".mp4"
    };

    private static readonly HashSet<string> AllowedProfileBackgroundExtensions = new(StringComparer.OrdinalIgnoreCase)
    {
        ".jpg",
        ".jpeg",
        ".png",
        ".webp",
        ".gif",
        ".mp4"
    };

    private const double MaxAnimatedAvatarDurationSeconds = 15;
    private const double MaxAnimatedServerIconDurationSeconds = 5;
    private const double MaxAnimatedProfileBackgroundDurationSeconds = 20;

    private static readonly HashSet<string> AllowedServerIconExtensions = new(StringComparer.OrdinalIgnoreCase)
    {
        ".png",
        ".jpg",
        ".jpeg",
        ".heif",
        ".heic",
        ".gif",
        ".mp4"
    };

    private static readonly HashSet<string> AllowedChatExtensions = new(StringComparer.OrdinalIgnoreCase)
    {
        ".jpg",
        ".jpeg",
        ".jfif",
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
            error = "Only JPG, PNG, WEBP, GIF, and MP4 avatars are allowed.";
            return false;
        }

        if (!string.IsNullOrWhiteSpace(file.ContentType) && !IsAllowedAvatarContentType(extension, file.ContentType))
        {
            error = extension == ".mp4" ? "Avatar must be an MP4 video." : "Avatar must be an image.";
            return false;
        }

        if (!HasExpectedFileSignature(file, extension))
        {
            error = "Avatar content does not match the selected file type.";
            return false;
        }

        var durationSeconds = 0d;
        if (extension == ".gif" || extension == ".mp4")
        {
            if (!TryGetAnimatedAvatarDurationSeconds(file, extension, out durationSeconds))
            {
                error = "Could not determine animated avatar duration.";
                return false;
            }
        }

        if ((extension == ".gif" || extension == ".mp4") && durationSeconds > MaxAnimatedAvatarDurationSeconds)
        {
            error = "Animated avatar duration must be less than or equal to 15 seconds.";
            return false;
        }

        return true;
    }

    public static bool TryValidateProfileBackground(IFormFile file, out string extension, out string contentType, out string error)
    {
        extension = NormalizeExtension(file.FileName, ".png");
        contentType = GetContentType(extension);
        error = string.Empty;

        if (!AllowedProfileBackgroundExtensions.Contains(extension))
        {
            error = "Only JPG, PNG, WEBP, GIF, and MP4 profile backgrounds are allowed.";
            return false;
        }

        if (!string.IsNullOrWhiteSpace(file.ContentType) && !IsAllowedAvatarContentType(extension, file.ContentType))
        {
            error = extension == ".mp4" ? "Profile background must be an MP4 video." : "Profile background must be an image.";
            return false;
        }

        if (!HasExpectedFileSignature(file, extension))
        {
            error = "Profile background content does not match the selected file type.";
            return false;
        }

        var durationSeconds = 0d;
        if (extension == ".gif" || extension == ".mp4")
        {
            if (!TryGetAnimatedAvatarDurationSeconds(file, extension, out durationSeconds))
            {
                error = "Could not determine profile background duration.";
                return false;
            }
        }

        if ((extension == ".gif" || extension == ".mp4") && durationSeconds > MaxAnimatedProfileBackgroundDurationSeconds)
        {
            error = "Animated profile background duration must be less than or equal to 20 seconds.";
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
            if (!TryDetectChatFileSignature(file, out var detectedExtension) ||
                !AllowedChatExtensions.Contains(detectedExtension) ||
                !AreCompatibleChatFileExtensions(extension, detectedExtension))
            {
                error = "File content does not match the selected file type.";
                return false;
            }

            extension = NormalizeStorageExtension(detectedExtension);
            contentType = GetContentType(extension);
        }

        extension = NormalizeStorageExtension(extension);
        contentType = GetContentType(extension);
        return true;
    }

    public static bool TryValidateServerIcon(IFormFile file, out string extension, out string contentType, out string error)
    {
        extension = NormalizeExtension(file.FileName, ".png");
        contentType = GetContentType(extension);
        error = string.Empty;

        if (!AllowedServerIconExtensions.Contains(extension))
        {
            error = "Only PNG, JPG, JPEG, HEIF, GIF, and MP4 server icons are allowed.";
            return false;
        }

        if (!string.IsNullOrWhiteSpace(file.ContentType) && !IsAllowedServerIconContentType(extension, file.ContentType))
        {
            error = extension == ".mp4" ? "Server icon must be an MP4 video." : "Server icon must be an image.";
            return false;
        }

        if (!HasExpectedFileSignature(file, extension))
        {
            error = "Server icon content does not match the selected file type.";
            return false;
        }

        var durationSeconds = 0d;
        if (extension == ".gif" || extension == ".mp4")
        {
            if (!TryGetAnimatedAvatarDurationSeconds(file, extension, out durationSeconds))
            {
                error = "Could not determine animated server icon duration.";
                return false;
            }
        }

        if ((extension == ".gif" || extension == ".mp4") && durationSeconds > MaxAnimatedServerIconDurationSeconds)
        {
            error = "Animated server icon duration must be less than or equal to 5 seconds.";
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

    private static string NormalizeStorageExtension(string extension)
    {
        return extension.Equals(".jfif", StringComparison.OrdinalIgnoreCase) ? ".jpg" : extension;
    }

    private static bool AreCompatibleChatFileExtensions(string declaredExtension, string detectedExtension)
    {
        if (declaredExtension.Equals(detectedExtension, StringComparison.OrdinalIgnoreCase))
        {
            return true;
        }

        if (IsJpegExtension(declaredExtension) && IsJpegExtension(detectedExtension))
        {
            return true;
        }

        return IsImageExtension(declaredExtension) && IsImageExtension(detectedExtension);
    }

    private static bool IsJpegExtension(string extension)
    {
        return extension.Equals(".jpg", StringComparison.OrdinalIgnoreCase)
               || extension.Equals(".jpeg", StringComparison.OrdinalIgnoreCase)
               || extension.Equals(".jfif", StringComparison.OrdinalIgnoreCase);
    }

    private static bool IsImageExtension(string extension)
    {
        return extension.Equals(".jpg", StringComparison.OrdinalIgnoreCase)
               || extension.Equals(".jpeg", StringComparison.OrdinalIgnoreCase)
               || extension.Equals(".jfif", StringComparison.OrdinalIgnoreCase)
               || extension.Equals(".png", StringComparison.OrdinalIgnoreCase)
               || extension.Equals(".webp", StringComparison.OrdinalIgnoreCase)
               || extension.Equals(".gif", StringComparison.OrdinalIgnoreCase)
               || extension.Equals(".bmp", StringComparison.OrdinalIgnoreCase);
    }

    private static bool TryDetectChatFileSignature(IFormFile file, out string extension)
    {
        using var stream = file.OpenReadStream();
        if (stream.CanSeek)
        {
            stream.Position = 0;
        }

        Span<byte> buffer = stackalloc byte[512];
        var bytesRead = stream.Read(buffer);
        var header = buffer[..bytesRead];

        extension = string.Empty;

        if (StartsWith(header, 0xFF, 0xD8, 0xFF))
        {
            extension = ".jpg";
            return true;
        }

        if (StartsWith(header, 0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A))
        {
            extension = ".png";
            return true;
        }

        if (StartsWithAscii(header, "RIFF") && HasAsciiAt(header, 8, "WEBP"))
        {
            extension = ".webp";
            return true;
        }

        if (StartsWithAscii(header, "GIF87a") || StartsWithAscii(header, "GIF89a"))
        {
            extension = ".gif";
            return true;
        }

        if (StartsWithAscii(header, "BM"))
        {
            extension = ".bmp";
            return true;
        }

        return false;
    }

    private static bool HasExpectedFileSignature(IFormFile file, string extension)
    {
        using var stream = file.OpenReadStream();
        if (stream.CanSeek)
        {
            stream.Position = 0;
        }

        Span<byte> buffer = stackalloc byte[512];
        var bytesRead = stream.Read(buffer);
        var header = buffer[..bytesRead];

        return extension switch
        {
            ".jpg" or ".jpeg" or ".jfif" => StartsWith(header, 0xFF, 0xD8, 0xFF),
            ".png" => StartsWith(header, 0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A),
            ".webp" => StartsWithAscii(header, "RIFF") && HasAsciiAt(header, 8, "WEBP"),
            ".gif" => StartsWithAscii(header, "GIF87a") || StartsWithAscii(header, "GIF89a"),
            ".heif" or ".heic" => HasAsciiAt(header, 4, "ftyp"),
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

    private static bool IsAllowedAvatarContentType(string extension, string contentType)
    {
        if (extension == ".mp4")
        {
            return string.Equals(contentType, "video/mp4", StringComparison.OrdinalIgnoreCase);
        }

        return contentType.StartsWith("image/", StringComparison.OrdinalIgnoreCase);
    }

    private static bool IsAllowedServerIconContentType(string extension, string contentType)
    {
        if (extension == ".mp4")
        {
            return string.Equals(contentType, "video/mp4", StringComparison.OrdinalIgnoreCase);
        }

        if (extension is ".heif" or ".heic")
        {
            return string.Equals(contentType, "image/heif", StringComparison.OrdinalIgnoreCase)
                   || string.Equals(contentType, "image/heic", StringComparison.OrdinalIgnoreCase)
                   || string.Equals(contentType, "image/heif-sequence", StringComparison.OrdinalIgnoreCase)
                   || string.Equals(contentType, "image/heic-sequence", StringComparison.OrdinalIgnoreCase);
        }

        return contentType.StartsWith("image/", StringComparison.OrdinalIgnoreCase);
    }

    private static bool TryGetAnimatedAvatarDurationSeconds(IFormFile file, string extension, out double durationSeconds)
    {
        durationSeconds = 0;

        using var stream = file.OpenReadStream();
        using var memoryStream = new MemoryStream();
        stream.CopyTo(memoryStream);
        var bytes = memoryStream.ToArray();

        return extension switch
        {
            ".gif" => TryReadGifDuration(bytes, out durationSeconds),
            ".mp4" => TryReadMp4Duration(bytes, out durationSeconds),
            _ => false
        };
    }

    private static bool TryReadGifDuration(byte[] bytes, out double durationSeconds)
    {
        durationSeconds = 0;
        if (bytes.Length < 14 || !StartsWithAscii(bytes, "GIF87a") && !StartsWithAscii(bytes, "GIF89a"))
        {
            return false;
        }

        var durationCentiseconds = 0;
        for (var index = 0; index < bytes.Length - 7; index++)
        {
            if (bytes[index] == 0x21 &&
                bytes[index + 1] == 0xF9 &&
                bytes[index + 2] == 0x04)
            {
                durationCentiseconds += bytes[index + 4] | (bytes[index + 5] << 8);
            }
        }

        durationSeconds = durationCentiseconds / 100d;
        return durationCentiseconds > 0;
    }

    private static bool TryReadMp4Duration(byte[] bytes, out double durationSeconds)
    {
        durationSeconds = 0;
        return TryReadMp4Duration(bytes, 0, bytes.Length, out durationSeconds)
               || TryReadMp4DurationByMovieHeaderScan(bytes, out durationSeconds);
    }

    private static bool TryReadMp4Duration(byte[] bytes, int start, int length, out double durationSeconds)
    {
        durationSeconds = 0;
        var end = start + length;
        var offset = start;

        while (offset + 8 <= end)
        {
            var atomSize = ReadMp4AtomSize(bytes, offset, end, out var headerSize);
            if (atomSize <= 0 || offset + atomSize > end)
            {
                return false;
            }

            var atomType = GetAscii(bytes, offset + 4, 4);
            if (atomType == "moov")
            {
                if (TryReadMp4Duration(bytes, offset + headerSize, atomSize - headerSize, out durationSeconds))
                {
                    return true;
                }
            }
            else if (atomType == "mvhd")
            {
                return TryReadMovieHeaderDuration(bytes, offset + headerSize, atomSize - headerSize, out durationSeconds);
            }

            offset += atomSize;
        }

        return false;
    }

    private static bool TryReadMovieHeaderDuration(byte[] bytes, int offset, int length, out double durationSeconds)
    {
        durationSeconds = 0;
        if (length < 20 || offset + length > bytes.Length)
        {
            return false;
        }

        var version = bytes[offset];
        if (version == 0)
        {
            if (length < 20)
            {
                return false;
            }

            var timescale = BinaryPrimitives.ReadUInt32BigEndian(bytes.AsSpan(offset + 12, 4));
            var duration = BinaryPrimitives.ReadUInt32BigEndian(bytes.AsSpan(offset + 16, 4));
            if (timescale == 0 || duration == 0)
            {
                return false;
            }

            durationSeconds = duration / (double)timescale;
            return true;
        }

        if (version == 1)
        {
            if (length < 32)
            {
                return false;
            }

            var timescale = BinaryPrimitives.ReadUInt32BigEndian(bytes.AsSpan(offset + 20, 4));
            var duration = BinaryPrimitives.ReadUInt64BigEndian(bytes.AsSpan(offset + 24, 8));
            if (timescale == 0 || duration == 0)
            {
                return false;
            }

            durationSeconds = duration / (double)timescale;
            return true;
        }

        return false;
    }

    private static bool TryReadMp4DurationByMovieHeaderScan(byte[] bytes, out double durationSeconds)
    {
        durationSeconds = 0;
        var searchOffset = 0;

        while (searchOffset <= bytes.Length - 4)
        {
            var atomTypeOffset = FindAscii(bytes, "mvhd", searchOffset);
            if (atomTypeOffset < 4)
            {
                return false;
            }

            var atomOffset = atomTypeOffset - 4;
            var atomSize = ReadMp4AtomSize(bytes, atomOffset, bytes.Length, out var headerSize);
            if (atomSize > 0 &&
                atomOffset + atomSize <= bytes.Length &&
                TryReadMovieHeaderDuration(bytes, atomOffset + headerSize, atomSize - headerSize, out durationSeconds))
            {
                return true;
            }

            searchOffset = atomTypeOffset + 4;
        }

        return false;
    }

    private static int ReadMp4AtomSize(byte[] bytes, int offset, int end, out int headerSize)
    {
        headerSize = 8;
        if (offset + 8 > end)
        {
            return 0;
        }

        var size = BinaryPrimitives.ReadUInt32BigEndian(bytes.AsSpan(offset, 4));
        if (size == 1)
        {
            if (offset + 16 > end)
            {
                return 0;
            }

            headerSize = 16;
            var extendedSize = BinaryPrimitives.ReadUInt64BigEndian(bytes.AsSpan(offset + 8, 8));
            return extendedSize > int.MaxValue ? 0 : (int)extendedSize;
        }

        return size == 0 ? end - offset : (int)size;
    }

    private static string GetAscii(byte[] bytes, int offset, int count)
    {
        if (offset < 0 || count <= 0 || offset + count > bytes.Length)
        {
            return string.Empty;
        }

        return System.Text.Encoding.ASCII.GetString(bytes, offset, count);
    }

    private static int FindAscii(byte[] bytes, string signature, int startOffset)
    {
        if (string.IsNullOrEmpty(signature) || startOffset < 0)
        {
            return -1;
        }

        for (var offset = startOffset; offset <= bytes.Length - signature.Length; offset++)
        {
            if (HasAsciiAt(bytes, offset, signature))
            {
                return offset;
            }
        }

        return -1;
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
