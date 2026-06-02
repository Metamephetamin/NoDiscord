using System.Text.Json;
using BackNoDiscord.Security;
using Microsoft.EntityFrameworkCore;

namespace BackNoDiscord.Services;

public sealed class ChatAttachmentHistoryService
{
    private const string MessagePayloadPrefix = "__CHAT_PAYLOAD__:";
    private const int DefaultLimit = 40;
    private const int MaxLimit = 80;
    private const int CandidateBatchSize = 250;

    private readonly AppDbContext _context;
    private readonly CryptoService _crypto;

    public ChatAttachmentHistoryService(AppDbContext context, CryptoService crypto)
    {
        _context = context;
        _crypto = crypto;
    }

    public async Task<ChatAttachmentHistoryPageDto> ListAsync(
        IEnumerable<string> allowedChannelIds,
        string? kind,
        int? beforeMessageId,
        int? limit,
        CancellationToken cancellationToken)
    {
        var channelIds = allowedChannelIds
            .Select(channelId => UploadPolicies.TrimToLength(channelId, 160))
            .Where(channelId => !string.IsNullOrWhiteSpace(channelId))
            .Distinct(StringComparer.Ordinal)
            .ToArray();
        if (channelIds.Length == 0)
        {
            return new ChatAttachmentHistoryPageDto();
        }

        var normalizedKind = NormalizeKind(kind);
        var pageSize = Math.Max(1, Math.Min(MaxLimit, limit.GetValueOrDefault(DefaultLimit)));
        var query = _context.Messages
            .AsNoTracking()
            .Where(message => channelIds.Contains(message.ChannelId) && !message.IsDeleted);

        var cursor = beforeMessageId.GetValueOrDefault();
        if (cursor > 0)
        {
            query = query.Where(message => message.Id < cursor);
        }

        var items = new List<ChatAttachmentHistoryItemDto>(pageSize + 1);
        var lastScannedMessageId = 0;

        while (items.Count <= pageSize)
        {
            var candidates = await query
                .OrderByDescending(message => message.Id)
                .Take(CandidateBatchSize)
                .Select(message => new Message
                {
                    Id = message.Id,
                    ChannelId = message.ChannelId,
                    Username = message.Username,
                    Content = message.Content,
                    EncryptedContent = message.EncryptedContent,
                    AuthorUserId = message.AuthorUserId,
                    Timestamp = message.Timestamp,
                    IsDeleted = message.IsDeleted
                })
                .ToListAsync(cancellationToken);

            if (candidates.Count == 0)
            {
                break;
            }

            foreach (var message in candidates)
            {
                cancellationToken.ThrowIfCancellationRequested();
                lastScannedMessageId = message.Id;
                var payload = DeserializePayload(GetRawPayload(message));
                foreach (var attachment in GetAttachments(payload).Select((attachment, index) => new { Attachment = attachment, Index = index }))
                {
                    var itemKind = GetKind(attachment.Attachment);
                    if (itemKind.Length == 0 || itemKind != normalizedKind)
                    {
                        continue;
                    }

                    items.Add(new ChatAttachmentHistoryItemDto
                    {
                        Id = $"{message.Id}:{attachment.Index}",
                        MessageId = message.Id,
                        ChannelId = message.ChannelId,
                        AuthorUserId = payload.AuthorUserId ?? message.AuthorUserId ?? string.Empty,
                        Username = message.Username,
                        Timestamp = message.Timestamp,
                        AttachmentIndex = attachment.Index,
                        AttachmentUrl = attachment.Attachment.AttachmentUrl,
                        AttachmentName = attachment.Attachment.AttachmentName,
                        AttachmentSize = attachment.Attachment.AttachmentSize,
                        AttachmentContentType = attachment.Attachment.AttachmentContentType,
                        AttachmentSpoiler = attachment.Attachment.AttachmentSpoiler,
                        AttachmentAsFile = attachment.Attachment.AttachmentAsFile,
                        AttachmentEncryption = attachment.Attachment.AttachmentEncryption,
                        Kind = itemKind,
                        MediaType = GetMediaType(attachment.Attachment),
                    });

                    if (items.Count > pageSize)
                    {
                        break;
                    }
                }

                if (items.Count > pageSize)
                {
                    break;
                }
            }

            if (candidates.Count < CandidateBatchSize)
            {
                break;
            }

            query = query.Where(message => message.Id < lastScannedMessageId);
        }

        var pageItems = items.Take(pageSize).ToList();
        return new ChatAttachmentHistoryPageDto
        {
            Items = pageItems,
            HasMore = items.Count > pageSize,
            NextCursor = pageItems.Count > 0 ? pageItems.Min(item => item.MessageId) : null
        };
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
        catch
        {
            return message.Content ?? string.Empty;
        }
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

    private static IEnumerable<ChatAttachmentPayload> GetAttachments(ChatMessagePayload payload)
    {
        if (payload.Attachments.Count > 0)
        {
            return payload.Attachments.Where(HasAttachmentBody);
        }

        if (!HasAttachmentBody(payload))
        {
            return [];
        }

        return
        [
            new ChatAttachmentPayload
            {
                AttachmentEncryption = payload.AttachmentEncryption,
                AttachmentUrl = payload.AttachmentUrl,
                AttachmentName = payload.AttachmentName,
                AttachmentSize = payload.AttachmentSize,
                AttachmentContentType = payload.AttachmentContentType,
                AttachmentSpoiler = payload.AttachmentSpoiler,
                AttachmentAsFile = payload.AttachmentAsFile,
                VoiceMessage = payload.VoiceMessage
            }
        ];
    }

    private static bool HasAttachmentBody(ChatMessagePayload payload) =>
        !string.IsNullOrWhiteSpace(payload.AttachmentUrl)
        || payload.AttachmentEncryption is not null
        || payload.VoiceMessage is not null;

    private static bool HasAttachmentBody(ChatAttachmentPayload attachment) =>
        !string.IsNullOrWhiteSpace(attachment.AttachmentUrl)
        || attachment.AttachmentEncryption is not null
        || attachment.VoiceMessage is not null;

    private static string NormalizeKind(string? kind)
    {
        var normalized = (kind ?? string.Empty).Trim().ToLowerInvariant();
        return normalized is "file" or "files" or "document" or "documents" ? "files" : "media";
    }

    private static string GetKind(ChatAttachmentPayload attachment)
    {
        if (attachment.VoiceMessage is not null)
        {
            return string.Empty;
        }

        var mediaType = GetMediaType(attachment);
        return (mediaType is "image" or "video") && !attachment.AttachmentAsFile ? "media" : "files";
    }

    private static string GetMediaType(ChatAttachmentPayload attachment)
    {
        var contentType = (attachment.AttachmentContentType ?? string.Empty).Trim().ToLowerInvariant();
        var fileHint = $"{attachment.AttachmentName ?? string.Empty} {attachment.AttachmentUrl ?? string.Empty}".ToLowerInvariant();

        if (contentType.StartsWith("image/", StringComparison.Ordinal) || HasKnownExtension(fileHint, ".png", ".jpg", ".jpeg", ".gif", ".webp", ".avif", ".bmp", ".svg"))
        {
            return "image";
        }

        if (contentType.StartsWith("video/", StringComparison.Ordinal) || HasKnownExtension(fileHint, ".mp4", ".webm", ".mov", ".mkv", ".avi"))
        {
            return "video";
        }

        return "file";
    }

    private static bool HasKnownExtension(string fileHint, params string[] extensions) =>
        fileHint
            .Split(' ', StringSplitOptions.RemoveEmptyEntries)
            .Any(part => extensions.Any(extension =>
                part.EndsWith(extension, StringComparison.Ordinal)
                || part.Contains($"{extension}?", StringComparison.Ordinal)
                || part.Contains($"{extension}#", StringComparison.Ordinal)));
}

public sealed class ChatAttachmentHistoryPageDto
{
    public List<ChatAttachmentHistoryItemDto> Items { get; set; } = [];
    public bool HasMore { get; set; }
    public int? NextCursor { get; set; }
}

public sealed class ChatAttachmentHistoryItemDto
{
    public string Id { get; set; } = string.Empty;
    public int MessageId { get; set; }
    public string ChannelId { get; set; } = string.Empty;
    public string AuthorUserId { get; set; } = string.Empty;
    public string Username { get; set; } = string.Empty;
    public DateTime Timestamp { get; set; }
    public int AttachmentIndex { get; set; }
    public string? AttachmentUrl { get; set; }
    public string? AttachmentName { get; set; }
    public long? AttachmentSize { get; set; }
    public string? AttachmentContentType { get; set; }
    public bool AttachmentSpoiler { get; set; }
    public bool AttachmentAsFile { get; set; }
    public ChatAttachmentEncryptionEnvelope? AttachmentEncryption { get; set; }
    public string Kind { get; set; } = "media";
    public string MediaType { get; set; } = "file";
}
