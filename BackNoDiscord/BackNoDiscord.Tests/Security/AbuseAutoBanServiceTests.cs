using BackNoDiscord.Security;
using BackNoDiscord.Services;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Logging.Abstractions;

namespace BackNoDiscord.Tests.Security;

public sealed class AbuseAutoBanServiceTests : IDisposable
{
    private readonly ServiceProvider _services;
    private readonly AbuseAutoBanService _abuse;

    public AbuseAutoBanServiceTests()
    {
        var services = new ServiceCollection();
        var databaseName = Guid.NewGuid().ToString("N");
        services.AddDbContext<AppDbContext>(options => options.UseInMemoryDatabase(databaseName));
        services.AddSingleton<IConfiguration>(new ConfigurationBuilder().Build());
        services.AddScoped<AccountBanService>();
        services.AddSingleton<ILogger<AbuseAutoBanService>>(NullLogger<AbuseAutoBanService>.Instance);
        services.AddSingleton<AbuseAutoBanService>();

        _services = services.BuildServiceProvider();
        _abuse = _services.GetRequiredService<AbuseAutoBanService>();
    }

    [Fact]
    public async Task RecordMessageBurstViolationAsync_BansOnlyAfterRepeatedViolations()
    {
        await SeedUserAsync(10);
        var now = new DateTimeOffset(2026, 5, 15, 12, 0, 0, TimeSpan.Zero);

        for (var index = 0; index < 5; index += 1)
        {
            var allowed = await _abuse.RecordMessageBurstViolationAsync(10, now.AddSeconds(index), CancellationToken.None);
            Assert.False(allowed.IsBanned);
        }

        var banned = await _abuse.RecordMessageBurstViolationAsync(10, now.AddSeconds(5), CancellationToken.None);

        Assert.True(banned.IsBanned);
        await using var scope = _services.CreateAsyncScope();
        var context = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        Assert.True((await context.Users.SingleAsync(item => item.id == 10)).IsBanned);
    }

    [Fact]
    public async Task RecordLoginSecuritySignalAsync_DoesNotBanByItself()
    {
        await SeedUserAsync(12);
        var now = new DateTimeOffset(2026, 5, 15, 12, 0, 0, TimeSpan.Zero);

        var result = await _abuse.RecordLoginSecuritySignalAsync(
            12,
            new LoginSecuritySignal(true, IsNewDevice: true, IsNewIpFamily: true),
            now,
            CancellationToken.None);

        Assert.False(result.IsBanned);
        Assert.True(result.RiskScore > 0);

        await using var scope = _services.CreateAsyncScope();
        var context = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        Assert.False((await context.Users.SingleAsync(item => item.id == 12)).IsBanned);
    }

    [Fact]
    public async Task RecordMessageBurstViolationAsync_BansSoonerAfterNewDeviceAndIp()
    {
        await SeedUserAsync(13);
        var now = new DateTimeOffset(2026, 5, 15, 12, 0, 0, TimeSpan.Zero);

        await _abuse.RecordLoginSecuritySignalAsync(
            13,
            new LoginSecuritySignal(true, IsNewDevice: true, IsNewIpFamily: true),
            now,
            CancellationToken.None);
        var firstBurst = await _abuse.RecordMessageBurstViolationAsync(13, now.AddSeconds(30), CancellationToken.None);
        var secondBurst = await _abuse.RecordMessageBurstViolationAsync(13, now.AddSeconds(45), CancellationToken.None);

        Assert.False(firstBurst.IsBanned);
        Assert.True(secondBurst.IsBanned);

        await using var scope = _services.CreateAsyncScope();
        var context = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        Assert.True((await context.Users.SingleAsync(item => item.id == 13)).IsBanned);
    }

    [Fact]
    public async Task RecordOutgoingFriendRequestAsync_BansMassOutgoingRequests()
    {
        await SeedUserAsync(11);
        var now = new DateTimeOffset(2026, 5, 15, 12, 0, 0, TimeSpan.Zero);

        AbuseAutoBanResult result = AbuseAutoBanResult.Allowed;
        for (var index = 0; index < 30; index += 1)
        {
            result = await _abuse.RecordOutgoingFriendRequestAsync(11, now.AddSeconds(index), CancellationToken.None);
        }

        Assert.True(result.IsBanned);
        await using var scope = _services.CreateAsyncScope();
        var context = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        Assert.True((await context.Users.SingleAsync(item => item.id == 11)).IsBanned);
    }

    public void Dispose()
    {
        _services.Dispose();
    }

    private async Task SeedUserAsync(int userId)
    {
        await using var scope = _services.CreateAsyncScope();
        var context = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        context.Users.Add(new User
        {
            id = userId,
            first_name = "Abuse",
            last_name = "User",
            nickname = $"abuse-{userId}",
            email = $"abuse-{userId}@example.com",
            is_email_verified = true,
            password_hash = "hash"
        });
        await context.SaveChangesAsync();
    }
}
