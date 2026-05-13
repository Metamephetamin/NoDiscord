using BackNoDiscord.Security;
using Microsoft.EntityFrameworkCore;

namespace BackNoDiscord.Services;

public sealed class MessageDeduplicationService
{
    public static string NormalizeClientMessageId(string? clientMessageId, string? clientTempId = null)
    {
        var normalizedClientMessageId = UploadPolicies.TrimToLength(clientMessageId, 160);
        if (!string.IsNullOrWhiteSpace(normalizedClientMessageId))
        {
            return normalizedClientMessageId;
        }

        return UploadPolicies.TrimToLength(clientTempId, 160);
    }

    public async Task<Message?> FindExistingAsync(
        AppDbContext context,
        IReadOnlyCollection<string> channelIds,
        string authorUserId,
        string clientMessageId,
        CancellationToken cancellationToken)
    {
        if (channelIds.Count == 0 || string.IsNullOrWhiteSpace(authorUserId) || string.IsNullOrWhiteSpace(clientMessageId))
        {
            return null;
        }

        return await context.Messages
            .Where(message =>
                !message.IsDeleted &&
                message.AuthorUserId == authorUserId &&
                message.ClientMessageId == clientMessageId &&
                channelIds.Contains(message.ChannelId))
            .OrderBy(message => message.Id)
            .FirstOrDefaultAsync(cancellationToken);
    }
}
