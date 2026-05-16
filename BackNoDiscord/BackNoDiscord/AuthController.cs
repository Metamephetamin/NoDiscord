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
using Npgsql;
using System.ComponentModel.DataAnnotations;
using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using BackNoDiscord.Infrastructure;

namespace BackNoDiscord;

[ApiController]
[Route("api/[controller]")]
public class AuthController : ControllerBase
{
    private static readonly TimeSpan QrLoginLifetime = TimeSpan.FromMinutes(2);
    private static readonly TimeSpan EmailVerificationLifetime = TimeSpan.FromMinutes(15);
    private static readonly TimeSpan EmailVerificationResendCooldown = TimeSpan.FromSeconds(60);
    private const string CurrentTermsVersion = "2026-05-13-rf-1";
    private const string CurrentPrivacyVersion = "2026-05-13-rf-1";
    private const string MediaAccessTokenCookieName = "tend_access_token";
    private const int MaxEmailVerificationAttempts = 5;
    private const string EmailVerificationPurpose = "email_verification";
    private const string LoginCodePurpose = "login";
    private const string PasswordResetPurpose = "password_reset";
    private const string TotpResetPurpose = "totp_reset";
    private bool RequireEmailRegistrationVerification => _config.GetValue<bool?>("Auth:RequireEmailVerification") ?? true;

    private readonly AppDbContext _context;
    private readonly IConfiguration _config;
    private readonly IEmailVerificationSender _emailVerificationSender;
    private readonly IWebHostEnvironment _environment;
    private readonly CryptoService _crypto;
    private readonly UserSessionService _userSessionService;
    private readonly AccountBanService _accountBanService;
    private readonly AbuseAutoBanService _abuseAutoBan;
    private readonly PasswordHasher<User> _passwordHasher;

    public AuthController(
        AppDbContext context,
        IConfiguration config,
        IEmailVerificationSender emailVerificationSender,
        IWebHostEnvironment environment,
        CryptoService crypto,
        UserSessionService userSessionService,
        AccountBanService accountBanService,
        AbuseAutoBanService abuseAutoBan)
    {
        _context = context;
        _config = config;
        _emailVerificationSender = emailVerificationSender;
        _environment = environment;
        _crypto = crypto;
        _userSessionService = userSessionService;
        _accountBanService = accountBanService;
        _abuseAutoBan = abuseAutoBan;
        _passwordHasher = new PasswordHasher<User>();
    }

    [HttpPost("local-dev-session")]
    public async Task<IActionResult> CreateLocalDevSession()
    {
        if (!_environment.IsDevelopment() || !IsLocalRequest())
        {
            return NotFound();
        }

        const string devEmail = "localdev@localhost";
        var user = await _context.Users.FirstOrDefaultAsync(item => item.email == devEmail);
        if (user == null)
        {
            user = new User
            {
                first_name = "Local",
                last_name = "Dev",
                nickname = "localdev",
                email = devEmail,
                is_email_verified = true,
                is_phone_verified = false,
            };
            user.password_hash = _passwordHasher.HashPassword(user, Guid.NewGuid().ToString("N"));

            _context.Users.Add(user);
            await _context.SaveChangesAsync();
        }

        if (user.IsBanned)
        {
            return CreateAccountBannedResponse(user);
        }

        var authSession = await IssueAuthSessionAsync(user, null, cancellationToken: HttpContext.RequestAborted);
        return Ok(BuildAuthResponse(user, authSession));
    }

    [HttpPost("resend-email-verification")]
    [EnableRateLimiting("email-send")]
    public async Task<IActionResult> ResendEmailVerification([FromBody] ResendEmailVerificationDto dto, CancellationToken cancellationToken = default)
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
            var payload = await CreateEmailVerificationAsync(user, cancellationToken: cancellationToken);
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

        if (user.IsBanned)
        {
            return CreateAccountBannedResponse(user);
        }

        var now = DateTimeOffset.UtcNow;
        var record = await _context.EmailVerificationCodes
            .Where(item =>
                item.UserId == user.id &&
                item.Email == normalizedEmail &&
                item.VerificationTokenHash == AuthInputPolicies.HashSecret(verificationToken) &&
                (item.Purpose == EmailVerificationPurpose || item.Purpose == LoginCodePurpose || item.Purpose == string.Empty) &&
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
        if (wasEmailVerified && user.is_totp_enabled && !VerifyUserTotpCode(user, dto.totpCode, now))
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

        var authSession = await IssueAuthSessionAsync(user, dto.deviceToken, cancellationToken: HttpContext.RequestAborted);
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
        user.totp_secret = ProtectTotpSecret(secret);
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

        if (!VerifyUserTotpCode(user, dto.code, DateTimeOffset.UtcNow))
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

        if (user.is_totp_enabled && !VerifyUserTotpCode(user, dto.code, DateTimeOffset.UtcNow))
        {
            return BadRequest(new { message = "Неверный код из Google Authenticator." });
        }

        user.totp_secret = null;
        user.is_totp_enabled = false;
        user.totp_enabled_at = null;
        await _context.SaveChangesAsync();

        return Ok(new { isTotpEnabled = false });
    }

    [HttpPost("totp/reset-code")]
    [Authorize(AuthenticationSchemes = JwtBearerDefaults.AuthenticationScheme)]
    [EnableRateLimiting("email-send")]
    public async Task<IActionResult> RequestTotpResetCode([FromBody] TotpResetCodeRequestDto dto, CancellationToken cancellationToken = default)
    {
        var user = await GetCurrentUserAsync();
        if (user == null)
        {
            return Unauthorized();
        }

        if (user.IsBanned)
        {
            return CreateAccountBannedResponse(user);
        }

        if (!user.is_totp_enabled)
        {
            return BadRequest(new { message = "Google Authenticator is not enabled." });
        }

        if (string.IsNullOrWhiteSpace(user.email) || !user.is_email_verified)
        {
            return BadRequest(new { message = "A verified email is required to reset Google Authenticator." });
        }

        var passwordResult = _passwordHasher.VerifyHashedPassword(user, user.password_hash, dto.password ?? string.Empty);
        if (passwordResult == PasswordVerificationResult.Failed)
        {
            return BadRequest(new { message = "Invalid password." });
        }

        if (passwordResult == PasswordVerificationResult.SuccessRehashNeeded)
        {
            user.password_hash = _passwordHasher.HashPassword(user, dto.password ?? string.Empty);
            await _context.SaveChangesAsync(cancellationToken);
        }

        try
        {
            var payload = await CreateEmailVerificationAsync(user, purpose: TotpResetPurpose, cancellationToken: cancellationToken);
            if (payload.IsRateLimited)
            {
                return StatusCode(StatusCodes.Status429TooManyRequests, new
                {
                    message = "Code can be resent in 60 seconds.",
                    resendAvailableAt = payload.ResendAvailableAt
                });
            }

            return Ok(payload.ToResponse());
        }
        catch (EmailDeliveryException)
        {
            return StatusCode(StatusCodes.Status503ServiceUnavailable, new
            {
                message = "Failed to send Google Authenticator reset code."
            });
        }
    }

    [HttpPost("totp/reset")]
    [Authorize(AuthenticationSchemes = JwtBearerDefaults.AuthenticationScheme)]
    [EnableRateLimiting("email-verify")]
    public async Task<IActionResult> ResetTotp([FromBody] TotpResetDto dto, CancellationToken cancellationToken = default)
    {
        var user = await GetCurrentUserAsync();
        if (user == null)
        {
            return Unauthorized();
        }

        if (user.IsBanned)
        {
            return CreateAccountBannedResponse(user);
        }

        var verificationToken = (dto.verificationToken ?? string.Empty).Trim();
        var code = new string((dto.code ?? string.Empty).Where(char.IsDigit).ToArray());
        if (string.IsNullOrWhiteSpace(verificationToken) || code.Length != 6)
        {
            return BadRequest(new { message = "Enter a valid 6-digit email code." });
        }

        var passwordResult = _passwordHasher.VerifyHashedPassword(user, user.password_hash, dto.password ?? string.Empty);
        if (passwordResult == PasswordVerificationResult.Failed)
        {
            return BadRequest(new { message = "Invalid password." });
        }

        if (string.IsNullOrWhiteSpace(user.email))
        {
            return BadRequest(new { message = "A verified email is required to reset Google Authenticator." });
        }

        var now = DateTimeOffset.UtcNow;
        var record = await _context.EmailVerificationCodes
            .Where(item =>
                item.UserId == user.id &&
                item.Email == user.email &&
                item.Purpose == TotpResetPurpose &&
                item.VerificationTokenHash == AuthInputPolicies.HashSecret(verificationToken) &&
                !item.ConsumedAt.HasValue)
            .OrderByDescending(item => item.CreatedAt)
            .FirstOrDefaultAsync(cancellationToken);

        if (record == null)
        {
            return BadRequest(new { message = "Google Authenticator reset session was not found. Request a new code." });
        }

        if (record.ExpiresAt <= now)
        {
            record.ConsumedAt = now;
            await _context.SaveChangesAsync(cancellationToken);
            return BadRequest(new { message = "Email code has expired. Request a new code." });
        }

        if (record.AttemptCount >= MaxEmailVerificationAttempts)
        {
            return BadRequest(new { message = "Attempt limit exceeded. Request a new code." });
        }

        if (!string.Equals(record.CodeHash, AuthInputPolicies.HashSecret(code), StringComparison.Ordinal))
        {
            record.AttemptCount += 1;
            if (record.AttemptCount >= MaxEmailVerificationAttempts)
            {
                record.ConsumedAt = now;
            }

            await _context.SaveChangesAsync(cancellationToken);
            return BadRequest(new { message = "Invalid email code." });
        }

        record.VerifiedAt = now;
        record.ConsumedAt = now;
        user.totp_secret = null;
        user.is_totp_enabled = false;
        user.totp_enabled_at = null;
        await _context.SaveChangesAsync(cancellationToken);

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

    [HttpPost("qr-login/account-session")]
    [Authorize(AuthenticationSchemes = JwtBearerDefaults.AuthenticationScheme)]
    [EnableRateLimiting("auth")]
    public async Task<IActionResult> CreateQrAccountLoginSession()
    {
        var user = await GetCurrentUserAsync();
        if (user == null)
        {
            return Unauthorized();
        }

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
            ApprovedAt = now,
            ApprovedUserId = user.id,
            RequestedIp = GetClientIp(),
            RequestedUserAgent = GetUserAgent(),
            ApprovedIp = GetClientIp(),
            ApprovedUserAgent = GetUserAgent()
        });

        await _context.SaveChangesAsync();

        return Ok(new
        {
            sessionId,
            scannerToken,
            expiresAt = now.Add(QrLoginLifetime).ToString("O")
        });
    }

    [HttpPost("qr-login/consume")]
    [EnableRateLimiting("auth")]
    public async Task<IActionResult> ConsumeQrAccountLoginSession([FromBody] QrLoginApproveDto dto)
    {
        var normalizedSessionId = NormalizeQrLoginToken(dto.sessionId);
        var normalizedScannerToken = NormalizeQrLoginToken(dto.scannerToken);
        if (string.IsNullOrWhiteSpace(normalizedSessionId) || string.IsNullOrWhiteSpace(normalizedScannerToken))
        {
            return BadRequest(new { status = "invalid", message = "QR-сессия не найдена." });
        }

        var scannerTokenHash = AuthInputPolicies.HashSecret(normalizedScannerToken);
        var now = DateTimeOffset.UtcNow;
        var record = await _context.QrLoginSessions
            .Include(item => item.ApprovedUser)
            .FirstOrDefaultAsync(item =>
                item.SessionId == normalizedSessionId &&
                item.ScannerTokenHash == scannerTokenHash &&
                item.ExpiresAt > now &&
                item.ApprovedAt.HasValue &&
                item.ApprovedUserId.HasValue &&
                !item.ConsumedAt.HasValue &&
                !item.CanceledAt.HasValue);

        if (record?.ApprovedUser == null)
        {
            return BadRequest(new { status = "invalid", message = "QR-код устарел или уже использован." });
        }

        if (record.ApprovedUser.IsBanned)
        {
            return CreateAccountBannedResponse(record.ApprovedUser);
        }

        record.ConsumedAt = now;
        var authSession = await IssueAuthSessionAsync(record.ApprovedUser, dto.deviceToken, cancellationToken: HttpContext.RequestAborted);
        await _context.SaveChangesAsync();

        return Ok(BuildQrAuthResponse(record.ApprovedUser, authSession));
    }

    [HttpGet("qr-login/session/{sessionId}")]
    [EnableRateLimiting("qr-login-poll")]
    public async Task<IActionResult> GetQrLoginSessionStatus([FromRoute] string sessionId, [FromQuery] string? browserToken, [FromQuery] string? deviceToken)
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
            if (record.ApprovedUser.IsBanned)
            {
                return CreateAccountBannedResponse(record.ApprovedUser);
            }

            record.ConsumedAt = DateTimeOffset.UtcNow;
            var clientBan = await _accountBanService.EvaluateClientBanAsync(
                record.ApprovedUser,
                record.ApprovedUser.email,
                record.ApprovedUser.phone_number,
                deviceToken,
                GetClientIp(),
                DateTimeOffset.UtcNow,
                HttpContext.RequestAborted);
            if (!clientBan.IsAllowed || record.ApprovedUser.IsBanned)
            {
                return CreateAccountBannedResponse(record.ApprovedUser);
            }

            var authSession = await IssueAuthSessionAsync(record.ApprovedUser, deviceToken, cancellationToken: HttpContext.RequestAborted);
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
    public async Task<IActionResult> RequestLoginCode([FromBody] LoginCodeRequestDto dto, CancellationToken cancellationToken = default)
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

        var user = await _context.Users.FirstOrDefaultAsync(item => item.email == normalizedEmail, cancellationToken);
        if (user == null)
        {
            return BadRequest(CreateInvalidCredentialsError());
        }

        if (user.IsBanned)
        {
            return CreateAccountBannedResponse(user);
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
            var payload = await CreateEmailVerificationAsync(user, purpose: LoginCodePurpose, cancellationToken: cancellationToken);
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
                message = "Не удалось отправить код входа на почту. Попробуйте немного позже."
            });
        }
    }

    [HttpPost("request-password-reset-code")]
    [EnableRateLimiting("email-send")]
    public async Task<IActionResult> RequestPasswordResetCode([FromBody] PasswordResetCodeRequestDto dto, CancellationToken cancellationToken = default)
    {
        if (!ModelState.IsValid)
        {
            return ValidationProblem(ModelState);
        }

        if (!AuthInputPolicies.TryNormalizeEmail(dto.email, out var normalizedEmail, out var emailError))
        {
            return BadRequest(new { message = emailError, fieldErrors = new { email = emailError } });
        }

        var user = await _context.Users.FirstOrDefaultAsync(item => item.email == normalizedEmail, cancellationToken);
        if (user == null)
        {
            return BadRequest(new { message = "Пользователь с такой почтой не найден.", fieldErrors = new { email = "Пользователь с такой почтой не найден." } });
        }

        if (user.IsBanned)
        {
            return CreateAccountBannedResponse(user);
        }

        try
        {
            var payload = await CreateEmailVerificationAsync(user, purpose: PasswordResetPurpose, cancellationToken: cancellationToken);
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
                message = "Не удалось отправить код восстановления на почту. Попробуйте немного позже."
            });
        }
    }

    [HttpPost("reset-password")]
    [EnableRateLimiting("email-verify")]
    public async Task<IActionResult> ResetPassword([FromBody] ResetPasswordDto dto, CancellationToken cancellationToken = default)
    {
        if (!ModelState.IsValid)
        {
            return ValidationProblem(ModelState);
        }

        if (!AuthInputPolicies.TryNormalizeEmail(dto.email, out var normalizedEmail, out var emailError))
        {
            return BadRequest(new { message = emailError, fieldErrors = new { email = emailError } });
        }

        var verificationToken = (dto.verificationToken ?? string.Empty).Trim();
        var code = new string((dto.code ?? string.Empty).Where(char.IsDigit).ToArray());
        if (string.IsNullOrWhiteSpace(verificationToken) || code.Length != 6)
        {
            return BadRequest(new { message = "Введите корректный шестизначный код." });
        }

        if (!AuthInputPolicies.TryValidateNewPassword(dto.password, out var passwordError))
        {
            return BadRequest(new { message = passwordError, fieldErrors = new { password = passwordError } });
        }

        var user = await _context.Users.FirstOrDefaultAsync(item => item.email == normalizedEmail, cancellationToken);
        if (user == null)
        {
            return BadRequest(new { message = "Сессия восстановления пароля не найдена. Запросите код заново." });
        }

        if (user.IsBanned)
        {
            return CreateAccountBannedResponse(user);
        }

        var now = DateTimeOffset.UtcNow;
        var record = await _context.EmailVerificationCodes
            .Where(item =>
                item.UserId == user.id &&
                item.Email == normalizedEmail &&
                item.Purpose == PasswordResetPurpose &&
                item.VerificationTokenHash == AuthInputPolicies.HashSecret(verificationToken) &&
                !item.ConsumedAt.HasValue)
            .OrderByDescending(item => item.CreatedAt)
            .FirstOrDefaultAsync();

        if (record == null)
        {
            return BadRequest(new { message = "Сессия восстановления пароля не найдена. Запросите код заново." });
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

        if (!string.Equals(record.CodeHash, AuthInputPolicies.HashSecret(code), StringComparison.Ordinal))
        {
            record.AttemptCount += 1;
            if (record.AttemptCount >= MaxEmailVerificationAttempts)
            {
                record.ConsumedAt = now;
            }

            await _context.SaveChangesAsync();
            return BadRequest(new { message = "Неверный код восстановления." });
        }

        record.VerifiedAt = now;
        record.ConsumedAt = now;
        user.is_email_verified = true;
        user.password_hash = _passwordHasher.HashPassword(user, dto.password);
        await _context.SaveChangesAsync();

        await RevokeActiveRefreshTokensAsync(user.id);
        return Ok(new { message = "Пароль изменён. Войдите снова." });
    }

    [HttpPost("register")]
    [EnableRateLimiting("auth")]
    public async Task<IActionResult> Register([FromBody] RegisterDto dto, CancellationToken cancellationToken = default)
    {
        if (!ModelState.IsValid)
        {
            return ValidationProblem(ModelState);
        }

        if (!dto.termsAccepted)
        {
            return BadRequest(new { message = "Нужно согласиться с пользовательским соглашением." });
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

        if (!AuthInputPolicies.TryValidateNewPassword(dto.password, out var passwordError))
        {
            return BadRequest(new { message = passwordError });
        }

        var registrationBan = await _accountBanService.EvaluateClientBanAsync(
            null,
            normalizedEmail,
            null,
            dto.deviceToken,
            GetClientIp(),
            DateTimeOffset.UtcNow,
            cancellationToken);
        if (!registrationBan.IsAllowed)
        {
            return CreateIdentityBannedResponse(registrationBan);
        }

        if (await _context.Users.AnyAsync(u => u.email == normalizedEmail, cancellationToken))
        {
            return CreateEmailAlreadyRegisteredResponse();
        }

        var nicknameLookup = nickname.ToLowerInvariant();
        if (await _context.Users.AnyAsync(u => u.nickname.ToLower() == nicknameLookup, cancellationToken))
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
            is_phone_verified = false,
            terms_accepted_at = DateTimeOffset.UtcNow,
            terms_version = CurrentTermsVersion,
            privacy_version = CurrentPrivacyVersion
        };

        user.password_hash = _passwordHasher.HashPassword(user, dto.password);

        _context.Users.Add(user);

        try
        {
            await _context.SaveChangesAsync(cancellationToken);
        }
        catch (DbUpdateException ex) when (IsUniqueConstraintViolation(
            ex,
            "ix_users_email_not_null",
            "IX_users_email",
            "users_email_key"))
        {
            _context.ChangeTracker.Clear();
            return CreateEmailAlreadyRegisteredResponse();
        }

        if (!string.IsNullOrWhiteSpace(normalizedEmail) && RequireEmailRegistrationVerification)
        {
            try
            {
                var emailVerification = await CreateEmailVerificationAsync(user, cancellationToken: cancellationToken);
                return Ok(new
                {
                    pendingEmailVerification = true,
                    user = BuildUserPayload(user),
                    verification = emailVerification.ToResponse()
                });
            }
            catch (EmailDeliveryException)
            {
                var createdUser = await _context.Users.FirstOrDefaultAsync(item => item.id == user.id, cancellationToken);
                if (createdUser != null)
                {
                    var pendingCodes = await _context.EmailVerificationCodes
                        .Where(item => item.UserId == createdUser.id)
                        .ToListAsync(cancellationToken);

                    _context.EmailVerificationCodes.RemoveRange(pendingCodes);
                    _context.Users.Remove(createdUser);
                    await _context.SaveChangesAsync(cancellationToken);
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

        var authSession = await IssueAuthSessionAsync(user, dto.deviceToken, cancellationToken);
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

        var clientBan = await _accountBanService.EvaluateClientBanAsync(
            user,
            user.email,
            user.phone_number,
            dto.deviceToken,
            GetClientIp(),
            DateTimeOffset.UtcNow,
            HttpContext.RequestAborted);
        if (!clientBan.IsAllowed || user.IsBanned)
        {
            return CreateAccountBannedResponse(user);
        }

        if (user.IsBanned)
        {
            return CreateAccountBannedResponse(user);
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

        if (user.is_totp_enabled && !VerifyUserTotpCode(user, dto.totpCode, DateTimeOffset.UtcNow))
        {
            return BadRequest(CreateTotpRequiredError());
        }

        var authSession = await IssueAuthSessionAsync(user, dto.deviceToken, cancellationToken: HttpContext.RequestAborted);
        return Ok(BuildAuthResponse(user, authSession));
    }

    [HttpPost("refresh")]
    [EnableRateLimiting("auth")]
    public async Task<IActionResult> Refresh([FromBody] RefreshTokenDto dto, CancellationToken cancellationToken = default)
    {
        if (!ModelState.IsValid)
        {
            return ValidationProblem(ModelState);
        }

        var tokenHash = HashToken(dto.refreshToken);
        var storedToken = await _context.RefreshTokens
            .Include(item => item.User)
            .FirstOrDefaultAsync(item => item.TokenHash == tokenHash, cancellationToken);

        if (storedToken?.User == null)
        {
            return Unauthorized(new { message = "Refresh token is invalid." });
        }

        var now = DateTimeOffset.UtcNow;
        if (storedToken.User.IsBanned)
        {
            await _accountBanService.RevokeActiveSessionsAsync(storedToken.User.id, now, cancellationToken);
            return CreateAccountBannedResponse(storedToken.User);
        }

        var refreshBan = await _accountBanService.EvaluateClientBanAsync(
            storedToken.User,
            storedToken.User.email,
            storedToken.User.phone_number,
            dto.deviceToken,
            GetClientIp(),
            now,
            cancellationToken);
        if (!refreshBan.IsAllowed || storedToken.User.IsBanned)
        {
            await _accountBanService.RevokeActiveSessionsAsync(storedToken.User.id, now, cancellationToken);
            return CreateAccountBannedResponse(storedToken.User);
        }

        if (storedToken.RevokedAt.HasValue)
        {
            await _userSessionService.RevokeActiveSessionsAfterRefreshTokenReuseAsync(tokenHash, now, cancellationToken);
            return Unauthorized(new { message = "Refresh token has expired." });
        }

        if (storedToken.ExpiresAt <= now)
        {
            return Unauthorized(new { message = "Refresh token has expired." });
        }

        await using var transaction = await _context.Database.BeginTransactionAsync(cancellationToken);
        var authSession = await IssueAuthSessionAsync(storedToken.User, dto.deviceToken, cancellationToken);
        var revoked = await RevokeRefreshTokenForRotationAsync(
            storedToken.Id,
            authSession.RefreshToken,
            now);
        if (!revoked)
        {
            await transaction.RollbackAsync(cancellationToken);
            return Unauthorized(new { message = "Refresh token has expired." });
        }

        await transaction.CommitAsync(cancellationToken);

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
    [HttpGet("sessions")]
    [Authorize(AuthenticationSchemes = JwtBearerDefaults.AuthenticationScheme)]
    public async Task<IActionResult> GetDevices(CancellationToken cancellationToken = default)
    {
        var user = await GetCurrentUserAsync();
        if (user == null)
        {
            return Unauthorized();
        }

        var currentRefreshTokenHash = GetCurrentRefreshTokenHash();
        var sessions = await _userSessionService.GetActiveSessionsAsync(
            user.id,
            currentRefreshTokenHash,
            cancellationToken);

        return Ok(new
        {
            sessions = sessions.Select(BuildDeviceSessionPayload)
        });
    }

    [HttpDelete("devices/{sessionId:int}")]
    [HttpDelete("sessions/{sessionId:int}")]
    [Authorize(AuthenticationSchemes = JwtBearerDefaults.AuthenticationScheme)]
    [EnableRateLimiting("auth")]
    public async Task<IActionResult> RevokeDeviceSession([FromRoute] int sessionId, CancellationToken cancellationToken = default)
    {
        var user = await GetCurrentUserAsync();
        if (user == null)
        {
            return Unauthorized();
        }

        var revoked = await _userSessionService.RevokeSessionAsync(
            user.id,
            sessionId,
            GetClientIp(),
            DateTimeOffset.UtcNow,
            cancellationToken);
        if (!revoked)
        {
            return NotFound(new { message = "Сессия не найдена." });
        }

        return Ok(new { revoked = true, sessionId });
    }

    [HttpPost("sessions/revoke-others")]
    [Authorize(AuthenticationSchemes = JwtBearerDefaults.AuthenticationScheme)]
    [EnableRateLimiting("auth")]
    public async Task<IActionResult> RevokeOtherDeviceSessions(CancellationToken cancellationToken = default)
    {
        var user = await GetCurrentUserAsync();
        if (user == null)
        {
            return Unauthorized();
        }

        var revoked = await _userSessionService.RevokeOtherSessionsAsync(
            user.id,
            GetCurrentRefreshTokenHash(),
            GetClientIp(),
            DateTimeOffset.UtcNow,
            cancellationToken);

        return Ok(new { revoked });
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

    private async Task<AuthSessionResult> IssueAuthSessionAsync(User user, string? deviceToken = null, CancellationToken cancellationToken = default)
    {
        var now = DateTimeOffset.UtcNow;
        var accessTokenExpiresAt = now.AddMinutes(GetAccessTokenLifetimeMinutes());
        var refreshTokenExpiresAt = now.AddDays(GetRefreshTokenLifetimeDays());
        var refreshToken = GenerateRefreshToken();
        var userAgent = GetUserAgent();
        var clientIp = GetClientIp();
        var deviceLabel = BuildDeviceLabel(userAgent);
        var deviceTokenHash = GetDeviceTokenHash(deviceToken);
        var securitySignal = await _userSessionService.DetectLoginSecuritySignalAsync(
            user.id,
            deviceLabel,
            deviceTokenHash,
            clientIp,
            now,
            cancellationToken);
        await _abuseAutoBan.RecordLoginSecuritySignalAsync(
            user.id,
            securitySignal,
            now,
            cancellationToken);

        _context.RefreshTokens.Add(new RefreshTokenRecord
        {
            UserId = user.id,
            TokenHash = HashToken(refreshToken),
            CreatedAt = now,
            ExpiresAt = refreshTokenExpiresAt,
            UserAgent = userAgent,
            DeviceLabel = deviceLabel,
            DeviceTokenHash = deviceTokenHash,
            LastIp = clientIp,
            LastUsedAt = now,
        });

        await _context.SaveChangesAsync();

        return new AuthSessionResult
        {
            AccessToken = GenerateJwtToken(user, accessTokenExpiresAt.UtcDateTime),
            RefreshToken = refreshToken,
            AccessTokenExpiresAt = accessTokenExpiresAt,
            RefreshTokenExpiresAt = refreshTokenExpiresAt,
            SecuritySignal = securitySignal
        };
    }

    private async Task<bool> RevokeRefreshTokenForRotationAsync(int refreshTokenId, string replacementRefreshToken, DateTimeOffset revokedAt)
    {
        if (!_context.Database.IsRelational())
        {
            var storedToken = await _context.RefreshTokens.FirstOrDefaultAsync(item =>
                item.Id == refreshTokenId &&
                item.RevokedAt == null &&
                item.ExpiresAt > revokedAt);
            if (storedToken is null)
            {
                return false;
            }

            storedToken.RevokedAt = revokedAt;
            storedToken.LastUsedAt = revokedAt;
            storedToken.LastIp = GetClientIp();
            storedToken.ReplacedByTokenHash = HashToken(replacementRefreshToken);
            await _context.SaveChangesAsync();
            return true;
        }

        var updatedRows = await _context.RefreshTokens
            .Where(item =>
                item.Id == refreshTokenId &&
                item.RevokedAt == null &&
                item.ExpiresAt > revokedAt)
            .ExecuteUpdateAsync(setters => setters
                .SetProperty(item => item.RevokedAt, revokedAt)
                .SetProperty(item => item.LastUsedAt, revokedAt)
                .SetProperty(item => item.LastIp, GetClientIp())
                .SetProperty(item => item.ReplacedByTokenHash, HashToken(replacementRefreshToken)));

        return updatedRows == 1;
    }

    private object BuildAuthResponse(User user, AuthSessionResult authSession)
    {
        AppendMediaAccessCookie(authSession);
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
            is_admin = _accountBanService.IsAdmin(user),
            is_banned = user.IsBanned,
            banned_at = user.BannedAt?.ToString("O"),
            ban_reason = user.BanReason ?? string.Empty,
            avatar_url = user.avatar_url ?? string.Empty,
            avatar_frame = MediaFrameSerializer.Parse(user.avatar_frame_json, allowNull: true),
            profile_background_url = user.profile_background_url ?? string.Empty,
            profile_background_frame = MediaFrameSerializer.Parse(user.profile_background_frame_json, allowNull: true),
            profile_customization = ParseProfileCustomization(user.profile_customization_json),
            token = authSession.AccessToken,
            refreshToken = authSession.RefreshToken,
            accessTokenExpiresAt = authSession.AccessTokenExpiresAt.ToString("O"),
            refreshTokenExpiresAt = authSession.RefreshTokenExpiresAt.ToString("O"),
            securitySignal = authSession.SecuritySignal
        };
    }

    private object BuildQrAuthResponse(User user, AuthSessionResult authSession)
    {
        AppendMediaAccessCookie(authSession);
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
            is_admin = _accountBanService.IsAdmin(user),
            is_banned = user.IsBanned,
            banned_at = user.BannedAt?.ToString("O"),
            ban_reason = user.BanReason ?? string.Empty,
            avatar_url = user.avatar_url ?? string.Empty,
            avatar_frame = MediaFrameSerializer.Parse(user.avatar_frame_json, allowNull: true),
            profile_background_url = user.profile_background_url ?? string.Empty,
            profile_background_frame = MediaFrameSerializer.Parse(user.profile_background_frame_json, allowNull: true),
            profile_customization = ParseProfileCustomization(user.profile_customization_json),
            token = authSession.AccessToken,
            accessToken = authSession.AccessToken,
            refreshToken = authSession.RefreshToken,
            accessTokenExpiresAt = authSession.AccessTokenExpiresAt.ToString("O"),
            refreshTokenExpiresAt = authSession.RefreshTokenExpiresAt.ToString("O"),
            securitySignal = authSession.SecuritySignal
        };
    }

    private void AppendMediaAccessCookie(AuthSessionResult authSession)
    {
        Response.Cookies.Append(MediaAccessTokenCookieName, authSession.AccessToken, new CookieOptions
        {
            HttpOnly = true,
            Secure = Request.IsHttps,
            SameSite = Request.IsHttps ? SameSiteMode.None : SameSiteMode.Lax,
            Path = "/",
            MaxAge = TimeSpan.FromMinutes(20)
        });
    }

    private object BuildDeviceSessionPayload(UserSessionSummary session)
    {
        return new
        {
            id = session.Id,
            deviceLabel = string.IsNullOrWhiteSpace(session.DeviceLabel) ? "Устройство" : session.DeviceLabel,
            userAgent = session.UserAgent,
            lastIp = session.LastIp,
            createdAt = session.CreatedAt.ToString("O"),
            lastUsedAt = session.LastUsedAt.ToString("O"),
            expiresAt = session.ExpiresAt.ToString("O"),
            isCurrent = session.IsCurrent,
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
            is_admin = _accountBanService.IsAdmin(user),
            is_banned = user.IsBanned,
            banned_at = user.BannedAt?.ToString("O"),
            ban_reason = user.BanReason ?? string.Empty,
            avatar_url = user.avatar_url ?? string.Empty,
            avatar_frame = MediaFrameSerializer.Parse(user.avatar_frame_json, allowNull: true),
            profile_background_url = user.profile_background_url ?? string.Empty,
            profile_background_frame = MediaFrameSerializer.Parse(user.profile_background_frame_json, allowNull: true),
            profile_customization = ParseProfileCustomization(user.profile_customization_json)
        };
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

    private async Task<EmailVerificationResult> CreateEmailVerificationAsync(
        User user,
        bool ignoreResendCooldown = false,
        string purpose = EmailVerificationPurpose,
        CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(user.email))
        {
            throw new InvalidOperationException("Email verification requested for user without email.");
        }

        var userEmail = user.email;
        var now = DateTimeOffset.UtcNow;
        var deliveryMode = GetEmailDeliveryMode();
        var latestActive = await _context.EmailVerificationCodes
            .Where(item => item.UserId == user.id && item.Purpose == purpose && !item.ConsumedAt.HasValue)
            .OrderByDescending(item => item.CreatedAt)
            .FirstOrDefaultAsync(cancellationToken);

        if (!ignoreResendCooldown &&
            latestActive != null &&
            latestActive.LastSentAt + EmailVerificationResendCooldown > now)
        {
            return EmailVerificationResult.RateLimited(
                userEmail,
                latestActive.ExpiresAt,
                latestActive.LastSentAt.Add(EmailVerificationResendCooldown),
                deliveryMode);
        }

        var verificationCode = GenerateEmailVerificationCode();
        var verificationToken = GenerateVerificationToken();
        var expiresAt = now.Add(EmailVerificationLifetime);
        var resendAvailableAt = now.Add(EmailVerificationResendCooldown);

        await using var transaction = await _context.Database.BeginTransactionAsync(cancellationToken);
        var activeCodes = await _context.EmailVerificationCodes
            .Where(item => item.UserId == user.id && item.Purpose == purpose && !item.ConsumedAt.HasValue)
            .ToListAsync(cancellationToken);

        foreach (var activeCode in activeCodes)
        {
            activeCode.ConsumedAt = now;
        }

        _context.EmailVerificationCodes.Add(new EmailVerificationCodeRecord
        {
            UserId = user.id,
            Email = userEmail,
            Purpose = purpose,
            VerificationTokenHash = AuthInputPolicies.HashSecret(verificationToken),
            CodeHash = AuthInputPolicies.HashSecret(verificationCode),
            CreatedAt = now,
            ExpiresAt = expiresAt,
            LastSentAt = now,
            AttemptCount = 0
        });

        await _context.SaveChangesAsync(cancellationToken);
        await _emailVerificationSender.SendVerificationCodeAsync(userEmail, verificationCode, expiresAt, cancellationToken, purpose);
        await transaction.CommitAsync(cancellationToken);

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
        var configuredMode = (_config["Email:Mode"] ?? string.Empty).Trim();
        if (!string.IsNullOrWhiteSpace(configuredMode))
        {
            var normalizedMode = configuredMode.ToLowerInvariant();
            if (string.Equals(normalizedMode, "mock", StringComparison.OrdinalIgnoreCase) && !_environment.IsDevelopment())
            {
                throw new EmailDeliveryException("Email:Mode=mock is only allowed in Development.");
            }

            return normalizedMode;
        }

        if (_environment.IsDevelopment())
        {
            return "mock";
        }

        throw new EmailDeliveryException("Email:Mode is not configured.");
    }

    private IActionResult CreateEmailAlreadyRegisteredResponse()
    {
        return Conflict(new { message = "Пользователь с таким email уже существует." });
    }

    private static bool IsUniqueConstraintViolation(DbUpdateException exception, params string[] constraintNames)
    {
        if (exception.InnerException is not PostgresException postgresException ||
            !string.Equals(postgresException.SqlState, PostgresErrorCodes.UniqueViolation, StringComparison.Ordinal))
        {
            return false;
        }

        if (constraintNames.Length == 0)
        {
            return true;
        }

        return constraintNames.Any(constraintName =>
            string.Equals(postgresException.ConstraintName, constraintName, StringComparison.OrdinalIgnoreCase));
    }

    private bool IsLocalRequest()
    {
        var remoteIp = HttpContext.Connection.RemoteIpAddress;
        if (remoteIp != null && System.Net.IPAddress.IsLoopback(remoteIp))
        {
            return true;
        }

        var host = HttpContext.Request.Host.Host;
        return string.Equals(host, "localhost", StringComparison.OrdinalIgnoreCase)
               || string.Equals(host, "127.0.0.1", StringComparison.OrdinalIgnoreCase);
    }

    private string ProtectTotpSecret(string secret)
    {
        return _crypto.Encrypt(secret);
    }

    private bool VerifyUserTotpCode(User user, string? code, DateTimeOffset now)
    {
        var secret = UnprotectTotpSecret(user.totp_secret);
        return TotpService.VerifyCode(secret, code, now);
    }

    private string? UnprotectTotpSecret(string? protectedSecret)
    {
        if (string.IsNullOrWhiteSpace(protectedSecret))
        {
            return null;
        }

        try
        {
            return _crypto.Decrypt(protectedSecret);
        }
        catch
        {
            // Legacy rows stored the base32 TOTP secret as plain text.
            return protectedSecret;
        }
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
        return (HttpContext?.Connection.RemoteIpAddress?.ToString() ?? "unknown").Trim();
    }

    private string GetUserAgent()
    {
        var userAgent = (HttpContext?.Request.Headers.UserAgent.ToString() ?? string.Empty).Trim();
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

    private ObjectResult CreateAccountBannedResponse(User user)
    {
        return StatusCode(StatusCodes.Status403Forbidden, new
        {
            code = "account_banned",
            message = "Аккаунт заблокирован. Доступ к приложению закрыт.",
            user = BuildBannedAccountPayload(user)
        });
    }

    private object BuildBannedAccountPayload(User user)
    {
        return new
        {
            id = user.id,
            first_name = user.first_name ?? string.Empty,
            last_name = user.last_name ?? string.Empty,
            nickname = user.nickname ?? string.Empty,
            email = user.email ?? string.Empty,
            is_banned = true,
            banned_at = user.BannedAt?.ToString("O"),
            ban_reason = user.BanReason ?? string.Empty,
            avatar_url = user.avatar_url ?? string.Empty,
            avatar_frame = MediaFrameSerializer.Parse(user.avatar_frame_json, allowNull: true),
            profile_background_url = user.profile_background_url ?? string.Empty,
            profile_background_frame = MediaFrameSerializer.Parse(user.profile_background_frame_json, allowNull: true)
        };
    }

    private ObjectResult CreateIdentityBannedResponse(ClientBanDecision decision)
    {
        return StatusCode(StatusCodes.Status403Forbidden, new
        {
            code = "account_banned",
            message = "Аккаунт или устройство заблокированы. Доступ к приложению закрыт.",
            identityType = decision.IdentityType
        });
    }

    private static string GetDeviceTokenHash(string? deviceToken)
    {
        var normalizedDeviceToken = AccountBanService.NormalizeDeviceToken(deviceToken);
        return string.IsNullOrWhiteSpace(normalizedDeviceToken)
            ? string.Empty
            : AccountBanService.HashIdentityValue(AccountBanService.IdentityTypeDeviceToken, normalizedDeviceToken);
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

    public bool termsAccepted { get; set; }

    public string? deviceToken { get; set; }
}

public class LoginDto
{
    public string? identifier { get; set; }

    public string? email { get; set; }

    [Required]
    public string password { get; set; } = string.Empty;

    public string? totpCode { get; set; }

    public string? deviceToken { get; set; }
}

public class LoginCodeRequestDto
{
    public string? identifier { get; set; }
}

public class PasswordResetCodeRequestDto
{
    [Required]
    public string? email { get; set; }
}

public class ResetPasswordDto
{
    [Required]
    public string? email { get; set; }

    [Required]
    public string verificationToken { get; set; } = string.Empty;

    [Required]
    public string code { get; set; } = string.Empty;

    [Required]
    [MinLength(6)]
    public string password { get; set; } = string.Empty;
}

public class QrLoginApproveDto
{
    public string? sessionId { get; set; }

    public string? scannerToken { get; set; }

    public string? deviceToken { get; set; }
}

public class TotpCodeDto
{
    public string? code { get; set; }
}

public class TotpResetCodeRequestDto
{
    [Required]
    public string? password { get; set; }
}

public class TotpResetDto
{
    [Required]
    public string? password { get; set; }

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

    public string? totpCode { get; set; }

    public string? deviceToken { get; set; }
}

public class RefreshTokenDto
{
    [Required]
    public string refreshToken { get; set; } = string.Empty;

    public string? deviceToken { get; set; }
}

public class AuthSessionResult
{
    public string AccessToken { get; set; } = string.Empty;
    public string RefreshToken { get; set; } = string.Empty;
    public DateTimeOffset AccessTokenExpiresAt { get; set; }
    public DateTimeOffset RefreshTokenExpiresAt { get; set; }
    public LoginSecuritySignal? SecuritySignal { get; set; }
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
        var response = new Dictionary<string, object?>
        {
            ["email"] = Email,
            ["verificationToken"] = VerificationToken,
            ["expiresAt"] = ExpiresAt.ToString("O"),
            ["resendAvailableAt"] = ResendAvailableAt.ToString("O"),
            ["deliveryMode"] = DeliveryMode
        };

        if (!string.IsNullOrWhiteSpace(DebugCode))
        {
            response["debugCode"] = DebugCode;
        }

        return response;
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

    public static EmailVerificationResult RateLimited(string email, DateTimeOffset expiresAt, DateTimeOffset resendAvailableAt, string deliveryMode)
    {
        return new EmailVerificationResult
        {
            Email = email,
            ExpiresAt = expiresAt,
            ResendAvailableAt = resendAvailableAt,
            DeliveryMode = deliveryMode,
            IsRateLimited = true
        };
    }
}


