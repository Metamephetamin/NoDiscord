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

        return lastMessages
            .Select(message => ToMessageDto(message, DeserializePayload(GetRawPayload(message))))
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
        else if (!string.Equals(msg.Username, currentUser.DisplayName, StringComparison.Ordinal))
        {
            throw new HubException("You can delete only your own messages.");
        }

        msg.IsDeleted = true;
        await _context.SaveChangesAsync();

        await Clients.Group(msg.ChannelId).SendAsync("MessageDeleted", messageId);
    }

    private static MessageDto ToMessageDto(Message message, ChatMessagePayload payload)
    {
        return new MessageDto
        {
            Id = message.Id,
            ChannelId = message.ChannelId,
            AuthorUserId = payload.AuthorUserId,
            Username = message.Username,
            Message = payload.Message,
            PhotoUrl = message.PhotoUrl,
            AttachmentUrl = payload.AttachmentUrl,
            AttachmentName = payload.AttachmentName,
            AttachmentSize = payload.AttachmentSize,
            AttachmentContentType = payload.AttachmentContentType,
            Timestamp = message.Timestamp,
            IsRead = message.ReadAt.HasValue,
            ReadAt = message.ReadAt,
            ReadByUserId = message.ReadByUserId
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
    public string? PhotoUrl { get; set; }
    public string? AttachmentUrl { get; set; }
    public string? AttachmentName { get; set; }
    public long? AttachmentSize { get; set; }
    public string? AttachmentContentType { get; set; }
    public DateTime Timestamp { get; set; }
    public bool IsRead { get; set; }
    public DateTime? ReadAt { get; set; }
    public string? ReadByUserId { get; set; }
}

public class MessageReadReceiptDto
{
    public string ChannelId { get; set; } = string.Empty;
    public string ReaderUserId { get; set; } = string.Empty;
    public List<int> MessageIds { get; set; } = [];
    public DateTime ReadAt { get; set; }
}

public class ChatMessagePayload
{
    public string AuthorUserId { get; set; } = string.Empty;
    public string Message { get; set; } = string.Empty;
    public string? AttachmentUrl { get; set; }
    public string? AttachmentName { get; set; }
    public long? AttachmentSize { get; set; }
    public string? AttachmentContentType { get; set; }
}
