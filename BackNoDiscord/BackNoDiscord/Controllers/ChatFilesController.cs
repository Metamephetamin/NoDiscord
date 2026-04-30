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

    public ChatFilesController(
        UploadStoragePaths uploadStoragePaths,
        IConfiguration configuration,
        IChatFileUploadStorageMetrics storageMetrics)
    {
        _uploadStoragePaths = uploadStoragePaths;
        _configuration = configuration;
        _storageMetrics = storageMetrics;
    }

    [HttpPost("upload")]
    [EnableRateLimiting("chat-upload")]
    public async Task<IActionResult> Upload(CancellationToken cancellationToken)
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
                Request,
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
