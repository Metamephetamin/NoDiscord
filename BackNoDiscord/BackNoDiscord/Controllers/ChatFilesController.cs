using Microsoft.AspNetCore.Mvc;

namespace BackNoDiscord.Controllers
{
    [ApiController]
    [Route("api/chat-files")]
    public class ChatFilesController : ControllerBase
    {
        private const long MaxFileSizeBytes = 100L * 1024 * 1024;

        [HttpPost("upload")]
        [RequestSizeLimit(MaxFileSizeBytes)]
        public async Task<IActionResult> Upload([FromForm] IFormFile file, [FromForm] string userId)
        {
            if (file == null || file.Length == 0)
            {
                return BadRequest(new { message = "File is required" });
            }

            if (file.Length > MaxFileSizeBytes)
            {
                return BadRequest(new { message = "File size must be less than or equal to 100 MB" });
            }

            if (string.IsNullOrWhiteSpace(userId))
            {
                return BadRequest(new { message = "UserId is required" });
            }

            var uploadsDirectory = Path.Combine(Directory.GetCurrentDirectory(), "wwwroot", "chat-files");
            Directory.CreateDirectory(uploadsDirectory);

            var originalExtension = Path.GetExtension(file.FileName);
            var safeExtension = string.IsNullOrWhiteSpace(originalExtension) ? ".bin" : originalExtension;
            var safeUserId = string.Concat(userId.Where(char.IsLetterOrDigit));
            if (string.IsNullOrWhiteSpace(safeUserId))
            {
                safeUserId = "user";
            }

            var fileName = $"chat-{safeUserId}-{DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()}{safeExtension}";
            var filePath = Path.Combine(uploadsDirectory, fileName);

            await using (var stream = System.IO.File.Create(filePath))
            {
                await file.CopyToAsync(stream);
            }

            return Ok(new
            {
                fileUrl = $"/chat-files/{fileName}",
                fileName = file.FileName,
                size = file.Length,
                contentType = string.IsNullOrWhiteSpace(file.ContentType) ? "application/octet-stream" : file.ContentType
            });
        }
    }
}
