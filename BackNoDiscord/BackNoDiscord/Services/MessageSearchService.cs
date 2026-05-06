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
        var attachmentNames = (payload.Attachments ?? [])
            .Select(attachment => attachment.AttachmentName)
            .Where(name => !string.IsNullOrWhiteSpace(name));
        return $"{payload.Message ?? string.Empty} {string.Join(' ', attachmentNames)}".ToLowerInvariant();
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
