using BackNoDiscord.Security;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace BackNoDiscord.Controllers;

public class UploadChatFileRequest
{
    public IFormFile? File { get; set; }
}

[ApiController]
[Route("api/chat-files")]
[Authorize(AuthenticationSchemes = JwtBearerDefaults.AuthenticationScheme)]
public class ChatFilesController : ControllerBase
{
    private const long MaxFileSizeBytes = 100L * 1024 * 1024;

    [HttpPost("upload")]
    [RequestSizeLimit(MaxFileSizeBytes)]
    public async Task<IActionResult> Upload([FromForm] UploadChatFileRequest request, CancellationToken cancellationToken)
    {
        if (!AuthenticatedUserAccessor.TryGetAuthenticatedUser(User, out var currentUser))
        {
            return Unauthorized();
        }

        var file = request.File;
        if (file == null || file.Length == 0)
        {
            return BadRequest(new { message = "File is required" });
        }

        if (file.Length > MaxFileSizeBytes)
        {
            return BadRequest(new { message = "File size must be less than or equal to 100 MB" });
        }

        if (!UploadPolicies.TryValidateChatFile(file, out var extension, out var contentType, out var error))
        {
            return BadRequest(new { message = error });
        }

        var uploadsDirectory = Path.Combine(Directory.GetCurrentDirectory(), "wwwroot", "chat-files");
        Directory.CreateDirectory(uploadsDirectory);

        var fileName = $"chat-{UploadPolicies.SanitizeIdentifier(currentUser.UserId)}-{Guid.NewGuid():N}{extension}";
        var filePath = Path.Combine(uploadsDirectory, fileName);

        await using (var stream = new FileStream(filePath, FileMode.CreateNew, FileAccess.Write, FileShare.None, 81920, FileOptions.SequentialScan))
        {
            await file.CopyToAsync(stream, cancellationToken);
        }

        return Ok(new
        {
            fileUrl = $"/chat-files/{fileName}",
            fileName = UploadPolicies.SanitizeDisplayFileName(file.FileName),
            size = file.Length,
            contentType
        });
    }
}
