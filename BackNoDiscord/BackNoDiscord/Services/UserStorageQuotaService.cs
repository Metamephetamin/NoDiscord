using Microsoft.EntityFrameworkCore;

namespace BackNoDiscord.Services;

public sealed class UserStorageQuotaService
{
    private readonly AppDbContext _context;

    public UserStorageQuotaService(AppDbContext context)
    {
        _context = context;
    }

    public async Task<long> GetUserUsageAsync(string userId, CancellationToken cancellationToken)
    {
        var normalizedUserId = (userId ?? string.Empty).Trim();
        if (string.IsNullOrWhiteSpace(normalizedUserId))
        {
            return 0;
        }

        return await _context.ChatFileUploads
            .AsNoTracking()
            .Where(item => item.OwnerUserId == normalizedUserId && item.DeletedAt == null)
            .SumAsync(item => item.Size, cancellationToken);
    }

    public async Task<long> GetServerUsageAsync(string serverId, CancellationToken cancellationToken)
    {
        var normalizedServerId = (serverId ?? string.Empty).Trim();
        if (string.IsNullOrWhiteSpace(normalizedServerId))
        {
            return 0;
        }

        var channelPrefix = $"server:{normalizedServerId}::channel:";
        return await _context.ChatFileUploads
            .AsNoTracking()
            .Where(item => item.ChannelId != null && item.ChannelId.StartsWith(channelPrefix) && item.DeletedAt == null)
            .SumAsync(item => item.Size, cancellationToken);
    }

    public async Task EnsureUserQuotaAsync(
        string userId,
        long additionalBytes,
        long maxUserStorageBytes,
        CancellationToken cancellationToken)
    {
        var usage = await GetUserUsageAsync(userId, cancellationToken);
        if (usage + Math.Max(0, additionalBytes) > maxUserStorageBytes)
        {
            throw new InvalidOperationException("User storage quota exceeded.");
        }
    }
}
