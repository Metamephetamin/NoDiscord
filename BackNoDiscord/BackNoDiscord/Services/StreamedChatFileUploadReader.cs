using BackNoDiscord.Security;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.WebUtilities;
using Microsoft.Net.Http.Headers;

namespace BackNoDiscord.Services;

public sealed class StreamedChatFileUploadException : Exception
{
    public bool IsStorageFailure { get; }

    public StreamedChatFileUploadException(string message) : base(message)
    {
    }

    public StreamedChatFileUploadException(string message, Exception innerException, bool isStorageFailure = false) : base(message, innerException)
    {
        IsStorageFailure = isStorageFailure;
    }

    public StreamedChatFileUploadException(string message, bool isStorageFailure) : base(message)
    {
        IsStorageFailure = isStorageFailure;
    }
}

public sealed record StreamedChatFileUploadResult(
    string FileUrl,
    string DisplayFileName,
    long Size,
    string ContentType);

public sealed record StreamedChatFileUploadLimits(
    long MaxFileSizeBytes,
    long MaxUserStorageBytes,
    long MinFreeDiskBytes);

public interface IChatFileUploadStorageMetrics
{
    long GetUserStoredBytes(string uploadsDirectory, string userId);
    long GetAvailableBytes(string uploadsDirectory);
}

public sealed class LocalChatFileUploadStorageMetrics : IChatFileUploadStorageMetrics
{
    public long GetUserStoredBytes(string uploadsDirectory, string userId)
    {
        if (!Directory.Exists(uploadsDirectory))
        {
            return 0;
        }

        var prefix = $"chat-{UploadPolicies.SanitizeIdentifier(userId)}-";
        return Directory.EnumerateFiles(uploadsDirectory, $"{prefix}*")
            .Sum(path =>
            {
                try
                {
                    return new FileInfo(path).Length;
                }
                catch
                {
                    return 0;
                }
            });
    }

    public long GetAvailableBytes(string uploadsDirectory)
    {
        var directory = Directory.Exists(uploadsDirectory)
            ? uploadsDirectory
            : Path.GetFullPath(Path.GetDirectoryName(uploadsDirectory) ?? uploadsDirectory);
        var root = Path.GetPathRoot(directory);
        if (string.IsNullOrWhiteSpace(root))
        {
            return long.MaxValue;
        }

        return new DriveInfo(root).AvailableFreeSpace;
    }
}

public static class StreamedChatFileUploadReader
{
    private const int BufferSize = 81920;
    private const long MinimumEffectiveDiskReserveBytes = 64L * 1024 * 1024;

    public static async Task<StreamedChatFileUploadResult> UploadAsync(
        HttpRequest request,
        string uploadsDirectory,
        string userId,
        StreamedChatFileUploadLimits limits,
        IChatFileUploadStorageMetrics storageMetrics,
        CancellationToken cancellationToken)
    {
        if (!TryGetBoundary(request.ContentType, out var boundary))
        {
            throw new StreamedChatFileUploadException("Multipart boundary is required.");
        }

        try
        {
            Directory.CreateDirectory(uploadsDirectory);

            var reader = new MultipartReader(boundary, request.Body);
            while (await reader.ReadNextSectionAsync(cancellationToken) is { } section)
            {
                if (!TryGetFileDisposition(section, out var originalFileName))
                {
                    continue;
                }

                return await StoreFileSectionAsync(
                    section,
                    uploadsDirectory,
                    userId,
                    originalFileName,
                    limits,
                    storageMetrics,
                    cancellationToken);
            }

            throw new StreamedChatFileUploadException("File is required.");
        }
        catch (StreamedChatFileUploadException)
        {
            throw;
        }
        catch (Exception exception) when (IsStorageException(exception))
        {
            throw new StreamedChatFileUploadException(
                "Chat file storage is temporarily unavailable.",
                exception,
                isStorageFailure: true);
        }
    }

    private static async Task<StreamedChatFileUploadResult> StoreFileSectionAsync(
        MultipartSection section,
        string uploadsDirectory,
        string userId,
        string originalFileName,
        StreamedChatFileUploadLimits limits,
        IChatFileUploadStorageMetrics storageMetrics,
        CancellationToken cancellationToken)
    {
        var userStoredBytes = Math.Max(0, storageMetrics.GetUserStoredBytes(uploadsDirectory, userId));
        if (userStoredBytes >= limits.MaxUserStorageBytes)
        {
            throw new StreamedChatFileUploadException("User storage quota exceeded.");
        }

        var availableBytes = Math.Max(0, storageMetrics.GetAvailableBytes(uploadsDirectory));
        var writableBytesBeforeReserve = availableBytes - ResolveEffectiveDiskReserveBytes(availableBytes, limits.MinFreeDiskBytes);
        if (writableBytesBeforeReserve <= 0)
        {
            throw new StreamedChatFileUploadException("Not enough free disk space.", isStorageFailure: true);
        }

        var tempFilePath = Path.Combine(uploadsDirectory, $"upload-{Guid.NewGuid():N}.tmp");
        var totalBytes = 0L;

        try
        {
            await using (var output = new FileStream(tempFilePath, FileMode.CreateNew, FileAccess.Write, FileShare.None, BufferSize, FileOptions.SequentialScan))
            {
                var buffer = new byte[BufferSize];
                while (true)
                {
                    var bytesRead = await section.Body.ReadAsync(buffer.AsMemory(0, buffer.Length), cancellationToken);
                    if (bytesRead == 0)
                    {
                        break;
                    }

                    totalBytes += bytesRead;
                    if (totalBytes > limits.MaxFileSizeBytes)
                    {
                        throw new StreamedChatFileUploadException("File size limit exceeded.");
                    }

                    if (userStoredBytes + totalBytes > limits.MaxUserStorageBytes)
                    {
                        throw new StreamedChatFileUploadException("User storage quota exceeded.");
                    }

                    if (totalBytes > writableBytesBeforeReserve)
                    {
                        throw new StreamedChatFileUploadException("Not enough free disk space.", isStorageFailure: true);
                    }

                    await output.WriteAsync(buffer.AsMemory(0, bytesRead), cancellationToken);
                }
            }

            if (totalBytes == 0)
            {
                throw new StreamedChatFileUploadException("File is required.");
            }

            string extension;
            string contentType;
            var declaredContentType = section.ContentType ?? string.Empty;
            await using (var validationStream = new FileStream(tempFilePath, FileMode.Open, FileAccess.Read, FileShare.Read, BufferSize, FileOptions.SequentialScan))
            {
                IFormFile validationFile = new FormFile(validationStream, 0, totalBytes, "File", originalFileName)
                {
                    Headers = new HeaderDictionary(),
                    ContentType = declaredContentType
                };

                if (!UploadPolicies.TryValidateChatFile(validationFile, out extension, out contentType, out var error))
                {
                    throw new StreamedChatFileUploadException(error);
                }
            }

            var fileName = $"chat-{UploadPolicies.SanitizeIdentifier(userId)}-{Guid.NewGuid():N}{extension}";
            var finalFilePath = Path.Combine(uploadsDirectory, fileName);
            File.Move(tempFilePath, finalFilePath);

            return new StreamedChatFileUploadResult(
                FileUrl: $"/chat-files/{fileName}",
                DisplayFileName: UploadPolicies.SanitizeDisplayFileName(originalFileName),
                Size: totalBytes,
                ContentType: contentType);
        }
        catch
        {
            TryDeleteFile(tempFilePath);
            throw;
        }
    }

    private static bool TryGetBoundary(string? contentType, out string boundary)
    {
        boundary = string.Empty;
        if (string.IsNullOrWhiteSpace(contentType) ||
            !MediaTypeHeaderValue.TryParse(contentType, out var mediaType) ||
            !string.Equals(mediaType.MediaType.Value, "multipart/form-data", StringComparison.OrdinalIgnoreCase))
        {
            return false;
        }

        boundary = HeaderUtilities.RemoveQuotes(mediaType.Boundary).Value ?? string.Empty;
        return !string.IsNullOrWhiteSpace(boundary);
    }

    private static long ResolveEffectiveDiskReserveBytes(long availableBytes, long configuredReserveBytes)
    {
        var normalizedReserveBytes = Math.Max(0, configuredReserveBytes);
        if (normalizedReserveBytes == 0 || availableBytes <= 0)
        {
            return normalizedReserveBytes;
        }

        var adaptiveReserveBytes = Math.Max(MinimumEffectiveDiskReserveBytes, availableBytes / 10);
        return Math.Min(normalizedReserveBytes, adaptiveReserveBytes);
    }

    private static bool TryGetFileDisposition(MultipartSection section, out string fileName)
    {
        fileName = string.Empty;
        if (string.IsNullOrWhiteSpace(section.ContentDisposition) ||
            !ContentDispositionHeaderValue.TryParse(section.ContentDisposition, out var disposition) ||
            !string.Equals(disposition.DispositionType.Value, "form-data", StringComparison.OrdinalIgnoreCase))
        {
            return false;
        }

        fileName = HeaderUtilities.RemoveQuotes(disposition.FileNameStar).Value
                   ?? HeaderUtilities.RemoveQuotes(disposition.FileName).Value
                   ?? string.Empty;
        return !string.IsNullOrWhiteSpace(fileName);
    }

    private static void TryDeleteFile(string path)
    {
        try
        {
            if (File.Exists(path))
            {
                File.Delete(path);
            }
        }
        catch
        {
            // Best-effort cleanup; the upload has already failed.
        }
    }

    private static bool IsStorageException(Exception exception)
    {
        return exception is IOException or UnauthorizedAccessException;
    }
}
