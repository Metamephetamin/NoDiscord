using BackNoDiscord.Services;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;

namespace BackNoDiscord.Tests.Services;

public sealed class UserLocationPrivacyServiceTests
{
    [Fact]
    public async Task CanPublishLocationAsync_AllowsDefaultSharing()
    {
        await using var context = CreateContext();
        context.Users.Add(CreateUser(id: 42));
        await context.SaveChangesAsync();
        var service = new UserLocationPrivacyService(context, CreateConfiguration());

        Assert.True(await service.CanPublishLocationAsync(42, CancellationToken.None));
    }

    [Fact]
    public async Task CanPublishLocationAsync_RejectsDisabledSharing()
    {
        await using var context = CreateContext();
        context.Users.Add(CreateUser(id: 42, sharingEnabled: false, visibility: "none"));
        await context.SaveChangesAsync();
        var service = new UserLocationPrivacyService(context, CreateConfiguration());

        Assert.False(await service.CanPublishLocationAsync(42, CancellationToken.None));
    }

    [Fact]
    public void IsLocationVisible_HidesExpiredLocation()
    {
        var now = DateTimeOffset.Parse("2026-05-28T12:00:00Z");
        var service = new UserLocationPrivacyService(CreateContext(), CreateConfiguration());
        var user = CreateUser(id: 42);
        user.last_location_latitude = 55.7558;
        user.last_location_longitude = 37.6173;
        user.last_location_updated_at = now.AddHours(-25);
        user.last_location_expires_at = now.AddMinutes(-1);

        Assert.False(service.IsLocationVisible(user, now));
    }

    [Fact]
    public async Task ClearLocationAsync_RemovesStoredCoordinates()
    {
        await using var context = CreateContext();
        var user = CreateUser(id: 42);
        user.last_location_latitude = 55.7558;
        user.last_location_longitude = 37.6173;
        user.last_location_updated_at = DateTimeOffset.UtcNow;
        user.last_location_expires_at = DateTimeOffset.UtcNow.AddHours(1);
        context.Users.Add(user);
        await context.SaveChangesAsync();
        var service = new UserLocationPrivacyService(context, CreateConfiguration());

        await service.ClearLocationAsync(42, CancellationToken.None);

        var updatedUser = await context.Users.SingleAsync(item => item.id == 42);
        Assert.Null(updatedUser.last_location_latitude);
        Assert.Null(updatedUser.last_location_longitude);
        Assert.Null(updatedUser.last_location_updated_at);
        Assert.Null(updatedUser.last_location_expires_at);
    }

    [Fact]
    public async Task UpdatePreferenceAsync_DisablingSharingClearsLocation()
    {
        await using var context = CreateContext();
        var user = CreateUser(id: 42);
        user.last_location_latitude = 55.7558;
        user.last_location_longitude = 37.6173;
        user.last_location_updated_at = DateTimeOffset.UtcNow;
        user.last_location_expires_at = DateTimeOffset.UtcNow.AddHours(1);
        context.Users.Add(user);
        await context.SaveChangesAsync();
        var service = new UserLocationPrivacyService(context, CreateConfiguration());

        var preference = await service.UpdatePreferenceAsync(42, enabled: false, visibility: "none", CancellationToken.None);

        var updatedUser = await context.Users.SingleAsync(item => item.id == 42);
        Assert.NotNull(preference);
        Assert.False(preference.Enabled);
        Assert.Equal("none", preference.Visibility);
        Assert.Null(updatedUser.last_location_latitude);
        Assert.Null(updatedUser.last_location_longitude);
        Assert.Null(updatedUser.last_location_updated_at);
        Assert.Null(updatedUser.last_location_expires_at);
    }

    [Fact]
    public async Task GetPreferenceAsync_ReturnsStoredSharingStateAndConfiguredRetention()
    {
        await using var context = CreateContext();
        context.Users.Add(CreateUser(id: 42, sharingEnabled: true, visibility: "friends"));
        await context.SaveChangesAsync();
        var service = new UserLocationPrivacyService(context, CreateConfiguration("36"));

        var preference = await service.GetPreferenceAsync(42, CancellationToken.None);

        Assert.NotNull(preference);
        Assert.True(preference.Enabled);
        Assert.Equal("friends", preference.Visibility);
        Assert.Equal(36, preference.RetentionHours);
    }

    [Theory]
    [InlineData("0", 1)]
    [InlineData("24", 24)]
    [InlineData("999", 168)]
    public async Task GetLocationExpiryAsync_ClampsRetentionHours(string configuredHours, int expectedHours)
    {
        var now = DateTimeOffset.Parse("2026-05-28T12:00:00Z");
        await using var context = CreateContext();
        var service = new UserLocationPrivacyService(context, CreateConfiguration(configuredHours));

        var expiresAt = await service.GetLocationExpiryAsync(now, CancellationToken.None);

        Assert.Equal(now.AddHours(expectedHours), expiresAt);
    }

    private static AppDbContext CreateContext()
    {
        var options = new DbContextOptionsBuilder<AppDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString("N"))
            .Options;

        return new AppDbContext(options);
    }

    private static IConfiguration CreateConfiguration(string retentionHours = "24") =>
        new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["Location:RetentionHours"] = retentionHours
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
