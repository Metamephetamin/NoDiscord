using BackNoDiscord.Services;
using Microsoft.EntityFrameworkCore;

namespace BackNoDiscord.Tests.Services;

public sealed class ChatReadStateServiceTests
{
    [Fact]
    public async Task MarkReadAsync_CreatesReadCursorForUserAndChannel()
    {
        await using var context = CreateContext();
        var service = new ChatReadStateService(context);
        var readAt = DateTimeOffset.Parse("2026-05-13T10:00:00Z");

        await service.MarkReadAsync("42", "dm:42:99", 123, readAt, CancellationToken.None);

        var state = await context.ChatChannelReadStates.SingleAsync();
        Assert.Equal("42", state.UserId);
        Assert.Equal("dm:42:99", state.ChannelId);
        Assert.Equal(123, state.LastReadMessageId);
        Assert.Equal(readAt, state.LastReadAt);
    }

    [Fact]
    public async Task MarkReadAsync_KeepsHighestReadMessageIdWhenOlderCursorArrives()
    {
        await using var context = CreateContext();
        var service = new ChatReadStateService(context);

        await service.MarkReadAsync("42", "dm:42:99", 200, DateTimeOffset.Parse("2026-05-13T10:00:00Z"), CancellationToken.None);
        await service.MarkReadAsync("42", "dm:42:99", 150, DateTimeOffset.Parse("2026-05-13T10:01:00Z"), CancellationToken.None);

        var state = await service.GetReadStateAsync("42", "dm:42:99", CancellationToken.None);
        Assert.NotNull(state);
        Assert.Equal(200, state.LastReadMessageId);
        Assert.Equal(DateTimeOffset.Parse("2026-05-13T10:01:00Z"), state.LastReadAt);
        Assert.Single(context.ChatChannelReadStates);
    }

    private static AppDbContext CreateContext()
    {
        var options = new DbContextOptionsBuilder<AppDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString("N"))
            .Options;

        return new AppDbContext(options);
    }
}
