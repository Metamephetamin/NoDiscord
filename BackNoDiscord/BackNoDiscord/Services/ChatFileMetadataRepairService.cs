using System.Text.Json;
using BackNoDiscord.Security;
using Microsoft.EntityFrameworkCore;

namespace BackNoDiscord.Services;

public sealed class ChatFileMetadataRepairService
{
    private const string MessagePayloadPrefix = "__CHAT_PAYLOAD__:";
    private readonly AppDbContext _context;
    private readonly CryptoService _crypto;
    private readonly ChatFileAccessService _fileAccess;

    public ChatFileMetadataRepairService(AppDbContext context, CryptoService crypto, ChatFileAccessService fileAccess)
    {
        _context = context;
        _crypto = crypto;
        _fileAccess = fileAccess;
    }

    public async Task<int> RepairAsync(int batchSize, CancellationToken cancellationToken)
    {
        var normalizedBatchSize = Math.Max(1, Math.Min(batchSize, 500));
        var candidates = await _context.Messages
            .AsNoTracking()
            .Where(message => !message.IsDeleted && (message.Content != null || message.EncryptedContent != null))
            .OrderByDescending(message => message.Id)
            .Select(message => new
            {
                message.Id,
                message.ChannelId,
                message.Content,
                message.EncryptedContent
            })
            .Take(normalizedBatchSize)
            .ToListAsync(cancellationToken);

        var repaired = 0;
        foreach (var message in candidates)
        {
            var payload = TryDeserializePayload(message.Content, message.EncryptedContent);
            if (payload is null)
            {
                continue;
            }

            var attachments = GetAttachments(payload).ToArray();
            if (attachments.Length == 0)
            {
                continue;
            }

            if (await AllAttachmentsAlreadyBoundAsync(message.Id, attachments, cancellationToken))
            {
                continue;
            }

            var authorUserId = string.IsNullOrWhiteSpace(payload.AuthorUserId)
                ? ExtractOwnerUserId(attachments)
                : payload.AuthorUserId.Trim();
            if (string.IsNullOrWhiteSpace(authorUserId))
            {
                continue;
            }

            await _fileAccess.BindMessageAttachmentsAsync(
                message.ChannelId,
                message.Id,
                attachments,
                new AuthenticatedUser(authorUserId, string.Empty, string.Empty, string.Empty, string.Empty),
                cancellationToken);
            repaired += 1;
        }

        return repaired;
    }

    private async Task<bool> AllAttachmentsAlreadyBoundAsync(
        int messageId,
        IReadOnlyCollection<ChatAttachmentPayload> attachments,
        CancellationToken cancellationToken)
    {
        var fileNames = attachments
            .Select(attachment => Path.GetFileName(UploadPolicies.SanitizeRelativeAssetUrl(attachment.AttachmentUrl, "/chat-files/")))
            .Where(fileName => !string.IsNullOrWhiteSpace(fileName))
            .Distinct(StringComparer.Ordinal)
            .ToArray();
        if (fileNames.Length == 0)
        {
            return true;
        }

        var boundCount = await _context.ChatFileUploads
            .AsNoTracking()
            .CountAsync(item => fileNames.Contains(item.FileName) && item.MessageId == messageId, cancellationToken);
        return boundCount == fileNames.Length;
    }

    private ChatMessagePayload? TryDeserializePayload(string? content, string? encryptedContent)
    {
        var raw = content ?? string.Empty;
        if (!string.IsNullOrWhiteSpace(encryptedContent))
        {
            try
            {
                raw = _crypto.Decrypt(encryptedContent);
            }
            catch
            {
                return null;
            }
        }

        if (string.IsNullOrWhiteSpace(raw) || !raw.StartsWith(MessagePayloadPrefix, StringComparison.Ordinal))
        {
            return null;
        }

        try
        {
            return JsonSerializer.Deserialize<ChatMessagePayload>(raw[MessagePayloadPrefix.Length..], new JsonSerializerOptions(JsonSerializerDefaults.Web));
        }
        catch
        {
            return null;
        }
    }

    private static IEnumerable<ChatAttachmentPayload> GetAttachments(ChatMessagePayload payload)
    {
        foreach (var attachment in payload.Attachments)
        {
            if (!string.IsNullOrWhiteSpace(UploadPolicies.SanitizeRelativeAssetUrl(attachment.AttachmentUrl, "/chat-files/")))
            {
                yield return attachment;
            }
        }

        if (!string.IsNullOrWhiteSpace(UploadPolicies.SanitizeRelativeAssetUrl(payload.AttachmentUrl, "/chat-files/")))
        {
            yield return new ChatAttachmentPayload
            {
                AttachmentUrl = payload.AttachmentUrl,
                AttachmentName = payload.AttachmentName,
                AttachmentSize = payload.AttachmentSize,
                AttachmentContentType = payload.AttachmentContentType,
                AttachmentSpoiler = payload.AttachmentSpoiler,
                AttachmentAsFile = payload.AttachmentAsFile,
                AttachmentEncryption = payload.AttachmentEncryption,
                VoiceMessage = payload.VoiceMessage
            };
        }
    }

    private static string ExtractOwnerUserId(IEnumerable<ChatAttachmentPayload> attachments)
    {
        foreach (var attachment in attachments)
        {
            var fileName = Path.GetFileName(UploadPolicies.SanitizeRelativeAssetUrl(attachment.AttachmentUrl, "/chat-files/"));
            if (!fileName.StartsWith("chat-", StringComparison.Ordinal))
            {
                continue;
            }

            var start = "chat-".Length;
            var separatorIndex = fileName.IndexOf('-', start);
            if (separatorIndex > start)
            {
                return fileName[start..separatorIndex];
            }
        }

        return string.Empty;
    }
}
