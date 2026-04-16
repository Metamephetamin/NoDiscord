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
    private const int MaxAttachmentsPerMessage = 12;
    private const int MaxReactionKeyLength = 32;
    private const int MaxReactionGlyphLength = 16;
    private const int MaxMentionHandleLength = 80;
    private const int MaxMentionDisplayNameLength = 160;
    private const int MaxMentionsPerMessage = 24;
    private const int MaxForwardBatchSize = 30;
    private const int MaxVoiceWaveformBars = 96;
    private const int MaxVoiceMimeTypeLength = 120;
    private const int MaxVoiceFileNameLength = 160;
    private static readonly TimeSpan MessageSendCooldown = TimeSpan.FromSeconds(1.5);
    private static readonly TimeSpan ForwardCooldown = TimeSpan.FromMilliseconds(900);
    private static readonly TimeSpan MessageMutationCooldown = TimeSpan.FromMilliseconds(350);
    private static readonly ConcurrentDictionary<string, DateTime> LastMessageSentAtByUser = new();
    private static readonly ConcurrentDictionary<string, DateTime> LastActionAtByUserAndName = new();

    private readonly AppDbContext _context;
    private readonly CryptoService _crypto;
    private readonly ILogger<ChatHub> _logger;
    private readonly ServerStateService _serverState;
    private readonly PushNotificationService _pushNotificationService;

    public ChatHub(
        AppDbContext context,
        CryptoService crypto,
        ILogger<ChatHub> logger,
        ServerStateService serverState,
        PushNotificationService pushNotificationService)
    {
        _context = context;
        _crypto = crypto;
        _logger = logger;
        _serverState = serverState;
        _pushNotificationService = pushNotificationService;
    }

    public async Task SendMessage(
        string channelId,
        string username,
        string message,
        string photoUrl,
        string? attachmentUrl = null,
        string? attachmentName = null,
        long? attachmentSize = null,
        string? attachmentContentType = null,
        ChatMessageEncryptionEnvelope? encryption = null,
        ChatAttachmentEncryptionEnvelope? attachmentEncryption = null,
        List<ChatMentionInput>? mentions = null,
        ChatVoiceMessageInput? voiceMessage = null,
        List<ChatAttachmentInput>? attachments = null,
        string? replyToMessageId = null,
        string? replyToUsername = null,
        string? replyPreview = null)
    {
        if (!AuthenticatedUserAccessor.TryGetAuthenticatedUser(Context.User, out var currentUser))
        {
            throw new HubException("Unauthorized");
        }

        var normalizedChannelId = NormalizeChannelId(channelId);
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

        var normalizedAttachments = NormalizeAttachments(
            attachments,
            attachmentUrl,
            attachmentName,
            attachmentSize,
            attachmentContentType,
            attachmentEncryption,
            voiceMessage);

        var replyReference = await ResolveReplyReferenceAsync(normalizedChannelId, replyToMessageId, currentUser, allowMissing: false);

        var payload = new ChatMessagePayload
        {
            AuthorUserId = currentUser.UserId,
            Message = UploadPolicies.TrimToLength(message, MaxMessageLength),
            Encryption = NormalizeEncryptionEnvelope(encryption),
            ReplyToMessageId = replyReference?.MessageId,
            ReplyToUsername = replyReference?.Username,
            ReplyPreview = replyReference?.Preview,
            Attachments = normalizedAttachments,
            Mentions = NormalizeMentions(normalizedChannelId, mentions),
            VoiceMessage = normalizedAttachments.FirstOrDefault(static item => item.VoiceMessage is not null)?.VoiceMessage
        };

        ApplyLegacyAttachmentFields(payload);

        if (string.IsNullOrWhiteSpace(payload.Message) &&
            payload.Encryption is null &&
            payload.Attachments.Count == 0)
        {
            throw new HubException("message or attachment is required");
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
        await SendDirectMessagePushIfNeededAsync(normalizedChannelId, currentUser, payload);
    }

    public async Task ForwardMessages(string channelId, string photoUrl, List<ForwardMessageInput>? items)
    {
        if (!AuthenticatedUserAccessor.TryGetAuthenticatedUser(Context.User, out var currentUser))
        {
            throw new HubException("Unauthorized");
        }

        var normalizedChannelId = NormalizeChannelId(channelId);
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

        EnsureActionCooldown(currentUser.UserId, "forward", ForwardCooldown, "Подождите немного перед следующей пересылкой.");

        var authorPhotoUrl = UploadPolicies.SanitizeRelativeAssetUrl(photoUrl, "/avatars/");
        var timestampBase = DateTime.UtcNow;
        var forwardedMessages = new List<(Message Entity, ChatMessagePayload Payload)>();

        foreach (var item in sourceItems.Take(MaxForwardBatchSize))
        {
            var replyReference = await ResolveReplyReferenceAsync(normalizedChannelId, item.ReplyToMessageId, currentUser, allowMissing: true);
            var normalizedAttachments = NormalizeAttachments(
                item.Attachments,
                item.AttachmentUrl,
                item.AttachmentName,
                item.AttachmentSize,
                item.AttachmentContentType,
                item.AttachmentEncryption,
                item.VoiceMessage);

            var payload = new ChatMessagePayload
            {
                AuthorUserId = currentUser.UserId,
                Message = UploadPolicies.TrimToLength(item.Message, MaxMessageLength),
                ForwardedFromUserId = UploadPolicies.TrimToLength(item.ForwardedFromUserId, 64),
                ForwardedFromUsername = UploadPolicies.TrimToLength(item.ForwardedFromUsername, 160),
                ReplyToMessageId = replyReference?.MessageId,
                ReplyToUsername = replyReference?.Username,
                ReplyPreview = replyReference?.Preview,
                Attachments = normalizedAttachments,
                Mentions = [],
                VoiceMessage = normalizedAttachments.FirstOrDefault(static attachment => attachment.VoiceMessage is not null)?.VoiceMessage
            };

            ApplyLegacyAttachmentFields(payload);

            if (string.IsNullOrWhiteSpace(payload.Message) && payload.Attachments.Count == 0)
            {
                continue;
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

        _logger.LogInformation("User {UserId} forwarded {Count} messages to channel {ChannelId}", currentUser.UserId, forwardedMessages.Count, normalizedChannelId);
        LastMessageSentAtByUser[currentUser.UserId] = DateTime.UtcNow;

        if (forwardedMessages.Count > 0)
        {
            await SendDirectMessagePushIfNeededAsync(normalizedChannelId, currentUser, forwardedMessages[^1].Payload);
        }
    }

    public async Task<List<MessageDto>> JoinChannel(string channelId)
    {
        if (!AuthenticatedUserAccessor.TryGetAuthenticatedUser(Context.User, out var currentUser))
        {
            throw new HubException("Unauthorized");
        }

        var normalizedChannelId = NormalizeChannelId(channelId);
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

        var equivalentChannelIds = GetEquivalentChannelIds(normalizedChannelId);

        var lastMessages = await _context.Messages.AsNoTracking()
            .Where(message => equivalentChannelIds.Contains(message.ChannelId) && !message.IsDeleted)
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

        var normalizedChannelId = NormalizeChannelId(channelId);
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

        var normalizedChannelId = NormalizeChannelId(channelId);
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

        EnsureActionCooldown(currentUser.UserId, "delete", MessageMutationCooldown, "Слишком частое удаление сообщений.");

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

        _logger.LogInformation("User {UserId} deleted message {MessageId} in channel {ChannelId}", currentUser.UserId, messageId, msg.ChannelId);
        await Clients.Group(msg.ChannelId).SendAsync("MessageDeleted", messageId);
    }

    public async Task EditMessage(
        int messageId,
        string message,
        ChatMessageEncryptionEnvelope? encryption = null,
        List<ChatMentionInput>? mentions = null)
    {
        if (!AuthenticatedUserAccessor.TryGetAuthenticatedUser(Context.User, out var currentUser))
        {
            throw new HubException("Unauthorized");
        }

        EnsureActionCooldown(currentUser.UserId, "edit", MessageMutationCooldown, "Слишком частое редактирование сообщений.");

        var msg = await _context.Messages.FirstOrDefaultAsync(item => item.Id == messageId && !item.IsDeleted);
        if (msg == null)
        {
            throw new HubException("Message not found.");
        }

        if (!TryAuthorizeChannelAccess(msg.ChannelId, currentUser))
        {
            throw new HubException("Forbidden");
        }

        var payload = DeserializePayload(GetRawPayload(msg));
        if (!string.Equals(payload.AuthorUserId, currentUser.UserId, StringComparison.Ordinal))
        {
            throw new HubException("You can edit only your own messages.");
        }

        var normalizedMessage = UploadPolicies.TrimToLength(message, MaxMessageLength);
        var normalizedEncryption = NormalizeEncryptionEnvelope(encryption);
        if (string.IsNullOrWhiteSpace(normalizedMessage) && normalizedEncryption is null)
        {
            throw new HubException("message is required");
        }

        payload.Message = normalizedMessage;
        payload.Encryption = normalizedEncryption;
        payload.Mentions = NormalizeMentions(msg.ChannelId, mentions);
        payload.EditedAt = DateTime.UtcNow;

        msg.EncryptedContent = _crypto.Encrypt(SerializePayload(payload));
        msg.Content = null;

        await _context.SaveChangesAsync();

        _logger.LogInformation("User {UserId} edited message {MessageId} in channel {ChannelId}", currentUser.UserId, messageId, msg.ChannelId);
        var reactionsByMessageId = await BuildReactionMapAsync([messageId]);
        await Clients.Group(msg.ChannelId).SendAsync(
            "MessageUpdated",
            ToMessageDto(
                msg,
                payload,
                reactionsByMessageId.TryGetValue(messageId, out var reactions) ? reactions : []));
    }

    public async Task ToggleReaction(int messageId, string reactionKey, string reactionGlyph)
    {
        if (!AuthenticatedUserAccessor.TryGetAuthenticatedUser(Context.User, out var currentUser))
        {
            throw new HubException("Unauthorized");
        }

        EnsureActionCooldown(currentUser.UserId, "reaction", MessageMutationCooldown, "Слишком частое изменение реакций.");

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

        _logger.LogInformation("User {UserId} toggled reaction {ReactionKey} for message {MessageId} in channel {ChannelId}", currentUser.UserId, normalizedReactionKey, messageId, message.ChannelId);
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
            Encryption = payload.Encryption,
            ForwardedFromUserId = payload.ForwardedFromUserId,
            ForwardedFromUsername = payload.ForwardedFromUsername,
            ReplyToMessageId = payload.ReplyToMessageId,
            ReplyToUsername = payload.ReplyToUsername,
            ReplyPreview = payload.ReplyPreview,
            PhotoUrl = message.PhotoUrl,
            AttachmentEncryption = payload.AttachmentEncryption,
            AttachmentUrl = payload.AttachmentUrl,
            AttachmentName = payload.AttachmentName,
            AttachmentSize = payload.AttachmentSize,
            AttachmentContentType = payload.AttachmentContentType,
            Attachments = payload.Attachments
                .Select(attachment => new ChatAttachmentDto
                {
                    AttachmentEncryption = attachment.AttachmentEncryption,
                    AttachmentUrl = attachment.AttachmentUrl,
                    AttachmentName = attachment.AttachmentName,
                    AttachmentSize = attachment.AttachmentSize,
                    AttachmentContentType = attachment.AttachmentContentType,
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

    private static string SerializePayload(ChatMessagePayload payload)
    {
        return $"{MessagePayloadPrefix}{JsonSerializer.Serialize(payload)}";
    }

    private static ChatMessageEncryptionEnvelope? NormalizeEncryptionEnvelope(ChatMessageEncryptionEnvelope? _)
    {
        return null;
    }

    private static ChatAttachmentEncryptionEnvelope? NormalizeAttachmentEncryptionEnvelope(ChatAttachmentEncryptionEnvelope? _)
    {
        return null;
    }

    private static ChatVoiceMessagePayload? NormalizeVoiceMessage(ChatVoiceMessageInput? voiceMessage)
    {
        if (voiceMessage is null)
        {
            return null;
        }

        var durationMs = Math.Max(0, Math.Min(voiceMessage.DurationMs, 60 * 60 * 1000));
        var mimeType = UploadPolicies.TrimToLength(voiceMessage.MimeType, MaxVoiceMimeTypeLength);
        var fileName = UploadPolicies.TrimToLength(voiceMessage.FileName, MaxVoiceFileNameLength);
        var waveform = (voiceMessage.Waveform ?? [])
            .Take(MaxVoiceWaveformBars)
            .Select(sample => Math.Max(0, Math.Min(1, sample)))
            .ToList();

        if (durationMs <= 0 && waveform.Count == 0 && string.IsNullOrWhiteSpace(mimeType) && string.IsNullOrWhiteSpace(fileName))
        {
            return null;
        }

        return new ChatVoiceMessagePayload
        {
            DurationMs = durationMs,
            MimeType = mimeType,
            FileName = fileName,
            Waveform = waveform
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

    private static List<ChatAttachmentPayload> NormalizeAttachments(
        List<ChatAttachmentInput>? attachments,
        string? legacyAttachmentUrl,
        string? legacyAttachmentName,
        long? legacyAttachmentSize,
        string? legacyAttachmentContentType,
        ChatAttachmentEncryptionEnvelope? legacyAttachmentEncryption,
        ChatVoiceMessageInput? legacyVoiceMessage)
    {
        var normalized = new List<ChatAttachmentPayload>();
        foreach (var item in attachments ?? [])
        {
            var normalizedAttachment = NormalizeAttachment(item.AttachmentUrl, item.AttachmentName, item.AttachmentSize, item.AttachmentContentType, item.AttachmentEncryption, item.VoiceMessage);
            if (normalizedAttachment is not null)
            {
                normalized.Add(normalizedAttachment);
            }
        }

        if (normalized.Count == 0)
        {
            var legacyAttachment = NormalizeAttachment(
                legacyAttachmentUrl,
                legacyAttachmentName,
                legacyAttachmentSize,
                legacyAttachmentContentType,
                legacyAttachmentEncryption,
                legacyVoiceMessage);

            if (legacyAttachment is not null)
            {
                normalized.Add(legacyAttachment);
            }
        }

        if (normalized.Count > MaxAttachmentsPerMessage)
        {
            throw new HubException($"attachments limit exceeded: max {MaxAttachmentsPerMessage}");
        }

        return normalized;
    }

    private static ChatAttachmentPayload? NormalizeAttachment(
        string? attachmentUrl,
        string? attachmentName,
        long? attachmentSize,
        string? attachmentContentType,
        ChatAttachmentEncryptionEnvelope? attachmentEncryption,
        ChatVoiceMessageInput? voiceMessage)
    {
        var normalizedAttachmentUrl = UploadPolicies.SanitizeRelativeAssetUrl(attachmentUrl, "/chat-files/");
        var normalizedVoiceMessage = NormalizeVoiceMessage(voiceMessage);

        if (string.IsNullOrWhiteSpace(normalizedAttachmentUrl) && normalizedVoiceMessage is null)
        {
            return null;
        }

        if (!string.IsNullOrWhiteSpace(normalizedAttachmentUrl) && normalizedAttachmentUrl.Length > MaxAttachmentUrlLength)
        {
            throw new HubException("attachmentUrl is too long");
        }

        return new ChatAttachmentPayload
        {
            AttachmentEncryption = NormalizeAttachmentEncryptionEnvelope(attachmentEncryption),
            AttachmentUrl = normalizedAttachmentUrl,
            AttachmentName = string.IsNullOrWhiteSpace(normalizedAttachmentUrl)
                ? null
                : UploadPolicies.SanitizeDisplayFileName(attachmentName),
            AttachmentSize = attachmentSize,
            AttachmentContentType = UploadPolicies.TrimToLength(attachmentContentType, MaxAttachmentContentTypeLength),
            VoiceMessage = normalizedVoiceMessage
        };
    }

    private static void NormalizeLegacyPayload(ChatMessagePayload payload)
    {
        payload.Attachments ??= [];
        if (payload.Attachments.Count == 0)
        {
            var legacyAttachment = NormalizeAttachment(
                payload.AttachmentUrl,
                payload.AttachmentName,
                payload.AttachmentSize,
                payload.AttachmentContentType,
                payload.AttachmentEncryption,
                payload.VoiceMessage is null
                    ? null
                    : new ChatVoiceMessageInput
                    {
                        DurationMs = payload.VoiceMessage.DurationMs,
                        MimeType = payload.VoiceMessage.MimeType,
                        FileName = payload.VoiceMessage.FileName,
                        Waveform = payload.VoiceMessage.Waveform
                    });

            if (legacyAttachment is not null)
            {
                payload.Attachments.Add(legacyAttachment);
            }
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
        payload.VoiceMessage = primaryAttachment?.VoiceMessage ?? payload.VoiceMessage;
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

    private static void EnsureActionCooldown(string userId, string actionName, TimeSpan cooldown, string message)
    {
        var actionKey = $"{userId}:{actionName}";
        if (LastActionAtByUserAndName.TryGetValue(actionKey, out var lastActionAtUtc)
            && DateTime.UtcNow - lastActionAtUtc < cooldown)
        {
            throw new HubException(message);
        }

        LastActionAtByUserAndName[actionKey] = DateTime.UtcNow;
    }

    private async Task<ReplyReferenceDto?> ResolveReplyReferenceAsync(string channelId, string? replyToMessageId, AuthenticatedUser currentUser, bool allowMissing)
    {
        var normalizedReplyToMessageId = UploadPolicies.TrimToLength(replyToMessageId, 32);
        if (string.IsNullOrWhiteSpace(normalizedReplyToMessageId))
        {
            return null;
        }

        if (!int.TryParse(normalizedReplyToMessageId, out var replyMessageId) || replyMessageId <= 0)
        {
            if (allowMissing)
            {
                return null;
            }

            throw new HubException("Некорректная ссылка на исходное сообщение.");
        }

        var replyMessage = await _context.Messages
            .AsNoTracking()
            .FirstOrDefaultAsync(message => message.Id == replyMessageId && message.ChannelId == channelId && !message.IsDeleted);

        if (replyMessage is null)
        {
            if (allowMissing)
            {
                return null;
            }

            throw new HubException("Исходное сообщение для ответа не найдено.");
        }

        if (!TryAuthorizeChannelAccess(replyMessage.ChannelId, currentUser))
        {
            if (allowMissing)
            {
                return null;
            }

            throw new HubException("Нет доступа к сообщению, на которое вы отвечаете.");
        }

        var replyPayload = DeserializePayload(GetRawPayload(replyMessage));
        return new ReplyReferenceDto
        {
            MessageId = replyMessage.Id.ToString(),
            Username = UploadPolicies.TrimToLength(replyMessage.Username, 160),
            Preview = UploadPolicies.TrimToLength(BuildMessagePreview(replyPayload), 220)
        };
    }

    private static string BuildMessagePreview(ChatMessagePayload payload)
    {
        var normalizedMessage = UploadPolicies.TrimToLength(payload.Message, 220).Trim();
        if (!string.IsNullOrWhiteSpace(normalizedMessage))
        {
            return normalizedMessage;
        }

        var firstAttachment = payload.Attachments.FirstOrDefault();
        if (firstAttachment?.VoiceMessage is not null)
        {
            return "Голосовое сообщение";
        }

        var attachmentName = UploadPolicies.TrimToLength(firstAttachment?.AttachmentName, 220).Trim();
        return string.IsNullOrWhiteSpace(attachmentName) ? "Сообщение без текста" : attachmentName;
    }

    private async Task SendDirectMessagePushIfNeededAsync(string channelId, AuthenticatedUser currentUser, ChatMessagePayload payload)
    {
        if (!_pushNotificationService.IsConfigured ||
            !DirectMessageChannels.TryParse(channelId, out var firstUserId, out var secondUserId, out _) ||
            !int.TryParse(currentUser.UserId, out var actorUserId))
        {
            return;
        }

        var recipientUserId = actorUserId == firstUserId ? secondUserId : firstUserId;
        if (recipientUserId <= 0 || recipientUserId == actorUserId)
        {
            return;
        }

        await _pushNotificationService.SendToUsersAsync(
            [recipientUserId],
            new PushNotificationPayload
            {
                Title = currentUser.DisplayName,
                Body = BuildMessagePreview(payload),
                Tag = $"direct-message:{channelId}",
                Url = "/",
                Type = "direct_message",
                Data = new Dictionary<string, string>
                {
                    ["channelId"] = channelId,
                    ["authorUserId"] = currentUser.UserId,
                }
            },
            Context.ConnectionAborted);
    }

    private bool TryAuthorizeChannelAccess(string channelId, AuthenticatedUser currentUser)
    {
        var normalizedChannelId = NormalizeChannelId(channelId);
        if (DirectMessageChannels.TryParse(normalizedChannelId, out var firstUserId, out var secondUserId, out _))
        {
            return CanAccessDirectChannel(currentUser.UserId, firstUserId, secondUserId);
        }

        if (!ServerChannelAuthorization.TryGetServerIdFromChatChannelId(normalizedChannelId, out var serverId))
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

        if (firstUserId == secondUserId)
        {
            return actorUserId == firstUserId;
        }

        var lowId = Math.Min(firstUserId, secondUserId);
        var highId = Math.Max(firstUserId, secondUserId);

        return _context.Friendships
            .AsNoTracking()
            .Any(item => item.UserLowId == lowId && item.UserHighId == highId);
    }

    private async Task MarkDirectMessagesAsReadAsync(string channelId, AuthenticatedUser currentUser)
    {
        var normalizedChannelId = NormalizeChannelId(channelId);
        if (!DirectMessageChannels.TryParse(normalizedChannelId, out _, out _, out _))
        {
            return;
        }

        var equivalentChannelIds = GetEquivalentChannelIds(normalizedChannelId);

        var unreadMessages = await _context.Messages
            .Where(message => equivalentChannelIds.Contains(message.ChannelId) && !message.IsDeleted && message.ReadAt == null)
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

        await Clients.Group(normalizedChannelId).SendAsync("MessagesRead", new MessageReadReceiptDto
        {
            ChannelId = normalizedChannelId,
            ReaderUserId = currentUser.UserId,
            MessageIds = readMessageIds,
            ReadAt = readAtUtc
        });
    }

    private string NormalizeChannelId(string? channelId)
    {
        var normalizedChannelId = UploadPolicies.TrimToLength(channelId, MaxChannelIdLength);
        return DirectMessageChannels.NormalizeChannelId(normalizedChannelId);
    }

    private static IReadOnlyCollection<string> GetEquivalentChannelIds(string? channelId)
    {
        return DirectMessageChannels.GetEquivalentChannelIds(channelId);
    }

    private List<ChatMentionPayload> NormalizeMentions(string channelId, List<ChatMentionInput>? mentions)
    {
        if (mentions is null || mentions.Count == 0)
        {
            return [];
        }

        if (DirectMessageChannels.TryParse(channelId, out _, out _, out _))
        {
            return [];
        }

        if (!ServerChannelAuthorization.TryGetServerIdFromChatChannelId(channelId, out var serverId))
        {
            return [];
        }

        var memberLookup = (_serverState.GetSnapshot(serverId)?.Members ?? [])
            .Where(member => !string.IsNullOrWhiteSpace(member.UserId))
            .GroupBy(member => member.UserId.Trim(), StringComparer.Ordinal)
            .ToDictionary(
                group => group.Key,
                group => UploadPolicies.TrimToLength(group.First().Name, MaxMentionDisplayNameLength),
                StringComparer.Ordinal);

        return mentions
            .Take(MaxMentionsPerMessage)
            .Select(item =>
            {
                var userId = UploadPolicies.TrimToLength(item?.UserId, 64);
                var handle = NormalizeMentionHandle(item?.Handle);

                return string.IsNullOrWhiteSpace(userId) || !memberLookup.TryGetValue(userId, out var memberName)
                    ? null
                    : new ChatMentionPayload
                    {
                        UserId = userId,
                        Handle = handle,
                        DisplayName = string.IsNullOrWhiteSpace(memberName) ? "User" : memberName
                    };
            })
            .Where(item => item is not null)
            .GroupBy(item => item!.UserId, StringComparer.Ordinal)
            .Select(group => group.First()!)
            .ToList();
    }

    private static string NormalizeMentionHandle(string? value)
    {
        var normalized = UploadPolicies.TrimToLength(value, MaxMentionHandleLength).Trim();
        normalized = normalized.TrimStart('@');
        return string.IsNullOrWhiteSpace(normalized) ? string.Empty : normalized;
    }
}

public class MessageDto
{
    public int Id { get; set; }
    public string ChannelId { get; set; } = string.Empty;
    public string AuthorUserId { get; set; } = string.Empty;
    public string Username { get; set; } = string.Empty;
    public string Message { get; set; } = string.Empty;
    public ChatMessageEncryptionEnvelope? Encryption { get; set; }
    public ChatAttachmentEncryptionEnvelope? AttachmentEncryption { get; set; }
    public string? ForwardedFromUserId { get; set; }
    public string? ForwardedFromUsername { get; set; }
    public string? ReplyToMessageId { get; set; }
    public string? ReplyToUsername { get; set; }
    public string? ReplyPreview { get; set; }
    public string? PhotoUrl { get; set; }
    public string? AttachmentUrl { get; set; }
    public string? AttachmentName { get; set; }
    public long? AttachmentSize { get; set; }
    public string? AttachmentContentType { get; set; }
    public List<ChatAttachmentDto> Attachments { get; set; } = [];
    public ChatVoiceMessagePayload? VoiceMessage { get; set; }
    public List<MessageMentionDto> Mentions { get; set; } = [];
    public DateTime Timestamp { get; set; }
    public DateTime? EditedAt { get; set; }
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

public class MessageMentionDto
{
    public string UserId { get; set; } = string.Empty;
    public string Handle { get; set; } = string.Empty;
    public string DisplayName { get; set; } = string.Empty;
}

public class MessageReactionsUpdatedDto
{
    public int MessageId { get; set; }
    public List<MessageReactionDto> Reactions { get; set; } = [];
}

public class ReplyReferenceDto
{
    public string MessageId { get; set; } = string.Empty;
    public string Username { get; set; } = string.Empty;
    public string Preview { get; set; } = string.Empty;
}

public class ChatMessagePayload
{
    public string AuthorUserId { get; set; } = string.Empty;
    public string Message { get; set; } = string.Empty;
    public ChatMessageEncryptionEnvelope? Encryption { get; set; }
    public ChatAttachmentEncryptionEnvelope? AttachmentEncryption { get; set; }
    public string? ForwardedFromUserId { get; set; }
    public string? ForwardedFromUsername { get; set; }
    public string? ReplyToMessageId { get; set; }
    public string? ReplyToUsername { get; set; }
    public string? ReplyPreview { get; set; }
    public string? AttachmentUrl { get; set; }
    public string? AttachmentName { get; set; }
    public long? AttachmentSize { get; set; }
    public string? AttachmentContentType { get; set; }
    public List<ChatAttachmentPayload> Attachments { get; set; } = [];
    public ChatVoiceMessagePayload? VoiceMessage { get; set; }
    public List<ChatMentionPayload> Mentions { get; set; } = [];
    public DateTime? EditedAt { get; set; }
}

public class ChatAttachmentInput
{
    public ChatAttachmentEncryptionEnvelope? AttachmentEncryption { get; set; }
    public string? AttachmentUrl { get; set; }
    public string? AttachmentName { get; set; }
    public long? AttachmentSize { get; set; }
    public string? AttachmentContentType { get; set; }
    public ChatVoiceMessageInput? VoiceMessage { get; set; }
}

public class ChatAttachmentPayload
{
    public ChatAttachmentEncryptionEnvelope? AttachmentEncryption { get; set; }
    public string? AttachmentUrl { get; set; }
    public string? AttachmentName { get; set; }
    public long? AttachmentSize { get; set; }
    public string? AttachmentContentType { get; set; }
    public ChatVoiceMessagePayload? VoiceMessage { get; set; }
}

public class ChatAttachmentDto
{
    public ChatAttachmentEncryptionEnvelope? AttachmentEncryption { get; set; }
    public string? AttachmentUrl { get; set; }
    public string? AttachmentName { get; set; }
    public long? AttachmentSize { get; set; }
    public string? AttachmentContentType { get; set; }
    public ChatVoiceMessagePayload? VoiceMessage { get; set; }
}

public class ChatVoiceMessageInput
{
    public int DurationMs { get; set; }
    public string MimeType { get; set; } = string.Empty;
    public string FileName { get; set; } = string.Empty;
    public List<double> Waveform { get; set; } = [];
}

public class ChatVoiceMessagePayload
{
    public int DurationMs { get; set; }
    public string MimeType { get; set; } = string.Empty;
    public string FileName { get; set; } = string.Empty;
    public List<double> Waveform { get; set; } = [];
}

public class ChatMessageEncryptionEnvelope
{
    public string Version { get; set; } = string.Empty;
    public string Algorithm { get; set; } = string.Empty;
    public string Curve { get; set; } = string.Empty;
    public string SenderFingerprint { get; set; } = string.Empty;
    public string SenderPublicKeyJwk { get; set; } = string.Empty;
    public string SharedKeyId { get; set; } = string.Empty;
    public string Iv { get; set; } = string.Empty;
    public string Ciphertext { get; set; } = string.Empty;
    public List<ChatMessageEncryptionRecipient> Recipients { get; set; } = [];
}

public class ChatAttachmentEncryptionEnvelope
{
    public string Version { get; set; } = string.Empty;
    public string Algorithm { get; set; } = string.Empty;
    public string SharedKeyId { get; set; } = string.Empty;
    public string KeyWrapIv { get; set; } = string.Empty;
    public string WrappedFileKey { get; set; } = string.Empty;
    public string FileIv { get; set; } = string.Empty;
    public string MetadataIv { get; set; } = string.Empty;
    public string MetadataCiphertext { get; set; } = string.Empty;
}

public class ChatMessageEncryptionRecipient
{
    public string UserId { get; set; } = string.Empty;
    public string KeyFingerprint { get; set; } = string.Empty;
    public string WrapIv { get; set; } = string.Empty;
    public string WrappedKey { get; set; } = string.Empty;
}

public class ForwardMessageInput
{
    public string Message { get; set; } = string.Empty;
    public string? ForwardedFromUserId { get; set; }
    public string? ForwardedFromUsername { get; set; }
    public string? ReplyToMessageId { get; set; }
    public string? ReplyToUsername { get; set; }
    public string? ReplyPreview { get; set; }
    public ChatAttachmentEncryptionEnvelope? AttachmentEncryption { get; set; }
    public string? AttachmentUrl { get; set; }
    public string? AttachmentName { get; set; }
    public long? AttachmentSize { get; set; }
    public string? AttachmentContentType { get; set; }
    public List<ChatAttachmentInput> Attachments { get; set; } = [];
    public ChatVoiceMessageInput? VoiceMessage { get; set; }
}

public class ChatMentionInput
{
    public string UserId { get; set; } = string.Empty;
    public string Handle { get; set; } = string.Empty;
}

public class ChatMentionPayload
{
    public string UserId { get; set; } = string.Empty;
    public string Handle { get; set; } = string.Empty;
    public string DisplayName { get; set; } = string.Empty;
}
