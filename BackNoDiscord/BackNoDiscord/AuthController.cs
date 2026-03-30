using BackNoDiscord.Security;
using Microsoft.AspNetCore.Authentication.JwtBearer;
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
    private const int MaxPhoneVerificationAttempts = 5;

    private readonly AppDbContext _context;
    private readonly IConfiguration _config;
    private readonly PasswordHasher<User> _passwordHasher;
    private readonly ILogger<AuthController> _logger;

    public AuthController(AppDbContext context, IConfiguration config, ILogger<AuthController> logger)
    {
        _context = context;
        _config = config;
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
                message = $"Повторно отправить код можно через {waitSeconds} сек."
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
        _logger.LogInformation("Phone verification code for {PhoneNumber}: {VerificationCode}", normalizedPhone, verificationCode);

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
            return BadRequest(new { message = "Введите корректный шестизначный код." });
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
            return BadRequest(new { message = "Сессия подтверждения номера не найдена. Запросите код заново." });
        }

        if (record.ExpiresAt <= now)
        {
            record.ConsumedAt = now;
            await _context.SaveChangesAsync();
            return BadRequest(new { message = "Срок действия кода истёк. Запросите новый код." });
        }

        if (record.AttemptCount >= MaxPhoneVerificationAttempts)
        {
            return BadRequest(new { message = "Лимит попыток исчерпан. Запросите новый код." });
        }

        if (!string.Equals(record.CodeHash, AuthInputPolicies.HashSecret(code), StringComparison.Ordinal))
        {
            record.AttemptCount += 1;
            if (record.AttemptCount >= MaxPhoneVerificationAttempts)
            {
                record.ConsumedAt = now;
            }

            await _context.SaveChangesAsync();
            return BadRequest(new { message = "Неверный код подтверждения." });
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

    [HttpPost("register")]
    [EnableRateLimiting("auth")]
    public async Task<IActionResult> Register([FromBody] RegisterDto dto)
    {
        if (!ModelState.IsValid)
        {
            return ValidationProblem(ModelState);
        }

        if (!AuthInputPolicies.TryNormalizeProfileName(dto.first_name, "Имя", out var firstName, out var firstNameError))
        {
            return BadRequest(new { message = firstNameError });
        }

        if (!AuthInputPolicies.TryNormalizeProfileName(dto.last_name, "Фамилия", out var lastName, out var lastNameError))
        {
            return BadRequest(new { message = lastNameError });
        }

        if (!AuthInputPolicies.TryNormalizeEmail(dto.email, out var normalizedEmail, out var emailError))
        {
            return BadRequest(new { message = emailError });
        }

        if (!AuthInputPolicies.TryNormalizeRussianPhone(dto.phone, out var normalizedPhone, out var phoneError))
        {
            return BadRequest(new { message = phoneError });
        }

        if (dto.password.Trim().Length < 6)
        {
            return BadRequest(new { message = "Пароль должен быть не короче 6 символов." });
        }

        if (await _context.Users.AnyAsync(u => u.email == normalizedEmail))
        {
            return BadRequest(new { message = "Email already exists" });
        }

        if (await _context.Users.AnyAsync(u => u.phone_number == normalizedPhone))
        {
            return BadRequest(new { message = "Этот номер уже используется." });
        }

        var verificationToken = (dto.phone_verification_token ?? string.Empty).Trim();
        if (string.IsNullOrWhiteSpace(verificationToken))
        {
            return BadRequest(new { message = "Сначала подтвердите номер телефона." });
        }

        var phoneVerification = await _context.PhoneVerificationCodes
            .Where(item =>
                item.PhoneNumber == normalizedPhone &&
                item.VerificationTokenHash == AuthInputPolicies.HashSecret(verificationToken) &&
                !item.ConsumedAt.HasValue)
            .OrderByDescending(item => item.CreatedAt)
            .FirstOrDefaultAsync();

        if (phoneVerification == null || !phoneVerification.VerifiedAt.HasValue || phoneVerification.ExpiresAt <= DateTimeOffset.UtcNow)
        {
            return BadRequest(new { message = "Номер телефона не подтвержден." });
        }

        var user = new User
        {
            first_name = firstName,
            last_name = lastName,
            email = normalizedEmail,
            phone_number = normalizedPhone,
            is_phone_verified = true
        };

        user.password_hash = _passwordHasher.HashPassword(user, dto.password);

        _context.Users.Add(user);
        phoneVerification.ConsumedAt = DateTimeOffset.UtcNow;
        await _context.SaveChangesAsync();

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
            return BadRequest(new { message = "Введите email или номер телефона." });
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
            user.email,
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
            email = user.email,
            phone_number = user.phone_number ?? string.Empty,
            is_phone_verified = user.is_phone_verified,
            avatar_url = user.avatar_url ?? string.Empty
        };
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
            new(JwtRegisteredClaimNames.Email, user.email),
            new(ClaimTypes.Email, user.email),
            new("first_name", user.first_name),
            new("last_name", user.last_name)
        };

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

    [Required]
    public string email { get; set; } = string.Empty;

    [Required]
    public string phone { get; set; } = string.Empty;

    [Required]
    public string phone_verification_token { get; set; } = string.Empty;

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
    [Required]
    public string phone { get; set; } = string.Empty;
}

public class VerifyPhoneCodeDto
{
    [Required]
    public string phone { get; set; } = string.Empty;

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
