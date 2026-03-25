using Microsoft.AspNetCore.Mvc;

namespace BackNoDiscord.Controllers
{
    public class UploadAvatarRequest
    {
        public IFormFile? Avatar { get; set; }
        public string UserId { get; set; } = string.Empty;
    }

    [ApiController]
    [Route("api/user")]
    public class UserController : ControllerBase
    {
        [HttpPost("upload-avatar")]
        [RequestSizeLimit(10_000_000)]
        public async Task<IActionResult> UploadAvatar([FromForm] UploadAvatarRequest request)
        {
            var avatar = request.Avatar;
            var userId = request.UserId;

            if (avatar == null || avatar.Length == 0)
            {
                return BadRequest(new { message = "Avatar file is required" });
            }

            if (string.IsNullOrWhiteSpace(userId))
            {
                return BadRequest(new { message = "UserId is required" });
            }

            var uploadsDirectory = Path.Combine(Directory.GetCurrentDirectory(), "wwwroot", "avatars");
            Directory.CreateDirectory(uploadsDirectory);

            var extension = Path.GetExtension(avatar.FileName);
            if (string.IsNullOrWhiteSpace(extension))
            {
                extension = ".png";
            }

            var fileName = $"user-{userId}-{DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()}{extension}";
            var filePath = Path.Combine(uploadsDirectory, fileName);

            await using (var stream = System.IO.File.Create(filePath))
            {
                await avatar.CopyToAsync(stream);
            }

            return Ok(new { avatarUrl = $"/avatars/{fileName}" });
        }
    }
}
