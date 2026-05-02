using BackNoDiscord.Services;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Diagnostics;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.FileProviders;

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

    public void Dispose()
    {
        _context.Dispose();
    }

    private AuthController BuildController()
    {
        var configuration = new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["Crypto:Key"] = "0123456789abcdef0123456789abcdef",
                ["Email:Mode"] = "mock"
            })
            .Build();

        return new AuthController(
            _context,
            configuration,
            _emailSender,
            new TestWebHostEnvironment(),
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
