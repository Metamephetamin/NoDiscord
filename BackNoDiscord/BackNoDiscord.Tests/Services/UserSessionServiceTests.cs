using BackNoDiscord.Services;
using Microsoft.EntityFrameworkCore;

namespace BackNoDiscord.Tests.Services;

public sealed class UserSessionServiceTests
{
    [Fact]
    public async Task RevokeOtherSessionsAsync_RevokesOnlyOtherActiveSessions()
    {
        await using var context = CreateContext();
        var now = DateTimeOffset.UtcNow;
        context.RefreshTokens.AddRange(
            BuildToken(id: 1, userId: 42, tokenHash: "current", now),
            BuildToken(id: 2, userId: 42, tokenHash: "other-active", now),
            BuildToken(id: 3, userId: 42, tokenHash: "old-revoked", now, revokedAt: now.AddMinutes(-5)),
            BuildToken(id: 4, userId: 99, tokenHash: "other-user", now));
        await context.SaveChangesAsync();
        var service = new UserSessionService(context);

        var revoked = await service.RevokeOtherSessionsAsync(
            userId: 42,
            currentRefreshTokenHash: "current",
            clientIp: "10.0.0.5",
            now,
            CancellationToken.None);

        Assert.Equal(1, revoked);
        Assert.Null((await context.RefreshTokens.FindAsync(1))?.RevokedAt);
        Assert.NotNull((await context.RefreshTokens.FindAsync(2))?.RevokedAt);
        Assert.NotNull((await context.RefreshTokens.FindAsync(3))?.RevokedAt);
        Assert.Null((await context.RefreshTokens.FindAsync(4))?.RevokedAt);
    }

    [Fact]
    public async Task RevokeActiveSessionsAfterRefreshTokenReuseAsync_RevokesUserActiveSessions()
    {
        await using var context = CreateContext();
        var now = DateTimeOffset.UtcNow;
        context.RefreshTokens.AddRange(
            BuildToken(id: 1, userId: 42, tokenHash: "used-old", now, revokedAt: now.AddMinutes(-1), replacedByTokenHash: "replacement"),
            BuildToken(id: 2, userId: 42, tokenHash: "active-current", now),
            BuildToken(id: 3, userId: 99, tokenHash: "other-user", now));
        await context.SaveChangesAsync();
        var service = new UserSessionService(context);

        var revoked = await service.RevokeActiveSessionsAfterRefreshTokenReuseAsync(
            reusedTokenHash: "used-old",
            now,
            CancellationToken.None);

        Assert.True(revoked);
        Assert.NotNull((await context.RefreshTokens.FindAsync(2))?.RevokedAt);
        Assert.Null((await context.RefreshTokens.FindAsync(3))?.RevokedAt);
    }

    [Fact]
    public async Task GetActiveSessionsAsync_PrunesDuplicateActiveSessionsForSameDeviceToken()
    {
        await using var context = CreateContext();
        var now = DateTimeOffset.UtcNow;
        var sameDeviceHash = new string('A', 64);
        context.RefreshTokens.AddRange(
            BuildToken(id: 1, userId: 42, tokenHash: "current", now, deviceTokenHash: sameDeviceHash, createdAt: now.AddDays(-2)),
            BuildToken(id: 2, userId: 42, tokenHash: "duplicate", now, deviceTokenHash: sameDeviceHash, createdAt: now.AddDays(-1)),
            BuildToken(id: 3, userId: 42, tokenHash: "other-device", now, deviceTokenHash: new string('B', 64), createdAt: now.AddHours(-2)));
        await context.SaveChangesAsync();
        var service = new UserSessionService(context);

        var sessions = await service.GetActiveSessionsAsync(
            userId: 42,
            currentRefreshTokenHash: "current",
            CancellationToken.None);

        Assert.Equal(2, sessions.Count);
        Assert.Contains(sessions, item => item.Id == 1 && item.IsCurrent);
        Assert.Contains(sessions, item => item.Id == 3);
        Assert.Null((await context.RefreshTokens.FindAsync(1))?.RevokedAt);
        Assert.NotNull((await context.RefreshTokens.FindAsync(2))?.RevokedAt);
        Assert.Null((await context.RefreshTokens.FindAsync(3))?.RevokedAt);
    }

    [Fact]
    public async Task DetectLoginSecuritySignalAsync_FlagsNewDeviceAndIpFamily()
    {
        await using var context = CreateContext();
        var now = DateTimeOffset.UtcNow;
        context.RefreshTokens.Add(BuildToken(id: 1, userId: 42, tokenHash: "known", now));
        await context.SaveChangesAsync();
        var service = new UserSessionService(context);

        var signal = await service.DetectLoginSecuritySignalAsync(
            userId: 42,
            deviceLabel: "New Browser",
            deviceTokenHash: string.Empty,
            clientIp: "172.16.10.4",
            now,
            CancellationToken.None);

        Assert.NotNull(signal);
        Assert.True(signal.IsSuspicious);
        Assert.True(signal.IsNewDevice);
        Assert.True(signal.IsNewIpFamily);
    }

    [Fact]
    public async Task DetectLoginSecuritySignalAsync_FlagsNewDeviceTokenEvenWithSameUserAgent()
    {
        await using var context = CreateContext();
        var now = DateTimeOffset.UtcNow;
        context.RefreshTokens.Add(BuildToken(
            id: 1,
            userId: 42,
            tokenHash: "known",
            now,
            deviceTokenHash: new string('A', 64)));
        await context.SaveChangesAsync();
        var service = new UserSessionService(context);

        var signal = await service.DetectLoginSecuritySignalAsync(
            userId: 42,
            deviceLabel: "Test Browser",
            deviceTokenHash: new string('B', 64),
            clientIp: "127.0.0.2",
            now: now,
            cancellationToken: CancellationToken.None);

        Assert.NotNull(signal);
        Assert.True(signal.IsSuspicious);
        Assert.True(signal.IsNewDevice);
    }

    [Fact]
    public async Task EvaluateHighRiskSessionAsync_BlocksNewSessionWhenOlderSessionIsStillActive()
    {
        await using var context = CreateContext();
        var now = DateTimeOffset.UtcNow;
        context.RefreshTokens.AddRange(
            BuildToken(id: 1, userId: 42, tokenHash: "older-session", now, createdAt: now.AddHours(-3)),
            BuildToken(id: 2, userId: 42, tokenHash: "new-session", now, createdAt: now.AddMinutes(-5)));
        await context.SaveChangesAsync();
        var service = new UserSessionService(context);

        var decision = await service.EvaluateHighRiskSessionAsync(
            userId: 42,
            currentRefreshTokenHash: "new-session",
            now,
            holdDuration: TimeSpan.FromHours(24),
            CancellationToken.None);

        Assert.False(decision.IsAllowed);
        Assert.Equal("new_session_hold", decision.Code);
        Assert.Equal(now.AddMinutes(-5).AddHours(24), decision.AvailableAt);
    }

    [Fact]
    public async Task EvaluateHighRiskSessionAsync_AllowsOnlyActiveSessionEvenWhenNew()
    {
        await using var context = CreateContext();
        var now = DateTimeOffset.UtcNow;
        context.RefreshTokens.Add(BuildToken(id: 1, userId: 42, tokenHash: "only-session", now, createdAt: now.AddMinutes(-5)));
        await context.SaveChangesAsync();
        var service = new UserSessionService(context);

        var decision = await service.EvaluateHighRiskSessionAsync(
            userId: 42,
            currentRefreshTokenHash: "only-session",
            now,
            holdDuration: TimeSpan.FromHours(24),
            CancellationToken.None);

        Assert.True(decision.IsAllowed);
        Assert.Equal("allowed", decision.Code);
    }

    [Fact]
    public async Task EvaluateHighRiskSessionAsync_RequiresCurrentRefreshTokenProof()
    {
        await using var context = CreateContext();
        var now = DateTimeOffset.UtcNow;
        context.RefreshTokens.Add(BuildToken(id: 1, userId: 42, tokenHash: "known-session", now));
        await context.SaveChangesAsync();
        var service = new UserSessionService(context);

        var decision = await service.EvaluateHighRiskSessionAsync(
            userId: 42,
            currentRefreshTokenHash: "",
            now,
            holdDuration: TimeSpan.FromHours(24),
            CancellationToken.None);

        Assert.False(decision.IsAllowed);
        Assert.Equal("current_session_required", decision.Code);
    }

    private static RefreshTokenRecord BuildToken(
        int id,
        int userId,
        string tokenHash,
        DateTimeOffset now,
        DateTimeOffset? revokedAt = null,
        string? replacedByTokenHash = null,
        string deviceTokenHash = "",
        DateTimeOffset? createdAt = null)
    {
        return new RefreshTokenRecord
        {
            Id = id,
            UserId = userId,
            TokenHash = tokenHash,
            CreatedAt = createdAt ?? now.AddHours(-1),
            ExpiresAt = now.AddDays(7),
            RevokedAt = revokedAt,
            ReplacedByTokenHash = replacedByTokenHash,
            UserAgent = "Test Browser",
            DeviceLabel = "Test Browser",
            DeviceTokenHash = deviceTokenHash,
            LastIp = "127.0.0.1",
            LastUsedAt = now.AddMinutes(-10)
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
