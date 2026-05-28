using BackNoDiscord.Services;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging.Abstractions;

namespace BackNoDiscord.Tests.Services;

public sealed class ChatFileMetadataRepairServiceTests
{
    [Fact]
    public async Task RepairAsync_BindsEncryptedLegacyAttachmentMetadata()
    {
        await using var context = CreateContext();
        var crypto = CreateCrypto();
        var accessService = new ChatFileAccessService(context, new ServerStateService(context));
        var repairService = new ChatFileMetadataRepairService(context, crypto, accessService);
        var channelId = DirectMessageChannels.BuildChannelId(42, 84);
        var encryptedPayload = crypto.Encrypt("__CHAT_PAYLOAD__:{\"authorUserId\":\"42\",\"attachments\":[{\"attachmentUrl\":\"/chat-files/chat-42-legacy.png\",\"attachmentName\":\"legacy.png\",\"attachmentContentType\":\"image/png\",\"attachmentSize\":12}]}");
        context.Messages.Add(new Message
        {
            Id = 123,
            ChannelId = channelId,
            Username = "owner",
            EncryptedContent = encryptedPayload,
            Timestamp = DateTime.UtcNow,
            IsDeleted = false
        });
        await context.SaveChangesAsync();

        var repaired = await repairService.RepairAsync(batchSize: 50, CancellationToken.None);

        Assert.Equal(1, repaired);
        var upload = await context.ChatFileUploads.SingleAsync();
        Assert.Equal("chat-42-legacy.png", upload.FileName);
        Assert.Equal("42", upload.OwnerUserId);
        Assert.Equal(channelId, upload.ChannelId);
        Assert.Equal(123, upload.MessageId);

        var secondRun = await repairService.RepairAsync(batchSize: 50, CancellationToken.None);

        Assert.Equal(0, secondRun);
    }

    [Fact]
    public async Task HostedRepair_DoesNotResolveRepairServiceWhenLockIsUnavailable()
    {
        var services = new ServiceCollection();
        services.AddSingleton<IDistributedJobLock>(new DenyingDistributedJobLock());
        await using var provider = services.BuildServiceProvider();
        var configuration = new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["ChatFiles:RepairLegacyMetadataOnStartup"] = "true"
            })
            .Build();
        var hostedService = new ChatFileMetadataRepairHostedService(
            provider.GetRequiredService<IServiceScopeFactory>(),
            configuration,
            NullLogger<ChatFileMetadataRepairHostedService>.Instance);

        await hostedService.RunRepairOnceAsync(CancellationToken.None);
    }

    private static CryptoService CreateCrypto()
    {
        var configuration = new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["Crypto:Key"] = "01234567890123456789012345678901"
            })
            .Build();

        return new CryptoService(configuration);
    }

    private static AppDbContext CreateContext()
    {
        var options = new DbContextOptionsBuilder<AppDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString("N"))
            .Options;

        return new AppDbContext(options);
    }

    private sealed class DenyingDistributedJobLock : IDistributedJobLock
    {
        public Task<IAsyncDisposable?> TryAcquireAsync(string key, TimeSpan ttl, CancellationToken cancellationToken) =>
            Task.FromResult<IAsyncDisposable?>(null);
    }
}
