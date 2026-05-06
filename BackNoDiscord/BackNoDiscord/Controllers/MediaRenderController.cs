using BackNoDiscord.Infrastructure;
using BackNoDiscord.Security;
using BackNoDiscord.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using SixLabors.ImageSharp;
using SixLabors.ImageSharp.Formats.Gif;
using SixLabors.ImageSharp.Formats.Jpeg;
using SixLabors.ImageSharp.Formats.Png;
using SixLabors.ImageSharp.Processing;

namespace BackNoDiscord.Controllers;

[ApiController]
[AllowAnonymous]
[EnableRateLimiting("media-render")]
[Route("api/media")]
public sealed class MediaRenderController : ControllerBase
{
    private const int MinEdge = 16;
    private const int MaxEdge = 1024;
    private const long MaxSourceBytes = 30L * 1024L * 1024L;
    private const long MaxGifSourceBytes = 8L * 1024L * 1024L;
    private static readonly HashSet<string> RenderableImageExtensions = new(StringComparer.OrdinalIgnoreCase)
    {
        ".jpg",
        ".jpeg",
        ".jfif",
        ".png",
        ".webp",
        ".gif",
        ".bmp"
    };

    private readonly UploadStoragePaths _uploadStoragePaths;
    private readonly ChatFileAccessService _chatFileAccess;
    private readonly IWebHostEnvironment _environment;

    public MediaRenderController(
        UploadStoragePaths uploadStoragePaths,
        ChatFileAccessService chatFileAccess,
        IWebHostEnvironment environment)
    {
        _uploadStoragePaths = uploadStoragePaths;
        _chatFileAccess = chatFileAccess;
        _environment = environment;
    }

    [HttpGet("render")]
    public async Task<IActionResult> Render(
        [FromQuery] string? src,
        [FromQuery] int? w,
        [FromQuery] int? h,
        [FromQuery] string? fit,
        [FromQuery] string? animated,
        CancellationToken cancellationToken = default)
    {
        var normalizedSource = StringFromUrlPath(src);
        if (!TryResolveAllowedAsset(src, out var filePath, out var extension, out var isRejectedSource))
        {
            return isRejectedSource ? RejectedMediaResult() : MissingMediaResult();
        }

        if (normalizedSource.StartsWith("/chat-files/", StringComparison.OrdinalIgnoreCase))
        {
            if (!AuthenticatedUserAccessor.TryGetAuthenticatedUser(User, out var currentUser))
            {
                return Unauthorized();
            }

            var fileName = Path.GetFileName(normalizedSource["/chat-files/".Length..]);
            if (!await _chatFileAccess.CanAccessFileAsync(fileName, currentUser, cancellationToken))
            {
                return Forbid();
            }
        }

        if (string.Equals(extension, ".mp4", StringComparison.OrdinalIgnoreCase))
        {
            return MissingMediaResult();
        }

        var fileInfo = new FileInfo(filePath);
        if (!fileInfo.Exists)
        {
            if (!TryResolveMissingMediaFallback(src, out filePath, out extension))
            {
                return MissingMediaResult();
            }

            fileInfo = new FileInfo(filePath);
        }

        if (fileInfo.Length > MaxSourceBytes ||
            (string.Equals(extension, ".gif", StringComparison.OrdinalIgnoreCase) && fileInfo.Length > MaxGifSourceBytes))
        {
            return StatusCode(StatusCodes.Status413PayloadTooLarge);
        }

        var targetWidth = NormalizeEdge(w);
        var targetHeight = NormalizeEdge(h);
        var resizeMode = string.Equals(fit, "contain", StringComparison.OrdinalIgnoreCase)
            ? ResizeMode.Max
            : ResizeMode.Crop;

        await using var inputStream = new FileStream(
            filePath,
            FileMode.Open,
            FileAccess.Read,
            FileShare.Read,
            81920,
            FileOptions.Asynchronous | FileOptions.SequentialScan);

        Image image;
        try
        {
            image = await Image.LoadAsync(inputStream, cancellationToken);
        }
        catch (UnknownImageFormatException)
        {
            return MissingMediaResult();
        }
        catch (InvalidImageContentException)
        {
            return MissingMediaResult();
        }

        using (image)
        {
            image.Mutate(context =>
            {
                context.AutoOrient();
                context.Resize(new ResizeOptions
                {
                    Mode = resizeMode,
                    Position = AnchorPositionMode.Center,
                    Size = new Size(targetWidth, targetHeight),
                    Sampler = KnownResamplers.Lanczos3,
                });
            });

            var outputStream = new MemoryStream();
            var preserveAnimatedGif = ParseAnimatedFlag(animated) && string.Equals(extension, ".gif", StringComparison.OrdinalIgnoreCase);
            var cacheSeconds = IsDefaultMediaFallback(filePath) ? 300 : 604800;

            if (preserveAnimatedGif)
            {
                await image.SaveAsGifAsync(outputStream, new GifEncoder(), cancellationToken);
                return BuildFileResult(outputStream, "image/gif", cacheSeconds);
            }

            if (SupportsTransparentOutput(extension))
            {
                await image.SaveAsPngAsync(outputStream, new PngEncoder(), cancellationToken);
                return BuildFileResult(outputStream, "image/png", cacheSeconds);
            }

            await image.SaveAsJpegAsync(outputStream, new JpegEncoder
            {
                Quality = 92,
            }, cancellationToken);
            return BuildFileResult(outputStream, "image/jpeg", cacheSeconds);
        }
    }

    private static bool SupportsTransparentOutput(string extension) =>
        string.Equals(extension, ".png", StringComparison.OrdinalIgnoreCase)
        || string.Equals(extension, ".webp", StringComparison.OrdinalIgnoreCase);

    private bool TryResolveMissingMediaFallback(string? rawSource, out string filePath, out string extension)
    {
        filePath = string.Empty;
        extension = ".png";

        var normalizedSource = StringFromUrlPath(rawSource);
        if (!CanUseDefaultMediaFallback(normalizedSource))
        {
            return false;
        }

        var webRootPath = !string.IsNullOrWhiteSpace(_environment.WebRootPath)
            ? _environment.WebRootPath
            : Path.Combine(_environment.ContentRootPath, "wwwroot");
        var fallbackPath = Path.Combine(webRootPath, "image", "image.png");
        if (!System.IO.File.Exists(fallbackPath))
        {
            return false;
        }

        filePath = fallbackPath;
        return true;
    }

    private static bool CanUseDefaultMediaFallback(string normalizedSource) =>
        normalizedSource.StartsWith("/server-icons/", StringComparison.OrdinalIgnoreCase)
        || normalizedSource.StartsWith("/avatars/", StringComparison.OrdinalIgnoreCase)
        || normalizedSource.StartsWith("/chat-files/", StringComparison.OrdinalIgnoreCase);

    private bool IsDefaultMediaFallback(string filePath)
    {
        var webRootPath = !string.IsNullOrWhiteSpace(_environment.WebRootPath)
            ? _environment.WebRootPath
            : Path.Combine(_environment.ContentRootPath, "wwwroot");
        var fallbackPath = Path.GetFullPath(Path.Combine(webRootPath, "image", "image.png"));
        return string.Equals(Path.GetFullPath(filePath), fallbackPath, StringComparison.OrdinalIgnoreCase);
    }

    private FileContentResult BuildFileResult(MemoryStream outputStream, string contentType, int cacheSeconds = 604800)
    {
        Response.Headers.CacheControl = $"public,max-age={cacheSeconds}";
        return File(outputStream.ToArray(), contentType);
    }

    private IActionResult MissingMediaResult()
    {
        Response.Headers.CacheControl = "no-store,max-age=0";
        Response.Headers.XContentTypeOptions = "nosniff";
        return NotFound();
    }

    private IActionResult RejectedMediaResult()
    {
        Response.Headers.CacheControl = "no-store,max-age=0";
        Response.Headers.XContentTypeOptions = "nosniff";
        return BadRequest();
    }

    private static int NormalizeEdge(int? requestedEdge)
    {
        var normalizedValue = requestedEdge.GetValueOrDefault(128);
        if (normalizedValue < MinEdge)
        {
            return MinEdge;
        }

        if (normalizedValue > MaxEdge)
        {
            return MaxEdge;
        }

        return normalizedValue;
    }

    private bool TryResolveAllowedAsset(string? rawSource, out string filePath, out string extension, out bool isRejectedSource)
    {
        filePath = string.Empty;
        extension = string.Empty;
        isRejectedSource = false;

        var normalizedSource = StringFromUrlPath(rawSource);
        if (string.IsNullOrWhiteSpace(normalizedSource))
        {
            return false;
        }

        var mappings = new (string Prefix, string Directory)[]
        {
            ("/avatars/", _uploadStoragePaths.ResolveDirectory("avatars")),
            ("/profile-backgrounds/", _uploadStoragePaths.ResolveDirectory("profile-backgrounds")),
            ("/api/profile-backgrounds/", _uploadStoragePaths.ResolveDirectory("profile-backgrounds")),
            ("/server-icons/", _uploadStoragePaths.ResolveDirectory("server-icons")),
            ("/chat-files/", _uploadStoragePaths.ResolveDirectory("chat-files")),
        };

        foreach (var mapping in mappings)
        {
            if (!normalizedSource.StartsWith(mapping.Prefix, StringComparison.OrdinalIgnoreCase))
            {
                continue;
            }

            var mappedName = normalizedSource[mapping.Prefix.Length..];
            if (IsUnsafeMappedFileName(mappedName))
            {
                isRejectedSource = true;
                return false;
            }

            var fileName = Path.GetFileName(mappedName);
            if (string.IsNullOrWhiteSpace(fileName))
            {
                return false;
            }

            extension = Path.GetExtension(fileName).ToLowerInvariant();
            if (!RenderableImageExtensions.Contains(extension))
            {
                return false;
            }

            filePath = Path.Combine(mapping.Directory, fileName);
            return true;
        }

        return false;
    }

    private static bool IsUnsafeMappedFileName(string value)
    {
        var normalizedValue = value.Trim();
        return string.IsNullOrWhiteSpace(normalizedValue)
               || normalizedValue.Contains('/', StringComparison.Ordinal)
               || normalizedValue.Contains('\\', StringComparison.Ordinal)
               || normalizedValue.Contains("..", StringComparison.Ordinal);
    }

    private static string StringFromUrlPath(string? rawSource)
    {
        var normalizedSource = string.Empty;
        if (string.IsNullOrWhiteSpace(rawSource))
        {
            return normalizedSource;
        }

        if (Uri.TryCreate(rawSource, UriKind.Absolute, out var absoluteUri) &&
            (string.Equals(absoluteUri.Scheme, Uri.UriSchemeHttp, StringComparison.OrdinalIgnoreCase) ||
             string.Equals(absoluteUri.Scheme, Uri.UriSchemeHttps, StringComparison.OrdinalIgnoreCase)))
        {
            normalizedSource = absoluteUri.AbsolutePath;
        }
        else
        {
            normalizedSource = rawSource.Trim();
        }

        return normalizedSource.Split('?', 2, StringSplitOptions.TrimEntries)[0];
    }

    private static bool ParseAnimatedFlag(string? rawAnimated)
    {
        if (string.IsNullOrWhiteSpace(rawAnimated))
        {
            return true;
        }

        var normalizedValue = rawAnimated.Trim();
        if (string.Equals(normalizedValue, "1", StringComparison.OrdinalIgnoreCase))
        {
            return true;
        }

        if (string.Equals(normalizedValue, "0", StringComparison.OrdinalIgnoreCase))
        {
            return false;
        }

        if (bool.TryParse(normalizedValue, out var parsedValue))
        {
            return parsedValue;
        }

        return true;
    }
}
