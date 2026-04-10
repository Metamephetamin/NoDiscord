using BackNoDiscord.Infrastructure;
using BackNoDiscord.Security;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;
using Microsoft.AspNetCore.StaticFiles;

namespace BackNoDiscord.Controllers;

public class UploadAvatarRequest
{
    public IFormFile? Avatar { get; set; }
    public string? Frame { get; set; }
}

public class UploadProfileBackgroundRequest
{
    public IFormFile? Background { get; set; }
    public string? Frame { get; set; }
}

public class UpdateProfileRequest
{
    public string? FirstName { get; set; }
    public string? LastName { get; set; }
    public string? ProfileBackgroundUrl { get; set; }
    public MediaFrameData? AvatarFrame { get; set; }
    public MediaFrameData? ProfileBackgroundFrame { get; set; }
}

[ApiController]
[Route("api/user")]
[Authorize(AuthenticationSchemes = JwtBearerDefaults.AuthenticationScheme)]
public class UserController : ControllerBase
{
    private const long MaxAvatarSizeBytes = 50L * 1024 * 1024;
    private const long MaxProfileBackgroundSizeBytes = 60L * 1024 * 1024;
    private static readonly FileExtensionContentTypeProvider ContentTypeProvider = new();
    private readonly AppDbContext _dbContext;
    private readonly IHubContext<ChatHub> _chatHubContext;
    private readonly UploadStoragePaths _uploadStoragePaths;

    public UserController(AppDbContext dbContext, IHubContext<ChatHub> chatHubContext, UploadStoragePaths uploadStoragePaths)
    {
        _dbContext = dbContext;
        _chatHubContext = chatHubContext;
        _uploadStoragePaths = uploadStoragePaths;
    }

    [HttpPut("profile")]
    public async Task<IActionResult> UpdateProfile([FromBody] UpdateProfileRequest request, CancellationToken cancellationToken)
    {
        if (!AuthenticatedUserAccessor.TryGetAuthenticatedUser(User, out var currentUser) ||
            !int.TryParse(currentUser.UserId, out var currentUserId))
        {
            return Unauthorized();
        }

        if (!AuthInputPolicies.TryNormalizeProfileName(request.FirstName, "Имя", out var firstName, out var firstNameError))
        {
            return BadRequest(new { message = firstNameError });
        }

        if (!AuthInputPolicies.TryNormalizeProfileName(request.LastName, "Фамилия", out var lastName, out var lastNameError))
        {
            return BadRequest(new { message = lastNameError });
        }

        if (!AuthInputPolicies.TryEnsureMatchingProfileNameScripts(firstName, lastName, out var nameScriptError))
        {
            return BadRequest(new { message = nameScriptError });
        }

        var user = await _dbContext.Users.FirstOrDefaultAsync(item => item.id == currentUserId, cancellationToken);
        if (user == null)
        {
            return Unauthorized();
        }

        user.first_name = firstName;
        user.last_name = lastName;
        user.avatar_frame_json = MediaFrameSerializer.Serialize(request.AvatarFrame, allowNull: false);
        if (request.ProfileBackgroundUrl != null)
        {
            user.profile_background_url = UploadPolicies.SanitizeRelativeAssetUrl(request.ProfileBackgroundUrl, "/api/profile-backgrounds/");
        }
        user.profile_background_frame_json = MediaFrameSerializer.Serialize(request.ProfileBackgroundFrame, allowNull: false);
        await _dbContext.SaveChangesAsync(cancellationToken);

        await BroadcastProfileUpdatedAsync(user, cancellationToken);

        return Ok(new
        {
            id = user.id,
            first_name = user.first_name,
            last_name = user.last_name,
            email = user.email,
            avatar_url = user.avatar_url ?? string.Empty,
            avatar_frame = MediaFrameSerializer.Parse(user.avatar_frame_json, allowNull: true),
            profile_background_url = user.profile_background_url ?? string.Empty,
            profile_background_frame = MediaFrameSerializer.Parse(user.profile_background_frame_json, allowNull: true)
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
            return BadRequest(new { message = "Avatar size must be less than or equal to 50 MB" });
        }

        if (!UploadPolicies.TryValidateAvatar(avatar, out var extension, out _, out var error))
        {
            return BadRequest(new { message = error });
        }

        var uploadsDirectory = _uploadStoragePaths.ResolveDirectory("avatars");
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
        user.avatar_frame_json = MediaFrameSerializer.Serialize(MediaFrameSerializer.Parse(request.Frame, allowNull: true), allowNull: false);
        await _dbContext.SaveChangesAsync(cancellationToken);

        await BroadcastProfileUpdatedAsync(user, cancellationToken);

        return Ok(new
        {
            avatarUrl,
            avatar_url = avatarUrl,
            avatar_frame = MediaFrameSerializer.Parse(user.avatar_frame_json, allowNull: true)
        });
    }

    [HttpPost("upload-profile-background")]
    [RequestSizeLimit(MaxProfileBackgroundSizeBytes)]
    public async Task<IActionResult> UploadProfileBackground([FromForm] UploadProfileBackgroundRequest request, CancellationToken cancellationToken)
    {
        if (!AuthenticatedUserAccessor.TryGetAuthenticatedUser(User, out var currentUser) ||
            !int.TryParse(currentUser.UserId, out var currentUserId))
        {
            return Unauthorized();
        }

        var background = request.Background;
        if (background == null || background.Length == 0)
        {
            return BadRequest(new { message = "Profile background file is required" });
        }

        if (background.Length > MaxProfileBackgroundSizeBytes)
        {
            return BadRequest(new { message = "Profile background size must be less than or equal to 60 MB" });
        }

        if (!UploadPolicies.TryValidateProfileBackground(background, out var extension, out _, out var error))
        {
            return BadRequest(new { message = error });
        }

        var uploadsDirectory = _uploadStoragePaths.ResolveDirectory("profile-backgrounds");
        Directory.CreateDirectory(uploadsDirectory);

        var fileName = $"profile-bg-{UploadPolicies.SanitizeIdentifier(currentUser.UserId)}-{Guid.NewGuid():N}{extension}";
        var filePath = Path.Combine(uploadsDirectory, fileName);

        await using (var stream = new FileStream(filePath, FileMode.CreateNew, FileAccess.Write, FileShare.None, 81920, FileOptions.SequentialScan))
        {
            await background.CopyToAsync(stream, cancellationToken);
        }

        var profileBackgroundUrl = $"/api/profile-backgrounds/{fileName}";
        var user = await _dbContext.Users.FirstOrDefaultAsync(item => item.id == currentUserId, cancellationToken);
        if (user == null)
        {
            return Unauthorized();
        }

        user.profile_background_url = profileBackgroundUrl;
        user.profile_background_frame_json = MediaFrameSerializer.Serialize(MediaFrameSerializer.Parse(request.Frame, allowNull: true), allowNull: false);
        await _dbContext.SaveChangesAsync(cancellationToken);

        await BroadcastProfileUpdatedAsync(user, cancellationToken);

        return Ok(new
        {
            profileBackgroundUrl,
            profile_background_url = profileBackgroundUrl,
            profile_background_frame = MediaFrameSerializer.Parse(user.profile_background_frame_json, allowNull: true)
        });
    }

    [AllowAnonymous]
    [HttpGet("~/api/profile-backgrounds/{fileName}")]
    public IActionResult GetProfileBackground([FromRoute] string fileName)
    {
        var sanitizedFileName = Path.GetFileName(fileName ?? string.Empty);
        if (string.IsNullOrWhiteSpace(sanitizedFileName))
        {
            return NotFound();
        }

        var uploadsDirectory = _uploadStoragePaths.ResolveDirectory("profile-backgrounds");
        var filePath = Path.Combine(uploadsDirectory, sanitizedFileName);
        if (!System.IO.File.Exists(filePath))
        {
            return NotFound();
        }

        if (!ContentTypeProvider.TryGetContentType(sanitizedFileName, out var contentType))
        {
            contentType = "application/octet-stream";
        }

        return PhysicalFile(filePath, contentType);
    }

    private async Task BroadcastProfileUpdatedAsync(User user, CancellationToken cancellationToken)
    {
        var recipientIds = await _dbContext.Friendships
            .AsNoTracking()
            .Where(item => item.UserLowId == user.id || item.UserHighId == user.id)
            .Select(item => item.UserLowId == user.id ? item.UserHighId : item.UserLowId)
            .ToListAsync(cancellationToken);

        recipientIds.Add(user.id);

        var payload = new
        {
            userId = user.id,
            first_name = user.first_name,
            last_name = user.last_name,
            email = user.email ?? string.Empty,
            avatar_url = user.avatar_url ?? string.Empty,
            avatar_frame = MediaFrameSerializer.Parse(user.avatar_frame_json, allowNull: true),
            profile_background_url = user.profile_background_url ?? string.Empty,
            profile_background_frame = MediaFrameSerializer.Parse(user.profile_background_frame_json, allowNull: true)
        };

        await _chatHubContext.Clients.Users(recipientIds.Distinct().Select(id => id.ToString()))
            .SendAsync("ProfileUpdated", payload, cancellationToken);
    }
}
