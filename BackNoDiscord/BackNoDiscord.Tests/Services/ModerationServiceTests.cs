using BackNoDiscord.Services;
using Microsoft.EntityFrameworkCore;

namespace BackNoDiscord.Tests.Services;

public sealed class ModerationServiceTests
{
    [Fact]
    public async Task CreateReportAsync_PersistsOpenReportWithoutMessageBody()
    {
        await using var context = CreateContext();
        var service = new ModerationService(context);

        var report = await service.CreateReportAsync(
            serverId: "server-1",
            channelId: "server:server-1::channel:general",
            reporterUserId: "42",
            targetUserId: "99",
            messageId: 123,
            reason: "spam message body should not be stored",
            CancellationToken.None);

        Assert.Equal("open", report.Status);
        Assert.Equal("server-1", report.ServerId);
        Assert.Equal(123, report.MessageId);
        Assert.DoesNotContain("message body", report.Reason, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public async Task ApplyActionAsync_ReturnsActiveMuteUntilItExpiresOrIsRevoked()
    {
        await using var context = CreateContext();
        var service = new ModerationService(context);

        var action = await service.ApplyActionAsync(
            serverId: "server-1",
            actorUserId: "1",
            targetUserId: "99",
            actionType: "mute",
            reason: "spam",
            expiresAt: DateTimeOffset.UtcNow.AddMinutes(10),
            CancellationToken.None);

        Assert.NotNull(await service.GetActiveActionAsync("server-1", "99", ["mute"], CancellationToken.None));

        await service.RevokeActionAsync(action.Id, "1", CancellationToken.None);

        Assert.Null(await service.GetActiveActionAsync("server-1", "99", ["mute"], CancellationToken.None));
    }

    [Fact]
    public async Task ApplyActionAsync_TracksActiveBanForServerEnforcement()
    {
        await using var context = CreateContext();
        var service = new ModerationService(context);

        await service.ApplyActionAsync(
            serverId: "server-1",
            actorUserId: "1",
            targetUserId: "99",
            actionType: "ban",
            reason: "raid",
            expiresAt: null,
            CancellationToken.None);

        var activeBan = await service.GetActiveActionAsync("server-1", "99", ["ban"], CancellationToken.None);

        Assert.NotNull(activeBan);
        Assert.Equal("ban", activeBan.ActionType);
    }

    private static AppDbContext CreateContext()
    {
        var options = new DbContextOptionsBuilder<AppDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString("N"))
            .Options;

        return new AppDbContext(options);
    }
}
