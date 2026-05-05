using BackNoDiscord.Security;
using Microsoft.EntityFrameworkCore;

namespace BackNoDiscord.Services;

public sealed class ChatFileAccessService
{
    private const string ChatServerPrefix = "server:";
    private const string ChatChannelMarker = "::channel:";
    private readonly AppDbContext _context;
    private readonly ServerStateService _serverState;

    public ChatFileAccessService(AppDbContext context, ServerStateService serverState)
    {
        _context = context;
        _serverState = serverState;
    }

    public async Task TrackUploadAsync(StreamedChatFileUploadResult upload, string ownerUserId, CancellationToken cancellationToken)
    {
        var fileName = Path.GetFileName(upload.FileUrl ?? string.Empty);
        if (string.IsNullOrWhiteSpace(fileName) || string.IsNullOrWhiteSpace(ownerUserId))
        {
            return;
        }

        var existing = await _context.ChatFileUploads.FirstOrDefaultAsync(
            item => item.FileName == fileName,
            cancellationToken);
        if (existing is not null)
        {
            existing.OwnerUserId = ownerUserId;
            existing.DisplayFileName = upload.DisplayFileName;
            existing.ContentType = upload.ContentType;
            existing.Size = upload.Size;
            await _context.SaveChangesAsync(cancellationToken);
            return;
        }

        _context.ChatFileUploads.Add(new ChatFileUploadRecord
        {
            FileName = fileName,
            OwnerUserId = ownerUserId,
            DisplayFileName = upload.DisplayFileName,
            ContentType = upload.ContentType,
            Size = upload.Size,
            CreatedAt = DateTimeOffset.UtcNow
        });
        await _context.SaveChangesAsync(cancellationToken);
    }

    public async Task BindMessageAttachmentsAsync(
        string channelId,
        int messageId,
        IEnumerable<ChatAttachmentPayload> attachments,
        AuthenticatedUser currentUser,
        CancellationToken cancellationToken)
    {
        var fileNames = attachments
            .Select(attachment => Path.GetFileName(UploadPolicies.SanitizeRelativeAssetUrl(attachment.AttachmentUrl, "/chat-files/")))
            .Where(fileName => !string.IsNullOrWhiteSpace(fileName))
            .Distinct(StringComparer.Ordinal)
            .ToArray();

        if (fileNames.Length == 0)
        {
            return;
        }

        var records = await _context.ChatFileUploads
            .Where(item => fileNames.Contains(item.FileName))
            .ToListAsync(cancellationToken);
        var recordByFileName = records.ToDictionary(item => item.FileName, StringComparer.Ordinal);
        var now = DateTimeOffset.UtcNow;

        foreach (var fileName in fileNames)
        {
            if (!recordByFileName.TryGetValue(fileName, out var record))
            {
                if (!IsOwnerFromFileName(fileName, currentUser.UserId))
                {
                    throw new InvalidOperationException("Chat file metadata is missing.");
                }

                record = new ChatFileUploadRecord
                {
                    FileName = fileName,
                    OwnerUserId = currentUser.UserId,
                    DisplayFileName = fileName,
                    ContentType = string.Empty,
                    Size = 0,
                    CreatedAt = now
                };
                _context.ChatFileUploads.Add(record);
            }

            if (!string.Equals(record.OwnerUserId, currentUser.UserId, StringComparison.Ordinal))
            {
                throw new InvalidOperationException("Chat file belongs to another user.");
            }

            if (!string.IsNullOrWhiteSpace(record.ChannelId) &&
                !string.Equals(record.ChannelId, channelId, StringComparison.Ordinal))
            {
                throw new InvalidOperationException("Chat file is already attached to another channel.");
            }

            record.ChannelId = channelId;
            record.MessageId = messageId;
            record.BoundAt = now;
        }

        await _context.SaveChangesAsync(cancellationToken);
    }

    public async Task<bool> CanAccessFileAsync(string fileName, AuthenticatedUser currentUser, CancellationToken cancellationToken)
    {
        var safeFileName = Path.GetFileName(fileName ?? string.Empty);
        if (string.IsNullOrWhiteSpace(safeFileName) ||
            !string.Equals(safeFileName, fileName, StringComparison.Ordinal) ||
            string.IsNullOrWhiteSpace(currentUser.UserId))
        {
            return false;
        }

        var record = await _context.ChatFileUploads
            .AsNoTracking()
            .FirstOrDefaultAsync(item => item.FileName == safeFileName, cancellationToken);
        if (record is null)
        {
            if (IsOwnerFromFileName(safeFileName, currentUser.UserId))
            {
                return true;
            }

            return await TryAuthorizeLegacyMessageAttachmentAsync(safeFileName, currentUser, cancellationToken);
        }

        if (string.Equals(record.OwnerUserId, currentUser.UserId, StringComparison.Ordinal))
        {
            return true;
        }

        if (string.IsNullOrWhiteSpace(record.ChannelId))
        {
            return false;
        }

        return await CanAccessChannelAsync(record.ChannelId, currentUser, cancellationToken);
    }

    private async Task<bool> TryAuthorizeLegacyMessageAttachmentAsync(
        string fileName,
        AuthenticatedUser currentUser,
        CancellationToken cancellationToken)
    {
        var attachmentPath = $"/chat-files/{fileName}";
        var legacyMessage = await _context.Messages
            .AsNoTracking()
            .Where(message => !message.IsDeleted && message.Content != null && message.Content.Contains(attachmentPath))
            .OrderByDescending(message => message.Id)
            .Select(message => new
            {
                message.Id,
                message.ChannelId
            })
            .FirstOrDefaultAsync(cancellationToken);

        if (legacyMessage is null || !await CanAccessChannelAsync(legacyMessage.ChannelId, currentUser, cancellationToken))
        {
            return false;
        }

        if (!await _context.ChatFileUploads.AnyAsync(item => item.FileName == fileName, cancellationToken))
        {
            _context.ChatFileUploads.Add(new ChatFileUploadRecord
            {
                FileName = fileName,
                OwnerUserId = ExtractOwnerUserIdFromFileName(fileName),
                DisplayFileName = fileName,
                ContentType = string.Empty,
                Size = 0,
                ChannelId = legacyMessage.ChannelId,
                MessageId = legacyMessage.Id,
                CreatedAt = DateTimeOffset.UtcNow,
                BoundAt = DateTimeOffset.UtcNow
            });
            await _context.SaveChangesAsync(cancellationToken);
        }

        return true;
    }

    private async Task<bool> CanAccessChannelAsync(string channelId, AuthenticatedUser currentUser, CancellationToken cancellationToken)
    {
        if (ConversationChannels.TryParseChatChannelId(channelId, out var conversationId))
        {
            return await CanAccessConversationAsync(currentUser.UserId, conversationId, cancellationToken);
        }

        if (DirectMessageChannels.TryParse(channelId, out var firstUserId, out var secondUserId, out _))
        {
            return await CanAccessDirectAsync(currentUser.UserId, firstUserId, secondUserId, cancellationToken);
        }

        if (!TryGetServerIdFromChatChannelId(channelId, out var serverId))
        {
            return false;
        }

        return ServerChannelAuthorization.CanAccessServer(serverId, currentUser, _serverState.GetSnapshot(serverId));
    }

    private async Task<bool> CanAccessDirectAsync(string currentUserId, int firstUserId, int secondUserId, CancellationToken cancellationToken)
    {
        if (!int.TryParse(currentUserId, out var actorUserId) ||
            (actorUserId != firstUserId && actorUserId != secondUserId))
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

    private async Task<bool> CanAccessConversationAsync(string currentUserId, int conversationId, CancellationToken cancellationToken)
    {
        return int.TryParse(currentUserId, out var actorUserId) &&
               await _context.GroupConversationMembers
                   .AsNoTracking()
                   .AnyAsync(item => item.ConversationId == conversationId && item.UserId == actorUserId && !item.IsBanned, cancellationToken);
    }

    private static bool IsOwnerFromFileName(string fileName, string currentUserId)
    {
        var expectedPrefix = $"chat-{UploadPolicies.SanitizeIdentifier(currentUserId)}-";
        return fileName.StartsWith(expectedPrefix, StringComparison.Ordinal);
    }

    private static string ExtractOwnerUserIdFromFileName(string fileName)
    {
        const string prefix = "chat-";
        if (!fileName.StartsWith(prefix, StringComparison.Ordinal))
        {
            return string.Empty;
        }

        var remaining = fileName[prefix.Length..];
        var separatorIndex = remaining.IndexOf('-', StringComparison.Ordinal);
        return separatorIndex <= 0 ? string.Empty : remaining[..separatorIndex];
    }

    private static bool TryGetServerIdFromChatChannelId(string? channelId, out string serverId)
    {
        serverId = string.Empty;
        var normalizedChannelId = (channelId ?? string.Empty).Trim();
        if (!normalizedChannelId.StartsWith(ChatServerPrefix, StringComparison.Ordinal) ||
            !normalizedChannelId.Contains(ChatChannelMarker, StringComparison.Ordinal))
        {
            return false;
        }

        var separatorIndex = normalizedChannelId.IndexOf(ChatChannelMarker, StringComparison.Ordinal);
        if (separatorIndex <= ChatServerPrefix.Length)
        {
            return false;
        }

        serverId = normalizedChannelId[ChatServerPrefix.Length..separatorIndex].Trim();
        return !string.IsNullOrWhiteSpace(serverId);
    }
}
