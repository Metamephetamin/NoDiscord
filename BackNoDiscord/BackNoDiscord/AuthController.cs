using BackNoDiscord.Security;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using BackNoDiscord.Services;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;
using System.ComponentModel.DataAnnotations;
using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;

namespace BackNoDiscord;

[ApiController]
[Route("api/[controller]")]
public class AuthController : ControllerBase
{
    private static readonly TimeSpan PhoneVerificationLifetime = TimeSpan.FromMinutes(10);
    private static readonly TimeSpan PhoneVerificationResendCooldown = TimeSpan.FromSeconds(60);
    private static readonly TimeSpan EmailVerificationLifetime = TimeSpan.FromMinutes(15);
    private static readonly TimeSpan EmailVerificationResendCooldown = TimeSpan.FromSeconds(60);
    private const int MaxPhoneVerificationAttempts = 5;
    private const int MaxEmailVerificationAttempts = 5;

    private readonly AppDbContext _context;
    private readonly IConfiguration _config;
    private readonly IEmailVerificationSender _emailVerificationSender;
    private readonly PasswordHasher<User> _passwordHasher;
    private readonly ILogger<AuthController> _logger;

    public AuthController(AppDbContext context, IConfiguration config, IEmailVerificationSender emailVerificationSender, ILogger<AuthController> logger)
    {
        _context = context;
        _config = config;
        _emailVerificationSender = emailVerificationSender;
        _logger = logger;
        _passwordHasher = new PasswordHasher<User>();
    }

    [HttpPost("request-phone-verification")]
    [EnableRateLimiting("phone-send")]
    public async Task<IActionResult> RequestPhoneVerification([FromBody] PhoneVerificationRequestDto dto)
    {
        if (!ModelState.IsValid)
        {
            return ValidationProblem(ModelState);
        }

        if (!AuthInputPolicies.TryNormalizeRussianPhone(dto.phone, out var normalizedPhone, out var phoneError))
        {
            return BadRequest(new { message = phoneError });
        }

        var now = DateTimeOffset.UtcNow;
        var latestActive = await _context.PhoneVerificationCodes
            .Where(item => item.PhoneNumber == normalizedPhone && !item.ConsumedAt.HasValue)
            .OrderByDescending(item => item.CreatedAt)
            .FirstOrDefaultAsync();

        if (latestActive != null &&
            latestActive.LastSentAt + PhoneVerificationResendCooldown > now)
        {
            var waitSeconds = Math.Max(1, (int)Math.Ceiling((latestActive.LastSentAt + PhoneVerificationResendCooldown - now).TotalSeconds));
            return StatusCode(StatusCodes.Status429TooManyRequests, new
            {
                message = $"РџРѕРІС‚РѕСЂРЅРѕ РѕС‚РїСЂР°РІРёС‚СЊ РєРѕРґ РјРѕР¶РЅРѕ С‡РµСЂРµР· {waitSeconds} СЃРµРє."
            });
        }

        if (await _context.Users.AnyAsync(user => user.phone_number == normalizedPhone))
        {
            return BadRequest(new { message = "Этот номер уже используется." });
        }

        var verificationCode = GeneratePhoneVerificationCode();
        var verificationToken = GenerateVerificationToken();

        var activeCodes = await _context.PhoneVerificationCodes
            .Where(item => item.PhoneNumber == normalizedPhone && !item.ConsumedAt.HasValue)
            .ToListAsync();

        foreach (var activeCode in activeCodes)
        {
            activeCode.ConsumedAt = now;
        }

        _context.PhoneVerificationCodes.Add(new PhoneVerificationCodeRecord
        {
            PhoneNumber = normalizedPhone,
            VerificationTokenHash = AuthInputPolicies.HashSecret(verificationToken),
            CodeHash = AuthInputPolicies.HashSecret(verificationCode),
            CreatedAt = now,
            ExpiresAt = now.Add(PhoneVerificationLifetime),
            LastSentAt = now,
            AttemptCount = 0
        });

        await _context.SaveChangesAsync();

        var deliveryMode = GetSmsDeliveryMode();
        if (string.Equals(deliveryMode, "mock", StringComparison.OrdinalIgnoreCase))
        {
            _logger.LogInformation("Phone verification code for {PhoneNumber}: {VerificationCode}", normalizedPhone, verificationCode);
        }
        else
        {
            _logger.LogInformation("Phone verification code generated for {PhoneNumber} using {DeliveryMode} delivery.", normalizedPhone, deliveryMode);
        }

        return Ok(new
        {
            phone = normalizedPhone,
            verificationToken,
            expiresAt = now.Add(PhoneVerificationLifetime).ToString("O"),
            resendAvailableAt = now.Add(PhoneVerificationResendCooldown).ToString("O"),
            deliveryMode,
            debugCode = string.Equals(deliveryMode, "mock", StringComparison.OrdinalIgnoreCase) ? verificationCode : null
        });
    }

    [HttpPost("verify-phone-code")]
    [EnableRateLimiting("phone-verify")]
    public async Task<IActionResult> VerifyPhoneCode([FromBody] VerifyPhoneCodeDto dto)
    {
        if (!ModelState.IsValid)
        {
            return ValidationProblem(ModelState);
        }

        if (!AuthInputPolicies.TryNormalizeRussianPhone(dto.phone, out var normalizedPhone, out var phoneError))
        {
            return BadRequest(new { message = phoneError });
        }

        var verificationToken = (dto.verificationToken ?? string.Empty).Trim();
        var code = new string((dto.code ?? string.Empty).Where(char.IsDigit).ToArray());
        if (string.IsNullOrWhiteSpace(verificationToken) || code.Length != 6)
        {
            return BadRequest(new { message = "Р’РІРµРґРёС‚Рµ РєРѕСЂСЂРµРєС‚РЅС‹Р№ С€РµСЃС‚РёР·РЅР°С‡РЅС‹Р№ РєРѕРґ." });
        }

        var now = DateTimeOffset.UtcNow;
        var record = await _context.PhoneVerificationCodes
            .Where(item =>
                item.PhoneNumber == normalizedPhone &&
                item.VerificationTokenHash == AuthInputPolicies.HashSecret(verificationToken) &&
                !item.ConsumedAt.HasValue)
            .OrderByDescending(item => item.CreatedAt)
            .FirstOrDefaultAsync();

        if (record == null)
        {
            return BadRequest(new { message = "РЎРµСЃСЃРёСЏ РїРѕРґС‚РІРµСЂР¶РґРµРЅРёСЏ РЅРѕРјРµСЂР° РЅРµ РЅР°Р№РґРµРЅР°. Р—Р°РїСЂРѕСЃРёС‚Рµ РєРѕРґ Р·Р°РЅРѕРІРѕ." });
        }

        if (record.ExpiresAt <= now)
        {
            record.ConsumedAt = now;
            await _context.SaveChangesAsync();
            return BadRequest(new { message = "РЎСЂРѕРє РґРµР№СЃС‚РІРёСЏ РєРѕРґР° РёСЃС‚С‘Рє. Р—Р°РїСЂРѕСЃРёС‚Рµ РЅРѕРІС‹Р№ РєРѕРґ." });
        }

        if (record.AttemptCount >= MaxPhoneVerificationAttempts)
        {
            return BadRequest(new { message = "Р›РёРјРёС‚ РїРѕРїС‹С‚РѕРє РёСЃС‡РµСЂРїР°РЅ. Р—Р°РїСЂРѕСЃРёС‚Рµ РЅРѕРІС‹Р№ РєРѕРґ." });
        }

        if (!string.Equals(record.CodeHash, AuthInputPolicies.HashSecret(code), StringComparison.Ordinal))
        {
            record.AttemptCount += 1;
            if (record.AttemptCount >= MaxPhoneVerificationAttempts)
            {
                record.ConsumedAt = now;
            }

            await _context.SaveChangesAsync();
            return BadRequest(new { message = "РќРµРІРµСЂРЅС‹Р№ РєРѕРґ РїРѕРґС‚РІРµСЂР¶РґРµРЅРёСЏ." });
        }

        record.VerifiedAt = now;
        await _context.SaveChangesAsync();

        return Ok(new
        {
            verified = true,
            phone = normalizedPhone,
            verificationToken
        });
    }

    [HttpPost("resend-email-verification")]
    [EnableRateLimiting("email-send")]
    public async Task<IActionResult> ResendEmailVerification([FromBody] ResendEmailVerificationDto dto)
    {
        if (!ModelState.IsValid)
        {
            return ValidationProblem(ModelState);
        }

        if (!AuthInputPolicies.TryNormalizeEmail(dto.email, out var normalizedEmail, out var emailError))
        {
            return BadRequest(new { message = emailError });
        }

        var user = await _context.Users.FirstOrDefaultAsync(item => item.email == normalizedEmail);
        if (user == null)
        {
            return BadRequest(new { message = "РџРѕР»СЊР·РѕРІР°С‚РµР»СЊ СЃ С‚Р°РєРѕР№ РїРѕС‡С‚РѕР№ РЅРµ РЅР°Р№РґРµРЅ." });
        }

        if (user.is_email_verified)
        {
            return BadRequest(new { message = "РџРѕС‡С‚Р° СѓР¶Рµ РїРѕРґС‚РІРµСЂР¶РґРµРЅР°." });
        }

        try
        {
            var payload = await CreateEmailVerificationAsync(user);
            if (payload.IsRateLimited)
            {
                return StatusCode(StatusCodes.Status429TooManyRequests, new
                {
                    message = "Повторно отправить код можно через 60 секунд.",
                    resendAvailableAt = payload.ResendAvailableAt
                });
            }

            return Ok(payload.ToResponse());
        }
        catch (EmailDeliveryException)
        {
            return StatusCode(StatusCodes.Status503ServiceUnavailable, new
            {
                message = "Не удалось отправить письмо с кодом подтверждения. Попробуйте немного позже."
            });
        }
    }

    [HttpPost("verify-email-code")]
    [EnableRateLimiting("email-verify")]
    public async Task<IActionResult> VerifyEmailCode([FromBody] VerifyEmailCodeDto dto)
    {
        if (!ModelState.IsValid)
        {
            return ValidationProblem(ModelState);
        }

        if (!AuthInputPolicies.TryNormalizeEmail(dto.email, out var normalizedEmail, out var emailError))
        {
            return BadRequest(new { message = emailError });
        }

        var verificationToken = (dto.verificationToken ?? string.Empty).Trim();
        var code = new string((dto.code ?? string.Empty).Where(char.IsDigit).ToArray());
        if (string.IsNullOrWhiteSpace(verificationToken) || code.Length != 6)
        {
            return BadRequest(new { message = "Р’РІРµРґРёС‚Рµ РєРѕСЂСЂРµРєС‚РЅС‹Р№ С€РµСЃС‚РёР·РЅР°С‡РЅС‹Р№ РєРѕРґ." });
        }

        var user = await _context.Users.FirstOrDefaultAsync(item => item.email == normalizedEmail);
        if (user == null)
        {
            return BadRequest(new { message = "РџРѕР»СЊР·РѕРІР°С‚РµР»СЊ СЃ С‚Р°РєРѕР№ РїРѕС‡С‚РѕР№ РЅРµ РЅР°Р№РґРµРЅ." });
        }

        if (user.is_email_verified)
        {
            await RevokeActiveRefreshTokensAsync(user.id);
            var existingSession = await IssueAuthSessionAsync(user);
            return Ok(BuildAuthResponse(user, existingSession));
        }

        var now = DateTimeOffset.UtcNow;
        var record = await _context.EmailVerificationCodes
            .Where(item =>
                item.UserId == user.id &&
                item.Email == normalizedEmail &&
                item.VerificationTokenHash == AuthInputPolicies.HashSecret(verificationToken) &&
                !item.ConsumedAt.HasValue)
            .OrderByDescending(item => item.CreatedAt)
            .FirstOrDefaultAsync();

        if (record == null)
        {
            return BadRequest(new { message = "РЎРµСЃСЃРёСЏ РїРѕРґС‚РІРµСЂР¶РґРµРЅРёСЏ РїРѕС‡С‚С‹ РЅРµ РЅР°Р№РґРµРЅР°. Р—Р°РїСЂРѕСЃРёС‚Рµ РєРѕРґ Р·Р°РЅРѕРІРѕ." });
        }

        if (record.ExpiresAt <= now)
        {
            record.ConsumedAt = now;
            await _context.SaveChangesAsync();
            return BadRequest(new { message = "РЎСЂРѕРє РґРµР№СЃС‚РІРёСЏ РєРѕРґР° РёСЃС‚С‘Рє. Р—Р°РїСЂРѕСЃРёС‚Рµ РЅРѕРІС‹Р№ РєРѕРґ." });
        }

        if (record.AttemptCount >= MaxEmailVerificationAttempts)
        {
            return BadRequest(new { message = "Р›РёРјРёС‚ РїРѕРїС‹С‚РѕРє РёСЃС‡РµСЂРїР°РЅ. Р—Р°РїСЂРѕСЃРёС‚Рµ РЅРѕРІС‹Р№ РєРѕРґ." });
        }

        if (!string.Equals(record.CodeHash, AuthInputPolicies.HashSecret(code), StringComparison.Ordinal))
        {
            record.AttemptCount += 1;
            if (record.AttemptCount >= MaxEmailVerificationAttempts)
            {
                record.ConsumedAt = now;
            }

            await _context.SaveChangesAsync();
            return BadRequest(new { message = "РќРµРІРµСЂРЅС‹Р№ РєРѕРґ РїРѕРґС‚РІРµСЂР¶РґРµРЅРёСЏ." });
        }

        record.VerifiedAt = now;
        record.ConsumedAt = now;
        user.is_email_verified = true;
        await _context.SaveChangesAsync();

        await RevokeActiveRefreshTokensAsync(user.id);
        var authSession = await IssueAuthSessionAsync(user);
        return Ok(BuildAuthResponse(user, authSession));
    }

        [HttpPost("register")]
    [EnableRateLimiting("auth")]
    public async Task<IActionResult> Register([FromBody] RegisterDto dto)
    {
        if (!ModelState.IsValid)
        {
            return ValidationProblem(ModelState);
        }

        if (!AuthInputPolicies.TryNormalizeProfileName(dto.first_name, "РРјСЏ", out var firstName, out var firstNameError))
        {
            return BadRequest(new { message = firstNameError });
        }

        if (!AuthInputPolicies.TryNormalizeProfileName(dto.last_name, "Р¤Р°РјРёР»РёСЏ", out var lastName, out var lastNameError))
        {
            return BadRequest(new { message = lastNameError });
        }

        var rawEmail = (dto.email ?? string.Empty).Trim();
        var rawPhone = (dto.phone ?? string.Empty).Trim();
        var hasEmail = !string.IsNullOrWhiteSpace(rawEmail);
        var hasPhone = !string.IsNullOrWhiteSpace(rawPhone);

        if (!hasEmail && !hasPhone)
        {
            return BadRequest(new { message = "Введите email или номер телефона." });
        }

        if (hasEmail && hasPhone)
        {
            return BadRequest(new { message = "Укажите только один способ регистрации: email или телефон." });
        }

        string? normalizedEmail = null;
        string? normalizedPhone = null;

        if (hasEmail)
        {
            if (!AuthInputPolicies.TryNormalizeEmail(rawEmail, out var emailValue, out var emailError))
            {
                return BadRequest(new { message = emailError });
            }

            normalizedEmail = emailValue;
        }

        if (hasPhone)
        {
            if (!AuthInputPolicies.TryNormalizeRussianPhone(rawPhone, out var phoneValue, out var phoneError))
            {
                return BadRequest(new { message = phoneError });
            }

            normalizedPhone = phoneValue;
        }

        if (dto.password.Trim().Length < 6)
        {
            return BadRequest(new { message = "РџР°СЂРѕР»СЊ РґРѕР»Р¶РµРЅ Р±С‹С‚СЊ РЅРµ РєРѕСЂРѕС‡Рµ 6 СЃРёРјРІРѕР»РѕРІ." });
        }

        if (!string.IsNullOrWhiteSpace(normalizedEmail) && await _context.Users.AnyAsync(u => u.email == normalizedEmail))
        {
            return BadRequest(new { message = "Email already exists" });
        }

        if (!string.IsNullOrWhiteSpace(normalizedPhone) && await _context.Users.AnyAsync(u => u.phone_number == normalizedPhone))
        {
            return BadRequest(new { message = "Этот номер уже используется." });
        }

        PhoneVerificationCodeRecord? phoneVerification = null;
        if (!string.IsNullOrWhiteSpace(normalizedPhone))
        {
            var verificationToken = (dto.phone_verification_token ?? string.Empty).Trim();
            if (string.IsNullOrWhiteSpace(verificationToken))
            {
                return BadRequest(new { message = "РЎРЅР°С‡Р°Р»Р° РїРѕРґС‚РІРµСЂРґРёС‚Рµ РЅРѕРјРµСЂ С‚РµР»РµС„РѕРЅР°." });
            }

            phoneVerification = await _context.PhoneVerificationCodes
                .Where(item =>
                    item.PhoneNumber == normalizedPhone &&
                    item.VerificationTokenHash == AuthInputPolicies.HashSecret(verificationToken) &&
                    !item.ConsumedAt.HasValue)
                .OrderByDescending(item => item.CreatedAt)
                .FirstOrDefaultAsync();

            if (phoneVerification == null || !phoneVerification.VerifiedAt.HasValue || phoneVerification.ExpiresAt <= DateTimeOffset.UtcNow)
            {
                return BadRequest(new { message = "РќРѕРјРµСЂ С‚РµР»РµС„РѕРЅР° РЅРµ РїРѕРґС‚РІРµСЂР¶РґРµРЅ." });
            }
        }

        var user = new User
        {
            first_name = firstName,
            last_name = lastName,
            email = normalizedEmail,
            // Email verification is temporarily disabled until SMTP is stabilized.
            is_email_verified = true,
            phone_number = normalizedPhone,
            is_phone_verified = !string.IsNullOrWhiteSpace(normalizedPhone)
        };

        user.password_hash = _passwordHasher.HashPassword(user, dto.password);

        _context.Users.Add(user);
        if (phoneVerification != null)
        {
            phoneVerification.ConsumedAt = DateTimeOffset.UtcNow;
        }

        await _context.SaveChangesAsync();

        // Temporarily disabled email verification flow.
        // if (!string.IsNullOrWhiteSpace(normalizedEmail))
        // {
        //     try
        //     {
        //         var emailVerification = await CreateEmailVerificationAsync(user);
        //         return Ok(new
        //         {
        //             pendingEmailVerification = true,
        //             user = BuildUserPayload(user),
        //             verification = emailVerification.ToResponse()
        //         });
        //     }
        //     catch (EmailDeliveryException)
        //     {
        //         var createdUser = await _context.Users.FirstOrDefaultAsync(item => item.id == user.id);
        //         if (createdUser != null)
        //         {
        //             var pendingCodes = await _context.EmailVerificationCodes
        //                 .Where(item => item.UserId == createdUser.id)
        //                 .ToListAsync();
        //
        //             _context.EmailVerificationCodes.RemoveRange(pendingCodes);
        //             _context.Users.Remove(createdUser);
        //             await _context.SaveChangesAsync();
        //         }
        //
        //         return StatusCode(StatusCodes.Status503ServiceUnavailable, new
        //         {
        //             message = "Не удалось отправить письмо с кодом подтверждения. Попробуйте зарегистрироваться ещё раз чуть позже."
        //         });
        //     }
        // }

        await RevokeActiveRefreshTokensAsync(user.id);
        var authSession = await IssueAuthSessionAsync(user);
        return Ok(BuildAuthResponse(user, authSession));
    }

    [HttpPost("login")]
    [EnableRateLimiting("auth")]
    public async Task<IActionResult> Login([FromBody] LoginDto dto)
    {
        if (!ModelState.IsValid)
        {
            return ValidationProblem(ModelState);
        }

        var identifier = (dto.identifier ?? dto.email ?? string.Empty).Trim();
        if (string.IsNullOrWhiteSpace(identifier))
        {
            return BadRequest(new { message = "Р’РІРµРґРёС‚Рµ email РёР»Рё РЅРѕРјРµСЂ С‚РµР»РµС„РѕРЅР°." });
        }

        User? user;
        if (identifier.Contains('@'))
        {
            if (!AuthInputPolicies.TryNormalizeEmail(identifier, out var normalizedEmail, out var emailError))
            {
                return BadRequest(new { message = emailError });
            }

            user = await _context.Users.FirstOrDefaultAsync(u => u.email == normalizedEmail);
        }
        else
        {
            if (!AuthInputPolicies.TryNormalizeRussianPhone(identifier, out var normalizedPhone, out var phoneError))
            {
                return BadRequest(new { message = phoneError });
            }

            user = await _context.Users.FirstOrDefaultAsync(u => u.phone_number == normalizedPhone);
        }

        if (user == null)
        {
            return BadRequest(new { message = "Invalid email/phone or password" });
        }

        // Temporarily disabled email verification check.
        // if (!string.IsNullOrWhiteSpace(user.email) && !user.is_email_verified)
        // {
        //     return BadRequest(new { message = "РЎРЅР°С‡Р°Р»Р° РїРѕРґС‚РІРµСЂРґРёС‚Рµ email." });
        // }

        var result = _passwordHasher.VerifyHashedPassword(user, user.password_hash, dto.password);
        if (result == PasswordVerificationResult.Failed)
        {
            return BadRequest(new { message = "Invalid email/phone or password" });
        }

        if (result == PasswordVerificationResult.SuccessRehashNeeded)
        {
            user.password_hash = _passwordHasher.HashPassword(user, dto.password);
            await _context.SaveChangesAsync();
        }

        await RevokeActiveRefreshTokensAsync(user.id);
        var authSession = await IssueAuthSessionAsync(user);
        return Ok(BuildAuthResponse(user, authSession));
    }

    [HttpPost("refresh")]
    [EnableRateLimiting("auth")]
    public async Task<IActionResult> Refresh([FromBody] RefreshTokenDto dto)
    {
        if (!ModelState.IsValid)
        {
            return ValidationProblem(ModelState);
        }

        var tokenHash = HashToken(dto.refreshToken);
        var storedToken = await _context.RefreshTokens
            .Include(item => item.User)
            .FirstOrDefaultAsync(item => item.TokenHash == tokenHash);

        if (storedToken?.User == null)
        {
            return Unauthorized(new { message = "Refresh token is invalid." });
        }

        if (storedToken.RevokedAt.HasValue || storedToken.ExpiresAt <= DateTimeOffset.UtcNow)
        {
            return Unauthorized(new { message = "Refresh token has expired." });
        }

        storedToken.RevokedAt = DateTimeOffset.UtcNow;
        var authSession = await IssueAuthSessionAsync(storedToken.User);
        storedToken.ReplacedByTokenHash = HashToken(authSession.RefreshToken);
        await _context.SaveChangesAsync();

        return Ok(BuildAuthResponse(storedToken.User, authSession));
    }

    [HttpPost("logout")]
    [EnableRateLimiting("auth")]
    public async Task<IActionResult> Logout([FromBody] RefreshTokenDto dto)
    {
        if (!ModelState.IsValid)
        {
            return ValidationProblem(ModelState);
        }

        var tokenHash = HashToken(dto.refreshToken);
        var storedToken = await _context.RefreshTokens.FirstOrDefaultAsync(item => item.TokenHash == tokenHash);
        if (storedToken is null)
        {
            return Ok(new { revoked = false });
        }

        if (!storedToken.RevokedAt.HasValue)
        {
            storedToken.RevokedAt = DateTimeOffset.UtcNow;
            await _context.SaveChangesAsync();
        }

        return Ok(new { revoked = true });
    }

    [HttpGet("me")]
    [Authorize(AuthenticationSchemes = JwtBearerDefaults.AuthenticationScheme)]
    public async Task<IActionResult> Me()
    {
        var userIdClaim = User.FindFirstValue(ClaimTypes.NameIdentifier)
                         ?? User.FindFirstValue(JwtRegisteredClaimNames.Sub);

        if (string.IsNullOrWhiteSpace(userIdClaim) || !int.TryParse(userIdClaim, out var userId))
        {
            return Unauthorized();
        }

        var user = await _context.Users.AsNoTracking().FirstOrDefaultAsync(u => u.id == userId);
        if (user == null)
        {
            return Unauthorized();
        }

        return Ok(BuildUserPayload(user));
    }

    private async Task RevokeActiveRefreshTokensAsync(int userId)
    {
        var activeTokens = await _context.RefreshTokens
            .Where(item => item.UserId == userId && !item.RevokedAt.HasValue && item.ExpiresAt > DateTimeOffset.UtcNow)
            .ToListAsync();

        if (activeTokens.Count == 0)
        {
            return;
        }

        var revokedAt = DateTimeOffset.UtcNow;
        foreach (var token in activeTokens)
        {
            token.RevokedAt = revokedAt;
        }

        await _context.SaveChangesAsync();
    }

    private async Task<AuthSessionResult> IssueAuthSessionAsync(User user)
    {
        var accessTokenExpiresAt = DateTimeOffset.UtcNow.AddMinutes(GetAccessTokenLifetimeMinutes());
        var refreshTokenExpiresAt = DateTimeOffset.UtcNow.AddDays(GetRefreshTokenLifetimeDays());
        var refreshToken = GenerateRefreshToken();

        _context.RefreshTokens.Add(new RefreshTokenRecord
        {
            UserId = user.id,
            TokenHash = HashToken(refreshToken),
            CreatedAt = DateTimeOffset.UtcNow,
            ExpiresAt = refreshTokenExpiresAt
        });

        await _context.SaveChangesAsync();

        return new AuthSessionResult
        {
            AccessToken = GenerateJwtToken(user, accessTokenExpiresAt.UtcDateTime),
            RefreshToken = refreshToken,
            AccessTokenExpiresAt = accessTokenExpiresAt,
            RefreshTokenExpiresAt = refreshTokenExpiresAt
        };
    }

    private object BuildAuthResponse(User user, AuthSessionResult authSession)
    {
        return new
        {
            user.id,
            user.first_name,
            user.last_name,
            email = user.email ?? string.Empty,
            user.is_email_verified,
            user.phone_number,
            user.is_phone_verified,
            avatar_url = user.avatar_url ?? string.Empty,
            token = authSession.AccessToken,
            refreshToken = authSession.RefreshToken,
            accessTokenExpiresAt = authSession.AccessTokenExpiresAt.ToString("O"),
            refreshTokenExpiresAt = authSession.RefreshTokenExpiresAt.ToString("O")
        };
    }

    private object BuildUserPayload(User user)
    {
        return new
        {
            id = user.id,
            first_name = user.first_name,
            last_name = user.last_name,
            email = user.email ?? string.Empty,
            is_email_verified = user.is_email_verified,
            phone_number = user.phone_number ?? string.Empty,
            is_phone_verified = user.is_phone_verified,
            avatar_url = user.avatar_url ?? string.Empty
        };
    }

    private async Task<EmailVerificationResult> CreateEmailVerificationAsync(User user)
    {
        if (string.IsNullOrWhiteSpace(user.email))
        {
            throw new InvalidOperationException("Email verification requested for user without email.");
        }

        var userEmail = user.email;
        var now = DateTimeOffset.UtcNow;
        var latestActive = await _context.EmailVerificationCodes
            .Where(item => item.UserId == user.id && !item.ConsumedAt.HasValue)
            .OrderByDescending(item => item.CreatedAt)
            .FirstOrDefaultAsync();

        if (latestActive != null &&
            latestActive.LastSentAt + EmailVerificationResendCooldown > now)
        {
            return EmailVerificationResult.RateLimited(
                userEmail,
                latestActive.ExpiresAt,
                latestActive.LastSentAt.Add(EmailVerificationResendCooldown));
        }

        var verificationCode = GenerateEmailVerificationCode();
        var verificationToken = GenerateVerificationToken();
        var expiresAt = now.Add(EmailVerificationLifetime);
        var resendAvailableAt = now.Add(EmailVerificationResendCooldown);

        await using var transaction = await _context.Database.BeginTransactionAsync();
        var activeCodes = await _context.EmailVerificationCodes
            .Where(item => item.UserId == user.id && !item.ConsumedAt.HasValue)
            .ToListAsync();

        foreach (var activeCode in activeCodes)
        {
            activeCode.ConsumedAt = now;
        }

        _context.EmailVerificationCodes.Add(new EmailVerificationCodeRecord
        {
            UserId = user.id,
            Email = userEmail,
            VerificationTokenHash = AuthInputPolicies.HashSecret(verificationToken),
            CodeHash = AuthInputPolicies.HashSecret(verificationCode),
            CreatedAt = now,
            ExpiresAt = expiresAt,
            LastSentAt = now,
            AttemptCount = 0
        });

        await _context.SaveChangesAsync();
        await _emailVerificationSender.SendVerificationCodeAsync(userEmail, verificationCode, expiresAt);
        await transaction.CommitAsync();

        var deliveryMode = GetEmailDeliveryMode();
        return EmailVerificationResult.Success(
            userEmail,
            verificationToken,
            expiresAt,
            resendAvailableAt,
            deliveryMode,
            string.Equals(deliveryMode, "mock", StringComparison.OrdinalIgnoreCase) ? verificationCode : null);
    }

    private string GenerateJwtToken(User user, DateTime expiresAtUtc)
    {
        var jwtSettings = _config.GetSection("Jwt");
        var keyBytes = Encoding.UTF8.GetBytes(jwtSettings["Key"] ?? throw new InvalidOperationException("Jwt:Key is not configured"));
        var key = new SymmetricSecurityKey(keyBytes);
        var creds = new SigningCredentials(key, SecurityAlgorithms.HmacSha256);

        var claims = new List<Claim>
        {
            new(JwtRegisteredClaimNames.Sub, user.id.ToString()),
            new(ClaimTypes.NameIdentifier, user.id.ToString()),
            new("first_name", user.first_name),
            new("last_name", user.last_name)
        };

        if (!string.IsNullOrWhiteSpace(user.email))
        {
            claims.Add(new Claim(JwtRegisteredClaimNames.Email, user.email));
            claims.Add(new Claim(ClaimTypes.Email, user.email));
        }

        if (!string.IsNullOrWhiteSpace(user.phone_number))
        {
            claims.Add(new Claim("phone_number", user.phone_number));
        }

        var token = new JwtSecurityToken(
            issuer: jwtSettings["Issuer"],
            audience: jwtSettings["Audience"],
            claims: claims,
            expires: expiresAtUtc,
            signingCredentials: creds
        );

        return new JwtSecurityTokenHandler().WriteToken(token);
    }

    private int GetAccessTokenLifetimeMinutes()
    {
        return int.TryParse(_config["Jwt:AccessTokenMinutes"], out var configured) && configured > 0
            ? configured
            : 20;
    }

    private int GetRefreshTokenLifetimeDays()
    {
        return int.TryParse(_config["Jwt:RefreshTokenDays"], out var configured) && configured > 0
            ? configured
            : 30;
    }

    private string GetSmsDeliveryMode()
    {
        return string.IsNullOrWhiteSpace(_config["Sms:Mode"]) ? "mock" : _config["Sms:Mode"]!.Trim().ToLowerInvariant();
    }

    private string GetEmailDeliveryMode()
    {
        return string.IsNullOrWhiteSpace(_config["Email:Mode"]) ? "mock" : _config["Email:Mode"]!.Trim().ToLowerInvariant();
    }

    private static string GenerateRefreshToken()
    {
        return Convert.ToBase64String(RandomNumberGenerator.GetBytes(64));
    }

    private static string GenerateVerificationToken()
    {
        return Convert.ToHexString(RandomNumberGenerator.GetBytes(32));
    }

    private static string GeneratePhoneVerificationCode()
    {
        return RandomNumberGenerator.GetInt32(100000, 1000000).ToString();
    }

    private static string GenerateEmailVerificationCode()
    {
        return RandomNumberGenerator.GetInt32(100000, 1000000).ToString();
    }

    private static string HashToken(string rawToken)
    {
        return Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(rawToken.Trim())));
    }
}

public class RegisterDto
{
    [Required]
    public string first_name { get; set; } = string.Empty;

    [Required]
    public string last_name { get; set; } = string.Empty;

    public string? email { get; set; }

    public string? phone { get; set; }

    public string? phone_verification_token { get; set; }

    [Required]
    [MinLength(6)]
    public string password { get; set; } = string.Empty;
}

public class LoginDto
{
    public string? identifier { get; set; }

    public string? email { get; set; }

    [Required]
    public string password { get; set; } = string.Empty;
}

public class PhoneVerificationRequestDto
{
    public string? phone { get; set; }
}

public class VerifyPhoneCodeDto
{
    [Required]
    public string? phone { get; set; }

    [Required]
    public string verificationToken { get; set; } = string.Empty;

    [Required]
    public string code { get; set; } = string.Empty;
}

public class ResendEmailVerificationDto
{
    [Required]
    public string? email { get; set; }
}

public class VerifyEmailCodeDto
{
    [Required]
    public string? email { get; set; }

    [Required]
    public string verificationToken { get; set; } = string.Empty;

    [Required]
    public string code { get; set; } = string.Empty;
}

public class RefreshTokenDto
{
    [Required]
    public string refreshToken { get; set; } = string.Empty;
}

public class AuthSessionResult
{
    public string AccessToken { get; set; } = string.Empty;
    public string RefreshToken { get; set; } = string.Empty;
    public DateTimeOffset AccessTokenExpiresAt { get; set; }
    public DateTimeOffset RefreshTokenExpiresAt { get; set; }
}

public sealed class EmailVerificationResult
{
    public required string Email { get; init; }
    public string VerificationToken { get; init; } = string.Empty;
    public required DateTimeOffset ExpiresAt { get; init; }
    public required DateTimeOffset ResendAvailableAt { get; init; }
    public string DeliveryMode { get; init; } = "mock";
    public string? DebugCode { get; init; }
    public bool IsRateLimited { get; init; }

    public object ToResponse()
    {
        return new
        {
            email = Email,
            verificationToken = VerificationToken,
            expiresAt = ExpiresAt.ToString("O"),
            resendAvailableAt = ResendAvailableAt.ToString("O"),
            deliveryMode = DeliveryMode,
            debugCode = DebugCode
        };
    }

    public static EmailVerificationResult Success(string email, string verificationToken, DateTimeOffset expiresAt, DateTimeOffset resendAvailableAt, string deliveryMode, string? debugCode)
    {
        return new EmailVerificationResult
        {
            Email = email,
            VerificationToken = verificationToken,
            ExpiresAt = expiresAt,
            ResendAvailableAt = resendAvailableAt,
            DeliveryMode = deliveryMode,
            DebugCode = debugCode,
            IsRateLimited = false
        };
    }

    public static EmailVerificationResult RateLimited(string email, DateTimeOffset expiresAt, DateTimeOffset resendAvailableAt)
    {
        return new EmailVerificationResult
        {
            Email = email,
            ExpiresAt = expiresAt,
            ResendAvailableAt = resendAvailableAt,
            DeliveryMode = "mock",
            IsRateLimited = true
        };
    }
}


