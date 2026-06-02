using BackNoDiscord.Security;
using BackNoDiscord.Services;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;

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
    private const string PollMessagePrefix = "[[tend-poll]]";
    private static readonly JsonSerializerOptions PollJsonOptions = new(JsonSerializerDefaults.Web);

    private readonly AppDbContext _context;
    private readonly CryptoService _crypto;
    private readonly ILogger<ChatMessagesController> _logger;
    private readonly ServerStateService _serverState;
    private readonly MessageSearchService _messageSearch;
    private readonly ChatAttachmentHistoryService _attachmentHistory;
    private readonly ChatFileAccessService _chatFileAccess;
    private readonly ChatSpamBurstLimiter _messageBurstLimiter;
    private readonly MessageDeduplicationService _messageDeduplication;
    private readonly IHubContext<ChatHub> _hubContext;
    private readonly ChatReadStateService _chatReadState;

    public ChatMessagesController(
        AppDbContext context,
        CryptoService crypto,
        ILogger<ChatMessagesController> logger,
        ServerStateService serverState,
        MessageSearchService messageSearch,
        ChatAttachmentHistoryService attachmentHistory,
        ChatFileAccessService chatFileAccess,
        ChatSpamBurstLimiter messageBurstLimiter,
        MessageDeduplicationService messageDeduplication,
        IHubContext<ChatHub> hubContext,
        ChatReadStateService chatReadState)
    {
        _context = context;
        _crypto = crypto;
        _logger = logger;
        _serverState = serverState;
        _messageSearch = messageSearch;
        _attachmentHistory = attachmentHistory;
        _chatFileAccess = chatFileAccess;
        _messageBurstLimiter = messageBurstLimiter;
        _messageDeduplication = messageDeduplication;
        _hubContext = hubContext;
        _chatReadState = chatReadState;
    }

    [HttpGet]
    public async Task<ActionResult<ChatMessagesPageDto>> GetMessages(
        [FromRoute] string chatId,
        [FromQuery] int? beforeMessageId,
        [FromQuery] int? afterMessageId,
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

        var afterCursorMessageId = afterMessageId.GetValueOrDefault();
        if (afterCursorMessageId > 0)
        {
            query = query.Where(message => message.Id > afterCursorMessageId);
        }

        var cursorMessageId = beforeMessageId.GetValueOrDefault();
        if (cursorMessageId > 0)
        {
            query = query.Where(message => message.Id < cursorMessageId);
        }

        var orderedQuery = afterCursorMessageId > 0
            ? query.OrderBy(message => message.Id)
            : query.OrderByDescending(message => message.Id);

        var rawPage = await orderedQuery
            .Take(pageSize + 1)
            .Select(message => new Message
            {
                Id = message.Id,
                ChannelId = message.ChannelId,
                Username = message.Username,
                Content = message.Content,
                EncryptedContent = message.EncryptedContent,
                PhotoUrl = message.PhotoUrl,
                AuthorUserId = message.AuthorUserId,
                Timestamp = message.Timestamp,
                ReadAt = message.ReadAt,
                ReadByUserId = message.ReadByUserId,
                IsDeleted = message.IsDeleted
            })
            .ToListAsync(cancellationToken);

        var hasMore = rawPage.Count > pageSize;
        var pageMessages = rawPage
            .Take(pageSize)
            .OrderBy(message => message.Id)
            .ToList();
        var reactionsByMessageId = await BuildReactionMapAsync(pageMessages.Select(message => message.Id), cancellationToken);
        var messagesWithPayloads = pageMessages
            .Select(message => new
            {
                Message = message,
                Payload = DeserializePayload(GetRawPayload(message))
            })
            .ToList();

        foreach (var item in messagesWithPayloads)
        {
            await _chatFileAccess.EnsureLegacyMessageAttachmentsBoundAsync(
                item.Message.ChannelId,
                item.Message.Id,
                item.Payload,
                item.Message.AuthorUserId,
                cancellationToken);
        }

        var readState = await _chatReadState.GetReadStateAsync(
            currentUser.UserId,
            normalizedChannelId,
            cancellationToken);

        return new ChatMessagesPageDto
        {
            Items = messagesWithPayloads
                .Select(item => ToMessageDto(
                    item.Message,
                    item.Payload,
                    reactionsByMessageId.TryGetValue(item.Message.Id, out var reactions) ? reactions : []))
                .ToList(),
            HasMore = hasMore,
            NextCursor = afterCursorMessageId > 0
                ? null
                : pageMessages.Count > 0 ? pageMessages.Min(message => message.Id) : null,
            ReadState = readState is null
                ? null
                : new ChatReadStateDto
                {
                    UserId = readState.UserId,
                    ChannelId = readState.ChannelId,
                    LastReadMessageId = readState.LastReadMessageId,
                    LastReadAt = readState.LastReadAt
                }
        };
    }

    [HttpGet("search")]
    public async Task<ActionResult<IReadOnlyList<MessageSearchResultDto>>> SearchMessages(
        [FromRoute] string chatId,
        [FromQuery] string? q,
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

        var equivalentChannelIds = GetEquivalentChannelIds(normalizedChannelId);
        var results = await _messageSearch.SearchAsync(equivalentChannelIds, q, limit, cancellationToken);
        return Ok(results);
    }

    [HttpGet("attachments")]
    public async Task<ActionResult<ChatAttachmentHistoryPageDto>> GetAttachments(
        [FromRoute] string chatId,
        [FromQuery] string? kind,
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

        var equivalentChannelIds = GetEquivalentChannelIds(normalizedChannelId);
        var page = await _attachmentHistory.ListAsync(equivalentChannelIds, kind, beforeMessageId, limit, cancellationToken);
        return Ok(page);
    }

    [HttpPost("outbox")]
    public async Task<ActionResult<MessageDto>> SendOutboxMessage(
        [FromRoute] string chatId,
        [FromBody] ChatOutboxMessageRequest request,
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

        var normalizedMessage = UploadPolicies.TrimToLength(request.Message, 4000);
        var normalizedClientMessageId = MessageDeduplicationService.NormalizeClientMessageId(request.ClientMessageId, request.ClientTempId);
        var normalizedEncryption = NormalizeEncryptionEnvelope(request.Encryption);
        if (string.IsNullOrWhiteSpace(normalizedMessage) && normalizedEncryption is null)
        {
            return BadRequest(new { message = "message is required" });
        }

        var equivalentChannelIds = GetEquivalentChannelIds(normalizedChannelId);
        var existingMessage = await _messageDeduplication.FindExistingAsync(
            _context,
            equivalentChannelIds,
            currentUser.UserId,
            normalizedClientMessageId,
            cancellationToken);
        existingMessage ??= await FindMessageByClientTempIdAsync(
            equivalentChannelIds,
            currentUser.UserId,
            normalizedClientMessageId,
            cancellationToken);
        if (existingMessage is not null)
        {
            var existingPayload = DeserializePayload(GetRawPayload(existingMessage));
            var existingReactions = await BuildReactionMapAsync([existingMessage.Id], cancellationToken);
            return Ok(ToMessageDto(
                existingMessage,
                existingPayload,
                existingReactions.TryGetValue(existingMessage.Id, out var reactions) ? reactions : []));
        }

        if (!_messageBurstLimiter.TryRecord(currentUser.UserId, DateTime.UtcNow, out var retryAfter))
        {
            var seconds = Math.Max(1, (int)Math.Ceiling(retryAfter.TotalSeconds));
            return StatusCode(StatusCodes.Status429TooManyRequests, new
            {
                message = $"Too many messages in a row. Wait {seconds} sec."
            });
        }

        var payload = new ChatMessagePayload
        {
            AuthorUserId = currentUser.UserId,
            Message = normalizedMessage,
            Encryption = normalizedEncryption,
            ClientMessageId = normalizedClientMessageId,
            ClientTempId = normalizedClientMessageId,
            ReplyToMessageId = UploadPolicies.TrimToLength(request.ReplyToMessageId, 80),
            ReplyToUsername = UploadPolicies.TrimToLength(request.ReplyToUsername, 160),
            ReplyPreview = UploadPolicies.TrimToLength(request.ReplyPreview, 240)
        };

        var message = new Message
        {
            ChannelId = normalizedChannelId,
            Username = currentUser.DisplayName,
            Content = null,
            EncryptedContent = _crypto.Encrypt($"{MessagePayloadPrefix}{JsonSerializer.Serialize(payload)}"),
            PhotoUrl = UploadPolicies.SanitizeRelativeAssetUrl(request.PhotoUrl, "/avatars/"),
            AuthorUserId = currentUser.UserId,
            ClientMessageId = normalizedClientMessageId,
            Timestamp = DateTime.UtcNow,
            IsDeleted = false
        };

        _context.Messages.Add(message);
        await _context.SaveChangesAsync(cancellationToken);

        var dto = ToMessageDto(message, payload);
        await _hubContext.Clients.Group(normalizedChannelId).SendAsync("ReceiveMessage", dto, cancellationToken);

        return Ok(dto);
    }

    [HttpPost("{messageId:int}/poll-vote")]
    public async Task<ActionResult<MessageDto>> SubmitPollVote(
        [FromRoute] string chatId,
        [FromRoute] int messageId,
        [FromBody] ChatPollVoteRequest request,
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

        var equivalentChannelIds = GetEquivalentChannelIds(normalizedChannelId);
        var message = await _context.Messages
            .FirstOrDefaultAsync(item =>
                item.Id == messageId &&
                equivalentChannelIds.Contains(item.ChannelId) &&
                !item.IsDeleted,
                cancellationToken);
        if (message is null)
        {
            return NotFound(new { message = "message not found" });
        }

        var payload = DeserializePayload(GetRawPayload(message));
        if (!TryDecodePollMessage(payload.Message, out var poll))
        {
            return BadRequest(new { message = "poll message is required" });
        }

        var allowedOptionIds = GetPollOptionIds(poll);
        var selectedOptionIds = NormalizeSelectedPollOptions(request.OptionIds, allowedOptionIds);
        if (selectedOptionIds.Count == 0)
        {
            return BadRequest(new { message = "poll option is required" });
        }

        if (selectedOptionIds.Count > 1 && !ReadPollSetting(poll, "allowMultipleAnswers"))
        {
            return BadRequest(new { message = "multiple answers are disabled for this poll" });
        }

        var now = DateTimeOffset.UtcNow;
        var existingVote = await _context.MessagePollVotes
            .FirstOrDefaultAsync(item => item.MessageId == message.Id && item.VoterUserId == currentUser.UserId, cancellationToken);
        if (existingVote is not null && !ReadPollSetting(poll, "allowRevoting"))
        {
            return Conflict(new { message = "revoting is disabled for this poll" });
        }

        if (existingVote is null)
        {
            _context.MessagePollVotes.Add(new MessagePollVoteRecord
            {
                MessageId = message.Id,
                ChannelId = message.ChannelId,
                VoterUserId = currentUser.UserId,
                OptionIdsJson = JsonSerializer.Serialize(selectedOptionIds, PollJsonOptions),
                CreatedAt = now,
                UpdatedAt = now
            });
        }
        else
        {
            existingVote.ChannelId = message.ChannelId;
            existingVote.OptionIdsJson = JsonSerializer.Serialize(selectedOptionIds, PollJsonOptions);
            existingVote.UpdatedAt = now;
        }

        await _context.SaveChangesAsync(cancellationToken);

        var voteRecords = await _context.MessagePollVotes
            .AsNoTracking()
            .Where(item => item.MessageId == message.Id)
            .ToListAsync(cancellationToken);
        var votersByUserId = await BuildPollVoterLookupAsync(voteRecords, cancellationToken);
        ApplyPollVoteTotals(poll, allowedOptionIds, voteRecords, votersByUserId);
        payload.Message = EncodePollMessage(poll);
        SaveMessagePayload(message, payload);
        await _context.SaveChangesAsync(cancellationToken);

        var reactionsByMessageId = await BuildReactionMapAsync([message.Id], cancellationToken);
        var dto = ToMessageDto(
            message,
            payload,
            reactionsByMessageId.TryGetValue(message.Id, out var reactions) ? reactions : []);
        await _hubContext.Clients.Group(message.ChannelId).SendAsync("MessageUpdated", dto, cancellationToken);

        return Ok(dto);
    }

    [HttpPost("{messageId:int}/poll-options")]
    public async Task<ActionResult<MessageDto>> AddPollOption(
        [FromRoute] string chatId,
        [FromRoute] int messageId,
        [FromBody] ChatPollOptionRequest request,
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

        var equivalentChannelIds = GetEquivalentChannelIds(normalizedChannelId);
        var message = await _context.Messages
            .FirstOrDefaultAsync(item =>
                item.Id == messageId &&
                equivalentChannelIds.Contains(item.ChannelId) &&
                !item.IsDeleted,
                cancellationToken);
        if (message is null)
        {
            return NotFound(new { message = "message not found" });
        }

        var payload = DeserializePayload(GetRawPayload(message));
        if (!TryDecodePollMessage(payload.Message, out var poll))
        {
            return BadRequest(new { message = "poll message is required" });
        }

        if (!ReadPollSetting(poll, "allowAddingOptions"))
        {
            return BadRequest(new { message = "adding options is disabled for this poll" });
        }

        var optionText = UploadPolicies.TrimToLength(request.Text, 120).Trim();
        if (string.IsNullOrWhiteSpace(optionText))
        {
            return BadRequest(new { message = "poll option text is required" });
        }

        var options = GetPollOptionsArray(poll);
        if (options.Count >= 12)
        {
            return BadRequest(new { message = "poll option limit reached" });
        }

        var existingTexts = options
            .OfType<JsonObject>()
            .Select(option => option["text"]?.GetValue<string>()?.Trim() ?? string.Empty)
            .ToHashSet(StringComparer.OrdinalIgnoreCase);
        if (existingTexts.Contains(optionText))
        {
            return Conflict(new { message = "poll option already exists" });
        }

        var optionId = CreatePollOptionId(options);
        options.Add(new JsonObject
        {
            ["id"] = optionId,
            ["text"] = optionText
        });
        poll["options"] = options;

        var allowedOptionIds = GetPollOptionIds(poll);
        var voteRecords = await _context.MessagePollVotes
            .AsNoTracking()
            .Where(item => item.MessageId == message.Id)
            .ToListAsync(cancellationToken);
        var votersByUserId = await BuildPollVoterLookupAsync(voteRecords, cancellationToken);
        ApplyPollVoteTotals(poll, allowedOptionIds, voteRecords, votersByUserId);
        payload.Message = EncodePollMessage(poll);
        SaveMessagePayload(message, payload);
        await _context.SaveChangesAsync(cancellationToken);

        var reactionsByMessageId = await BuildReactionMapAsync([message.Id], cancellationToken);
        var dto = ToMessageDto(
            message,
            payload,
            reactionsByMessageId.TryGetValue(message.Id, out var reactions) ? reactions : []);
        await _hubContext.Clients.Group(message.ChannelId).SendAsync("MessageUpdated", dto, cancellationToken);

        return Ok(dto);
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
            ClientMessageId = message.ClientMessageId ?? payload.ClientMessageId ?? payload.ClientTempId,
            ClientTempId = payload.ClientTempId ?? message.ClientMessageId,
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

    private void SaveMessagePayload(Message message, ChatMessagePayload payload)
    {
        var serializedPayload = $"{MessagePayloadPrefix}{JsonSerializer.Serialize(payload)}";
        if (string.IsNullOrWhiteSpace(message.EncryptedContent))
        {
            message.Content = serializedPayload;
            return;
        }

        message.EncryptedContent = _crypto.Encrypt(serializedPayload);
    }

    private static bool TryDecodePollMessage(string? rawMessage, out JsonObject poll)
    {
        poll = [];
        var normalizedMessage = rawMessage?.Trim() ?? string.Empty;
        if (!normalizedMessage.StartsWith(PollMessagePrefix, StringComparison.Ordinal))
        {
            return false;
        }

        try
        {
            var encodedPayload = normalizedMessage[PollMessagePrefix.Length..];
            var json = Encoding.UTF8.GetString(Convert.FromBase64String(encodedPayload));
            if (JsonNode.Parse(json) is not JsonObject parsedPoll)
            {
                return false;
            }

            poll = parsedPoll;
            return true;
        }
        catch
        {
            return false;
        }
    }

    private static string EncodePollMessage(JsonObject poll)
    {
        var json = poll.ToJsonString(PollJsonOptions);
        return $"{PollMessagePrefix}{Convert.ToBase64String(Encoding.UTF8.GetBytes(json))}";
    }

    private static List<string> GetPollOptionIds(JsonObject poll)
    {
        return GetPollOptionsArray(poll)
            .OfType<JsonObject>()
            .Select(option => option["id"]?.GetValue<string>()?.Trim() ?? string.Empty)
            .Where(optionId => !string.IsNullOrWhiteSpace(optionId))
            .Distinct(StringComparer.Ordinal)
            .ToList();
    }

    private static JsonArray GetPollOptionsArray(JsonObject poll)
    {
        if (poll["options"] is JsonArray options)
        {
            return options;
        }

        var nextOptions = new JsonArray();
        poll["options"] = nextOptions;
        return nextOptions;
    }

    private static string CreatePollOptionId(JsonArray options)
    {
        var existingIds = options
            .OfType<JsonObject>()
            .Select(option => option["id"]?.GetValue<string>()?.Trim() ?? string.Empty)
            .Where(optionId => !string.IsNullOrWhiteSpace(optionId))
            .ToHashSet(StringComparer.Ordinal);

        for (var index = options.Count + 1; index <= options.Count + 100; index += 1)
        {
            var optionId = $"option-{index}";
            if (!existingIds.Contains(optionId))
            {
                return optionId;
            }
        }

        return $"option-{DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()}";
    }

    private static List<string> NormalizeSelectedPollOptions(
        IReadOnlyList<string>? rawOptionIds,
        IReadOnlyList<string> allowedOptionIds)
    {
        var allowed = allowedOptionIds.ToHashSet(StringComparer.Ordinal);
        return (rawOptionIds ?? [])
            .Select(optionId => UploadPolicies.TrimToLength(optionId, 80).Trim())
            .Where(optionId => allowed.Contains(optionId))
            .Distinct(StringComparer.Ordinal)
            .ToList();
    }

    private static bool ReadPollSetting(JsonObject poll, string key)
    {
        return poll["settings"] is JsonObject settings &&
            settings[key] is JsonValue value &&
            value.TryGetValue<bool>(out var enabled) &&
            enabled;
    }

    private static bool ShouldExposePollVoters(JsonObject poll)
    {
        return ReadPollSetting(poll, "showWhoVoted") && !ReadPollSetting(poll, "anonymous");
    }

    private async Task<Dictionary<string, MessageReactionUserDto>> BuildPollVoterLookupAsync(
        IReadOnlyList<MessagePollVoteRecord> voteRecords,
        CancellationToken cancellationToken)
    {
        var voterIds = voteRecords
            .Select(vote => vote.VoterUserId)
            .Where(userId => !string.IsNullOrWhiteSpace(userId))
            .Distinct(StringComparer.Ordinal)
            .ToList();
        var numericVoterIds = voterIds
            .Select(userId => int.TryParse(userId, out var parsedUserId) ? parsedUserId : 0)
            .Where(userId => userId > 0)
            .Distinct()
            .ToList();
        var users = numericVoterIds.Count == 0
            ? []
            : await _context.Users
                .AsNoTracking()
                .Where(user => numericVoterIds.Contains(user.id))
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

        var lookup = users.ToDictionary(
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

        foreach (var voterId in voterIds)
        {
            lookup.TryAdd(voterId, new MessageReactionUserDto
            {
                UserId = voterId,
                DisplayName = $"User {voterId}",
                AvatarUrl = null
            });
        }

        return lookup;
    }

    private static void ApplyPollVoteTotals(
        JsonObject poll,
        IReadOnlyList<string> optionIds,
        IReadOnlyList<MessagePollVoteRecord> voteRecords,
        IReadOnlyDictionary<string, MessageReactionUserDto> votersByUserId)
    {
        var countsByOptionId = optionIds.ToDictionary(optionId => optionId, _ => 0, StringComparer.Ordinal);
        var shouldExposeVoters = ShouldExposePollVoters(poll);
        var votersByOptionId = optionIds.ToDictionary(optionId => optionId, _ => new JsonArray(), StringComparer.Ordinal);
        foreach (var voteRecord in voteRecords)
        {
            var selectedOptionIds = DeserializePollVoteOptions(voteRecord.OptionIdsJson);
            foreach (var optionId in selectedOptionIds)
            {
                if (countsByOptionId.ContainsKey(optionId))
                {
                    countsByOptionId[optionId] += 1;
                    if (shouldExposeVoters && votersByUserId.TryGetValue(voteRecord.VoterUserId, out var voter))
                    {
                        votersByOptionId[optionId].Add(new JsonObject
                        {
                            ["userId"] = voter.UserId,
                            ["displayName"] = voter.DisplayName,
                            ["avatarUrl"] = voter.AvatarUrl
                        });
                    }
                }
            }
        }

        var votes = new JsonObject();
        foreach (var optionId in optionIds)
        {
            votes[optionId] = countsByOptionId[optionId];
        }

        poll["votes"] = votes;
        var voters = new JsonObject();
        if (shouldExposeVoters)
        {
            foreach (var optionId in optionIds)
            {
                voters[optionId] = votersByOptionId[optionId];
            }
        }
        poll["voters"] = voters;
        poll["totalVoters"] = voteRecords
            .Select(vote => vote.VoterUserId)
            .Where(userId => !string.IsNullOrWhiteSpace(userId))
            .Distinct(StringComparer.Ordinal)
            .Count();
    }

    private static List<string> DeserializePollVoteOptions(string rawOptionIds)
    {
        try
        {
            return JsonSerializer.Deserialize<List<string>>(rawOptionIds, PollJsonOptions) ?? [];
        }
        catch
        {
            return [];
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

    private async Task<Message?> FindMessageByClientTempIdAsync(
        IReadOnlyCollection<string> channelIds,
        string authorUserId,
        string clientTempId,
        CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(clientTempId))
        {
            return null;
        }

        var candidates = await _context.Messages
            .AsNoTracking()
            .Where(message =>
                channelIds.Contains(message.ChannelId) &&
                message.AuthorUserId == authorUserId &&
                !message.IsDeleted)
            .OrderByDescending(message => message.Id)
            .Take(100)
            .Select(message => new Message
            {
                Id = message.Id,
                ChannelId = message.ChannelId,
                Username = message.Username,
                Content = message.Content,
                EncryptedContent = message.EncryptedContent,
                PhotoUrl = message.PhotoUrl,
                AuthorUserId = message.AuthorUserId,
                Timestamp = message.Timestamp,
                ReadAt = message.ReadAt,
                ReadByUserId = message.ReadByUserId,
                IsDeleted = message.IsDeleted
            })
            .ToListAsync(cancellationToken);

        return candidates.FirstOrDefault(message =>
            string.Equals(DeserializePayload(GetRawPayload(message)).ClientTempId, clientTempId, StringComparison.Ordinal));
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

    private static ChatMessageEncryptionEnvelope? NormalizeEncryptionEnvelope(ChatMessageEncryptionEnvelope? _)
    {
        return null;
    }
}

public sealed class ChatMessagesPageDto
{
    public List<MessageDto> Items { get; set; } = [];
    public bool HasMore { get; set; }
    public int? NextCursor { get; set; }
    public ChatReadStateDto? ReadState { get; set; }
}

public sealed class ChatReadStateDto
{
    public string UserId { get; set; } = string.Empty;
    public string ChannelId { get; set; } = string.Empty;
    public int? LastReadMessageId { get; set; }
    public DateTimeOffset LastReadAt { get; set; }
}

public sealed class ChatOutboxMessageRequest
{
    public string Message { get; set; } = string.Empty;
    public ChatMessageEncryptionEnvelope? Encryption { get; set; }
    public string? PhotoUrl { get; set; }
    public string? ClientMessageId { get; set; }
    public string? ClientTempId { get; set; }
    public string? ReplyToMessageId { get; set; }
    public string? ReplyToUsername { get; set; }
    public string? ReplyPreview { get; set; }
}

public sealed class ChatPollVoteRequest
{
    public IReadOnlyList<string> OptionIds { get; set; } = [];
}

public sealed class ChatPollOptionRequest
{
    public string Text { get; set; } = string.Empty;
}
