using System.Text.Json;
using BackNoDiscord;
using BackNoDiscord.Services;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;

namespace BackNoDiscord.Tests.Services;

public sealed class MessageSearchServiceTests
{
    [Fact]
    public async Task SearchAsync_ReturnsOnlyAllowedChannelMessages()
    {
        await using var context = CreateContext();
        var service = CreateService(context);
        context.Messages.AddRange(
            CreateMessage("channel-a", "Alice", "visible target"),
            CreateMessage("channel-b", "Bob", "hidden target"));
        await context.SaveChangesAsync();

        var results = await service.SearchAsync(["channel-a"], "target", 10, CancellationToken.None);

        var result = Assert.Single(results);
        Assert.Equal("channel-a", result.ChannelId);
        Assert.Equal("visible target", result.Preview);
    }

    [Fact]
    public async Task SearchAsync_TrimsQueryAndEnforcesMinimumLength()
    {
        await using var context = CreateContext();
        var service = CreateService(context);
        context.Messages.Add(CreateMessage("channel-a", "Alice", "alpha"));
        await context.SaveChangesAsync();

        var results = await service.SearchAsync(["channel-a"], " a ", 10, CancellationToken.None);

        Assert.Empty(results);
    }

    [Fact]
    public async Task SearchAsync_LimitsResultsAndExcludesDeletedMessages()
    {
        await using var context = CreateContext();
        var service = CreateService(context);
        context.Messages.AddRange(
            CreateMessage("channel-a", "Alice", "target one", timestampOffsetSeconds: -5),
            CreateMessage("channel-a", "Alice", "target two", timestampOffsetSeconds: -4),
            CreateMessage("channel-a", "Alice", "target three", timestampOffsetSeconds: -3),
            CreateMessage("channel-a", "Alice", "target deleted", isDeleted: true));
        await context.SaveChangesAsync();

        var results = await service.SearchAsync(["channel-a"], "target", 2, CancellationToken.None);

        Assert.Equal(2, results.Count);
        Assert.DoesNotContain(results, item => item.Preview.Contains("deleted", StringComparison.OrdinalIgnoreCase));
    }

    [Fact]
    public async Task SearchAsync_SearchesEncryptedPayloadText()
    {
        await using var context = CreateContext();
        var crypto = CreateCrypto();
        var service = new MessageSearchService(context, crypto);
        var payload = new ChatMessagePayload
        {
            AuthorUserId = "42",
            Message = "encrypted needle",
        };
        context.Messages.Add(new Message
        {
            ChannelId = "channel-a",
            Username = "Alice",
            EncryptedContent = crypto.Encrypt($"__CHAT_PAYLOAD__:{JsonSerializer.Serialize(payload)}"),
            Timestamp = DateTime.UtcNow,
        });
        await context.SaveChangesAsync();

        var results = await service.SearchAsync(["channel-a"], "needle", 10, CancellationToken.None);

        var result = Assert.Single(results);
        Assert.Equal("encrypted needle", result.Preview);
        Assert.Equal("42", result.AuthorUserId);
    }

    private static Message CreateMessage(
        string channelId,
        string username,
        string content,
        bool isDeleted = false,
        int timestampOffsetSeconds = 0)
    {
        return new Message
        {
            ChannelId = channelId,
            Username = username,
            Content = content,
            Timestamp = DateTime.UtcNow.AddSeconds(timestampOffsetSeconds),
            IsDeleted = isDeleted,
        };
    }

    private static MessageSearchService CreateService(AppDbContext context) =>
        new(context, CreateCrypto());

    private static AppDbContext CreateContext()
    {
        var options = new DbContextOptionsBuilder<AppDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString("N"))
            .Options;

        return new AppDbContext(options);
    }

    private static CryptoService CreateCrypto()
    {
        var configuration = new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["Crypto:Key"] = "0123456789abcdef0123456789abcdef"
            })
            .Build();
        return new CryptoService(configuration);
    }
}
