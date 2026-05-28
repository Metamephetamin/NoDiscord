using BackNoDiscord.Controllers;
using BackNoDiscord.Services;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using System.Security.Claims;
using System.Text.Json;

namespace BackNoDiscord.Tests.Controllers;

public sealed class FriendsControllerTests
{
    [Fact]
    public async Task GetFriends_IncludesFreshVisibleLocation()
    {
        await using var context = CreateContext();
        var now = DateTimeOffset.UtcNow;
        var friend = CreateUser(2);
        friend.last_location_latitude = 55.7558;
        friend.last_location_longitude = 37.6173;
        friend.last_location_updated_at = now;
        friend.last_location_expires_at = now.AddHours(1);
        context.Users.AddRange(CreateUser(1), friend);
        context.Friendships.Add(new FriendshipRecord { UserLowId = 1, UserHighId = 2, CreatedAt = now });
        await context.SaveChangesAsync();
        var controller = CreateController(context, userId: "1");

        var result = await controller.GetFriends(CancellationToken.None);

        using var document = ToJsonDocument(result);
        var firstFriend = document.RootElement[0];
        Assert.Equal(55.7558, firstFriend.GetProperty("latitude").GetDouble());
        Assert.Equal(37.6173, firstFriend.GetProperty("longitude").GetDouble());
        Assert.Equal("Последняя локация", firstFriend.GetProperty("locationLabel").GetString());
    }

    [Fact]
    public async Task GetFriends_HidesDisabledLocation()
    {
        await using var context = CreateContext();
        var now = DateTimeOffset.UtcNow;
        var friend = CreateUser(2, sharingEnabled: false, visibility: "none");
        friend.last_location_latitude = 55.7558;
        friend.last_location_longitude = 37.6173;
        friend.last_location_updated_at = now;
        friend.last_location_expires_at = now.AddHours(1);
        context.Users.AddRange(CreateUser(1), friend);
        context.Friendships.Add(new FriendshipRecord { UserLowId = 1, UserHighId = 2, CreatedAt = now });
        await context.SaveChangesAsync();
        var controller = CreateController(context, userId: "1");

        var result = await controller.GetFriends(CancellationToken.None);

        using var document = ToJsonDocument(result);
        var firstFriend = document.RootElement[0];
        Assert.Equal(JsonValueKind.Null, firstFriend.GetProperty("latitude").ValueKind);
        Assert.Equal(JsonValueKind.Null, firstFriend.GetProperty("longitude").ValueKind);
        Assert.Equal(JsonValueKind.Null, firstFriend.GetProperty("locationLabel").ValueKind);
        Assert.Equal(JsonValueKind.Null, firstFriend.GetProperty("locationUpdatedAt").ValueKind);
    }

    [Fact]
    public async Task GetFriends_HidesExpiredLocation()
    {
        await using var context = CreateContext();
        var now = DateTimeOffset.UtcNow;
        var friend = CreateUser(2);
        friend.last_location_latitude = 55.7558;
        friend.last_location_longitude = 37.6173;
        friend.last_location_updated_at = now.AddHours(-25);
        friend.last_location_expires_at = now.AddMinutes(-1);
        context.Users.AddRange(CreateUser(1), friend);
        context.Friendships.Add(new FriendshipRecord { UserLowId = 1, UserHighId = 2, CreatedAt = now });
        await context.SaveChangesAsync();
        var controller = CreateController(context, userId: "1");

        var result = await controller.GetFriends(CancellationToken.None);

        using var document = ToJsonDocument(result);
        var firstFriend = document.RootElement[0];
        Assert.Equal(JsonValueKind.Null, firstFriend.GetProperty("latitude").ValueKind);
        Assert.Equal(JsonValueKind.Null, firstFriend.GetProperty("longitude").ValueKind);
        Assert.Equal(JsonValueKind.Null, firstFriend.GetProperty("locationLabel").ValueKind);
        Assert.Equal(JsonValueKind.Null, firstFriend.GetProperty("locationUpdatedAt").ValueKind);
    }

    private static JsonDocument ToJsonDocument(IActionResult result)
    {
        var okResult = Assert.IsType<OkObjectResult>(result);
        return JsonDocument.Parse(JsonSerializer.Serialize(okResult.Value));
    }

    private static FriendsController CreateController(AppDbContext context, string userId)
    {
        var controller = new FriendsController(
            context,
            chatHubContext: null!,
            friendRequestService: null!,
            userBlockService: null!,
            new UserPresenceService(),
            crypto: null!,
            abuseAutoBan: null!,
            new UserLocationPrivacyService(context, CreateConfiguration()))
        {
            ControllerContext = new ControllerContext
            {
                HttpContext = new DefaultHttpContext
                {
                    User = new ClaimsPrincipal(new ClaimsIdentity(
                    [
                        new Claim(ClaimTypes.NameIdentifier, userId),
                        new Claim(ClaimTypes.Email, $"user{userId}@example.com"),
                        new Claim("nickname", $"user{userId}")
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

    private static IConfiguration CreateConfiguration() =>
        new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["Location:RetentionHours"] = "24"
            })
            .Build();

    private static User CreateUser(int id, bool sharingEnabled = true, string visibility = "friends") =>
        new()
        {
            id = id,
            first_name = "Test",
            last_name = "User",
            nickname = $"test{id}",
            email = $"test{id}@example.com",
            password_hash = "hash",
            is_email_verified = true,
            location_sharing_enabled = sharingEnabled,
            location_visibility = visibility
        };
}
