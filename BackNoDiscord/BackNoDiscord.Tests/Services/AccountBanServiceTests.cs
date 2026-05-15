using BackNoDiscord.Services;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;

namespace BackNoDiscord.Tests.Services;

public sealed class AccountBanServiceTests : IDisposable
{
    private readonly AppDbContext _context = CreateContext();

    [Fact]
    public async Task BanUser_AddsIdentityRecordsFromAccountAndSessions()
    {
        var service = CreateService();
        var actor = BuildUser(1, "admin@example.com");
        var target = BuildUser(2, "banned@example.com");
        const string deviceToken = "ldv1.11111111-1111-1111-1111-111111111111.22222222-2222-2222-2222-222222222222";
        _context.Users.AddRange(actor, target);
        _context.RefreshTokens.Add(new RefreshTokenRecord
        {
            UserId = target.id,
            TokenHash = "refresh-token-hash",
            CreatedAt = DateTimeOffset.UtcNow.AddMinutes(-10),
            ExpiresAt = DateTimeOffset.UtcNow.AddDays(7),
            UserAgent = "Electron",
            DeviceLabel = "Electron on Windows",
            DeviceTokenHash = AccountBanService.HashIdentityValue(AccountBanService.IdentityTypeDeviceToken, deviceToken),
            LastIp = "10.20.30.40",
            LastUsedAt = DateTimeOffset.UtcNow.AddMinutes(-5)
        });
        await _context.SaveChangesAsync();

        var result = await service.BanUserAsync(actor.id, target.id, "abuse", CancellationToken.None);

        Assert.Equal(AccountBanResult.Success, result);
        Assert.Contains(_context.BannedIdentityRecords, item => item.IdentityType == AccountBanService.IdentityTypeEmail);
        Assert.Contains(_context.BannedIdentityRecords, item => item.IdentityType == AccountBanService.IdentityTypeDeviceToken);
        Assert.Contains(_context.BannedIdentityRecords, item => item.IdentityType == AccountBanService.IdentityTypeIpFamily);
        Assert.All(_context.RefreshTokens.Where(item => item.UserId == target.id), item => Assert.NotNull(item.RevokedAt));
    }

    [Fact]
    public async Task EvaluateClientBan_WhenDeviceTokenMatches_RejectsAndBansUser()
    {
        var service = CreateService();
        const string deviceToken = "ldv1.aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa.bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
        var source = BuildUser(1, "source@example.com");
        var nextUser = BuildUser(2, "next@example.com");
        _context.Users.AddRange(source, nextUser);
        _context.BannedIdentityRecords.Add(new BannedIdentityRecord
        {
            IdentityType = AccountBanService.IdentityTypeDeviceToken,
            IdentityHash = AccountBanService.HashIdentityValue(AccountBanService.IdentityTypeDeviceToken, deviceToken),
            SourceUserId = source.id,
            CreatedByUserId = source.id,
            CreatedAt = DateTimeOffset.UtcNow.AddMinutes(-5),
            Reason = "test"
        });
        await _context.SaveChangesAsync();

        var decision = await service.EvaluateClientBanAsync(
            nextUser,
            nextUser.email,
            nextUser.phone_number,
            deviceToken,
            "203.0.113.20",
            DateTimeOffset.UtcNow,
            CancellationToken.None);

        Assert.False(decision.IsAllowed);
        Assert.Equal(AccountBanService.IdentityTypeDeviceToken, decision.IdentityType);
        Assert.True(nextUser.IsBanned);
        var matchedIdentity = await _context.BannedIdentityRecords.SingleAsync(item =>
            item.IdentityType == AccountBanService.IdentityTypeDeviceToken &&
            item.IdentityHash == AccountBanService.HashIdentityValue(AccountBanService.IdentityTypeDeviceToken, deviceToken));
        Assert.Equal(1, matchedIdentity.MatchCount);
        Assert.Contains(_context.BannedIdentityRecords, item =>
            item.SourceUserId == nextUser.id &&
            item.IdentityType == AccountBanService.IdentityTypeEmail);
    }

    public void Dispose()
    {
        _context.Dispose();
    }

    private AccountBanService CreateService()
    {
        var configuration = new ConfigurationBuilder().Build();
        return new AccountBanService(_context, configuration);
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

    private static AppDbContext CreateContext()
    {
        var options = new DbContextOptionsBuilder<AppDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString("N"))
            .Options;

        return new AppDbContext(options);
    }
}
