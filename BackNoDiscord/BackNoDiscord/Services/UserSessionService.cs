using Microsoft.EntityFrameworkCore;
using System.Net;

namespace BackNoDiscord.Services;

public sealed class UserSessionService
{
    private readonly AppDbContext _context;

    public UserSessionService(AppDbContext context)
    {
        _context = context;
    }

    public async Task<IReadOnlyList<UserSessionSummary>> GetActiveSessionsAsync(
        int userId,
        string? currentRefreshTokenHash,
        CancellationToken cancellationToken)
    {
        var now = DateTimeOffset.UtcNow;
        var sessions = await _context.RefreshTokens
            .AsNoTracking()
            .Where(item =>
                item.UserId == userId &&
                !item.RevokedAt.HasValue &&
                item.ExpiresAt > now)
            .OrderByDescending(item => item.LastUsedAt)
            .ThenByDescending(item => item.CreatedAt)
            .ToListAsync(cancellationToken);

        return sessions
            .Select(item => new UserSessionSummary(
                item.Id,
                string.IsNullOrWhiteSpace(item.DeviceLabel) ? "Устройство" : item.DeviceLabel,
                item.UserAgent ?? string.Empty,
                item.LastIp ?? string.Empty,
                item.CreatedAt,
                item.LastUsedAt,
                item.ExpiresAt,
                !string.IsNullOrWhiteSpace(currentRefreshTokenHash) &&
                string.Equals(item.TokenHash, currentRefreshTokenHash, StringComparison.Ordinal)))
            .ToList();
    }

    public async Task<bool> RevokeSessionAsync(
        int userId,
        int sessionId,
        string clientIp,
        DateTimeOffset now,
        CancellationToken cancellationToken)
    {
        var session = await _context.RefreshTokens.FirstOrDefaultAsync(
            item => item.Id == sessionId && item.UserId == userId,
            cancellationToken);
        if (session is null)
        {
            return false;
        }

        if (!session.RevokedAt.HasValue)
        {
            session.RevokedAt = now;
            session.LastUsedAt = now;
            session.LastIp = clientIp;
            await _context.SaveChangesAsync(cancellationToken);
        }

        return true;
    }

    public async Task<int> RevokeOtherSessionsAsync(
        int userId,
        string? currentRefreshTokenHash,
        string clientIp,
        DateTimeOffset now,
        CancellationToken cancellationToken)
    {
        var activeSessions = await _context.RefreshTokens
            .Where(item =>
                item.UserId == userId &&
                !item.RevokedAt.HasValue &&
                item.ExpiresAt > now)
            .ToListAsync(cancellationToken);

        var revoked = 0;
        foreach (var session in activeSessions)
        {
            if (!string.IsNullOrWhiteSpace(currentRefreshTokenHash) &&
                string.Equals(session.TokenHash, currentRefreshTokenHash, StringComparison.Ordinal))
            {
                continue;
            }

            session.RevokedAt = now;
            session.LastUsedAt = now;
            session.LastIp = clientIp;
            revoked += 1;
        }

        if (revoked > 0)
        {
            await _context.SaveChangesAsync(cancellationToken);
        }

        return revoked;
    }

    public async Task<bool> RevokeActiveSessionsAfterRefreshTokenReuseAsync(
        string reusedTokenHash,
        DateTimeOffset now,
        CancellationToken cancellationToken)
    {
        var reusedToken = await _context.RefreshTokens
            .AsNoTracking()
            .FirstOrDefaultAsync(
                item =>
                    item.TokenHash == reusedTokenHash &&
                    item.RevokedAt.HasValue &&
                    item.ReplacedByTokenHash != null,
                cancellationToken);
        if (reusedToken is null)
        {
            return false;
        }

        var activeSessions = await _context.RefreshTokens
            .Where(item =>
                item.UserId == reusedToken.UserId &&
                !item.RevokedAt.HasValue &&
                item.ExpiresAt > now)
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

        return true;
    }

    public async Task<LoginSecuritySignal?> DetectLoginSecuritySignalAsync(
        int userId,
        string deviceLabel,
        string clientIp,
        DateTimeOffset now,
        CancellationToken cancellationToken)
    {
        var activeSessions = await _context.RefreshTokens
            .AsNoTracking()
            .Where(item =>
                item.UserId == userId &&
                !item.RevokedAt.HasValue &&
                item.ExpiresAt > now)
            .ToListAsync(cancellationToken);
        if (activeSessions.Count == 0)
        {
            return null;
        }

        var normalizedDeviceLabel = (deviceLabel ?? string.Empty).Trim();
        var normalizedIpFamily = NormalizeIpFamily(clientIp);
        var isNewDevice = activeSessions.All(item =>
            !string.Equals(item.DeviceLabel, normalizedDeviceLabel, StringComparison.OrdinalIgnoreCase));
        var isNewIpFamily = !string.IsNullOrWhiteSpace(normalizedIpFamily) &&
            activeSessions
                .Select(item => NormalizeIpFamily(item.LastIp))
                .Where(item => !string.IsNullOrWhiteSpace(item))
                .All(item => !string.Equals(item, normalizedIpFamily, StringComparison.OrdinalIgnoreCase));

        return isNewDevice || isNewIpFamily
            ? new LoginSecuritySignal(true, isNewDevice, isNewIpFamily)
            : null;
    }

    private static string NormalizeIpFamily(string? value)
    {
        var normalized = (value ?? string.Empty).Trim();
        if (!IPAddress.TryParse(normalized, out var ipAddress))
        {
            return normalized.ToLowerInvariant();
        }

        var bytes = ipAddress.GetAddressBytes();
        if (ipAddress.AddressFamily == System.Net.Sockets.AddressFamily.InterNetwork && bytes.Length == 4)
        {
            return $"{bytes[0]}.{bytes[1]}";
        }

        if (ipAddress.AddressFamily == System.Net.Sockets.AddressFamily.InterNetworkV6 && bytes.Length == 16)
        {
            return Convert.ToHexString(bytes.AsSpan(0, 8));
        }

        return normalized.ToLowerInvariant();
    }
}

public sealed record UserSessionSummary(
    int Id,
    string DeviceLabel,
    string UserAgent,
    string LastIp,
    DateTimeOffset CreatedAt,
    DateTimeOffset LastUsedAt,
    DateTimeOffset ExpiresAt,
    bool IsCurrent);

public sealed record LoginSecuritySignal(
    bool IsSuspicious,
    bool IsNewDevice,
    bool IsNewIpFamily);
