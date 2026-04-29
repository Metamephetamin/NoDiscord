using Microsoft.EntityFrameworkCore;

namespace BackNoDiscord.Services;

public sealed record UserBlockState(
    bool CurrentUserBlockedTarget,
    bool TargetBlockedCurrentUser)
{
    public bool HasAnyBlock => CurrentUserBlockedTarget || TargetBlockedCurrentUser;
}

public class UserBlockService
{
    public const string BlockedByTargetMessage = "Пользователь ограничил общение с вами.";
    public const string YouBlockedTargetMessage = "Вы заблокировали этого пользователя.";
    public const string InteractionBlockedMessage = "Общение между пользователями ограничено.";

    private readonly AppDbContext _context;

    public UserBlockService(AppDbContext context)
    {
        _context = context;
    }

    public async Task<UserBlockState> GetBlockStateAsync(int currentUserId, int targetUserId, CancellationToken cancellationToken = default)
    {
        if (currentUserId <= 0 || targetUserId <= 0 || currentUserId == targetUserId)
        {
            return new UserBlockState(false, false);
        }

        var blocks = await _context.UserBlocks
            .AsNoTracking()
            .Where(item =>
                (item.BlockerUserId == currentUserId && item.BlockedUserId == targetUserId) ||
                (item.BlockerUserId == targetUserId && item.BlockedUserId == currentUserId))
            .Select(item => new { item.BlockerUserId, item.BlockedUserId })
            .ToListAsync(cancellationToken);

        return new UserBlockState(
            blocks.Any(item => item.BlockerUserId == currentUserId && item.BlockedUserId == targetUserId),
            blocks.Any(item => item.BlockerUserId == targetUserId && item.BlockedUserId == currentUserId));
    }

    public async Task<bool> HasAnyBlockAsync(int firstUserId, int secondUserId, CancellationToken cancellationToken = default)
    {
        if (firstUserId <= 0 || secondUserId <= 0 || firstUserId == secondUserId)
        {
            return false;
        }

        return await _context.UserBlocks
            .AsNoTracking()
            .AnyAsync(item =>
                (item.BlockerUserId == firstUserId && item.BlockedUserId == secondUserId) ||
                (item.BlockerUserId == secondUserId && item.BlockedUserId == firstUserId),
                cancellationToken);
    }

    public async Task<HashSet<int>> GetBlockedMentionTargetIdsAsync(
        int senderUserId,
        IEnumerable<int> targetUserIds,
        CancellationToken cancellationToken = default)
    {
        if (senderUserId <= 0)
        {
            return [];
        }

        var normalizedTargets = targetUserIds
            .Where(item => item > 0 && item != senderUserId)
            .Distinct()
            .ToList();

        if (normalizedTargets.Count == 0)
        {
            return [];
        }

        var blockedTargets = await _context.UserBlocks
            .AsNoTracking()
            .Where(item =>
                (item.BlockerUserId == senderUserId && normalizedTargets.Contains(item.BlockedUserId)) ||
                (normalizedTargets.Contains(item.BlockerUserId) && item.BlockedUserId == senderUserId))
            .Select(item => item.BlockerUserId == senderUserId ? item.BlockedUserId : item.BlockerUserId)
            .Distinct()
            .ToListAsync(cancellationToken);

        return blockedTargets.ToHashSet();
    }

    public async Task<UserBlockState> BlockAsync(int blockerUserId, int blockedUserId, CancellationToken cancellationToken = default)
    {
        if (blockerUserId <= 0 || blockedUserId <= 0 || blockerUserId == blockedUserId)
        {
            return new UserBlockState(false, false);
        }

        var exists = await _context.UserBlocks
            .AnyAsync(item => item.BlockerUserId == blockerUserId && item.BlockedUserId == blockedUserId, cancellationToken);

        if (!exists)
        {
            _context.UserBlocks.Add(new UserBlockRecord
            {
                BlockerUserId = blockerUserId,
                BlockedUserId = blockedUserId,
                CreatedAt = DateTimeOffset.UtcNow,
            });
            await _context.SaveChangesAsync(cancellationToken);
        }

        return await GetBlockStateAsync(blockerUserId, blockedUserId, cancellationToken);
    }

    public async Task<UserBlockState> UnblockAsync(int blockerUserId, int blockedUserId, CancellationToken cancellationToken = default)
    {
        if (blockerUserId <= 0 || blockedUserId <= 0 || blockerUserId == blockedUserId)
        {
            return new UserBlockState(false, false);
        }

        var blocks = await _context.UserBlocks
            .Where(item => item.BlockerUserId == blockerUserId && item.BlockedUserId == blockedUserId)
            .ToListAsync(cancellationToken);

        if (blocks.Count > 0)
        {
            _context.UserBlocks.RemoveRange(blocks);
            await _context.SaveChangesAsync(cancellationToken);
        }

        return await GetBlockStateAsync(blockerUserId, blockedUserId, cancellationToken);
    }
}
