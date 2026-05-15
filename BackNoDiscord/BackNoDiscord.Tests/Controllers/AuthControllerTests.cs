using BackNoDiscord.Security;
using BackNoDiscord.Services;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Diagnostics;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.FileProviders;
using Microsoft.Extensions.Logging.Abstractions;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;

namespace BackNoDiscord.Tests.Controllers;

public sealed class AuthControllerTests : IDisposable
{
    private readonly AppDbContext _context;
    private readonly TestEmailVerificationSender _emailSender = new();

    public AuthControllerTests()
    {
        _context = CreateContext();
    }

    [Fact]
    public async Task Register_WithoutTermsAccepted_ReturnsBadRequest()
    {
        var controller = BuildController();

        var result = await controller.Register(new RegisterDto
        {
            first_name = "Lanaya",
            last_name = "User",
            nickname = "TermsMissing",
            email = "terms-missing@gmail.com",
            password = "password1",
            termsAccepted = false
        });

        Assert.IsType<BadRequestObjectResult>(result);
        Assert.Empty(_context.Users);
    }

    [Fact]
    public async Task Register_WithTermsAccepted_StoresConsentMetadata()
    {
        var controller = BuildController(emailMode: "mock");

        var result = await controller.Register(new RegisterDto
        {
            first_name = "Lanaya",
            last_name = "User",
            nickname = "TermsAccepted",
            email = "terms-accepted@gmail.com",
            password = "password1",
            termsAccepted = true
        });

        Assert.IsType<OkObjectResult>(result);
        var user = Assert.Single(_context.Users);
        Assert.NotNull(user.terms_accepted_at);
        Assert.Equal("2026-05-13-rf-1", user.terms_version);
        Assert.Equal("2026-05-13-rf-1", user.privacy_version);
    }

    [Fact]
    public async Task RequestPasswordResetCode_CreatesPasswordResetVerificationWithoutExposingDebugCodeOutsideMockMode()
    {
        var user = BuildUser(10, "reset-user@gmail.com");
        _context.Users.Add(user);
        await _context.SaveChangesAsync();
        var controller = BuildController(emailMode: "smtp", environmentName: "Production");

        var result = await controller.RequestPasswordResetCode(new PasswordResetCodeRequestDto { email = "reset-user@gmail.com" });

        var ok = Assert.IsType<OkObjectResult>(result);
        var json = JsonSerializer.Serialize(ok.Value);
        Assert.Contains("\"deliveryMode\":\"smtp\"", json);
        Assert.DoesNotContain("debugCode", json, StringComparison.OrdinalIgnoreCase);
        var record = Assert.Single(_context.EmailVerificationCodes);
        Assert.Equal("password_reset", record.Purpose);
        Assert.Equal(user.id, record.UserId);
        Assert.Equal(1, _emailSender.SendCount);
    }

    [Fact]
    public async Task ResetPassword_WithPasswordResetCode_UpdatesPasswordAndRevokesActiveSessions()
    {
        var passwordHasher = new PasswordHasher<User>();
        var user = BuildUser(11, "password-reset@gmail.com");
        user.password_hash = passwordHasher.HashPassword(user, "old-password");
        _context.Users.Add(user);
        _context.RefreshTokens.Add(new RefreshTokenRecord
        {
            UserId = user.id,
            TokenHash = "active-refresh-token",
            CreatedAt = DateTimeOffset.UtcNow.AddMinutes(-5),
            ExpiresAt = DateTimeOffset.UtcNow.AddDays(1),
            UserAgent = "test",
            DeviceLabel = "test",
            LastIp = "127.0.0.1",
            LastUsedAt = DateTimeOffset.UtcNow.AddMinutes(-5)
        });
        await _context.SaveChangesAsync();
        var controller = BuildController();
        var codeResult = await controller.RequestPasswordResetCode(new PasswordResetCodeRequestDto { email = "password-reset@gmail.com" });
        var (verificationToken, debugCode) = ReadVerificationPayload(Assert.IsType<OkObjectResult>(codeResult));

        var result = await controller.ResetPassword(new ResetPasswordDto
        {
            email = "password-reset@gmail.com",
            verificationToken = verificationToken,
            code = debugCode,
            password = "new-password"
        });

        Assert.IsType<OkObjectResult>(result);
        var updatedUser = await _context.Users.FirstAsync(item => item.id == user.id);
        Assert.Equal(PasswordVerificationResult.Success, passwordHasher.VerifyHashedPassword(updatedUser, updatedUser.password_hash, "new-password"));
        Assert.NotEqual(PasswordVerificationResult.Success, passwordHasher.VerifyHashedPassword(updatedUser, updatedUser.password_hash, "old-password"));
        Assert.All(_context.RefreshTokens.Where(item => item.UserId == user.id), item => Assert.NotNull(item.RevokedAt));
        Assert.All(_context.EmailVerificationCodes.Where(item => item.UserId == user.id), item => Assert.NotNull(item.ConsumedAt));
    }

    [Fact]
    public async Task ResetPassword_WithLoginCode_DoesNotResetPassword()
    {
        var passwordHasher = new PasswordHasher<User>();
        var user = BuildUser(12, "login-code-reset@gmail.com");
        user.password_hash = passwordHasher.HashPassword(user, "old-password");
        _context.Users.Add(user);
        await _context.SaveChangesAsync();
        var controller = BuildController();
        var loginCodeResult = await controller.RequestLoginCode(new LoginCodeRequestDto { identifier = "login-code-reset@gmail.com" });
        var (verificationToken, debugCode) = ReadVerificationPayload(Assert.IsType<OkObjectResult>(loginCodeResult));

        var result = await controller.ResetPassword(new ResetPasswordDto
        {
            email = "login-code-reset@gmail.com",
            verificationToken = verificationToken,
            code = debugCode,
            password = "new-password"
        });

        Assert.IsType<BadRequestObjectResult>(result);
        var updatedUser = await _context.Users.FirstAsync(item => item.id == user.id);
        Assert.Equal(PasswordVerificationResult.Success, passwordHasher.VerifyHashedPassword(updatedUser, updatedUser.password_hash, "old-password"));
    }

    [Fact]
    public async Task RequestLoginCode_WhenCodeWasRecentlySent_ReturnsTooManyRequestsWithoutSendingAgain()
    {
        _context.Users.Add(new User
        {
            id = 1,
            first_name = "Lanaya",
            last_name = "User",
            nickname = "LanayaUser",
            email = "user@gmail.com",
            is_email_verified = true,
            password_hash = "hash"
        });
        await _context.SaveChangesAsync();
        var controller = BuildController();

        var firstResult = await controller.RequestLoginCode(new LoginCodeRequestDto { identifier = "user@gmail.com" });
        var secondResult = await controller.RequestLoginCode(new LoginCodeRequestDto { identifier = "user@gmail.com" });

        Assert.IsType<OkObjectResult>(firstResult);
        var tooManyRequests = Assert.IsType<ObjectResult>(secondResult);
        Assert.Equal(429, tooManyRequests.StatusCode);
        Assert.Equal(1, _emailSender.SendCount);
    }

    [Fact]
    public async Task RequestLoginCode_WhenSmtpModeIsConfigured_DoesNotExposeDebugCode()
    {
        _context.Users.Add(new User
        {
            id = 2,
            first_name = "Lanaya",
            last_name = "User",
            nickname = "LanayaSmtp",
            email = "smtp-user@gmail.com",
            is_email_verified = true,
            password_hash = "hash"
        });
        await _context.SaveChangesAsync();
        var controller = BuildController(emailMode: "smtp", environmentName: "Production");

        var result = await controller.RequestLoginCode(new LoginCodeRequestDto { identifier = "smtp-user@gmail.com" });

        var ok = Assert.IsType<OkObjectResult>(result);
        var json = JsonSerializer.Serialize(ok.Value);
        Assert.Contains("\"deliveryMode\":\"smtp\"", json);
        Assert.DoesNotContain("debugCode", json, StringComparison.OrdinalIgnoreCase);
        Assert.Equal(1, _emailSender.SendCount);
    }

    [Fact]
    public async Task RequestLoginCode_PassesRequestCancellationTokenToEmailSender()
    {
        _context.Users.Add(new User
        {
            id = 5,
            first_name = "Lanaya",
            last_name = "User",
            nickname = "LanayaCancellation",
            email = "cancellation-user@gmail.com",
            is_email_verified = true,
            password_hash = "hash"
        });
        await _context.SaveChangesAsync();
        var controller = BuildController();
        using var cancellationTokenSource = new CancellationTokenSource();

        var result = await controller.RequestLoginCode(
            new LoginCodeRequestDto { identifier = "cancellation-user@gmail.com" },
            cancellationTokenSource.Token);

        Assert.IsType<OkObjectResult>(result);
        Assert.Equal(cancellationTokenSource.Token, _emailSender.LastCancellationToken);
    }

    [Fact]
    public async Task RequestLoginCode_WhenEmailModeIsMissingOutsideDevelopment_FailsClosedWithoutSendingCode()
    {
        _context.Users.Add(new User
        {
            id = 3,
            first_name = "Lanaya",
            last_name = "User",
            nickname = "LanayaProduction",
            email = "production-user@gmail.com",
            is_email_verified = true,
            password_hash = "hash"
        });
        await _context.SaveChangesAsync();
        var controller = BuildController(emailMode: null, environmentName: "Production");

        var result = await controller.RequestLoginCode(new LoginCodeRequestDto { identifier = "production-user@gmail.com" });

        var unavailable = Assert.IsType<ObjectResult>(result);
        Assert.Equal(StatusCodes.Status503ServiceUnavailable, unavailable.StatusCode);
        Assert.Equal(0, _emailSender.SendCount);
        Assert.Empty(_context.EmailVerificationCodes);
    }

    [Fact]
    public async Task RequestLoginCode_WhenMockEmailModeIsConfiguredOutsideDevelopment_FailsClosedWithoutSendingCode()
    {
        _context.Users.Add(new User
        {
            id = 4,
            first_name = "Lanaya",
            last_name = "User",
            nickname = "LanayaMockProduction",
            email = "mock-production-user@gmail.com",
            is_email_verified = true,
            password_hash = "hash"
        });
        await _context.SaveChangesAsync();
        var controller = BuildController(emailMode: "mock", environmentName: "Production");

        var result = await controller.RequestLoginCode(new LoginCodeRequestDto { identifier = "mock-production-user@gmail.com" });

        var unavailable = Assert.IsType<ObjectResult>(result);
        Assert.Equal(StatusCodes.Status503ServiceUnavailable, unavailable.StatusCode);
        Assert.Equal(0, _emailSender.SendCount);
        Assert.Empty(_context.EmailVerificationCodes);
    }

    [Fact]
    public async Task Refresh_WhenRotatedRefreshTokenIsReused_RevokesActiveSessions()
    {
        var now = DateTimeOffset.UtcNow;
        var user = BuildUser(13, "refresh-reuse@gmail.com");
        _context.Users.Add(user);
        _context.RefreshTokens.AddRange(
            new RefreshTokenRecord
            {
                UserId = user.id,
                TokenHash = HashRawToken("old-refresh-token"),
                CreatedAt = now.AddHours(-2),
                ExpiresAt = now.AddDays(7),
                RevokedAt = now.AddMinutes(-5),
                ReplacedByTokenHash = HashRawToken("replacement-token"),
                UserAgent = "Old Browser",
                DeviceLabel = "Old Browser",
                LastIp = "127.0.0.1",
                LastUsedAt = now.AddMinutes(-5)
            },
            new RefreshTokenRecord
            {
                UserId = user.id,
                TokenHash = HashRawToken("active-refresh-token"),
                CreatedAt = now.AddMinutes(-4),
                ExpiresAt = now.AddDays(7),
                UserAgent = "Current Browser",
                DeviceLabel = "Current Browser",
                LastIp = "127.0.0.1",
                LastUsedAt = now.AddMinutes(-4)
            });
        await _context.SaveChangesAsync();
        var controller = BuildController();

        var result = await controller.Refresh(new RefreshTokenDto { refreshToken = "old-refresh-token" });

        Assert.IsType<UnauthorizedObjectResult>(result);
        var activeToken = await _context.RefreshTokens.SingleAsync(item => item.TokenHash == HashRawToken("active-refresh-token"));
        Assert.NotNull(activeToken.RevokedAt);
    }

    public void Dispose()
    {
        _context.Dispose();
    }

    private AuthController BuildController(string? emailMode = "mock", string environmentName = "Development")
    {
        var values = new Dictionary<string, string?>
        {
            ["Crypto:Key"] = "0123456789abcdef0123456789abcdef"
        };

        if (emailMode != null)
        {
            values["Email:Mode"] = emailMode;
        }

        var configuration = new ConfigurationBuilder()
            .AddInMemoryCollection(values)
            .Build();

        var services = new ServiceCollection();
        services.AddSingleton<IConfiguration>(configuration);
        services.AddSingleton(_context);
        services.AddScoped<AccountBanService>();
        var serviceProvider = services.BuildServiceProvider();
        var abuseAutoBan = new AbuseAutoBanService(
            serviceProvider.GetRequiredService<IServiceScopeFactory>(),
            NullLogger<AbuseAutoBanService>.Instance);

        return new AuthController(
            _context,
            configuration,
            _emailSender,
            new TestWebHostEnvironment { EnvironmentName = environmentName },
            new CryptoService(configuration),
            new UserSessionService(_context),
            new AccountBanService(_context, configuration),
            abuseAutoBan);
    }

    private static User BuildUser(int id, string email)
    {
        return new User
        {
            id = id,
            first_name = "Lanaya",
            last_name = "User",
            nickname = $"LanayaUser{id}",
            email = email,
            is_email_verified = true,
            password_hash = "hash"
        };
    }

    private static (string VerificationToken, string DebugCode) ReadVerificationPayload(OkObjectResult result)
    {
        using var document = JsonDocument.Parse(JsonSerializer.Serialize(result.Value));
        var root = document.RootElement;
        return (
            root.GetProperty("verificationToken").GetString() ?? string.Empty,
            root.GetProperty("debugCode").GetString() ?? string.Empty
        );
    }

    private static string HashRawToken(string rawToken)
    {
        return Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(rawToken.Trim())));
    }

    private static AppDbContext CreateContext()
    {
        var options = new DbContextOptionsBuilder<AppDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString("N"))
            .ConfigureWarnings(warnings => warnings.Ignore(InMemoryEventId.TransactionIgnoredWarning))
            .Options;

        return new AppDbContext(options);
    }

    private sealed class TestEmailVerificationSender : IEmailVerificationSender
    {
        public int SendCount { get; private set; }
        public CancellationToken LastCancellationToken { get; private set; }

        public Task SendVerificationCodeAsync(
            string email,
            string verificationCode,
            DateTimeOffset expiresAt,
            CancellationToken cancellationToken = default,
            string purpose = EmailVerificationPurpose.Login)
        {
            SendCount++;
            LastCancellationToken = cancellationToken;
            return Task.CompletedTask;
        }
    }

    private sealed class TestWebHostEnvironment : IWebHostEnvironment
    {
        public string EnvironmentName { get; set; } = "Development";
        public string ApplicationName { get; set; } = "BackNoDiscord.Tests";
        public string WebRootPath { get; set; } = string.Empty;
        public IFileProvider WebRootFileProvider { get; set; } = new NullFileProvider();
        public string ContentRootPath { get; set; } = Directory.GetCurrentDirectory();
        public IFileProvider ContentRootFileProvider { get; set; } = new NullFileProvider();
    }
}
