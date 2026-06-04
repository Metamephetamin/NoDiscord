using System.Security.Claims;
using System.Text.Json;
using BackNoDiscord.Controllers;
using BackNoDiscord.Infrastructure;
using BackNoDiscord.Security;
using BackNoDiscord.Services;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.FileProviders;

namespace BackNoDiscord.Tests.Controllers;

public sealed class UserControllerTests
{
    [Fact]
    public async Task GetVisibleUserLocations_ReturnsOfflineUsersAtLastSharedLocation()
    {
        await using var context = CreateContext();
        var now = DateTimeOffset.UtcNow;
        context.Users.AddRange(
            new User
            {
                id = 1,
                first_name = "Current",
                last_name = "User",
                nickname = "current",
                email = "current@example.com",
                password_hash = "hash",
                is_email_verified = true
            },
            new User
            {
                id = 2,
                first_name = "Map",
                last_name = "Friend",
                nickname = "mapfriend",
                email = "mapfriend@example.com",
                password_hash = "hash",
                avatar_url = "/avatars/mapfriend.png",
                is_email_verified = true,
                location_sharing_enabled = true,
                location_visibility = "public",
                last_location_latitude = 55.8,
                last_location_longitude = 37.6,
                last_location_updated_at = now.AddHours(-3),
                last_location_expires_at = now.AddHours(-1),
                last_seen_at = now.AddMinutes(-30)
            });
        await context.SaveChangesAsync();
        var controller = BuildController(context, new RecordingHubContext(), userId: "1");

        var result = await controller.GetVisibleUserLocations(CancellationToken.None);

        var ok = Assert.IsType<OkObjectResult>(result);
        using var responseJson = JsonDocument.Parse(JsonSerializer.Serialize(ok.Value));
        var userLocation = Assert.Single(responseJson.RootElement.EnumerateArray());
        Assert.Equal(2, userLocation.GetProperty("id").GetInt32());
        Assert.Equal("Map Friend", userLocation.GetProperty("name").GetString());
        Assert.Equal("mapfriend", userLocation.GetProperty("nickname").GetString());
        Assert.Equal("/avatars/mapfriend.png", userLocation.GetProperty("avatar").GetString());
        Assert.Equal(55.8, userLocation.GetProperty("latitude").GetDouble());
        Assert.Equal(37.6, userLocation.GetProperty("longitude").GetDouble());
        Assert.Equal("offline", userLocation.GetProperty("presence").GetString());
        Assert.Equal("offline", userLocation.GetProperty("kind").GetString());
        Assert.True(userLocation.TryGetProperty("locationUpdatedAt", out _));
    }

    [Fact]
    public async Task UpdateProfile_PersistsProfileStatusAndBroadcastsIt()
    {
        await using var context = CreateContext();
        context.Users.Add(new User
        {
            id = 42,
            first_name = "Old",
            last_name = "Name",
            nickname = "OldNick",
            email = "user@example.com",
            password_hash = "hash"
        });
        await context.SaveChangesAsync();
        var hubContext = new RecordingHubContext();
        var controller = BuildController(context, hubContext, userId: "42");

        var result = await controller.UpdateProfile(new UpdateProfileRequest
        {
            FirstName = "Lanaya",
            LastName = "User",
            Nickname = "LanayaUser",
            ProfileStatus = "Пишу код"
        }, CancellationToken.None);

        var ok = Assert.IsType<OkObjectResult>(result);
        using var responseJson = JsonDocument.Parse(JsonSerializer.Serialize(ok.Value));
        Assert.Equal("Пишу код", responseJson.RootElement.GetProperty("profile_status").GetString());
        Assert.Equal("Пишу код", Assert.Single(context.Users).profile_status);

        var send = Assert.Single(hubContext.Sends);
        Assert.Equal("ProfileUpdated", send.Method);
        Assert.Contains("42", send.UserIds);
        using var broadcastJson = JsonDocument.Parse(JsonSerializer.Serialize(send.Arguments.Single()));
        Assert.Equal("Пишу код", broadcastJson.RootElement.GetProperty("profile_status").GetString());
    }

    private static UserController BuildController(AppDbContext context, IHubContext<ChatHub> hubContext, string userId)
    {
        var configuration = new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["Crypto:Key"] = "0123456789abcdef0123456789abcdef",
                ["Storage:Root"] = Path.Combine(Path.GetTempPath(), "nodiscord-tests")
            })
            .Build();
        var controller = new UserController(
            context,
            hubContext,
            new UploadStoragePaths(configuration, new TestWebHostEnvironment()),
            new TestEmailVerificationSender(),
            new CryptoService(configuration),
            new UserLocationPrivacyService(context, configuration),
            new UserPresenceService())
        {
            ControllerContext = new ControllerContext
            {
                HttpContext = new DefaultHttpContext
                {
                    User = new ClaimsPrincipal(new ClaimsIdentity(
                    [
                        new Claim(ClaimTypes.NameIdentifier, userId),
                        new Claim(ClaimTypes.Email, "user@example.com"),
                        new Claim("first_name", "Lanaya"),
                        new Claim("last_name", "User")
                    ], "test"))
                }
            }
        };

        return controller;
    }

    private static AppDbContext CreateContext()
    {
        var options = new DbContextOptionsBuilder<AppDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString("N"))
            .Options;

        return new AppDbContext(options);
    }

    private sealed record RecordedHubSend(IReadOnlyList<string> UserIds, string Method, IReadOnlyList<object?> Arguments);

    private sealed class RecordingHubContext : IHubContext<ChatHub>
    {
        public RecordingHubContext()
        {
            Clients = new RecordingHubClients(Sends);
            Groups = new RecordingGroupManager();
        }

        public List<RecordedHubSend> Sends { get; } = [];

        public IHubClients Clients { get; }

        public IGroupManager Groups { get; }
    }

    private sealed class RecordingHubClients(List<RecordedHubSend> sends) : IHubClients
    {
        private IClientProxy EmptyProxy => new RecordingClientProxy([], sends);

        public IClientProxy All => EmptyProxy;

        public IClientProxy AllExcept(IReadOnlyList<string> excludedConnectionIds) => EmptyProxy;

        public IClientProxy Client(string connectionId) => EmptyProxy;

        public IClientProxy Clients(IReadOnlyList<string> connectionIds) => EmptyProxy;

        public IClientProxy Group(string groupName) => EmptyProxy;

        public IClientProxy GroupExcept(string groupName, IReadOnlyList<string> excludedConnectionIds) => EmptyProxy;

        public IClientProxy Groups(IReadOnlyList<string> groupNames) => EmptyProxy;

        public IClientProxy User(string userId) => new RecordingClientProxy([userId], sends);

        public IClientProxy Users(IReadOnlyList<string> userIds) => new RecordingClientProxy(userIds, sends);
    }

    private sealed class RecordingClientProxy(IReadOnlyList<string> userIds, List<RecordedHubSend> sends) : IClientProxy
    {
        public Task SendCoreAsync(string method, object?[] args, CancellationToken cancellationToken = default)
        {
            sends.Add(new RecordedHubSend(userIds, method, args));
            return Task.CompletedTask;
        }
    }

    private sealed class RecordingGroupManager : IGroupManager
    {
        public Task AddToGroupAsync(string connectionId, string groupName, CancellationToken cancellationToken = default) => Task.CompletedTask;

        public Task RemoveFromGroupAsync(string connectionId, string groupName, CancellationToken cancellationToken = default) => Task.CompletedTask;
    }

    private sealed class TestEmailVerificationSender : IEmailVerificationSender
    {
        public Task SendVerificationCodeAsync(
            string email,
            string verificationCode,
            DateTimeOffset expiresAt,
            CancellationToken cancellationToken = default,
            string purpose = EmailVerificationPurpose.Login) => Task.CompletedTask;
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
