using Microsoft.EntityFrameworkCore;
using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;

namespace BackNoDiscord.Services;

public sealed class AccountBanService
{
    private readonly AppDbContext _context;
    private readonly IConfiguration _configuration;

    public AccountBanService(AppDbContext context, IConfiguration configuration)
    {
        _context = context;
        _configuration = configuration;
    }

    public async Task<User?> GetCurrentUserAsync(ClaimsPrincipal principal, CancellationToken cancellationToken)
    {
        var userId = GetUserId(principal);
        if (!userId.HasValue)
        {
            return null;
        }

        return await _context.Users.FirstOrDefaultAsync(user => user.id == userId.Value, cancellationToken);
    }

    public async Task<bool> IsCurrentUserAdminAsync(ClaimsPrincipal principal, CancellationToken cancellationToken)
    {
        var user = await GetCurrentUserAsync(principal, cancellationToken);
        return user != null && IsAdmin(user);
    }

    public bool IsAdmin(User user)
    {
        var configuredIds = ReadConfiguredSet("Admin:UserIds", "Admin:UserId");
        if (configuredIds.Contains(user.id.ToString()))
        {
            return true;
        }

        var normalizedEmail = NormalizeEmail(user.email);
        if (!string.IsNullOrWhiteSpace(normalizedEmail) && ReadConfiguredSet("Admin:Emails", "Admin:Email").Contains(normalizedEmail))
        {
            return true;
        }

        return false;
    }

    public async Task<bool> IsUserBannedAsync(int userId, CancellationToken cancellationToken)
    {
        return await _context.Users
            .AsNoTracking()
            .Where(user => user.id == userId)
            .Select(user => user.IsBanned)
            .FirstOrDefaultAsync(cancellationToken);
    }

    public async Task<int> RevokeActiveSessionsAsync(int userId, DateTimeOffset now, CancellationToken cancellationToken)
    {
        var activeSessions = await _context.RefreshTokens
            .Where(item => item.UserId == userId && !item.RevokedAt.HasValue && item.ExpiresAt > now)
            .ToListAsync(cancellationToken);

        foreach (var session in activeSessions)
        {
            session.RevokedAt = now;
            session.LastUsedAt = now;
        }

        if (activeSessions.Count > 0)
        {
            await _context.SaveChangesAsync(cancellationToken);
        }

        return activeSessions.Count;
    }

    public async Task<AccountBanResult> BanUserAsync(int actorUserId, int targetUserId, string? reason, CancellationToken cancellationToken)
    {
        var target = await _context.Users.FirstOrDefaultAsync(user => user.id == targetUserId, cancellationToken);
        if (target == null)
        {
            return AccountBanResult.NotFound;
        }

        if (target.id == actorUserId)
        {
            return AccountBanResult.SelfBanDenied;
        }

        var now = DateTimeOffset.UtcNow;
        target.IsBanned = true;
        target.BannedAt = now;
        target.BannedByUserId = actorUserId;
        target.BanReason = NormalizeReason(reason);

        await RevokeActiveSessionsAsync(target.id, now, cancellationToken);
        await DeactivatePushSubscriptionsAsync(target.id, now, cancellationToken);
        await _context.SaveChangesAsync(cancellationToken);
        return AccountBanResult.Success;
    }

    public async Task<AccountBanResult> UnbanUserAsync(int targetUserId, CancellationToken cancellationToken)
    {
        var target = await _context.Users.FirstOrDefaultAsync(user => user.id == targetUserId, cancellationToken);
        if (target == null)
        {
            return AccountBanResult.NotFound;
        }

        target.IsBanned = false;
        target.BannedAt = null;
        target.BannedByUserId = null;
        target.BanReason = null;
        await _context.SaveChangesAsync(cancellationToken);
        return AccountBanResult.Success;
    }

    public static int? GetUserId(ClaimsPrincipal principal)
    {
        var userIdClaim = principal.FindFirstValue(ClaimTypes.NameIdentifier)
                          ?? principal.FindFirstValue(JwtRegisteredClaimNames.Sub);
        return int.TryParse(userIdClaim, out var userId) ? userId : null;
    }

    private async Task DeactivatePushSubscriptionsAsync(int userId, DateTimeOffset now, CancellationToken cancellationToken)
    {
        var subscriptions = await _context.PushSubscriptions
            .Where(item => item.UserId == userId && item.IsActive)
            .ToListAsync(cancellationToken);

        foreach (var subscription in subscriptions)
        {
            subscription.IsActive = false;
            subscription.UpdatedAt = now;
        }
    }

    private HashSet<string> ReadConfiguredSet(params string[] keys)
    {
        var values = keys
            .SelectMany(key => SplitConfiguredValue(_configuration[key]))
            .ToHashSet(StringComparer.OrdinalIgnoreCase);

        return values;
    }

    private static IEnumerable<string> SplitConfiguredValue(string? value)
    {
        return (value ?? string.Empty)
            .Split([',', ';', ' ', '\n', '\r', '\t'], StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
            .Select(item => NormalizeEmail(item))
            .Where(item => !string.IsNullOrWhiteSpace(item));
    }

    private static string NormalizeEmail(string? value)
    {
        return (value ?? string.Empty).Trim().ToLowerInvariant();
    }

    private static string NormalizeReason(string? value)
    {
        var normalized = (value ?? string.Empty).Trim();
        return normalized.Length <= 500 ? normalized : normalized[..500];
    }
}

public enum AccountBanResult
{
    Success,
    NotFound,
    SelfBanDenied
}
