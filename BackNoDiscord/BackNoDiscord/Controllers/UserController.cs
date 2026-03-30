using BackNoDiscord.Security;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using System.Globalization;

namespace BackNoDiscord.Controllers;

public class UploadAvatarRequest
{
    public IFormFile? Avatar { get; set; }
}

public class UpdateProfileRequest
{
    public string? FirstName { get; set; }
    public string? LastName { get; set; }
}

[ApiController]
[Route("api/user")]
[Authorize(AuthenticationSchemes = JwtBearerDefaults.AuthenticationScheme)]
public class UserController : ControllerBase
{
    private const long MaxAvatarSizeBytes = 5_000_000;
    private const int MaxProfileNameLength = 60;
    private readonly AppDbContext _dbContext;

    public UserController(AppDbContext dbContext)
    {
        _dbContext = dbContext;
    }

    [HttpPut("profile")]
    public async Task<IActionResult> UpdateProfile([FromBody] UpdateProfileRequest request, CancellationToken cancellationToken)
    {
        if (!AuthenticatedUserAccessor.TryGetAuthenticatedUser(User, out var currentUser) ||
            !int.TryParse(currentUser.UserId, out var currentUserId))
        {
            return Unauthorized();
        }

        var firstName = NormalizeProfileName(request.FirstName, "Имя", out var firstNameError);
        if (!string.IsNullOrEmpty(firstNameError))
        {
            return BadRequest(new { message = firstNameError });
        }

        var lastName = NormalizeProfileName(request.LastName, "Фамилия", out var lastNameError);
        if (!string.IsNullOrEmpty(lastNameError))
        {
            return BadRequest(new { message = lastNameError });
        }

        var user = await _dbContext.Users.FirstOrDefaultAsync(item => item.id == currentUserId, cancellationToken);
        if (user == null)
        {
            return Unauthorized();
        }

        user.first_name = firstName;
        user.last_name = lastName;
        await _dbContext.SaveChangesAsync(cancellationToken);

        return Ok(new
        {
            id = user.id,
            first_name = user.first_name,
            last_name = user.last_name,
            email = user.email,
            avatar_url = user.avatar_url ?? string.Empty
        });
    }

    [HttpPost("upload-avatar")]
    [RequestSizeLimit(MaxAvatarSizeBytes)]
    public async Task<IActionResult> UploadAvatar([FromForm] UploadAvatarRequest request, CancellationToken cancellationToken)
    {
        if (!AuthenticatedUserAccessor.TryGetAuthenticatedUser(User, out var currentUser) ||
            !int.TryParse(currentUser.UserId, out var currentUserId))
        {
            return Unauthorized();
        }

        var avatar = request.Avatar;
        if (avatar == null || avatar.Length == 0)
        {
            return BadRequest(new { message = "Avatar file is required" });
        }

        if (avatar.Length > MaxAvatarSizeBytes)
        {
            return BadRequest(new { message = "Avatar size must be less than or equal to 5 MB" });
        }

        if (!UploadPolicies.TryValidateAvatar(avatar, out var extension, out _, out var error))
        {
            return BadRequest(new { message = error });
        }

        var uploadsDirectory = Path.Combine(Directory.GetCurrentDirectory(), "wwwroot", "avatars");
        Directory.CreateDirectory(uploadsDirectory);

        var fileName = $"user-{UploadPolicies.SanitizeIdentifier(currentUser.UserId)}-{Guid.NewGuid():N}{extension}";
        var filePath = Path.Combine(uploadsDirectory, fileName);

        await using (var stream = new FileStream(filePath, FileMode.CreateNew, FileAccess.Write, FileShare.None, 81920, FileOptions.SequentialScan))
        {
            await avatar.CopyToAsync(stream, cancellationToken);
        }

        var avatarUrl = $"/avatars/{fileName}";
        var user = await _dbContext.Users.FirstOrDefaultAsync(item => item.id == currentUserId, cancellationToken);
        if (user == null)
        {
            return Unauthorized();
        }

        user.avatar_url = avatarUrl;
        await _dbContext.SaveChangesAsync(cancellationToken);

        return Ok(new { avatarUrl, avatar_url = avatarUrl });
    }

    private static string NormalizeProfileName(string? value, string fieldName, out string error)
    {
        error = string.Empty;
        var sanitized = UploadPolicies.TrimToLength(value, MaxProfileNameLength);

        if (string.IsNullOrWhiteSpace(sanitized))
        {
            error = $"{fieldName} не должно быть пустым.";
            return string.Empty;
        }

        if (sanitized.Any(char.IsControl))
        {
            error = $"{fieldName} содержит недопустимые символы.";
            return string.Empty;
        }

        if (sanitized.Any(character => !IsAllowedProfileNameCharacter(character)))
        {
            error = $"{fieldName} может содержать только буквы, пробел, дефис и апостроф.";
            return string.Empty;
        }

        return CollapseWhitespace(sanitized);
    }

    private static bool IsAllowedProfileNameCharacter(char character)
    {
        var category = char.GetUnicodeCategory(character);
        return char.IsLetter(character) ||
               category == UnicodeCategory.NonSpacingMark ||
               character is ' ' or '-' or '\'';
    }

    private static string CollapseWhitespace(string value)
    {
        return string.Join(" ", value.Split(' ', StringSplitOptions.RemoveEmptyEntries));
    }
}
