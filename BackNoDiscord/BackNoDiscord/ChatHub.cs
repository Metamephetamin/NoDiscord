using BackNoDiscord.Security;
using BackNoDiscord.Services;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;
using System.Collections.Concurrent;
using System.Text.Json;

namespace BackNoDiscord;

[Authorize(AuthenticationSchemes = JwtBearerDefaults.AuthenticationScheme)]
public class ChatHub : Hub
{
    private const string MessagePayloadPrefix = "__CHAT_PAYLOAD__:";
    private const int MaxChannelIdLength = 160;
    private const int MaxMessageLength = 4000;
    private const int MaxAttachmentUrlLength = 260;
    private const int MaxAttachmentContentTypeLength = 120;
    private const int MaxReactionKeyLength = 32;
    private const int MaxReactionGlyphLength = 16;
    private const int MaxForwardBatchSize = 30;
    private const string DirectMessageChannelPrefix = "dm:";
    private static readonly TimeSpan MessageSendCooldown = TimeSpan.FromSeconds(1.5);
    private static readonly ConcurrentDictionary<string, DateTime> LastMessageSentAtByUser = new();

    private readonly AppDbContext _context;
    private readonly CryptoService _crypto;
    private readonly ILogger<ChatHub> _logger;
    private readonly ServerStateService _serverState;

    public ChatHub(AppDbContext context, CryptoService crypto, ILogger<ChatHub> logger, ServerStateService serverState)
    {
        _context = context;
        _crypto = crypto;
        _logger = logger;
        _serverState = serverState;
    }

    public async Task SendMessage(
        string channelId,
        string username,
        string message,
        string photoUrl,
        string? attachmentUrl = null,
        string? attachmentName = null,
        long? attachmentSize = null,
        string? attachmentContentType = null)
    {
        if (!AuthenticatedUserAccessor.TryGetAuthenticatedUser(Context.User, out var currentUser))
        {
            throw new HubException("Unauthorized");
        }

        var normalizedChannelId = UploadPolicies.TrimToLength(channelId, MaxChannelIdLength);
        if (string.IsNullOrWhiteSpace(normalizedChannelId))
        {
            throw new HubException("channelId is required");
        }

        if (!TryAuthorizeChannelAccess(normalizedChannelId, currentUser))
        {
            throw new HubException("Forbidden");
        }

        if (LastMessageSentAtByUser.TryGetValue(currentUser.UserId, out var lastMessageSentAtUtc)
            && DateTime.UtcNow - lastMessageSentAtUtc < MessageSendCooldown)
        {
            throw new HubException("Подождите 1.5 секунды перед следующим сообщением.");
        }

        var payload = new ChatMessagePayload
        {
            AuthorUserId = currentUser.UserId,
            Message = UploadPolicies.TrimToLength(message, MaxMessageLength),
            AttachmentUrl = UploadPolicies.SanitizeRelativeAssetUrl(attachmentUrl, "/chat-files/"),
            AttachmentName = string.IsNullOrWhiteSpace(attachmentUrl)
                ? null
                : UploadPolicies.SanitizeDisplayFileName(attachmentName),
            AttachmentSize = attachmentSize,
            AttachmentContentType = UploadPolicies.TrimToLength(attachmentContentType, MaxAttachmentContentTypeLength)
        };

        if (string.IsNullOrWhiteSpace(payload.Message) && string.IsNullOrWhiteSpace(payload.AttachmentUrl))
        {
            throw new HubException("message or attachment is required");
        }

        if (!string.IsNullOrWhiteSpace(payload.AttachmentUrl) && payload.AttachmentUrl.Length > MaxAttachmentUrlLength)
        {
            throw new HubException("attachmentUrl is too long");
        }

        var serializedPayload = SerializePayload(payload);
        var encrypted = _crypto.Encrypt(serializedPayload);

        var msg = new Message
        {
            ChannelId = normalizedChannelId,
            Username = currentUser.DisplayName,
            Content = null,
            EncryptedContent = encrypted,
            PhotoUrl = UploadPolicies.SanitizeRelativeAssetUrl(photoUrl, "/avatars/"),
            Timestamp = DateTime.UtcNow,
            IsDeleted = false
        };

        _context.Messages.Add(msg);
        try
        {
            await _context.SaveChangesAsync();
        }
        catch (DbUpdateException ex)
        {
            _logger.LogError(ex, "Failed to persist chat message for channel {ChannelId}", normalizedChannelId);
            throw new HubException("Не удалось сохранить сообщение. Перезапустите backend, чтобы он обновил схему базы данных.");
        }

        await Clients.Group(normalizedChannelId).SendAsync("ReceiveMessage", ToMessageDto(msg, payload));
        LastMessageSentAtByUser[currentUser.UserId] = DateTime.UtcNow;
    }

    public async Task ForwardMessages(string channelId, string photoUrl, List<ForwardMessageInput>? items)
    {
        if (!AuthenticatedUserAccessor.TryGetAuthenticatedUser(Context.User, out var currentUser))
        {
            throw new HubException("Unauthorized");
        }

        var normalizedChannelId = UploadPolicies.TrimToLength(channelId, MaxChannelIdLength);
        if (string.IsNullOrWhiteSpace(normalizedChannelId))
        {
            throw new HubException("channelId is required");
        }

        if (!TryAuthorizeChannelAccess(normalizedChannelId, currentUser))
        {
            throw new HubException("Forbidden");
        }

        var sourceItems = items ?? [];
        if (sourceItems.Count == 0)
        {
            throw new HubException("messages are required");
        }

        if (LastMessageSentAtByUser.TryGetValue(currentUser.UserId, out var lastMessageSentAtUtc)
            && DateTime.UtcNow - lastMessageSentAtUtc < MessageSendCooldown)
        {
            throw new HubException("Подождите 1.5 секунды перед следующим сообщением.");
        }

        var authorPhotoUrl = UploadPolicies.SanitizeRelativeAssetUrl(photoUrl, "/avatars/");
        var timestampBase = DateTime.UtcNow;
        var forwardedMessages = new List<(Message Entity, ChatMessagePayload Payload)>();

        foreach (var item in sourceItems.Take(MaxForwardBatchSize))
        {
            var payload = new ChatMessagePayload
            {
                AuthorUserId = currentUser.UserId,
                Message = UploadPolicies.TrimToLength(item.Message, MaxMessageLength),
                ForwardedFromUserId = UploadPolicies.TrimToLength(item.ForwardedFromUserId, 64),
                ForwardedFromUsername = UploadPolicies.TrimToLength(item.ForwardedFromUsername, 160),
                AttachmentUrl = UploadPolicies.SanitizeRelativeAssetUrl(item.AttachmentUrl, "/chat-files/"),
                AttachmentName = string.IsNullOrWhiteSpace(item.AttachmentUrl)
                    ? null
                    : UploadPolicies.SanitizeDisplayFileName(item.AttachmentName),
                AttachmentSize = item.AttachmentSize,
                AttachmentContentType = UploadPolicies.TrimToLength(item.AttachmentContentType, MaxAttachmentContentTypeLength)
            };

            if (string.IsNullOrWhiteSpace(payload.Message) && string.IsNullOrWhiteSpace(payload.AttachmentUrl))
            {
                continue;
            }

            if (!string.IsNullOrWhiteSpace(payload.AttachmentUrl) && payload.AttachmentUrl.Length > MaxAttachmentUrlLength)
            {
                throw new HubException("attachmentUrl is too long");
            }

            var entity = new Message
            {
                ChannelId = normalizedChannelId,
                Username = currentUser.DisplayName,
                Content = null,
                EncryptedContent = _crypto.Encrypt(SerializePayload(payload)),
                PhotoUrl = authorPhotoUrl,
                Timestamp = timestampBase.AddMilliseconds(forwardedMessages.Count),
                IsDeleted = false
            };

            _context.Messages.Add(entity);
            forwardedMessages.Add((entity, payload));
        }

        if (forwardedMessages.Count == 0)
        {
            throw new HubException("messages are required");
        }

        try
        {
            await _context.SaveChangesAsync();
        }
        catch (DbUpdateException ex)
        {
            _logger.LogError(ex, "Failed to forward chat messages for channel {ChannelId}", normalizedChannelId);
            throw new HubException("Не удалось переслать сообщения.");
        }

        foreach (var forwardedMessage in forwardedMessages)
        {
            await Clients.Group(normalizedChannelId).SendAsync("ReceiveMessage", ToMessageDto(forwardedMessage.Entity, forwardedMessage.Payload));
        }

        LastMessageSentAtByUser[currentUser.UserId] = DateTime.UtcNow;
    }

    public async Task<List<MessageDto>> JoinChannel(string channelId)
    {
        if (!AuthenticatedUserAccessor.TryGetAuthenticatedUser(Context.User, out var currentUser))
        {
            throw new HubException("Unauthorized");
        }

        var normalizedChannelId = UploadPolicies.TrimToLength(channelId, MaxChannelIdLength);
        if (string.IsNullOrWhiteSpace(normalizedChannelId))
        {
            throw new HubException("channelId is required");
        }

        if (!TryAuthorizeChannelAccess(normalizedChannelId, currentUser))
        {
            throw new HubException("Forbidden");
        }

        await Groups.AddToGroupAsync(Context.ConnectionId, normalizedChannelId);
        await MarkDirectMessagesAsReadAsync(normalizedChannelId, currentUser);

        var lastMessages = await _context.Messages.AsNoTracking()
            .Where(message => message.ChannelId == normalizedChannelId && !message.IsDeleted)
            .OrderByDescending(message => message.Timestamp)
            .Take(100)
            .OrderBy(message => message.Timestamp)
            .ToListAsync();

        var reactionsByMessageId = await BuildReactionMapAsync(lastMessages.Select(message => message.Id));

        return lastMessages
            .Select(message => ToMessageDto(
                message,
                DeserializePayload(GetRawPayload(message)),
                reactionsByMessageId.TryGetValue(message.Id, out var reactions) ? reactions : []))
            .ToList();
    }

    public async Task MarkChannelRead(string channelId)
    {
        if (!AuthenticatedUserAccessor.TryGetAuthenticatedUser(Context.User, out var currentUser))
        {
            throw new HubException("Unauthorized");
        }

        var normalizedChannelId = UploadPolicies.TrimToLength(channelId, MaxChannelIdLength);
        if (string.IsNullOrWhiteSpace(normalizedChannelId))
        {
            throw new HubException("channelId is required");
        }

        if (!TryAuthorizeChannelAccess(normalizedChannelId, currentUser))
        {
            throw new HubException("Forbidden");
        }

        await MarkDirectMessagesAsReadAsync(normalizedChannelId, currentUser);
    }

    public async Task LeaveChannel(string channelId)
    {
        if (!AuthenticatedUserAccessor.TryGetAuthenticatedUser(Context.User, out _))
        {
            return;
        }

        var normalizedChannelId = UploadPolicies.TrimToLength(channelId, MaxChannelIdLength);
        if (string.IsNullOrWhiteSpace(normalizedChannelId))
        {
            return;
        }

        await Groups.RemoveFromGroupAsync(Context.ConnectionId, normalizedChannelId);
    }

    public async Task DeleteMessage(int messageId)
    {
        if (!AuthenticatedUserAccessor.TryGetAuthenticatedUser(Context.User, out var currentUser))
        {
            throw new HubException("Unauthorized");
        }

        var msg = await _context.Messages.FirstOrDefaultAsync(message => message.Id == messageId);
        if (msg == null)
        {
            return;
        }

        var payload = DeserializePayload(GetRawPayload(msg));
        if (!string.IsNullOrWhiteSpace(payload.AuthorUserId))
        {
            if (!string.Equals(payload.AuthorUserId, currentUser.UserId, StringComparison.Ordinal))
            {
                throw new HubException("You can delete only your own messages.");
            }
        }
        else
        {
            throw new HubException("Legacy messages without a trusted author id cannot be deleted securely.");
        }

        msg.IsDeleted = true;
        await _context.SaveChangesAsync();

        await Clients.Group(msg.ChannelId).SendAsync("MessageDeleted", messageId);
    }

    public async Task ToggleReaction(int messageId, string reactionKey, string reactionGlyph)
    {
        if (!AuthenticatedUserAccessor.TryGetAuthenticatedUser(Context.User, out var currentUser))
        {
            throw new HubException("Unauthorized");
        }

        var message = await _context.Messages
            .AsNoTracking()
            .FirstOrDefaultAsync(item => item.Id == messageId && !item.IsDeleted);

        if (message == null)
        {
            throw new HubException("Message not found.");
        }

        if (!TryAuthorizeChannelAccess(message.ChannelId, currentUser))
        {
            throw new HubException("Forbidden");
        }

        var normalizedReactionKey = UploadPolicies.TrimToLength(reactionKey, MaxReactionKeyLength);
        var normalizedReactionGlyph = UploadPolicies.TrimToLength(reactionGlyph, MaxReactionGlyphLength);
        if (string.IsNullOrWhiteSpace(normalizedReactionKey) || string.IsNullOrWhiteSpace(normalizedReactionGlyph))
        {
            throw new HubException("Reaction is required.");
        }

        var existingReaction = await _context.MessageReactions.FirstOrDefaultAsync(item =>
            item.MessageId == messageId
            && item.ReactorUserId == currentUser.UserId
            && item.ReactionKey == normalizedReactionKey);

        if (existingReaction != null)
        {
            _context.MessageReactions.Remove(existingReaction);
        }
        else
        {
            _context.MessageReactions.Add(new MessageReactionRecord
            {
                MessageId = messageId,
                ChannelId = message.ChannelId,
                ReactorUserId = currentUser.UserId,
                ReactionKey = normalizedReactionKey,
                ReactionGlyph = normalizedReactionGlyph,
                CreatedAt = DateTimeOffset.UtcNow
            });
        }

        await _context.SaveChangesAsync();

        var reactionsByMessageId = await BuildReactionMapAsync([messageId]);
        await Clients.Group(message.ChannelId).SendAsync("MessageReactionsUpdated", new MessageReactionsUpdatedDto
        {
            MessageId = messageId,
            Reactions = reactionsByMessageId.TryGetValue(messageId, out var reactions) ? reactions : []
        });
    }

    private static MessageDto ToMessageDto(Message message, ChatMessagePayload payload, List<MessageReactionDto>? reactions = null)
    {
        return new MessageDto
        {
            Id = message.Id,
            ChannelId = message.ChannelId,
            AuthorUserId = payload.AuthorUserId,
            Username = message.Username,
            Message = payload.Message,
            ForwardedFromUserId = payload.ForwardedFromUserId,
            ForwardedFromUsername = payload.ForwardedFromUsername,
            PhotoUrl = message.PhotoUrl,
            AttachmentUrl = payload.AttachmentUrl,
            AttachmentName = payload.AttachmentName,
            AttachmentSize = payload.AttachmentSize,
            AttachmentContentType = payload.AttachmentContentType,
            Timestamp = message.Timestamp,
            IsRead = message.ReadAt.HasValue,
            ReadAt = message.ReadAt,
            ReadByUserId = message.ReadByUserId,
            Reactions = reactions ?? []
        };
    }

    private static string SerializePayload(ChatMessagePayload payload)
    {
        return $"{MessagePayloadPrefix}{JsonSerializer.Serialize(payload)}";
    }

    private static ChatMessagePayload DeserializePayload(string raw)
    {
        if (string.IsNullOrWhiteSpace(raw))
        {
            return new ChatMessagePayload();
        }

        if (!raw.StartsWith(MessagePayloadPrefix, StringComparison.Ordinal))
        {
            return new ChatMessagePayload { Message = raw };
        }

        try
        {
            return JsonSerializer.Deserialize<ChatMessagePayload>(raw[MessagePayloadPrefix.Length..]) ?? new ChatMessagePayload();
        }
        catch
        {
            return new ChatMessagePayload { Message = raw };
        }
    }

    private string GetRawPayload(Message message)
    {
        if (string.IsNullOrWhiteSpace(message.EncryptedContent))
        {
            return message.Content ?? string.Empty;
        }

        try
        {
            return _crypto.Decrypt(message.EncryptedContent);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(
                ex,
                "Failed to decrypt chat message {MessageId} in channel {ChannelId}. Falling back to plain content.",
                message.Id,
                message.ChannelId);
            return message.Content ?? string.Empty;
        }
    }

    private async Task<Dictionary<int, List<MessageReactionDto>>> BuildReactionMapAsync(IEnumerable<int> messageIds)
    {
        var normalizedMessageIds = messageIds
            .Distinct()
            .Where(messageId => messageId > 0)
            .ToArray();

        if (normalizedMessageIds.Length == 0)
        {
            return [];
        }

        var rawReactions = await _context.MessageReactions
            .AsNoTracking()
            .Where(item => normalizedMessageIds.Contains(item.MessageId))
            .OrderBy(item => item.CreatedAt)
            .ToListAsync();

        var reactorUserIds = rawReactions
            .Select(item => item.ReactorUserId)
            .Distinct(StringComparer.Ordinal)
            .ToArray();

        var reactorNumericIds = reactorUserIds
            .Select(userId => int.TryParse(userId, out var parsedUserId) ? parsedUserId : 0)
            .Where(userId => userId > 0)
            .Distinct()
            .ToArray();

        var reactorUsers = reactorNumericIds.Length == 0
            ? []
            : await _context.Users
                .AsNoTracking()
                .Where(user => reactorNumericIds.Contains(user.id))
                .ToListAsync();

        var reactorLookup = reactorUsers.ToDictionary(
            user => user.id.ToString(),
            user =>
            {
                var displayName = $"{user.first_name} {user.last_name}".Trim();
                return new MessageReactionUserDto
                {
                    UserId = user.id.ToString(),
                    DisplayName = string.IsNullOrWhiteSpace(displayName) ? (user.email ?? "User") : displayName,
                    AvatarUrl = user.avatar_url
                };
            },
            StringComparer.Ordinal);

        return rawReactions
            .GroupBy(item => item.MessageId)
            .ToDictionary(
                group => group.Key,
                group => group
                    .GroupBy(item => new { item.ReactionKey, item.ReactionGlyph })
                    .Select(reactionGroup => new MessageReactionDto
                    {
                        Key = reactionGroup.Key.ReactionKey,
                        Glyph = reactionGroup.Key.ReactionGlyph,
                        Count = reactionGroup.Count(),
                        ReactorUserIds = reactionGroup
                            .Select(item => item.ReactorUserId)
                            .Where(item => !string.IsNullOrWhiteSpace(item))
                            .Distinct()
                            .ToList(),
                        Users = reactionGroup
                            .Select(item =>
                            {
                                if (reactorLookup.TryGetValue(item.ReactorUserId, out var user))
                                {
                                    return user;
                                }

                                return new MessageReactionUserDto
                                {
                                    UserId = item.ReactorUserId,
                                    DisplayName = item.ReactorUserId,
                                    AvatarUrl = null
                                };
                            })
                            .GroupBy(user => user.UserId, StringComparer.Ordinal)
                            .Select(userGroup => userGroup.First())
                            .ToList()
                    })
                    .OrderByDescending(item => item.Count)
                    .ThenBy(item => item.Key, StringComparer.Ordinal)
                    .ToList());
    }

    private bool TryAuthorizeChannelAccess(string channelId, AuthenticatedUser currentUser)
    {
        if (TryGetDirectMessageParticipantIds(channelId, out var firstUserId, out var secondUserId))
        {
            return CanAccessDirectChannel(currentUser.UserId, firstUserId, secondUserId);
        }

        if (!ServerChannelAuthorization.TryGetServerIdFromChatChannelId(channelId, out var serverId))
        {
            return false;
        }

        var snapshot = _serverState.GetSnapshot(serverId);
        return ServerChannelAuthorization.CanAccessServer(serverId, currentUser, snapshot);
    }

    private bool CanAccessDirectChannel(string currentUserId, int firstUserId, int secondUserId)
    {
        if (!int.TryParse(currentUserId, out var actorUserId))
        {
            return false;
        }

        if (actorUserId != firstUserId && actorUserId != secondUserId)
        {
            return false;
        }

        var lowId = Math.Min(firstUserId, secondUserId);
        var highId = Math.Max(firstUserId, secondUserId);

        return _context.Friendships
            .AsNoTracking()
            .Any(item => item.UserLowId == lowId && item.UserHighId == highId);
    }

    private async Task MarkDirectMessagesAsReadAsync(string channelId, AuthenticatedUser currentUser)
    {
        if (!TryGetDirectMessageParticipantIds(channelId, out _, out _))
        {
            return;
        }

        var unreadMessages = await _context.Messages
            .Where(message => message.ChannelId == channelId && !message.IsDeleted && message.ReadAt == null)
            .OrderBy(message => message.Timestamp)
            .ToListAsync();

        if (unreadMessages.Count == 0)
        {
            return;
        }

        var readAtUtc = DateTime.UtcNow;
        var readMessageIds = new List<int>();

        foreach (var unreadMessage in unreadMessages)
        {
            var payload = DeserializePayload(GetRawPayload(unreadMessage));
            if (string.Equals(payload.AuthorUserId, currentUser.UserId, StringComparison.Ordinal))
            {
                continue;
            }

            unreadMessage.ReadAt = readAtUtc;
            unreadMessage.ReadByUserId = currentUser.UserId;
            readMessageIds.Add(unreadMessage.Id);
        }

        if (readMessageIds.Count == 0)
        {
            return;
        }

        await _context.SaveChangesAsync();

        await Clients.Group(channelId).SendAsync("MessagesRead", new MessageReadReceiptDto
        {
            ChannelId = channelId,
            ReaderUserId = currentUser.UserId,
            MessageIds = readMessageIds,
            ReadAt = readAtUtc
        });
    }

    private static bool TryGetDirectMessageParticipantIds(string channelId, out int firstUserId, out int secondUserId)
    {
        firstUserId = 0;
        secondUserId = 0;

        var normalizedChannelId = channelId?.Trim() ?? string.Empty;
        if (!normalizedChannelId.StartsWith(DirectMessageChannelPrefix, StringComparison.OrdinalIgnoreCase))
        {
            return false;
        }

        var parts = normalizedChannelId.Split(':', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
        if (parts.Length != 3)
        {
            return false;
        }

        return int.TryParse(parts[1], out firstUserId) &&
               int.TryParse(parts[2], out secondUserId) &&
               firstUserId > 0 &&
               secondUserId > 0 &&
               firstUserId != secondUserId;
    }
}

public class MessageDto
{
    public int Id { get; set; }
    public string ChannelId { get; set; } = string.Empty;
    public string AuthorUserId { get; set; } = string.Empty;
    public string Username { get; set; } = string.Empty;
    public string Message { get; set; } = string.Empty;
    public string? ForwardedFromUserId { get; set; }
    public string? ForwardedFromUsername { get; set; }
    public string? PhotoUrl { get; set; }
    public string? AttachmentUrl { get; set; }
    public string? AttachmentName { get; set; }
    public long? AttachmentSize { get; set; }
    public string? AttachmentContentType { get; set; }
    public DateTime Timestamp { get; set; }
    public bool IsRead { get; set; }
    public DateTime? ReadAt { get; set; }
    public string? ReadByUserId { get; set; }
    public List<MessageReactionDto> Reactions { get; set; } = [];
}

public class MessageReadReceiptDto
{
    public string ChannelId { get; set; } = string.Empty;
    public string ReaderUserId { get; set; } = string.Empty;
    public List<int> MessageIds { get; set; } = [];
    public DateTime ReadAt { get; set; }
}

public class MessageReactionDto
{
    public string Key { get; set; } = string.Empty;
    public string Glyph { get; set; } = string.Empty;
    public int Count { get; set; }
    public List<string> ReactorUserIds { get; set; } = [];
    public List<MessageReactionUserDto> Users { get; set; } = [];
}

public class MessageReactionUserDto
{
    public string UserId { get; set; } = string.Empty;
    public string DisplayName { get; set; } = string.Empty;
    public string? AvatarUrl { get; set; }
}

public class MessageReactionsUpdatedDto
{
    public int MessageId { get; set; }
    public List<MessageReactionDto> Reactions { get; set; } = [];
}

public class ChatMessagePayload
{
    public string AuthorUserId { get; set; } = string.Empty;
    public string Message { get; set; } = string.Empty;
    public string? ForwardedFromUserId { get; set; }
    public string? ForwardedFromUsername { get; set; }
    public string? AttachmentUrl { get; set; }
    public string? AttachmentName { get; set; }
    public long? AttachmentSize { get; set; }
    public string? AttachmentContentType { get; set; }
}

public class ForwardMessageInput
{
    public string Message { get; set; } = string.Empty;
    public string? ForwardedFromUserId { get; set; }
    public string? ForwardedFromUsername { get; set; }
    public string? AttachmentUrl { get; set; }
    public string? AttachmentName { get; set; }
    public long? AttachmentSize { get; set; }
    public string? AttachmentContentType { get; set; }
}
