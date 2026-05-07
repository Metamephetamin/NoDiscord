using BackNoDiscord.Security;
using BackNoDiscord.Services;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;

namespace BackNoDiscord.Tests.Security;

public sealed class ChatFileAccessServiceTests
{
    [Fact]
    public async Task CanAccessFileAsync_AllowsOwnerForUnboundUpload()
    {
        await using var context = CreateContext();
        var service = CreateService(context);
        context.ChatFileUploads.Add(new ChatFileUploadRecord
        {
            FileName = "chat-42-owner.png",
            OwnerUserId = "42",
            DisplayFileName = "owner.png",
            ContentType = "image/png",
            Size = 12,
            CreatedAt = DateTimeOffset.UtcNow
        });
        await context.SaveChangesAsync();

        var allowed = await service.CanAccessFileAsync("chat-42-owner.png", User("42"), CancellationToken.None);

        Assert.True(allowed);
    }

    [Fact]
    public async Task CanAccessFileAsync_AllowsDirectFriendAfterFileIsBoundToMessageChannel()
    {
        await using var context = CreateContext();
        var service = CreateService(context);
        context.Friendships.Add(new FriendshipRecord
        {
            UserLowId = 42,
            UserHighId = 84,
            CreatedAt = DateTimeOffset.UtcNow
        });
        context.ChatFileUploads.Add(new ChatFileUploadRecord
        {
            FileName = "chat-42-shared.png",
            OwnerUserId = "42",
            DisplayFileName = "shared.png",
            ContentType = "image/png",
            Size = 12,
            ChannelId = DirectMessageChannels.BuildChannelId(42, 84),
            MessageId = 123,
            CreatedAt = DateTimeOffset.UtcNow,
            BoundAt = DateTimeOffset.UtcNow
        });
        await context.SaveChangesAsync();

        var allowed = await service.CanAccessFileAsync("chat-42-shared.png", User("84"), CancellationToken.None);

        Assert.True(allowed);
    }

    [Fact]
    public async Task CanAccessFileAsync_AllowsDirectFriendForLegacyMessageAttachmentWithoutMetadata()
    {
        await using var context = CreateContext();
        var service = CreateService(context);
        var channelId = DirectMessageChannels.BuildChannelId(42, 84);
        context.Friendships.Add(new FriendshipRecord
        {
            UserLowId = 42,
            UserHighId = 84,
            CreatedAt = DateTimeOffset.UtcNow
        });
        context.Messages.Add(new Message
        {
            Id = 123,
            ChannelId = channelId,
            Username = "owner",
            Content = "__CHAT_PAYLOAD__:{\"authorUserId\":\"42\",\"attachments\":[{\"attachmentUrl\":\"/chat-files/chat-42-legacy.png\"}]}",
            Timestamp = DateTime.UtcNow,
            IsDeleted = false
        });
        await context.SaveChangesAsync();

        var allowed = await service.CanAccessFileAsync("chat-42-legacy.png", User("84"), CancellationToken.None);

        Assert.True(allowed);
    }

    [Fact]
    public async Task CanAccessFileAsync_AllowsDirectFriendForEncryptedLegacyMessageAttachmentWithoutMetadata()
    {
        await using var context = CreateContext();
        var crypto = CreateCrypto();
        var service = CreateService(context, crypto);
        var channelId = DirectMessageChannels.BuildChannelId(42, 84);
        context.Friendships.Add(new FriendshipRecord
        {
            UserLowId = 42,
            UserHighId = 84,
            CreatedAt = DateTimeOffset.UtcNow
        });
        context.Messages.Add(new Message
        {
            Id = 123,
            ChannelId = channelId,
            Username = "owner",
            EncryptedContent = crypto.Encrypt("__CHAT_PAYLOAD__:{\"authorUserId\":\"42\",\"attachments\":[{\"attachmentUrl\":\"/chat-files/chat-42-legacy.png\"}]}"),
            Timestamp = DateTime.UtcNow,
            IsDeleted = false
        });
        await context.SaveChangesAsync();

        var allowed = await service.CanAccessFileAsync("chat-42-legacy.png", User("84"), CancellationToken.None);

        Assert.True(allowed);
        var upload = await context.ChatFileUploads.SingleAsync();
        Assert.Equal("chat-42-legacy.png", upload.FileName);
        Assert.Equal(channelId, upload.ChannelId);
        Assert.Equal(123, upload.MessageId);
    }

    [Fact]
    public async Task CanAccessFileAsync_BindsEncryptedLegacyAttachmentWhenUploadRecordIsUnbound()
    {
        await using var context = CreateContext();
        var crypto = CreateCrypto();
        var service = CreateService(context, crypto);
        var channelId = DirectMessageChannels.BuildChannelId(42, 84);
        context.Friendships.Add(new FriendshipRecord
        {
            UserLowId = 42,
            UserHighId = 84,
            CreatedAt = DateTimeOffset.UtcNow
        });
        context.ChatFileUploads.Add(new ChatFileUploadRecord
        {
            FileName = "chat-42-legacy.png",
            OwnerUserId = "42",
            DisplayFileName = "legacy.png",
            ContentType = "image/png",
            Size = 12,
            CreatedAt = DateTimeOffset.UtcNow
        });
        context.Messages.Add(new Message
        {
            Id = 123,
            ChannelId = channelId,
            Username = "owner",
            EncryptedContent = crypto.Encrypt("__CHAT_PAYLOAD__:{\"authorUserId\":\"42\",\"attachments\":[{\"attachmentUrl\":\"/chat-files/chat-42-legacy.png\"}]}"),
            Timestamp = DateTime.UtcNow,
            IsDeleted = false
        });
        await context.SaveChangesAsync();

        var allowed = await service.CanAccessFileAsync("chat-42-legacy.png", User("84"), CancellationToken.None);

        Assert.True(allowed);
        var upload = await context.ChatFileUploads.SingleAsync();
        Assert.Equal(channelId, upload.ChannelId);
        Assert.Equal(123, upload.MessageId);
    }

    [Fact]
    public async Task CanAccessFileAsync_DeniesUnrelatedUserForBoundDirectFile()
    {
        await using var context = CreateContext();
        var service = CreateService(context);
        context.ChatFileUploads.Add(new ChatFileUploadRecord
        {
            FileName = "chat-42-private.png",
            OwnerUserId = "42",
            DisplayFileName = "private.png",
            ContentType = "image/png",
            Size = 12,
            ChannelId = DirectMessageChannels.BuildChannelId(42, 84),
            MessageId = 123,
            CreatedAt = DateTimeOffset.UtcNow,
            BoundAt = DateTimeOffset.UtcNow
        });
        await context.SaveChangesAsync();

        var allowed = await service.CanAccessFileAsync("chat-42-private.png", User("126"), CancellationToken.None);

        Assert.False(allowed);
    }

    [Fact]
    public async Task CanAccessFileAsync_AllowsConversationParticipantForBoundFile()
    {
        await using var context = CreateContext();
        var service = CreateService(context);
        context.GroupConversationMembers.Add(new GroupConversationMemberRecord
        {
            ConversationId = 17,
            UserId = 84,
            Role = "member",
            JoinedAt = DateTimeOffset.UtcNow,
            IsBanned = false
        });
        context.ChatFileUploads.Add(new ChatFileUploadRecord
        {
            FileName = "chat-42-group.png",
            OwnerUserId = "42",
            DisplayFileName = "group.png",
            ContentType = "image/png",
            Size = 12,
            ChannelId = ConversationChannels.BuildChatChannelId(17),
            MessageId = 123,
            CreatedAt = DateTimeOffset.UtcNow,
            BoundAt = DateTimeOffset.UtcNow
        });
        await context.SaveChangesAsync();

        var allowed = await service.CanAccessFileAsync("chat-42-group.png", User("84"), CancellationToken.None);

        Assert.True(allowed);
    }

    [Fact]
    public async Task CanAccessFileAsync_DeniesBannedConversationParticipantForBoundFile()
    {
        await using var context = CreateContext();
        var service = CreateService(context);
        context.GroupConversationMembers.Add(new GroupConversationMemberRecord
        {
            ConversationId = 17,
            UserId = 84,
            Role = "member",
            JoinedAt = DateTimeOffset.UtcNow,
            IsBanned = true
        });
        context.ChatFileUploads.Add(new ChatFileUploadRecord
        {
            FileName = "chat-42-group.png",
            OwnerUserId = "42",
            DisplayFileName = "group.png",
            ContentType = "image/png",
            Size = 12,
            ChannelId = ConversationChannels.BuildChatChannelId(17),
            MessageId = 123,
            CreatedAt = DateTimeOffset.UtcNow,
            BoundAt = DateTimeOffset.UtcNow
        });
        await context.SaveChangesAsync();

        var allowed = await service.CanAccessFileAsync("chat-42-group.png", User("84"), CancellationToken.None);

        Assert.False(allowed);
    }

    private static ChatFileAccessService CreateService(AppDbContext context, CryptoService? crypto = null)
    {
        return new ChatFileAccessService(context, new ServerStateService(context), crypto);
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

    private static AuthenticatedUser User(string userId)
    {
        return new AuthenticatedUser(userId, $"{userId}@example.com", $"user-{userId}", "", "");
    }

    private static AppDbContext CreateContext()
    {
        var options = new DbContextOptionsBuilder<AppDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString("N"))
            .Options;

        return new AppDbContext(options);
    }
}
