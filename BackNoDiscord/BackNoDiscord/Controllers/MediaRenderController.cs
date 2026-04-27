using BackNoDiscord.Infrastructure;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using SixLabors.ImageSharp;
using SixLabors.ImageSharp.Formats.Gif;
using SixLabors.ImageSharp.Formats.Jpeg;
using SixLabors.ImageSharp.Formats.Png;
using SixLabors.ImageSharp.Processing;

namespace BackNoDiscord.Controllers;

[ApiController]
[AllowAnonymous]
[Route("api/media")]
public sealed class MediaRenderController : ControllerBase
{
    private const int MinEdge = 16;
    private const int MaxEdge = 1024;
    private readonly UploadStoragePaths _uploadStoragePaths;

    public MediaRenderController(UploadStoragePaths uploadStoragePaths)
    {
        _uploadStoragePaths = uploadStoragePaths;
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
        if (!TryResolveAllowedAsset(src, out var filePath, out var extension))
        {
            return NotFound();
        }

        if (string.Equals(extension, ".mp4", StringComparison.OrdinalIgnoreCase))
        {
            return NotFound();
        }

        if (!System.IO.File.Exists(filePath))
        {
            return NotFound();
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

        using var image = await Image.LoadAsync(inputStream, cancellationToken);

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

        if (preserveAnimatedGif)
        {
            await image.SaveAsGifAsync(outputStream, new GifEncoder(), cancellationToken);
            return BuildFileResult(outputStream, "image/gif");
        }

        if (SupportsTransparentOutput(extension))
        {
            await image.SaveAsPngAsync(outputStream, new PngEncoder(), cancellationToken);
            return BuildFileResult(outputStream, "image/png");
        }

        await image.SaveAsJpegAsync(outputStream, new JpegEncoder
        {
            Quality = 92,
        }, cancellationToken);
        return BuildFileResult(outputStream, "image/jpeg");
    }

    private static bool SupportsTransparentOutput(string extension) =>
        string.Equals(extension, ".png", StringComparison.OrdinalIgnoreCase)
        || string.Equals(extension, ".webp", StringComparison.OrdinalIgnoreCase);

    private FileContentResult BuildFileResult(MemoryStream outputStream, string contentType)
    {
        Response.Headers.CacheControl = "public,max-age=604800";
        return File(outputStream.ToArray(), contentType);
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

    private bool TryResolveAllowedAsset(string? rawSource, out string filePath, out string extension)
    {
        filePath = string.Empty;
        extension = string.Empty;

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

            var fileName = Path.GetFileName(normalizedSource[mapping.Prefix.Length..]);
            if (string.IsNullOrWhiteSpace(fileName))
            {
                return false;
            }

            extension = Path.GetExtension(fileName).ToLowerInvariant();
            filePath = Path.Combine(mapping.Directory, fileName);
            return true;
        }

        return false;
    }

    private static string StringFromUrlPath(string? rawSource)
    {
        var normalizedSource = string.Empty;
        if (string.IsNullOrWhiteSpace(rawSource))
        {
            return normalizedSource;
        }

        if (Uri.TryCreate(rawSource, UriKind.Absolute, out var absoluteUri))
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
