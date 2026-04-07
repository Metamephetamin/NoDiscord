using BackNoDiscord.Security;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace BackNoDiscord.Controllers;

public class UploadServerIconRequest
{
    public IFormFile? Icon { get; set; }
}

[ApiController]
[Route("api/server-assets")]
[Authorize(AuthenticationSchemes = JwtBearerDefaults.AuthenticationScheme)]
public class ServerAssetsController : ControllerBase
{
    private const long MaxStaticServerIconSizeBytes = 15L * 1024 * 1024;
    private const long MaxAnimatedServerIconSizeBytes = 30L * 1024 * 1024;

    [HttpPost("upload-icon")]
    [RequestSizeLimit(MaxAnimatedServerIconSizeBytes)]
    public async Task<IActionResult> UploadServerIcon([FromForm] UploadServerIconRequest request, CancellationToken cancellationToken)
    {
        if (!AuthenticatedUserAccessor.TryGetAuthenticatedUser(User, out var currentUser))
        {
            return Unauthorized();
        }

        var icon = request.Icon;
        if (icon == null || icon.Length == 0)
        {
            return BadRequest(new { message = "Server icon file is required." });
        }

        if (!UploadPolicies.TryValidateServerIcon(icon, out var extension, out _, out var error))
        {
            return BadRequest(new { message = error });
        }

        var maxAllowedSize = extension is ".gif" or ".mp4"
            ? MaxAnimatedServerIconSizeBytes
            : MaxStaticServerIconSizeBytes;
        if (icon.Length > maxAllowedSize)
        {
            return BadRequest(new
            {
                message = extension is ".gif" or ".mp4"
                    ? "Animated server icon size must be less than or equal to 30 MB."
                    : "Static server icon size must be less than or equal to 15 MB."
            });
        }

        var uploadsDirectory = Path.Combine(Directory.GetCurrentDirectory(), "wwwroot", "server-icons");
        Directory.CreateDirectory(uploadsDirectory);

        var fileName = $"server-icon-{UploadPolicies.SanitizeIdentifier(currentUser.UserId)}-{Guid.NewGuid():N}{extension}";
        var filePath = Path.Combine(uploadsDirectory, fileName);

        await using (var stream = new FileStream(filePath, FileMode.CreateNew, FileAccess.Write, FileShare.None, 81920, FileOptions.SequentialScan))
        {
            await icon.CopyToAsync(stream, cancellationToken);
        }

        var iconUrl = $"/server-icons/{fileName}";
        return Ok(new { iconUrl, icon_url = iconUrl });
    }
}
