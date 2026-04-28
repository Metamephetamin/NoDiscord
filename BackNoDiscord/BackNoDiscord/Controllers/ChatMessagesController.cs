using BackNoDiscord.Security;
using BackNoDiscord.Services;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using System.Text.Json;

namespace BackNoDiscord.Controllers;

[ApiController]
[Authorize(AuthenticationSchemes = JwtBearerDefaults.AuthenticationScheme)]
[Route("api/chats/{chatId}/messages")]
public sealed class ChatMessagesController : ControllerBase
{
    private const string MessagePayloadPrefix = "__CHAT_PAYLOAD__:";
    private const int MaxChannelIdLength = 160;
    private const int DefaultLimit = 50;
    private const int MaxLimit = 100;
    private const string ChatServerPrefix = "server:";
    private const string ChatChannelMarker = "::channel:";
    private const string PrivateServerPrefix = "server-";
    private const string PersonalServerPrefix = "server-main-";

    private readonly AppDbContext _context;
    private readonly CryptoService _crypto;
    private readonly ILogger<ChatMessagesController> _logger;
    private readonly ServerStateService _serverState;

    public ChatMessagesController(
        AppDbContext context,
        CryptoService crypto,
        ILogger<ChatMessagesController> logger,
        ServerStateService serverState)
    {
        _context = context;
        _crypto = crypto;
        _logger = logger;
        _serverState = serverState;
    }

    [HttpGet]
    public async Task<ActionResult<ChatMessagesPageDto>> GetMessages(
        [FromRoute] string chatId,
        [FromQuery] int? beforeMessageId,
        [FromQuery] int? limit,
        CancellationToken cancellationToken)
    {
        if (!AuthenticatedUserAccessor.TryGetAuthenticatedUser(User, out var currentUser))
        {
            return Unauthorized();
        }

        var normalizedChannelId = NormalizeChannelId(chatId);
        if (string.IsNullOrWhiteSpace(normalizedChannelId))
        {
            return BadRequest(new { message = "chatId is required" });
        }

        if (!await TryAuthorizeChannelAccessAsync(normalizedChannelId, currentUser, cancellationToken))
        {
            return Forbid();
        }

        var pageSize = Math.Max(1, Math.Min(MaxLimit, limit.GetValueOrDefault(DefaultLimit)));
        var equivalentChannelIds = GetEquivalentChannelIds(normalizedChannelId);
        var query = _context.Messages.AsNoTracking()
            .Where(message => equivalentChannelIds.Contains(message.ChannelId) && !message.IsDeleted);

        var cursorMessageId = beforeMessageId.GetValueOrDefault();
        if (cursorMessageId > 0)
        {
            query = query.Where(message => message.Id < cursorMessageId);
        }

        var descendingPage = await query
            .OrderByDescending(message => message.Id)
            .Take(pageSize + 1)
            .Select(message => new Message
            {
                Id = message.Id,
                ChannelId = message.ChannelId,
                Username = message.Username,
                Content = message.Content,
                EncryptedContent = message.EncryptedContent,
                PhotoUrl = message.PhotoUrl,
                Timestamp = message.Timestamp,
                ReadAt = message.ReadAt,
                ReadByUserId = message.ReadByUserId,
                IsDeleted = message.IsDeleted
            })
            .ToListAsync(cancellationToken);

        var hasMore = descendingPage.Count > pageSize;
        var pageMessages = descendingPage
            .Take(pageSize)
            .OrderBy(message => message.Id)
            .ToList();
        var reactionsByMessageId = await BuildReactionMapAsync(pageMessages.Select(message => message.Id), cancellationToken);

        return new ChatMessagesPageDto
        {
            Items = pageMessages
                .Select(message => ToMessageDto(
                    message,
                    DeserializePayload(GetRawPayload(message)),
                    reactionsByMessageId.TryGetValue(message.Id, out var reactions) ? reactions : []))
                .ToList(),
            HasMore = hasMore,
            NextCursor = pageMessages.Count > 0 ? pageMessages.Min(message => message.Id) : null
        };
    }

    private MessageDto ToMessageDto(Message message, ChatMessagePayload payload, List<MessageReactionDto>? reactions = null)
    {
        return new MessageDto
        {
            Id = message.Id,
            ChannelId = message.ChannelId,
            AuthorUserId = payload.AuthorUserId,
            Username = message.Username,
            Message = payload.Message,
            SystemEvent = payload.SystemEvent,
            Encryption = payload.Encryption,
            ForwardedFromUserId = payload.ForwardedFromUserId,
            ForwardedFromUsername = payload.ForwardedFromUsername,
            ReplyToMessageId = payload.ReplyToMessageId,
            ReplyToUsername = payload.ReplyToUsername,
            ReplyPreview = payload.ReplyPreview,
            ClientTempId = payload.ClientTempId,
            PhotoUrl = message.PhotoUrl,
            AttachmentEncryption = payload.AttachmentEncryption,
            AttachmentUrl = payload.AttachmentUrl,
            AttachmentName = payload.AttachmentName,
            AttachmentSize = payload.AttachmentSize,
            AttachmentContentType = payload.AttachmentContentType,
            AttachmentSpoiler = payload.AttachmentSpoiler,
            AttachmentAsFile = payload.AttachmentAsFile,
            Attachments = payload.Attachments
                .Select(attachment => new ChatAttachmentDto
                {
                    AttachmentEncryption = attachment.AttachmentEncryption,
                    AttachmentUrl = attachment.AttachmentUrl,
                    AttachmentName = attachment.AttachmentName,
                    AttachmentSize = attachment.AttachmentSize,
                    AttachmentContentType = attachment.AttachmentContentType,
                    AttachmentSpoiler = attachment.AttachmentSpoiler,
                    AttachmentAsFile = attachment.AttachmentAsFile,
                    VoiceMessage = attachment.VoiceMessage
                })
                .ToList(),
            VoiceMessage = payload.VoiceMessage,
            Mentions = payload.Mentions
                .Select(mention => new MessageMentionDto
                {
                    UserId = mention.UserId,
                    Handle = mention.Handle,
                    DisplayName = mention.DisplayName
                })
                .ToList(),
            Timestamp = message.Timestamp,
            EditedAt = payload.EditedAt,
            IsRead = message.ReadAt.HasValue,
            ReadAt = message.ReadAt,
            ReadByUserId = message.ReadByUserId,
            Reactions = reactions ?? []
        };
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
            var payload = JsonSerializer.Deserialize<ChatMessagePayload>(raw[MessagePayloadPrefix.Length..]) ?? new ChatMessagePayload();
            NormalizeLegacyPayload(payload);
            return payload;
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
            _logger.LogWarning(ex, "Failed to decrypt chat message {MessageId} in channel {ChannelId}.", message.Id, message.ChannelId);
            return message.Content ?? string.Empty;
        }
    }

    private async Task<Dictionary<int, List<MessageReactionDto>>> BuildReactionMapAsync(IEnumerable<int> messageIds, CancellationToken cancellationToken)
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
            .ToListAsync(cancellationToken);

        var reactorNumericIds = rawReactions
            .Select(item => int.TryParse(item.ReactorUserId, out var parsedUserId) ? parsedUserId : 0)
            .Where(userId => userId > 0)
            .Distinct()
            .ToArray();

        var reactorUsers = reactorNumericIds.Length == 0
            ? []
            : await _context.Users
                .AsNoTracking()
                .Where(user => reactorNumericIds.Contains(user.id))
                .Select(user => new
                {
                    user.id,
                    user.nickname,
                    user.first_name,
                    user.last_name,
                    user.email,
                    user.avatar_url
                })
                .ToListAsync(cancellationToken);

        var reactorLookup = reactorUsers.ToDictionary(
            user => user.id.ToString(),
            user =>
            {
                var displayName = string.IsNullOrWhiteSpace(user.nickname)
                    ? $"{user.first_name} {user.last_name}".Trim()
                    : user.nickname.Trim();
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
                            .Select(item => item.ReactorUserId)
                            .Where(item => !string.IsNullOrWhiteSpace(item))
                            .Distinct()
                            .Select(userId => reactorLookup.TryGetValue(userId, out var user)
                                ? user
                                : new MessageReactionUserDto
                                {
                                    UserId = userId,
                                    DisplayName = "User"
                                })
                            .ToList()
                    })
                    .ToList());
    }

    private async Task<bool> TryAuthorizeChannelAccessAsync(string channelId, AuthenticatedUser currentUser, CancellationToken cancellationToken)
    {
        var normalizedChannelId = NormalizeChannelId(channelId);
        if (ConversationChannels.TryParseChatChannelId(normalizedChannelId, out var conversationId))
        {
            return await CanAccessConversationChannelAsync(currentUser.UserId, conversationId, cancellationToken);
        }

        if (DirectMessageChannels.TryParse(normalizedChannelId, out var firstUserId, out var secondUserId, out _))
        {
            return await CanAccessDirectChannelAsync(currentUser.UserId, firstUserId, secondUserId, cancellationToken);
        }

        if (!ServerChannelAuthorization.TryGetServerIdFromChatChannelId(normalizedChannelId, out var serverId))
        {
            return false;
        }

        var snapshot = _serverState.GetSnapshot(serverId);
        return ServerChannelAuthorization.CanAccessServer(serverId, currentUser, snapshot);
    }

    private async Task<bool> CanAccessDirectChannelAsync(string currentUserId, int firstUserId, int secondUserId, CancellationToken cancellationToken)
    {
        if (!int.TryParse(currentUserId, out var actorUserId))
        {
            return false;
        }

        if (actorUserId != firstUserId && actorUserId != secondUserId)
        {
            return false;
        }

        if (firstUserId == secondUserId)
        {
            return actorUserId == firstUserId;
        }

        var lowId = Math.Min(firstUserId, secondUserId);
        var highId = Math.Max(firstUserId, secondUserId);

        return await _context.Friendships
            .AsNoTracking()
            .AnyAsync(item => item.UserLowId == lowId && item.UserHighId == highId, cancellationToken);
    }

    private async Task<bool> CanAccessConversationChannelAsync(string currentUserId, int conversationId, CancellationToken cancellationToken)
    {
        if (!int.TryParse(currentUserId, out var actorUserId) || actorUserId <= 0 || conversationId <= 0)
        {
            return false;
        }

        return await _context.GroupConversationMembers
            .AsNoTracking()
            .AnyAsync(item => item.ConversationId == conversationId && item.UserId == actorUserId && !item.IsBanned, cancellationToken);
    }

    private string NormalizeChannelId(string? channelId)
    {
        var normalizedChannelId = UploadPolicies.TrimToLength(channelId, MaxChannelIdLength);
        if (ConversationChannels.TryParseChatChannelId(normalizedChannelId, out _))
        {
            return ConversationChannels.NormalizeChatChannelId(normalizedChannelId);
        }

        return DirectMessageChannels.NormalizeChannelId(normalizedChannelId);
    }

    private IReadOnlyCollection<string> GetEquivalentChannelIds(string? channelId)
    {
        var normalizedChannelId = channelId?.Trim() ?? string.Empty;
        var equivalentChannelIds = new HashSet<string>(StringComparer.Ordinal);

        if (ConversationChannels.TryParseChatChannelId(normalizedChannelId, out _))
        {
            equivalentChannelIds.Add(ConversationChannels.NormalizeChatChannelId(normalizedChannelId));
            return equivalentChannelIds.ToList();
        }

        equivalentChannelIds.UnionWith(DirectMessageChannels.GetEquivalentChannelIds(normalizedChannelId));

        if (!TryParseServerChatChannelId(normalizedChannelId, out var serverId, out var channelPart))
        {
            return equivalentChannelIds.ToList();
        }

        equivalentChannelIds.Add(normalizedChannelId);
        if (serverId.StartsWith(PersonalServerPrefix, StringComparison.OrdinalIgnoreCase))
        {
            return equivalentChannelIds.ToList();
        }

        var snapshot = _serverState.GetSnapshot(serverId);
        var ownerUserId = snapshot?.OwnerId ?? string.Empty;
        var canonicalServerId = ServerChannelAuthorization.NormalizeSharedServerId(serverId, ownerUserId);
        AddServerChatAlias(equivalentChannelIds, canonicalServerId, channelPart);

        if (!string.IsNullOrWhiteSpace(ownerUserId) && canonicalServerId.StartsWith(PrivateServerPrefix, StringComparison.OrdinalIgnoreCase))
        {
            var suffix = canonicalServerId[PrivateServerPrefix.Length..].Trim();
            if (!string.IsNullOrWhiteSpace(suffix))
            {
                AddServerChatAlias(equivalentChannelIds, $"{PrivateServerPrefix}{SanitizeChannelScope(ownerUserId)}-{suffix}", channelPart);
            }
        }

        return equivalentChannelIds.ToList();
    }

    private static bool TryParseServerChatChannelId(string channelId, out string serverId, out string channelPart)
    {
        serverId = string.Empty;
        channelPart = string.Empty;

        if (!channelId.StartsWith(ChatServerPrefix, StringComparison.Ordinal))
        {
            return false;
        }

        var separatorIndex = channelId.IndexOf(ChatChannelMarker, StringComparison.Ordinal);
        if (separatorIndex <= ChatServerPrefix.Length)
        {
            return false;
        }

        serverId = channelId[ChatServerPrefix.Length..separatorIndex].Trim();
        channelPart = channelId[(separatorIndex + ChatChannelMarker.Length)..].Trim();
        return !string.IsNullOrWhiteSpace(serverId) && !string.IsNullOrWhiteSpace(channelPart);
    }

    private static void AddServerChatAlias(ISet<string> channelIds, string serverId, string channelPart)
    {
        if (string.IsNullOrWhiteSpace(serverId) || string.IsNullOrWhiteSpace(channelPart))
        {
            return;
        }

        channelIds.Add($"{ChatServerPrefix}{serverId.Trim()}{ChatChannelMarker}{channelPart.Trim()}");
    }

    private static string SanitizeChannelScope(string value)
    {
        var sanitized = new string((value ?? string.Empty)
            .Trim()
            .ToLowerInvariant()
            .Where(character => char.IsLetterOrDigit(character) || character is '-' or '_')
            .ToArray());

        return string.IsNullOrWhiteSpace(sanitized) ? "guest" : sanitized;
    }

    private static void NormalizeLegacyPayload(ChatMessagePayload payload)
    {
        payload.Attachments ??= [];
        if (payload.Attachments.Count == 0 && (!string.IsNullOrWhiteSpace(payload.AttachmentUrl) || payload.VoiceMessage is not null))
        {
            payload.Attachments.Add(new ChatAttachmentPayload
            {
                AttachmentEncryption = payload.AttachmentEncryption,
                AttachmentUrl = payload.AttachmentUrl,
                AttachmentName = payload.AttachmentName,
                AttachmentSize = payload.AttachmentSize,
                AttachmentContentType = payload.AttachmentContentType,
                AttachmentSpoiler = payload.AttachmentSpoiler,
                AttachmentAsFile = payload.AttachmentAsFile,
                VoiceMessage = payload.VoiceMessage
            });
        }

        ApplyLegacyAttachmentFields(payload);
    }

    private static void ApplyLegacyAttachmentFields(ChatMessagePayload payload)
    {
        var primaryAttachment = payload.Attachments.FirstOrDefault();
        payload.AttachmentEncryption = primaryAttachment?.AttachmentEncryption;
        payload.AttachmentUrl = primaryAttachment?.AttachmentUrl;
        payload.AttachmentName = primaryAttachment?.AttachmentName;
        payload.AttachmentSize = primaryAttachment?.AttachmentSize;
        payload.AttachmentContentType = primaryAttachment?.AttachmentContentType;
        payload.AttachmentSpoiler = primaryAttachment?.AttachmentSpoiler ?? payload.AttachmentSpoiler;
        payload.AttachmentAsFile = primaryAttachment?.AttachmentAsFile ?? payload.AttachmentAsFile;
        payload.VoiceMessage = primaryAttachment?.VoiceMessage ?? payload.VoiceMessage;
    }
}

public sealed class ChatMessagesPageDto
{
    public List<MessageDto> Items { get; set; } = [];
    public bool HasMore { get; set; }
    public int? NextCursor { get; set; }
}
