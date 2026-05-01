using BackNoDiscord.Infrastructure;
using BackNoDiscord.Security;
using BackNoDiscord.Services;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http.Features;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.StaticFiles;
using Microsoft.AspNetCore.RateLimiting;

namespace BackNoDiscord.Controllers;

[ApiController]
[Route("api/chat-files")]
[Authorize(AuthenticationSchemes = JwtBearerDefaults.AuthenticationScheme)]
public class ChatFilesController : ControllerBase
{
    private const long DefaultMaxFileSizeBytes = 100L * 1024 * 1024;
    private const long DefaultMaxUserStorageBytes = 5L * 1024 * 1024 * 1024;
    private const long DefaultMinFreeDiskBytes = 1L * 1024 * 1024 * 1024;
    private const long MultipartRequestOverheadBytes = 1L * 1024 * 1024;
    private static readonly FileExtensionContentTypeProvider ContentTypeProvider = new();
    private readonly UploadStoragePaths _uploadStoragePaths;
    private readonly IConfiguration _configuration;
    private readonly IChatFileUploadStorageMetrics _storageMetrics;
    private readonly ILogger<ChatFilesController> _logger;

    public ChatFilesController(
        UploadStoragePaths uploadStoragePaths,
        IConfiguration configuration,
        IChatFileUploadStorageMetrics storageMetrics,
        ILogger<ChatFilesController> logger)
    {
        _uploadStoragePaths = uploadStoragePaths;
        _configuration = configuration;
        _storageMetrics = storageMetrics;
        _logger = logger;
    }

    [HttpPost("upload")]
    [Consumes("multipart/form-data")]
    [EnableRateLimiting("chat-upload")]
    public async Task<IActionResult> Upload([FromForm(Name = "file")] IFormFile? file, CancellationToken cancellationToken)
    {
        if (!AuthenticatedUserAccessor.TryGetAuthenticatedUser(User, out var currentUser))
        {
            return Unauthorized();
        }

        var limits = ResolveUploadLimits();
        ApplyRequestBodyLimit(limits);
        var uploadsDirectory = _uploadStoragePaths.ResolveDirectory("chat-files");
        try
        {
            var upload = await StreamedChatFileUploadReader.UploadAsync(
                file,
                uploadsDirectory,
                currentUser.UserId,
                limits,
                _storageMetrics,
                cancellationToken);

            return Ok(new
            {
                fileUrl = upload.FileUrl,
                fileName = upload.DisplayFileName,
                size = upload.Size,
                contentType = upload.ContentType
            });
        }
        catch (StreamedChatFileUploadException exception)
        {
            if (exception.IsStorageFailure)
            {
                var diagnostics = BuildStorageDiagnostics(uploadsDirectory, exception);
                _logger.LogError(
                    exception,
                    "Chat file upload storage failed for user {UserId}. {Diagnostics}",
                    currentUser.UserId,
                    diagnostics.Summary);
                Response.Headers["X-Upload-Storage-Diagnostics"] = diagnostics.Summary;
                return StatusCode(StatusCodes.Status503ServiceUnavailable, new
                {
                    message = $"{exception.Message} {diagnostics.Summary}",
                    storage = diagnostics
                });
            }

            var message = string.Equals(exception.Message, "File size limit exceeded.", StringComparison.Ordinal)
                ? $"File size must be less than or equal to {FormatBytes(limits.MaxFileSizeBytes)}"
                : exception.Message;
            return BadRequest(new { message });
        }
    }

    private StreamedChatFileUploadLimits ResolveUploadLimits()
    {
        var maxFileSizeBytes = GetConfiguredBytes("ChatFiles:MaxFileSizeBytes", DefaultMaxFileSizeBytes);
        var maxUserStorageBytes = Math.Max(
            maxFileSizeBytes,
            GetConfiguredBytes("ChatFiles:MaxUserStorageBytes", DefaultMaxUserStorageBytes));
        var minFreeDiskBytes = GetConfiguredBytes("ChatFiles:MinFreeDiskBytes", DefaultMinFreeDiskBytes);

        return new StreamedChatFileUploadLimits(maxFileSizeBytes, maxUserStorageBytes, minFreeDiskBytes);
    }

    private long GetConfiguredBytes(string key, long fallback)
    {
        return long.TryParse(_configuration[key], out var configured) && configured > 0
            ? configured
            : fallback;
    }

    private void ApplyRequestBodyLimit(StreamedChatFileUploadLimits limits)
    {
        var feature = HttpContext.Features.Get<IHttpMaxRequestBodySizeFeature>();
        if (feature is null || feature.IsReadOnly)
        {
            return;
        }

        feature.MaxRequestBodySize = checked(limits.MaxFileSizeBytes + MultipartRequestOverheadBytes);
    }

    private static string FormatBytes(long bytes)
    {
        const long gigabyte = 1024L * 1024 * 1024;
        const long megabyte = 1024L * 1024;

        if (bytes % gigabyte == 0)
        {
            return $"{bytes / gigabyte} GB";
        }

        if (bytes % megabyte == 0)
        {
            return $"{bytes / megabyte} MB";
        }

        return $"{bytes} bytes";
    }

    private StorageDiagnostics BuildStorageDiagnostics(string uploadsDirectory, Exception exception)
    {
        var parentDirectory = Path.GetDirectoryName(uploadsDirectory) ?? string.Empty;
        var directoryExists = Directory.Exists(uploadsDirectory);
        var parentExists = !string.IsNullOrWhiteSpace(parentDirectory) && Directory.Exists(parentDirectory);
        long? availableBytes = null;
        string? availableBytesError = null;
        var writable = false;
        string? writeError = null;

        try
        {
            availableBytes = _storageMetrics.GetAvailableBytes(uploadsDirectory);
        }
        catch (Exception metricException)
        {
            availableBytesError = $"{metricException.GetType().Name}: {metricException.Message}";
        }

        try
        {
            Directory.CreateDirectory(uploadsDirectory);
            var probePath = Path.Combine(uploadsDirectory, $".upload-diagnostic-{Guid.NewGuid():N}.tmp");
            System.IO.File.WriteAllText(probePath, "ok");
            System.IO.File.Delete(probePath);
            writable = true;
            directoryExists = true;
        }
        catch (Exception writeException)
        {
            writeError = $"{writeException.GetType().Name}: {writeException.Message}";
        }

        var rootException = exception.InnerException ?? exception;
        var rootError = $"{rootException.GetType().Name}: {rootException.Message}";
        var summary =
            $"storageDirectory={uploadsDirectory}; " +
            $"exists={directoryExists}; " +
            $"parentExists={parentExists}; " +
            $"writable={writable}; " +
            $"availableBytes={availableBytes?.ToString() ?? "unknown"}; " +
            $"rootError={rootError}";

        if (!string.IsNullOrWhiteSpace(availableBytesError))
        {
            summary += $"; availableBytesError={availableBytesError}";
        }

        if (!string.IsNullOrWhiteSpace(writeError))
        {
            summary += $"; writeProbeError={writeError}";
        }

        return new StorageDiagnostics(
            Directory: uploadsDirectory,
            Exists: directoryExists,
            ParentDirectory: parentDirectory,
            ParentExists: parentExists,
            Writable: writable,
            AvailableBytes: availableBytes,
            RootError: rootError,
            AvailableBytesError: availableBytesError,
            WriteProbeError: writeError,
            Summary: summary);
    }

    private sealed record StorageDiagnostics(
        string Directory,
        bool Exists,
        string ParentDirectory,
        bool ParentExists,
        bool Writable,
        long? AvailableBytes,
        string RootError,
        string? AvailableBytesError,
        string? WriteProbeError,
        string Summary);

    [HttpGet("/chat-files/{fileName}")]
    [HttpHead("/chat-files/{fileName}")]
    public IActionResult Download([FromRoute] string fileName)
    {
        var safeFileName = Path.GetFileName(fileName ?? string.Empty);
        if (string.IsNullOrWhiteSpace(safeFileName) ||
            !string.Equals(safeFileName, fileName, StringComparison.Ordinal))
        {
            return NotFound();
        }

        var uploadsDirectory = _uploadStoragePaths.ResolveDirectory("chat-files");
        var filePath = Path.Combine(uploadsDirectory, safeFileName);
        if (!System.IO.File.Exists(filePath))
        {
            return NotFound();
        }

        if (!ContentTypeProvider.TryGetContentType(filePath, out var contentType))
        {
            contentType = "application/octet-stream";
        }

        Response.Headers.CacheControl = "private,max-age=604800";
        Response.Headers["X-Content-Type-Options"] = "nosniff";
        return PhysicalFile(filePath, contentType, enableRangeProcessing: true);
    }
}
