using Microsoft.EntityFrameworkCore;

namespace BackNoDiscord.Services;

public sealed class ChatReadStateService
{
    private const int MaxUserIdLength = 64;
    private const int MaxChannelIdLength = 160;
    private readonly AppDbContext _context;

    public ChatReadStateService(AppDbContext context)
    {
        _context = context;
    }

    public async Task<ChatChannelReadStateRecord> MarkReadAsync(
        string? userId,
        string? channelId,
        int? lastReadMessageId,
        DateTimeOffset readAt,
        CancellationToken cancellationToken)
    {
        var normalizedUserId = Normalize(userId, MaxUserIdLength);
        var normalizedChannelId = Normalize(channelId, MaxChannelIdLength);
        if (string.IsNullOrWhiteSpace(normalizedUserId) || string.IsNullOrWhiteSpace(normalizedChannelId))
        {
            throw new ArgumentException("userId and channelId are required.");
        }

        var existing = await _context.ChatChannelReadStates
            .FirstOrDefaultAsync(
                item => item.UserId == normalizedUserId && item.ChannelId == normalizedChannelId,
                cancellationToken);

        if (existing is null)
        {
            existing = new ChatChannelReadStateRecord
            {
                UserId = normalizedUserId,
                ChannelId = normalizedChannelId,
                LastReadMessageId = lastReadMessageId,
                LastReadAt = readAt,
                UpdatedAt = readAt
            };
            _context.ChatChannelReadStates.Add(existing);
        }
        else
        {
            if (lastReadMessageId.HasValue)
            {
                existing.LastReadMessageId = Math.Max(existing.LastReadMessageId ?? 0, lastReadMessageId.Value);
            }

            if (readAt > existing.LastReadAt)
            {
                existing.LastReadAt = readAt;
            }
            existing.UpdatedAt = readAt;
        }

        await _context.SaveChangesAsync(cancellationToken);
        return existing;
    }

    public async Task<ChatChannelReadStateRecord?> GetReadStateAsync(
        string? userId,
        string? channelId,
        CancellationToken cancellationToken)
    {
        var normalizedUserId = Normalize(userId, MaxUserIdLength);
        var normalizedChannelId = Normalize(channelId, MaxChannelIdLength);
        if (string.IsNullOrWhiteSpace(normalizedUserId) || string.IsNullOrWhiteSpace(normalizedChannelId))
        {
            return null;
        }

        return await _context.ChatChannelReadStates
            .AsNoTracking()
            .FirstOrDefaultAsync(
                item => item.UserId == normalizedUserId && item.ChannelId == normalizedChannelId,
                cancellationToken);
    }

    private static string Normalize(string? value, int maxLength)
    {
        var normalized = value?.Trim() ?? string.Empty;
        return normalized.Length <= maxLength ? normalized : normalized[..maxLength];
    }
}
