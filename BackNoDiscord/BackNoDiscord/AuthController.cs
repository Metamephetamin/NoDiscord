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
using BackNoDiscord.Infrastructure;

namespace BackNoDiscord;

[ApiController]
[Route("api/[controller]")]
public class AuthController : ControllerBase
{
    private static readonly TimeSpan QrLoginLifetime = TimeSpan.FromMinutes(2);
    private static readonly TimeSpan EmailVerificationLifetime = TimeSpan.FromMinutes(15);
    private static readonly TimeSpan EmailVerificationResendCooldown = TimeSpan.FromSeconds(60);
    private const int MaxEmailVerificationAttempts = 5;
    private bool RequireEmailRegistrationVerification => _config.GetValue<bool?>("Auth:RequireEmailVerification") ?? true;

    private readonly AppDbContext _context;
    private readonly IConfiguration _config;
    private readonly IEmailVerificationSender _emailVerificationSender;
    private readonly PasswordHasher<User> _passwordHasher;

    public AuthController(AppDbContext context, IConfiguration config, IEmailVerificationSender emailVerificationSender)
    {
        _context = context;
        _config = config;
        _emailVerificationSender = emailVerificationSender;
        _passwordHasher = new PasswordHasher<User>();
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
            return BadRequest(new { message = "Пользователь с такой почтой не найден." });
        }

        if (user.is_email_verified)
        {
            return BadRequest(new { message = "Почта уже подтверждена." });
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
            return BadRequest(new { message = "Введите корректный шестизначный код." });
        }

        var user = await _context.Users.FirstOrDefaultAsync(item => item.email == normalizedEmail);
        if (user == null)
        {
            return BadRequest(new { message = "Пользователь с такой почтой не найден." });
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
            return BadRequest(new { message = "Сессия подтверждения почты не найдена. Запросите код заново." });
        }

        if (record.ExpiresAt <= now)
        {
            record.ConsumedAt = now;
            await _context.SaveChangesAsync();
            return BadRequest(new { message = "Срок действия кода истёк. Запросите новый код." });
        }

        if (record.AttemptCount >= MaxEmailVerificationAttempts)
        {
            return BadRequest(new { message = "Лимит попыток исчерпан. Запросите новый код." });
        }

        var wasEmailVerified = user.is_email_verified;
        if (wasEmailVerified && user.is_totp_enabled && !TotpService.VerifyCode(user.totp_secret, dto.totpCode, now))
        {
            return BadRequest(new
            {
                code = "totp_required",
                message = "Введите код из Google Authenticator.",
                requiresTotp = true
            });
        }

        if (!string.Equals(record.CodeHash, AuthInputPolicies.HashSecret(code), StringComparison.Ordinal))
        {
            record.AttemptCount += 1;
            if (record.AttemptCount >= MaxEmailVerificationAttempts)
            {
                record.ConsumedAt = now;
            }

            await _context.SaveChangesAsync();
            return BadRequest(new { message = "Неверный код подтверждения." });
        }

        record.VerifiedAt = now;
        record.ConsumedAt = now;
        user.is_email_verified = true;
        await _context.SaveChangesAsync();

        await RevokeActiveRefreshTokensAsync(user.id);
        var authSession = await IssueAuthSessionAsync(user);
        return Ok(BuildAuthResponse(user, authSession));
    }

    [HttpPost("totp/setup")]
    [Authorize(AuthenticationSchemes = JwtBearerDefaults.AuthenticationScheme)]
    [EnableRateLimiting("auth")]
    public async Task<IActionResult> SetupTotp()
    {
        var user = await GetCurrentUserAsync();
        if (user == null)
        {
            return Unauthorized();
        }

        if (user.is_totp_enabled)
        {
            return BadRequest(new { message = "Google Authenticator уже подключён." });
        }

        var secret = TotpService.GenerateSecret();
        user.totp_secret = secret;
        user.is_totp_enabled = false;
        user.totp_enabled_at = null;
        await _context.SaveChangesAsync();

        var accountName = !string.IsNullOrWhiteSpace(user.email)
            ? user.email
            : user.nickname;

        return Ok(new
        {
            secret,
            accountName,
            otpauthUri = TotpService.BuildOtpAuthUri("MAX", accountName, secret),
            isTotpEnabled = user.is_totp_enabled
        });
    }

    [HttpPost("totp/verify")]
    [Authorize(AuthenticationSchemes = JwtBearerDefaults.AuthenticationScheme)]
    [EnableRateLimiting("auth")]
    public async Task<IActionResult> VerifyTotpSetup([FromBody] TotpCodeDto dto)
    {
        var user = await GetCurrentUserAsync();
        if (user == null)
        {
            return Unauthorized();
        }

        if (!TotpService.VerifyCode(user.totp_secret, dto.code, DateTimeOffset.UtcNow))
        {
            return BadRequest(new { message = "Неверный код из Google Authenticator." });
        }

        user.is_totp_enabled = true;
        user.totp_enabled_at = DateTimeOffset.UtcNow;
        await _context.SaveChangesAsync();

        return Ok(new { isTotpEnabled = true, enabledAt = user.totp_enabled_at?.ToString("O") });
    }

    [HttpPost("totp/disable")]
    [Authorize(AuthenticationSchemes = JwtBearerDefaults.AuthenticationScheme)]
    [EnableRateLimiting("auth")]
    public async Task<IActionResult> DisableTotp([FromBody] TotpCodeDto dto)
    {
        var user = await GetCurrentUserAsync();
        if (user == null)
        {
            return Unauthorized();
        }

        if (user.is_totp_enabled && !TotpService.VerifyCode(user.totp_secret, dto.code, DateTimeOffset.UtcNow))
        {
            return BadRequest(new { message = "Неверный код из Google Authenticator." });
        }

        user.totp_secret = null;
        user.is_totp_enabled = false;
        user.totp_enabled_at = null;
        await _context.SaveChangesAsync();

        return Ok(new { isTotpEnabled = false });
    }

    [HttpPost("qr-login/session")]
    [EnableRateLimiting("auth")]
    public async Task<IActionResult> CreateQrLoginSession()
    {
        var now = DateTimeOffset.UtcNow;
        var sessionId = GeneratePublicToken(16);
        var browserToken = GenerateVerificationToken();
        var scannerToken = GenerateVerificationToken();

        await _context.QrLoginSessions
            .Where(item =>
                item.ExpiresAt < now.AddMinutes(-10) ||
                (item.ConsumedAt.HasValue && item.ConsumedAt < now.AddMinutes(-10)) ||
                (item.CanceledAt.HasValue && item.CanceledAt < now.AddMinutes(-10)))
            .ExecuteDeleteAsync();

        _context.QrLoginSessions.Add(new QrLoginSessionRecord
        {
            SessionId = sessionId,
            BrowserTokenHash = AuthInputPolicies.HashSecret(browserToken),
            ScannerTokenHash = AuthInputPolicies.HashSecret(scannerToken),
            CreatedAt = now,
            ExpiresAt = now.Add(QrLoginLifetime),
            RequestedIp = GetClientIp(),
            RequestedUserAgent = GetUserAgent()
        });

        await _context.SaveChangesAsync();

        return Ok(new
        {
            sessionId,
            browserToken,
            scannerToken,
            expiresAt = now.Add(QrLoginLifetime).ToString("O")
        });
    }

    [HttpGet("qr-login/session/{sessionId}")]
    [EnableRateLimiting("qr-login-poll")]
    public async Task<IActionResult> GetQrLoginSessionStatus([FromRoute] string sessionId, [FromQuery] string? browserToken)
    {
        var normalizedSessionId = NormalizeQrLoginToken(sessionId);
        var normalizedBrowserToken = NormalizeQrLoginToken(browserToken);
        if (string.IsNullOrWhiteSpace(normalizedSessionId) || string.IsNullOrWhiteSpace(normalizedBrowserToken))
        {
            return BadRequest(new { status = "invalid", message = "QR-сессия не найдена." });
        }

        var browserTokenHash = AuthInputPolicies.HashSecret(normalizedBrowserToken);
        var record = await _context.QrLoginSessions
            .Include(item => item.ApprovedUser)
            .FirstOrDefaultAsync(item =>
                item.SessionId == normalizedSessionId &&
                item.BrowserTokenHash == browserTokenHash);

        if (record == null)
        {
            return BadRequest(new { status = "invalid", message = "QR-сессия не найдена." });
        }

        var status = GetQrLoginStatus(record, DateTimeOffset.UtcNow);
        if (status == "approved" && record.ApprovedUser != null)
        {
            record.ConsumedAt = DateTimeOffset.UtcNow;
            var authSession = await IssueAuthSessionAsync(record.ApprovedUser);
            await _context.SaveChangesAsync();

            return Ok(BuildQrAuthResponse(record.ApprovedUser, authSession));
        }

        return Ok(new
        {
            status,
            expiresAt = record.ExpiresAt.ToString("O"),
            requestedIp = record.RequestedIp,
            requestedUserAgent = record.RequestedUserAgent
        });
    }

    [HttpGet("qr-login/session/{sessionId}/preview")]
    [Authorize(AuthenticationSchemes = JwtBearerDefaults.AuthenticationScheme)]
    [EnableRateLimiting("auth")]
    public async Task<IActionResult> PreviewQrLoginSession([FromRoute] string sessionId, [FromQuery] string? scannerToken)
    {
        var record = await FindPendingQrLoginSessionAsync(sessionId, scannerToken);
        if (record == null)
        {
            return BadRequest(new { status = "invalid", message = "QR-код устарел или уже использован." });
        }

        return Ok(new
        {
            status = "pending",
            expiresAt = record.ExpiresAt.ToString("O"),
            requestedIp = record.RequestedIp,
            requestedUserAgent = record.RequestedUserAgent
        });
    }

    [HttpPost("qr-login/approve")]
    [Authorize(AuthenticationSchemes = JwtBearerDefaults.AuthenticationScheme)]
    [EnableRateLimiting("auth")]
    public async Task<IActionResult> ApproveQrLoginSession([FromBody] QrLoginApproveDto dto)
    {
        var user = await GetCurrentUserAsync();
        if (user == null)
        {
            return Unauthorized();
        }

        var record = await FindPendingQrLoginSessionAsync(dto.sessionId, dto.scannerToken);
        if (record == null)
        {
            return BadRequest(new { status = "invalid", message = "QR-код устарел или уже использован." });
        }

        var now = DateTimeOffset.UtcNow;
        record.ApprovedUserId = user.id;
        record.ApprovedAt = now;
        record.ApprovedIp = GetClientIp();
        record.ApprovedUserAgent = GetUserAgent();
        await _context.SaveChangesAsync();

        return Ok(new { status = "approved" });
    }

    [HttpPost("request-login-code")]
    [EnableRateLimiting("email-send")]
    public async Task<IActionResult> RequestLoginCode([FromBody] LoginCodeRequestDto dto)
    {
        if (!ModelState.IsValid)
        {
            return ValidationProblem(ModelState);
        }

        var rawIdentifier = dto.identifier ?? string.Empty;
        if (rawIdentifier.Any(char.IsWhiteSpace))
        {
            return BadRequest(CreateLoginError("identifier_invalid", "Логин не должен содержать пробелы.", identifier: "Логин не должен содержать пробелы."));
        }

        var identifier = rawIdentifier.Trim();
        if (string.IsNullOrWhiteSpace(identifier))
        {
            return BadRequest(CreateLoginError("identifier_required", "Введите email.", identifier: "Введите email."));
        }

        if (!AuthInputPolicies.TryNormalizeEmail(identifier, out var normalizedEmail, out var emailError))
        {
            return BadRequest(CreateLoginError("identifier_invalid", emailError, identifier: emailError));
        }

        var user = await _context.Users.FirstOrDefaultAsync(item => item.email == normalizedEmail);
        if (user == null)
        {
            return BadRequest(CreateInvalidCredentialsError());
        }

        if (string.IsNullOrWhiteSpace(user.email))
        {
            return BadRequest(CreateLoginError(
                "email_required",
                "Для входа по коду к аккаунту должна быть привязана почта.",
                identifier: "Для входа по коду к аккаунту должна быть привязана почта."));
        }

        try
        {
            var payload = await CreateEmailVerificationAsync(user, ignoreResendCooldown: true);
            return Ok(payload.ToResponse());
        }
        catch (EmailDeliveryException)
        {
            return StatusCode(StatusCodes.Status503ServiceUnavailable, new
            {
                message = "Не удалось отправить код входа на почту. Попробуйте немного позже."
            });
        }
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

        if (!AuthInputPolicies.TryNormalizeOptionalProfileName(dto.last_name, "Фамилия", out var lastName, out var lastNameError))
        {
            return BadRequest(new { message = lastNameError });
        }

        if (!AuthInputPolicies.TryNormalizeNickname(dto.nickname, out var nickname, out var nicknameError))
        {
            return BadRequest(new { message = nicknameError });
        }

        if (!AuthInputPolicies.TryEnsureMatchingProfileNameScripts(firstName, lastName, out var nameScriptError))
        {
            return BadRequest(new { message = nameScriptError });
        }

        var rawEmail = (dto.email ?? string.Empty).Trim();
        if (string.IsNullOrWhiteSpace(rawEmail))
        {
            return BadRequest(new { message = "Введите email." });
        }

        if (!AuthInputPolicies.TryNormalizeEmail(rawEmail, out var normalizedEmail, out var emailError))
        {
            return BadRequest(new { message = emailError });
        }

        if (dto.password.Trim().Length < 6)
        {
            return BadRequest(new { message = "Пароль должен быть не короче 6 символов." });
        }

        if (await _context.Users.AnyAsync(u => u.email == normalizedEmail))
        {
            return BadRequest(new { message = "Email already exists" });
        }

        var nicknameLookup = nickname.ToLowerInvariant();
        if (await _context.Users.AnyAsync(u => u.nickname.ToLower() == nicknameLookup))
        {
            return BadRequest(new { message = "Этот никнейм уже занят." });
        }

        var user = new User
        {
            first_name = firstName,
            last_name = lastName,
            nickname = nickname,
            email = normalizedEmail,
            is_email_verified = !RequireEmailRegistrationVerification,
            phone_number = null,
            is_phone_verified = false
        };

        user.password_hash = _passwordHasher.HashPassword(user, dto.password);

        _context.Users.Add(user);

        await _context.SaveChangesAsync();

        if (!string.IsNullOrWhiteSpace(normalizedEmail) && RequireEmailRegistrationVerification)
        {
            try
            {
                var emailVerification = await CreateEmailVerificationAsync(user);
                return Ok(new
                {
                    pendingEmailVerification = true,
                    user = BuildUserPayload(user),
                    verification = emailVerification.ToResponse()
                });
            }
            catch (EmailDeliveryException)
            {
                var createdUser = await _context.Users.FirstOrDefaultAsync(item => item.id == user.id);
                if (createdUser != null)
                {
                    var pendingCodes = await _context.EmailVerificationCodes
                        .Where(item => item.UserId == createdUser.id)
                        .ToListAsync();

                    _context.EmailVerificationCodes.RemoveRange(pendingCodes);
                    _context.Users.Remove(createdUser);
                    await _context.SaveChangesAsync();
                }

                return StatusCode(StatusCodes.Status503ServiceUnavailable, new
                {
                    message = "Не удалось отправить письмо с кодом подтверждения. Попробуйте зарегистрироваться ещё раз чуть позже."
                });
            }
        }

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

        return await HandleLoginAsync(dto);
    }

    private async Task<IActionResult> HandleLoginAsync(LoginDto dto)
    {
        var rawIdentifier = dto.identifier ?? dto.email ?? string.Empty;
        if (rawIdentifier.Any(char.IsWhiteSpace))
        {
            return BadRequest(CreateLoginError("identifier_invalid", "Логин не должен содержать пробелы.", identifier: "Логин не должен содержать пробелы."));
        }

        var identifier = rawIdentifier.Trim();
        if (string.IsNullOrWhiteSpace(identifier))
        {
            return BadRequest(CreateLoginError("identifier_required", "Введите email.", identifier: "Введите email."));
        }

        if (string.IsNullOrWhiteSpace(dto.password))
        {
            return BadRequest(CreateLoginError("password_required", "Введите пароль.", password: "Введите пароль."));
        }

        if (!AuthInputPolicies.TryNormalizeEmail(identifier, out var normalizedEmail, out var emailError))
        {
            return BadRequest(CreateLoginError("identifier_invalid", emailError, identifier: emailError));
        }

        var user = await _context.Users.FirstOrDefaultAsync(item => item.email == normalizedEmail);
        if (user == null)
        {
            return BadRequest(CreateInvalidCredentialsError());
        }

        var passwordResult = _passwordHasher.VerifyHashedPassword(user, user.password_hash, dto.password);
        if (passwordResult == PasswordVerificationResult.Failed)
        {
            return BadRequest(CreateInvalidCredentialsError());
        }

        if (passwordResult == PasswordVerificationResult.SuccessRehashNeeded)
        {
            user.password_hash = _passwordHasher.HashPassword(user, dto.password);
            await _context.SaveChangesAsync();
        }

        if (RequireEmailRegistrationVerification && !string.IsNullOrWhiteSpace(user.email) && !user.is_email_verified)
        {
            try
            {
                var emailVerification = await CreateEmailVerificationAsync(user, ignoreResendCooldown: true);
                return BadRequest(new
                {
                    code = "email_verification_required",
                    message = "Сначала подтвердите email. Мы отправили новый код на почту.",
                    pendingEmailVerification = true,
                    verification = emailVerification.ToResponse()
                });
            }
            catch (EmailDeliveryException)
            {
                return StatusCode(StatusCodes.Status503ServiceUnavailable, new
                {
                    message = "Не удалось отправить код подтверждения email. Попробуйте немного позже."
                });
            }
        }

        if (user.is_totp_enabled && !TotpService.VerifyCode(user.totp_secret, dto.totpCode, DateTimeOffset.UtcNow))
        {
            return BadRequest(CreateTotpRequiredError());
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

        var now = DateTimeOffset.UtcNow;
        storedToken.RevokedAt = now;
        storedToken.LastUsedAt = now;
        storedToken.LastIp = GetClientIp();
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

    [HttpGet("devices")]
    [Authorize(AuthenticationSchemes = JwtBearerDefaults.AuthenticationScheme)]
    public async Task<IActionResult> GetDevices()
    {
        var user = await GetCurrentUserAsync();
        if (user == null)
        {
            return Unauthorized();
        }

        var now = DateTimeOffset.UtcNow;
        var currentRefreshTokenHash = GetCurrentRefreshTokenHash();
        var sessions = await _context.RefreshTokens
            .AsNoTracking()
            .Where(item =>
                item.UserId == user.id &&
                !item.RevokedAt.HasValue &&
                item.ExpiresAt > now)
            .OrderByDescending(item => item.LastUsedAt)
            .ThenByDescending(item => item.CreatedAt)
            .ToListAsync();

        return Ok(new
        {
            sessions = sessions.Select(item => BuildDeviceSessionPayload(item, currentRefreshTokenHash))
        });
    }

    [HttpDelete("devices/{sessionId:int}")]
    [Authorize(AuthenticationSchemes = JwtBearerDefaults.AuthenticationScheme)]
    [EnableRateLimiting("auth")]
    public async Task<IActionResult> RevokeDeviceSession([FromRoute] int sessionId)
    {
        var user = await GetCurrentUserAsync();
        if (user == null)
        {
            return Unauthorized();
        }

        var session = await _context.RefreshTokens.FirstOrDefaultAsync(item => item.Id == sessionId && item.UserId == user.id);
        if (session == null)
        {
            return NotFound(new { message = "Сессия не найдена." });
        }

        if (!session.RevokedAt.HasValue)
        {
            session.RevokedAt = DateTimeOffset.UtcNow;
            session.LastUsedAt = DateTimeOffset.UtcNow;
            session.LastIp = GetClientIp();
            await _context.SaveChangesAsync();
        }

        return Ok(new { revoked = true, sessionId });
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
        var now = DateTimeOffset.UtcNow;
        var accessTokenExpiresAt = now.AddMinutes(GetAccessTokenLifetimeMinutes());
        var refreshTokenExpiresAt = now.AddDays(GetRefreshTokenLifetimeDays());
        var refreshToken = GenerateRefreshToken();
        var userAgent = GetUserAgent();
        var clientIp = GetClientIp();

        _context.RefreshTokens.Add(new RefreshTokenRecord
        {
            UserId = user.id,
            TokenHash = HashToken(refreshToken),
            CreatedAt = now,
            ExpiresAt = refreshTokenExpiresAt,
            UserAgent = userAgent,
            DeviceLabel = BuildDeviceLabel(userAgent),
            LastIp = clientIp,
            LastUsedAt = now,
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
            user.nickname,
            email = user.email ?? string.Empty,
            user.is_email_verified,
            user.phone_number,
            user.is_phone_verified,
            is_totp_enabled = user.is_totp_enabled,
            avatar_url = user.avatar_url ?? string.Empty,
            avatar_frame = MediaFrameSerializer.Parse(user.avatar_frame_json, allowNull: true),
            profile_background_url = user.profile_background_url ?? string.Empty,
            profile_background_frame = MediaFrameSerializer.Parse(user.profile_background_frame_json, allowNull: true),
            token = authSession.AccessToken,
            refreshToken = authSession.RefreshToken,
            accessTokenExpiresAt = authSession.AccessTokenExpiresAt.ToString("O"),
            refreshTokenExpiresAt = authSession.RefreshTokenExpiresAt.ToString("O")
        };
    }

    private object BuildQrAuthResponse(User user, AuthSessionResult authSession)
    {
        return new
        {
            status = "approved",
            user.id,
            user.first_name,
            user.last_name,
            user.nickname,
            email = user.email ?? string.Empty,
            user.is_email_verified,
            user.phone_number,
            user.is_phone_verified,
            is_totp_enabled = user.is_totp_enabled,
            avatar_url = user.avatar_url ?? string.Empty,
            avatar_frame = MediaFrameSerializer.Parse(user.avatar_frame_json, allowNull: true),
            profile_background_url = user.profile_background_url ?? string.Empty,
            profile_background_frame = MediaFrameSerializer.Parse(user.profile_background_frame_json, allowNull: true),
            token = authSession.AccessToken,
            accessToken = authSession.AccessToken,
            refreshToken = authSession.RefreshToken,
            accessTokenExpiresAt = authSession.AccessTokenExpiresAt.ToString("O"),
            refreshTokenExpiresAt = authSession.RefreshTokenExpiresAt.ToString("O")
        };
    }

    private object BuildDeviceSessionPayload(RefreshTokenRecord session, string? currentRefreshTokenHash)
    {
        var isCurrent = !string.IsNullOrWhiteSpace(currentRefreshTokenHash)
            && string.Equals(session.TokenHash, currentRefreshTokenHash, StringComparison.Ordinal);

        return new
        {
            id = session.Id,
            deviceLabel = string.IsNullOrWhiteSpace(session.DeviceLabel) ? "Устройство" : session.DeviceLabel,
            userAgent = session.UserAgent ?? string.Empty,
            lastIp = session.LastIp ?? string.Empty,
            createdAt = session.CreatedAt.ToString("O"),
            lastUsedAt = session.LastUsedAt.ToString("O"),
            expiresAt = session.ExpiresAt.ToString("O"),
            isCurrent,
        };
    }

    private object BuildUserPayload(User user)
    {
        return new
        {
            id = user.id,
            first_name = user.first_name,
            last_name = user.last_name,
            nickname = user.nickname,
            email = user.email ?? string.Empty,
            is_email_verified = user.is_email_verified,
            phone_number = user.phone_number ?? string.Empty,
            is_phone_verified = user.is_phone_verified,
            is_totp_enabled = user.is_totp_enabled,
            avatar_url = user.avatar_url ?? string.Empty,
            avatar_frame = MediaFrameSerializer.Parse(user.avatar_frame_json, allowNull: true),
            profile_background_url = user.profile_background_url ?? string.Empty,
            profile_background_frame = MediaFrameSerializer.Parse(user.profile_background_frame_json, allowNull: true)
        };
    }

    private async Task<EmailVerificationResult> CreateEmailVerificationAsync(User user, bool ignoreResendCooldown = false)
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

        if (!ignoreResendCooldown &&
            latestActive != null &&
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
            new("nickname", user.nickname),
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
            : 60;
    }

    private int GetRefreshTokenLifetimeDays()
    {
        return int.TryParse(_config["Jwt:RefreshTokenDays"], out var configured) && configured > 0
            ? configured
            : 14;
    }

    private string GetEmailDeliveryMode()
    {
        return string.IsNullOrWhiteSpace(_config["Email:Mode"]) ? "mock" : _config["Email:Mode"]!.Trim().ToLowerInvariant();
    }

    private async Task<User?> GetCurrentUserAsync()
    {
        var userIdClaim = User.FindFirstValue(ClaimTypes.NameIdentifier)
                          ?? User.FindFirstValue(JwtRegisteredClaimNames.Sub);
        return int.TryParse(userIdClaim, out var userId)
            ? await _context.Users.FirstOrDefaultAsync(user => user.id == userId)
            : null;
    }

    private async Task<QrLoginSessionRecord?> FindPendingQrLoginSessionAsync(string? sessionId, string? scannerToken)
    {
        var normalizedSessionId = NormalizeQrLoginToken(sessionId);
        var normalizedScannerToken = NormalizeQrLoginToken(scannerToken);
        if (string.IsNullOrWhiteSpace(normalizedSessionId) || string.IsNullOrWhiteSpace(normalizedScannerToken))
        {
            return null;
        }

        var scannerTokenHash = AuthInputPolicies.HashSecret(normalizedScannerToken);
        var now = DateTimeOffset.UtcNow;
        return await _context.QrLoginSessions.FirstOrDefaultAsync(item =>
            item.SessionId == normalizedSessionId &&
            item.ScannerTokenHash == scannerTokenHash &&
            item.ExpiresAt > now &&
            !item.ApprovedAt.HasValue &&
            !item.ConsumedAt.HasValue &&
            !item.CanceledAt.HasValue);
    }

    private static string GetQrLoginStatus(QrLoginSessionRecord record, DateTimeOffset now)
    {
        if (record.CanceledAt.HasValue)
        {
            return "canceled";
        }

        if (record.ConsumedAt.HasValue)
        {
            return "consumed";
        }

        if (record.ExpiresAt <= now)
        {
            return "expired";
        }

        return record.ApprovedAt.HasValue ? "approved" : "pending";
    }

    private string GetClientIp()
    {
        return (HttpContext.Connection.RemoteIpAddress?.ToString() ?? "unknown").Trim();
    }

    private string GetUserAgent()
    {
        var userAgent = Request.Headers.UserAgent.ToString().Trim();
        return userAgent.Length <= 512 ? userAgent : userAgent[..512];
    }

    private string? GetCurrentRefreshTokenHash()
    {
        var rawRefreshToken = Request.Headers["X-Refresh-Token"].ToString().Trim();
        if (string.IsNullOrWhiteSpace(rawRefreshToken))
        {
            return null;
        }

        return HashToken(rawRefreshToken);
    }

    private static string BuildDeviceLabel(string userAgent)
    {
        var normalized = (userAgent ?? string.Empty).Trim();
        if (string.IsNullOrWhiteSpace(normalized))
        {
            return "Неизвестное устройство";
        }

        var lower = normalized.ToLowerInvariant();
        var platform =
            lower.Contains("iphone") ? "iPhone" :
            lower.Contains("ipad") ? "iPad" :
            lower.Contains("android") ? "Android" :
            lower.Contains("windows") ? "Windows" :
            lower.Contains("mac os x") || lower.Contains("macintosh") ? "macOS" :
            lower.Contains("linux") ? "Linux" :
            "Устройство";
        var browser =
            lower.Contains("edg/") ? "Edge" :
            lower.Contains("opr/") || lower.Contains("opera") ? "Opera" :
            lower.Contains("firefox/") ? "Firefox" :
            lower.Contains("electron/") ? "Electron" :
            lower.Contains("chrome/") && !lower.Contains("edg/") && !lower.Contains("opr/") ? "Chrome" :
            lower.Contains("safari/") && !lower.Contains("chrome/") ? "Safari" :
            "Браузер";

        return $"{browser} на {platform}";
    }

    private static string NormalizeQrLoginToken(string? value)
    {
        return new string((value ?? string.Empty).Where(Uri.IsHexDigit).ToArray()).ToUpperInvariant();
    }

    private static string GenerateRefreshToken()
    {
        return Convert.ToBase64String(RandomNumberGenerator.GetBytes(64));
    }

    private static object CreateLoginError(string code, string message, string? identifier = null, string? password = null)
    {
        var fieldErrors = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);

        if (!string.IsNullOrWhiteSpace(identifier))
        {
            fieldErrors["identifier"] = identifier;
        }

        if (!string.IsNullOrWhiteSpace(password))
        {
            fieldErrors["password"] = password;
        }

        return new
        {
            code,
            message,
            fieldErrors
        };
    }

    private static object CreateInvalidCredentialsError()
    {
        const string message = "Неверный email или пароль.";
        return CreateLoginError(
            "invalid_credentials",
            message,
            identifier: message,
            password: message);
    }

    private static object CreateTotpRequiredError()
    {
        return new
        {
            code = "totp_required",
            message = "Введите код из Google Authenticator.",
            requiresTotp = true,
            fieldErrors = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase)
            {
                ["totpCode"] = "Введите код из Google Authenticator."
            }
        };
    }

    private static string GenerateVerificationToken()
    {
        return Convert.ToHexString(RandomNumberGenerator.GetBytes(32));
    }

    private static string GeneratePublicToken(int byteCount)
    {
        return Convert.ToHexString(RandomNumberGenerator.GetBytes(byteCount));
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

    public string last_name { get; set; } = string.Empty;

    [Required]
    public string nickname { get; set; } = string.Empty;

    public string? email { get; set; }

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

    public string? totpCode { get; set; }
}

public class LoginCodeRequestDto
{
    public string? identifier { get; set; }
}

public class QrLoginApproveDto
{
    public string? sessionId { get; set; }

    public string? scannerToken { get; set; }
}

public class TotpCodeDto
{
    public string? code { get; set; }
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

    public string? totpCode { get; set; }
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


