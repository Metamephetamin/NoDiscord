using BackNoDiscord.Services;
using Microsoft.EntityFrameworkCore;

namespace BackNoDiscord.Tests.Services;

public sealed class MessageDeduplicationServiceTests
{
    [Fact]
    public void NormalizeClientMessageId_PrefersClientMessageIdAndFallsBackToClientTempId()
    {
        Assert.Equal("msg-1", MessageDeduplicationService.NormalizeClientMessageId(" msg-1 ", " temp-1 "));
        Assert.Equal("temp-1", MessageDeduplicationService.NormalizeClientMessageId("", " temp-1 "));
        Assert.Equal("", MessageDeduplicationService.NormalizeClientMessageId("", ""));
    }

    [Fact]
    public async Task FindExistingAsync_UsesAuthorChannelAndClientMessageId()
    {
        await using var context = CreateContext();
        context.Messages.AddRange(
            new Message
            {
                ChannelId = "direct-message::1::2",
                AuthorUserId = "1",
                ClientMessageId = "client-1",
                Username = "One",
                Timestamp = DateTime.UtcNow,
                IsDeleted = false
            },
            new Message
            {
                ChannelId = "direct-message::1::3",
                AuthorUserId = "1",
                ClientMessageId = "client-1",
                Username = "One",
                Timestamp = DateTime.UtcNow,
                IsDeleted = false
            });
        await context.SaveChangesAsync();

        var service = new MessageDeduplicationService();
        var existing = await service.FindExistingAsync(
            context,
            ["direct-message::1::2"],
            "1",
            "client-1",
            CancellationToken.None);

        Assert.NotNull(existing);
        Assert.Equal("direct-message::1::2", existing.ChannelId);
    }

    private static AppDbContext CreateContext()
    {
        var options = new DbContextOptionsBuilder<AppDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString("N"))
            .Options;

        return new AppDbContext(options);
    }
}
