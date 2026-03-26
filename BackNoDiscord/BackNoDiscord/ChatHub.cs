using BackNoDiscord.Security;
using BackNoDiscord.Services;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;
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
    private const int MaxSignalPayloadLength = 128_000;

    private readonly AppDbContext _context;
    private readonly CryptoService _crypto;
    private readonly ILogger<ChatHub> _logger;

    public ChatHub(AppDbContext context, CryptoService crypto, ILogger<ChatHub> logger)
    {
        _context = context;
        _crypto = crypto;
        _logger = logger;
    }

    public async Task SendScreenOffer(string targetConnectionId, string sdp)
    {
        if (string.IsNullOrWhiteSpace(targetConnectionId) ||
            string.IsNullOrWhiteSpace(sdp) ||
            sdp.Length > MaxSignalPayloadLength)
        {
            return;
        }

        await Clients.Client(targetConnectionId).SendAsync("ReceiveScreenOffer", Context.ConnectionId, sdp);
    }

    public async Task SendScreenAnswer(string targetConnectionId, string sdp)
    {
        if (string.IsNullOrWhiteSpace(targetConnectionId) ||
            string.IsNullOrWhiteSpace(sdp) ||
            sdp.Length > MaxSignalPayloadLength)
        {
            return;
        }

        await Clients.Client(targetConnectionId).SendAsync("ReceiveScreenAnswer", Context.ConnectionId, sdp);
    }

    public async Task SendIceCandidate(string targetConnectionId, string candidate)
    {
        if (string.IsNullOrWhiteSpace(targetConnectionId) ||
            string.IsNullOrWhiteSpace(candidate) ||
            candidate.Length > 8000)
        {
            return;
        }

        await Clients.Client(targetConnectionId).SendAsync("ReceiveIceCandidate", Context.ConnectionId, candidate);
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
            Content = serializedPayload,
            EncryptedContent = encrypted,
            PhotoUrl = UploadPolicies.SanitizeRelativeAssetUrl(photoUrl, "/avatars/"),
            Timestamp = DateTime.UtcNow,
            IsDeleted = false
        };

        _context.Messages.Add(msg);
        await _context.SaveChangesAsync();

        await Clients.Group(normalizedChannelId).SendAsync("ReceiveMessage", ToMessageDto(msg, payload));
    }

    public async Task<List<MessageDto>> JoinChannel(string channelId)
    {
        if (!AuthenticatedUserAccessor.TryGetAuthenticatedUser(Context.User, out _))
        {
            throw new HubException("Unauthorized");
        }

        var normalizedChannelId = UploadPolicies.TrimToLength(channelId, MaxChannelIdLength);
        if (string.IsNullOrWhiteSpace(normalizedChannelId))
        {
            throw new HubException("channelId is required");
        }

        await Groups.AddToGroupAsync(Context.ConnectionId, normalizedChannelId);

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
            Username = message.Username,
            Message = payload.Message,
            PhotoUrl = message.PhotoUrl,
            AttachmentUrl = payload.AttachmentUrl,
            AttachmentName = payload.AttachmentName,
            AttachmentSize = payload.AttachmentSize,
            AttachmentContentType = payload.AttachmentContentType,
            Timestamp = message.Timestamp
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
}

public class MessageDto
{
    public int Id { get; set; }
    public string Username { get; set; } = string.Empty;
    public string Message { get; set; } = string.Empty;
    public string? PhotoUrl { get; set; }
    public string? AttachmentUrl { get; set; }
    public string? AttachmentName { get; set; }
    public long? AttachmentSize { get; set; }
    public string? AttachmentContentType { get; set; }
    public DateTime Timestamp { get; set; }
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
