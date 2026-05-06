using BackNoDiscord.Services;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Diagnostics;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.FileProviders;
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

        return new AuthController(
            _context,
            configuration,
            _emailSender,
            new TestWebHostEnvironment { EnvironmentName = environmentName },
            new CryptoService(configuration));
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

        public Task SendVerificationCodeAsync(string email, string verificationCode, DateTimeOffset expiresAt, CancellationToken cancellationToken = default)
        {
            SendCount++;
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
