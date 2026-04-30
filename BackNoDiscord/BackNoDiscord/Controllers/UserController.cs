using BackNoDiscord.Infrastructure;
using BackNoDiscord.Security;
using BackNoDiscord.Services;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;
using Microsoft.AspNetCore.StaticFiles;
using System.Security.Cryptography;
using System.Text.Json;

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
    public string? Nickname { get; set; }
    public string? ProfileBackgroundUrl { get; set; }
    public MediaFrameData? AvatarFrame { get; set; }
    public MediaFrameData? ProfileBackgroundFrame { get; set; }
}

public class UpdateProfileCustomizationRequest
{
    public JsonElement? Customization { get; set; }
}

public class StartEmailChangeRequest
{
    public string? Email { get; set; }
}

public class ConfirmEmailChangeRequest
{
    public string? Email { get; set; }
    public string? VerificationToken { get; set; }
    public string? Code { get; set; }
    public string? TotpCode { get; set; }
}

[ApiController]
[Route("api/user")]
[Authorize(AuthenticationSchemes = JwtBearerDefaults.AuthenticationScheme)]
public class UserController : ControllerBase
{
    private const long MaxAvatarSizeBytes = 50L * 1024 * 1024;
    private const long MaxProfileBackgroundSizeBytes = 60L * 1024 * 1024;
    private const int MaxProfileCustomizationJsonLength = 8192;
    private const int MaxEmailVerificationAttempts = 5;
    private static readonly TimeSpan EmailChangeCodeLifetime = TimeSpan.FromMinutes(15);
    private static readonly TimeSpan EmailChangeResendCooldown = TimeSpan.FromSeconds(60);
    private static readonly FileExtensionContentTypeProvider ContentTypeProvider = new();
    private readonly AppDbContext _dbContext;
    private readonly IHubContext<ChatHub> _chatHubContext;
    private readonly UploadStoragePaths _uploadStoragePaths;
    private readonly IEmailVerificationSender _emailVerificationSender;

    public UserController(AppDbContext dbContext, IHubContext<ChatHub> chatHubContext, UploadStoragePaths uploadStoragePaths, IEmailVerificationSender emailVerificationSender)
    {
        _dbContext = dbContext;
        _chatHubContext = chatHubContext;
        _uploadStoragePaths = uploadStoragePaths;
        _emailVerificationSender = emailVerificationSender;
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

        if (!AuthInputPolicies.TryNormalizeOptionalProfileName(request.LastName, "Фамилия", out var lastName, out var lastNameError))
        {
            return BadRequest(new { message = lastNameError });
        }

        if (!AuthInputPolicies.TryEnsureMatchingProfileNameScripts(firstName, lastName, out var nameScriptError))
        {
            return BadRequest(new { message = nameScriptError });
        }

        var nicknameInput = request.Nickname;
        var nickname = string.Empty;
        if (nicknameInput != null && !AuthInputPolicies.TryNormalizeNickname(nicknameInput, out nickname, out var nicknameError))
        {
            return BadRequest(new { message = nicknameError });
        }

        if (nicknameInput != null)
        {
            var nicknameLookup = nickname.ToLowerInvariant();
            var nicknameTaken = await _dbContext.Users.AnyAsync(
                item => item.id != currentUserId && item.nickname.ToLower() == nicknameLookup,
                cancellationToken);
            if (nicknameTaken)
            {
                return BadRequest(new { message = "Этот никнейм уже занят." });
            }
        }

        var user = await _dbContext.Users.FirstOrDefaultAsync(item => item.id == currentUserId, cancellationToken);
        if (user == null)
        {
            return Unauthorized();
        }

        user.first_name = firstName;
        user.last_name = lastName;
        if (nicknameInput != null)
        {
            user.nickname = nickname;
        }
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
            nickname = user.nickname,
            email = user.email,
            avatar_url = user.avatar_url ?? string.Empty,
            avatar_frame = MediaFrameSerializer.Parse(user.avatar_frame_json, allowNull: true),
            profile_background_url = user.profile_background_url ?? string.Empty,
            profile_background_frame = MediaFrameSerializer.Parse(user.profile_background_frame_json, allowNull: true),
            profile_customization = ParseProfileCustomization(user.profile_customization_json)
        });
    }

    [HttpPost("email-change/start")]
    public async Task<IActionResult> StartEmailChange([FromBody] StartEmailChangeRequest? request, CancellationToken cancellationToken)
    {
        if (!AuthenticatedUserAccessor.TryGetAuthenticatedUser(User, out var currentUser) ||
            !int.TryParse(currentUser.UserId, out var currentUserId))
        {
            return Unauthorized();
        }

        if (!AuthInputPolicies.TryNormalizeEmail(request?.Email, out var normalizedEmail, out var emailError))
        {
            return BadRequest(new { message = emailError });
        }

        var user = await _dbContext.Users.FirstOrDefaultAsync(item => item.id == currentUserId, cancellationToken);
        if (user == null)
        {
            return Unauthorized();
        }

        if (string.Equals(user.email, normalizedEmail, StringComparison.OrdinalIgnoreCase))
        {
            return BadRequest(new { message = "Это уже текущая почта." });
        }

        var emailTaken = await _dbContext.Users.AnyAsync(
            item => item.id != currentUserId && item.email == normalizedEmail,
            cancellationToken);
        if (emailTaken)
        {
            return BadRequest(new { message = "Эта почта уже занята." });
        }

        var now = DateTimeOffset.UtcNow;
        var latestActive = await _dbContext.EmailVerificationCodes
            .Where(item => item.UserId == currentUserId && item.Email == normalizedEmail && !item.ConsumedAt.HasValue)
            .OrderByDescending(item => item.CreatedAt)
            .FirstOrDefaultAsync(cancellationToken);

        if (latestActive is not null && latestActive.LastSentAt + EmailChangeResendCooldown > now)
        {
            return BadRequest(new
            {
                message = "Повторно отправить код можно через 60 секунд.",
                verificationToken = string.Empty,
                resendAvailableAt = latestActive.LastSentAt.Add(EmailChangeResendCooldown).ToString("O")
            });
        }

        var activeCodes = await _dbContext.EmailVerificationCodes
            .Where(item => item.UserId == currentUserId && !item.ConsumedAt.HasValue)
            .ToListAsync(cancellationToken);
        foreach (var activeCode in activeCodes)
        {
            activeCode.ConsumedAt = now;
        }

        var verificationCode = GenerateEmailVerificationCode();
        var verificationToken = GenerateVerificationToken();
        var deliveryEmail = string.IsNullOrWhiteSpace(user.email) ? normalizedEmail : user.email.Trim();

        _dbContext.EmailVerificationCodes.Add(new EmailVerificationCodeRecord
        {
            UserId = currentUserId,
            Email = normalizedEmail,
            VerificationTokenHash = AuthInputPolicies.HashSecret(verificationToken),
            CodeHash = AuthInputPolicies.HashSecret(verificationCode),
            CreatedAt = now,
            ExpiresAt = now.Add(EmailChangeCodeLifetime),
            LastSentAt = now,
            AttemptCount = 0,
            ConsumedAt = null
        });
        await _dbContext.SaveChangesAsync(cancellationToken);

        await _emailVerificationSender.SendVerificationCodeAsync(deliveryEmail, verificationCode, now.Add(EmailChangeCodeLifetime));

        return Ok(new
        {
            email = normalizedEmail,
            verificationToken,
            expiresAt = now.Add(EmailChangeCodeLifetime).ToString("O"),
            resendAvailableAt = now.Add(EmailChangeResendCooldown).ToString("O"),
            requiresTotp = user.is_totp_enabled
        });
    }

    [HttpPost("email-change/confirm")]
    public async Task<IActionResult> ConfirmEmailChange([FromBody] ConfirmEmailChangeRequest? request, CancellationToken cancellationToken)
    {
        if (!AuthenticatedUserAccessor.TryGetAuthenticatedUser(User, out var currentUser) ||
            !int.TryParse(currentUser.UserId, out var currentUserId))
        {
            return Unauthorized();
        }

        if (!AuthInputPolicies.TryNormalizeEmail(request?.Email, out var normalizedEmail, out var emailError))
        {
            return BadRequest(new { message = emailError });
        }

        var verificationToken = (request?.VerificationToken ?? string.Empty).Trim();
        var code = new string((request?.Code ?? string.Empty).Where(char.IsDigit).Take(6).ToArray());
        if (string.IsNullOrWhiteSpace(verificationToken) || code.Length != 6)
        {
            return BadRequest(new { message = "Введите корректный шестизначный код из письма." });
        }

        var user = await _dbContext.Users.FirstOrDefaultAsync(item => item.id == currentUserId, cancellationToken);
        if (user == null)
        {
            return Unauthorized();
        }

        if (user.is_totp_enabled && !TotpService.VerifyCode(user.totp_secret, request?.TotpCode, DateTimeOffset.UtcNow))
        {
            return BadRequest(new { message = "Введите корректный код из Google Authenticator.", requiresTotp = true });
        }

        var record = await _dbContext.EmailVerificationCodes
            .Where(item =>
                item.UserId == currentUserId &&
                item.Email == normalizedEmail &&
                item.VerificationTokenHash == AuthInputPolicies.HashSecret(verificationToken) &&
                !item.ConsumedAt.HasValue)
            .OrderByDescending(item => item.CreatedAt)
            .FirstOrDefaultAsync(cancellationToken);

        if (record == null)
        {
            return BadRequest(new { message = "Сессия подтверждения почты не найдена. Запросите код заново." });
        }

        var now = DateTimeOffset.UtcNow;
        if (record.ExpiresAt < now)
        {
            record.ConsumedAt = now;
            await _dbContext.SaveChangesAsync(cancellationToken);
            return BadRequest(new { message = "Срок действия кода истёк. Запросите новый код." });
        }

        if (record.AttemptCount >= MaxEmailVerificationAttempts)
        {
            record.ConsumedAt = now;
            await _dbContext.SaveChangesAsync(cancellationToken);
            return BadRequest(new { message = "Лимит попыток исчерпан. Запросите новый код." });
        }

        if (!string.Equals(record.CodeHash, AuthInputPolicies.HashSecret(code), StringComparison.Ordinal))
        {
            record.AttemptCount += 1;
            if (record.AttemptCount >= MaxEmailVerificationAttempts)
            {
                record.ConsumedAt = now;
            }
            await _dbContext.SaveChangesAsync(cancellationToken);
            return BadRequest(new { message = "Неверный код подтверждения." });
        }

        var emailTaken = await _dbContext.Users.AnyAsync(
            item => item.id != currentUserId && item.email == normalizedEmail,
            cancellationToken);
        if (emailTaken)
        {
            record.ConsumedAt = now;
            await _dbContext.SaveChangesAsync(cancellationToken);
            return BadRequest(new { message = "Эта почта уже занята." });
        }

        record.ConsumedAt = now;
        user.email = normalizedEmail;
        user.is_email_verified = true;
        await _dbContext.SaveChangesAsync(cancellationToken);

        await BroadcastProfileUpdatedAsync(user, cancellationToken);

        return Ok(new
        {
            id = user.id,
            first_name = user.first_name,
            last_name = user.last_name,
            nickname = user.nickname,
            email = user.email ?? string.Empty,
            is_email_verified = user.is_email_verified,
            avatar_url = user.avatar_url ?? string.Empty,
            avatar_frame = MediaFrameSerializer.Parse(user.avatar_frame_json, allowNull: true),
            profile_background_url = user.profile_background_url ?? string.Empty,
            profile_background_frame = MediaFrameSerializer.Parse(user.profile_background_frame_json, allowNull: true),
            profile_customization = ParseProfileCustomization(user.profile_customization_json)
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

    [HttpPut("profile-customization")]
    public async Task<IActionResult> UpdateProfileCustomization([FromBody] UpdateProfileCustomizationRequest request, CancellationToken cancellationToken)
    {
        if (!AuthenticatedUserAccessor.TryGetAuthenticatedUser(User, out var currentUser) ||
            !int.TryParse(currentUser.UserId, out var currentUserId))
        {
            return Unauthorized();
        }

        var customizationJson = request.Customization.HasValue
            ? JsonSerializer.Serialize(request.Customization.Value)
            : "{}";
        if (customizationJson.Length > MaxProfileCustomizationJsonLength)
        {
            return BadRequest(new { message = "Настройки профиля слишком большие." });
        }

        var user = await _dbContext.Users.FirstOrDefaultAsync(item => item.id == currentUserId, cancellationToken);
        if (user == null)
        {
            return Unauthorized();
        }

        user.profile_customization_json = customizationJson;
        await _dbContext.SaveChangesAsync(cancellationToken);

        await BroadcastProfileUpdatedAsync(user, cancellationToken);

        return Ok(new
        {
            profile_customization = ParseProfileCustomization(user.profile_customization_json)
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

    private static string GenerateVerificationToken()
    {
        Span<byte> bytes = stackalloc byte[32];
        RandomNumberGenerator.Fill(bytes);
        return Convert.ToBase64String(bytes)
            .Replace("+", "-", StringComparison.Ordinal)
            .Replace("/", "_", StringComparison.Ordinal)
            .TrimEnd('=');
    }

    private static string GenerateEmailVerificationCode()
    {
        return RandomNumberGenerator.GetInt32(0, 1_000_000).ToString("D6");
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
            nickname = user.nickname,
            email = user.email ?? string.Empty,
            avatar_url = user.avatar_url ?? string.Empty,
            avatar_frame = MediaFrameSerializer.Parse(user.avatar_frame_json, allowNull: true),
            profile_background_url = user.profile_background_url ?? string.Empty,
            profile_background_frame = MediaFrameSerializer.Parse(user.profile_background_frame_json, allowNull: true),
            profile_customization = ParseProfileCustomization(user.profile_customization_json)
        };

        await _chatHubContext.Clients.Users(recipientIds.Distinct().Select(id => id.ToString()))
            .SendAsync("ProfileUpdated", payload, cancellationToken);
    }

    private static object? ParseProfileCustomization(string? rawValue)
    {
        if (string.IsNullOrWhiteSpace(rawValue))
        {
            return null;
        }

        try
        {
            return JsonSerializer.Deserialize<JsonElement>(rawValue);
        }
        catch
        {
            return null;
        }
    }
}
