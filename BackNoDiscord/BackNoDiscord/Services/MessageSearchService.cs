using System.Text.Json;
using BackNoDiscord.Security;
using Microsoft.EntityFrameworkCore;

namespace BackNoDiscord.Services;

public sealed class MessageSearchService
{
    private const string MessagePayloadPrefix = "__CHAT_PAYLOAD__:";
    private const int MinimumQueryLength = 2;
    private const int DefaultLimit = 20;
    private const int MaxLimit = 50;
    private const int CandidateLimit = 300;

    private readonly AppDbContext _context;
    private readonly CryptoService _crypto;

    public MessageSearchService(AppDbContext context, CryptoService crypto)
    {
        _context = context;
        _crypto = crypto;
    }

    public async Task<IReadOnlyList<MessageSearchResultDto>> SearchAsync(
        IEnumerable<string> allowedChannelIds,
        string? query,
        int? limit,
        CancellationToken cancellationToken)
    {
        var normalizedQuery = NormalizeQuery(query);
        if (normalizedQuery.Length < MinimumQueryLength)
        {
            return [];
        }

        var channelIds = allowedChannelIds
            .Select(channelId => UploadPolicies.TrimToLength(channelId, 160))
            .Where(channelId => !string.IsNullOrWhiteSpace(channelId))
            .Distinct(StringComparer.Ordinal)
            .ToArray();
        if (channelIds.Length == 0)
        {
            return [];
        }

        var pageSize = Math.Max(1, Math.Min(MaxLimit, limit.GetValueOrDefault(DefaultLimit)));
        var normalizedQueryLower = normalizedQuery.ToLowerInvariant();
        var candidates = await _context.Messages
            .AsNoTracking()
            .Where(message => channelIds.Contains(message.ChannelId) && !message.IsDeleted)
            .OrderByDescending(message => message.Id)
            .Take(CandidateLimit)
            .Select(message => new Message
            {
                Id = message.Id,
                ChannelId = message.ChannelId,
                Username = message.Username,
                Content = message.Content,
                EncryptedContent = message.EncryptedContent,
                PhotoUrl = message.PhotoUrl,
                Timestamp = message.Timestamp,
                IsDeleted = message.IsDeleted
            })
            .ToListAsync(cancellationToken);

        var results = new List<MessageSearchResultDto>(pageSize);
        foreach (var message in candidates)
        {
            cancellationToken.ThrowIfCancellationRequested();

            var payload = DeserializePayload(GetRawPayload(message));
            var searchableText = BuildSearchText(payload);
            if (!searchableText.Contains(normalizedQueryLower, StringComparison.Ordinal))
            {
                continue;
            }

            results.Add(new MessageSearchResultDto
            {
                Id = message.Id,
                ChannelId = message.ChannelId,
                AuthorUserId = payload.AuthorUserId,
                Username = message.Username,
                Preview = BuildPreview(payload),
                Timestamp = message.Timestamp
            });

            if (results.Count >= pageSize)
            {
                break;
            }
        }

        return results;
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

    private static string BuildSearchText(ChatMessagePayload payload)
    {
        var parts = new List<string> { payload.Message ?? string.Empty };
        parts.AddRange(GetSearchAttachments(payload).Select(BuildAttachmentSearchText));
        return string.Join(' ', parts).ToLowerInvariant();
    }

    private static IEnumerable<ChatAttachmentPayload> GetSearchAttachments(ChatMessagePayload payload)
    {
        foreach (var attachment in payload.Attachments ?? [])
        {
            yield return attachment;
        }

        if (HasLegacyAttachment(payload))
        {
            yield return new ChatAttachmentPayload
            {
                AttachmentUrl = payload.AttachmentUrl,
                AttachmentName = payload.AttachmentName,
                AttachmentContentType = payload.AttachmentContentType,
                AttachmentAsFile = payload.AttachmentAsFile,
                VoiceMessage = payload.VoiceMessage
            };
        }
    }

    private static bool HasLegacyAttachment(ChatMessagePayload payload)
    {
        return !string.IsNullOrWhiteSpace(payload.AttachmentUrl)
            || !string.IsNullOrWhiteSpace(payload.AttachmentName)
            || !string.IsNullOrWhiteSpace(payload.AttachmentContentType)
            || payload.AttachmentAsFile
            || payload.VoiceMessage is not null;
    }

    private static string BuildAttachmentSearchText(ChatAttachmentPayload attachment)
    {
        var parts = new List<string?>
        {
            attachment.AttachmentName,
            attachment.AttachmentContentType,
            attachment.AttachmentUrl,
            GetAttachmentMediaKindTerms(attachment)
        };

        if (attachment.AttachmentAsFile)
        {
            parts.Add("файл документ file document");
        }

        return string.Join(' ', parts.Where(part => !string.IsNullOrWhiteSpace(part)));
    }

    private static string GetAttachmentMediaKindTerms(ChatAttachmentPayload attachment)
    {
        var contentType = (attachment.AttachmentContentType ?? string.Empty).Trim().ToLowerInvariant();
        var fileHint = $"{attachment.AttachmentName ?? string.Empty} {attachment.AttachmentUrl ?? string.Empty}".ToLowerInvariant();

        if (contentType.StartsWith("image/", StringComparison.Ordinal) || HasKnownExtension(fileHint, ".png", ".jpg", ".jpeg", ".gif", ".webp", ".avif", ".bmp", ".svg"))
        {
            return "изображение картинка фото image photo picture";
        }

        if (contentType.StartsWith("video/", StringComparison.Ordinal) || HasKnownExtension(fileHint, ".mp4", ".webm", ".mov", ".mkv", ".avi"))
        {
            return "видео video clip";
        }

        if (contentType.StartsWith("audio/", StringComparison.Ordinal) || attachment.VoiceMessage is not null || HasKnownExtension(fileHint, ".mp3", ".wav", ".ogg", ".m4a"))
        {
            return "аудио голос voice audio";
        }

        return attachment.AttachmentAsFile ? "файл документ file document" : "вложение attachment";
    }

    private static bool HasKnownExtension(string fileHint, params string[] extensions)
    {
        return fileHint
            .Split(' ', StringSplitOptions.RemoveEmptyEntries)
            .Any(part => extensions.Any(extension =>
                part.EndsWith(extension, StringComparison.Ordinal)
                || part.Contains($"{extension}?", StringComparison.Ordinal)
                || part.Contains($"{extension}#", StringComparison.Ordinal)));
    }

    private static string BuildPreview(ChatMessagePayload payload)
    {
        var text = (payload.Message ?? string.Empty).Trim();
        if (!string.IsNullOrWhiteSpace(text))
        {
            return UploadPolicies.TrimToLength(text, 180);
        }

        var firstAttachmentName = payload.Attachments?.FirstOrDefault()?.AttachmentName?.Trim();
        return string.IsNullOrWhiteSpace(firstAttachmentName)
            ? "Сообщение без текста"
            : UploadPolicies.TrimToLength(firstAttachmentName, 180);
    }

    private static string NormalizeQuery(string? query)
    {
        return string.Join(' ', (query ?? string.Empty).Trim().Split(' ', StringSplitOptions.RemoveEmptyEntries));
    }
}

public sealed class MessageSearchResultDto
{
    public int Id { get; set; }
    public string ChannelId { get; set; } = string.Empty;
    public string AuthorUserId { get; set; } = string.Empty;
    public string Username { get; set; } = string.Empty;
    public string Preview { get; set; } = string.Empty;
    public DateTime Timestamp { get; set; }
}
