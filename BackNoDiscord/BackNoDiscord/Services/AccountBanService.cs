using Microsoft.EntityFrameworkCore;
using System.IdentityModel.Tokens.Jwt;
using System.Net;
using System.Security.Claims;
using BackNoDiscord.Security;

namespace BackNoDiscord.Services;

public sealed class AccountBanService
{
    public const string IdentityTypeEmail = "email";
    public const string IdentityTypePhone = "phone";
    public const string IdentityTypeDeviceToken = "device_token";
    public const string IdentityTypeIpFamily = "ip_family";

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
        return await BanUserCoreAsync(actorUserId, targetUserId, reason, denySelfBan: true, cancellationToken);
    }

    public async Task<AccountBanResult> BanUserForAbuseAsync(int targetUserId, string? reason, CancellationToken cancellationToken)
    {
        return await BanUserCoreAsync(null, targetUserId, reason, denySelfBan: false, cancellationToken);
    }

    private async Task<AccountBanResult> BanUserCoreAsync(int? actorUserId, int targetUserId, string? reason, bool denySelfBan, CancellationToken cancellationToken)
    {
        var target = await _context.Users.FirstOrDefaultAsync(user => user.id == targetUserId, cancellationToken);
        if (target == null)
        {
            return AccountBanResult.NotFound;
        }

        if (denySelfBan && target.id == actorUserId)
        {
            return AccountBanResult.SelfBanDenied;
        }

        if (IsAdmin(target))
        {
            return AccountBanResult.AdminBanDenied;
        }

        var now = DateTimeOffset.UtcNow;
        target.IsBanned = true;
        target.BannedAt = now;
        target.BannedByUserId = actorUserId;
        target.BanReason = NormalizeReason(reason);

        var sessions = await _context.RefreshTokens
            .Where(item => item.UserId == target.id)
            .ToListAsync(cancellationToken);

        await AddBannedIdentitiesForUserAsync(target, sessions, actorUserId, now, cancellationToken);
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

        var now = DateTimeOffset.UtcNow;
        var activeIdentities = await _context.BannedIdentityRecords
            .Where(item => item.SourceUserId == targetUserId && item.RevokedAt == null)
            .ToListAsync(cancellationToken);

        foreach (var identity in activeIdentities)
        {
            identity.RevokedAt = now;
        }

        await _context.SaveChangesAsync(cancellationToken);
        return AccountBanResult.Success;
    }

    public async Task<ClientBanDecision> EvaluateClientBanAsync(
        User? user,
        string? email,
        string? phoneNumber,
        string? deviceToken,
        string? clientIp,
        DateTimeOffset now,
        CancellationToken cancellationToken)
    {
        var signals = BuildIdentitySignals(email, phoneNumber, deviceToken, clientIp);
        if (signals.Count == 0)
        {
            return ClientBanDecision.Allowed;
        }

        var signalKeys = signals.Select(signal => signal.Key).ToHashSet(StringComparer.Ordinal);
        var signalTypes = signals.Select(signal => signal.Type).Distinct().ToList();
        var signalHashes = signals.Select(signal => signal.Hash).Distinct().ToList();
        var candidateIdentities = await _context.BannedIdentityRecords
            .Where(item =>
                item.RevokedAt == null &&
                signalTypes.Contains(item.IdentityType) &&
                signalHashes.Contains(item.IdentityHash))
            .OrderByDescending(item => item.CreatedAt)
            .ToListAsync(cancellationToken);
        var matchedIdentity = candidateIdentities.FirstOrDefault(item => signalKeys.Contains(item.IdentityType + ":" + item.IdentityHash));
        if (matchedIdentity is null)
        {
            return ClientBanDecision.Allowed;
        }

        matchedIdentity.LastMatchedAt = now;
        matchedIdentity.MatchCount += 1;

        if (user is not null && !user.IsBanned && !IsAdmin(user))
        {
            user.IsBanned = true;
            user.BannedAt = now;
            user.BannedByUserId = matchedIdentity.CreatedByUserId;
            user.BanReason = NormalizeReason($"Matched banned identity: {matchedIdentity.IdentityType}");
            await AddBannedIdentitySignalsAsync(user, signals, matchedIdentity.CreatedByUserId, now, cancellationToken);
            await RevokeActiveSessionsAsync(user.id, now, cancellationToken);
        }

        await _context.SaveChangesAsync(cancellationToken);
        return new ClientBanDecision(false, matchedIdentity.IdentityType, matchedIdentity.SourceUserId);
    }

    public static string NormalizeDeviceToken(string? value)
    {
        var normalized = (value ?? string.Empty).Trim();
        if (normalized.Length < 32 || normalized.Length > 512)
        {
            return string.Empty;
        }

        return normalized.All(character => character is >= '!' and <= '~')
            ? normalized
            : string.Empty;
    }

    public static string HashIdentityValue(string identityType, string value)
    {
        return AuthInputPolicies.HashSecret($"{identityType}:{value}");
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

    private async Task AddBannedIdentitiesForUserAsync(
        User user,
        IReadOnlyCollection<RefreshTokenRecord> sessions,
        int? actorUserId,
        DateTimeOffset now,
        CancellationToken cancellationToken)
    {
        var signals = BuildIdentitySignals(
            user.email,
            user.phone_number,
            null,
            null);

        foreach (var session in sessions)
        {
            signals.AddRange(BuildIdentitySignals(null, null, session.DeviceTokenHash, session.LastIp));
        }

        await AddBannedIdentitySignalsAsync(user, signals, actorUserId, now, cancellationToken);
    }

    private async Task AddBannedIdentitySignalsAsync(
        User user,
        IReadOnlyCollection<IdentitySignal> signals,
        int? actorUserId,
        DateTimeOffset now,
        CancellationToken cancellationToken)
    {
        var uniqueSignals = signals
            .GroupBy(item => item.Key, StringComparer.Ordinal)
            .Select(group => group.First())
            .ToList();
        if (uniqueSignals.Count == 0)
        {
            return;
        }

        var signalTypes = uniqueSignals.Select(signal => signal.Type).Distinct().ToList();
        var signalHashes = uniqueSignals.Select(signal => signal.Hash).Distinct().ToList();
        var existingIdentities = await _context.BannedIdentityRecords
            .Where(item =>
                item.RevokedAt == null &&
                signalTypes.Contains(item.IdentityType) &&
                signalHashes.Contains(item.IdentityHash))
            .ToListAsync(cancellationToken);
        var existingKeys = existingIdentities
            .Select(item => item.IdentityType + ":" + item.IdentityHash)
            .ToHashSet(StringComparer.Ordinal);

        foreach (var signal in uniqueSignals)
        {
            if (existingKeys.Contains(signal.Key))
            {
                continue;
            }

            _context.BannedIdentityRecords.Add(new BannedIdentityRecord
            {
                IdentityType = signal.Type,
                IdentityHash = signal.Hash,
                SourceUserId = user.id,
                CreatedByUserId = actorUserId,
                CreatedAt = now,
                Reason = NormalizeReason(user.BanReason)
            });
        }
    }

    private static List<IdentitySignal> BuildIdentitySignals(string? email, string? phoneNumber, string? deviceToken, string? clientIp)
    {
        var signals = new List<IdentitySignal>(4);

        var normalizedEmail = NormalizeEmail(email);
        if (!string.IsNullOrWhiteSpace(normalizedEmail))
        {
            signals.Add(CreateSignal(IdentityTypeEmail, normalizedEmail));
        }

        var normalizedPhone = NormalizePhone(phoneNumber);
        if (!string.IsNullOrWhiteSpace(normalizedPhone))
        {
            signals.Add(CreateSignal(IdentityTypePhone, normalizedPhone));
        }

        var normalizedDeviceToken = NormalizeDeviceToken(deviceToken);
        if (!string.IsNullOrWhiteSpace(normalizedDeviceToken))
        {
            var looksAlreadyHashed = normalizedDeviceToken.Length == 64 &&
                normalizedDeviceToken.All(character => Uri.IsHexDigit(character));
            signals.Add(looksAlreadyHashed
                ? new IdentitySignal(IdentityTypeDeviceToken, normalizedDeviceToken.ToUpperInvariant())
                : CreateSignal(IdentityTypeDeviceToken, normalizedDeviceToken));
        }

        var normalizedIpFamily = NormalizeIpFamily(clientIp);
        if (!string.IsNullOrWhiteSpace(normalizedIpFamily))
        {
            signals.Add(CreateSignal(IdentityTypeIpFamily, normalizedIpFamily));
        }

        return signals;
    }

    private static IdentitySignal CreateSignal(string type, string value)
    {
        return new IdentitySignal(type, HashIdentityValue(type, value));
    }

    private static string NormalizePhone(string? value)
    {
        return new string((value ?? string.Empty).Where(char.IsDigit).ToArray());
    }

    private static string NormalizeIpFamily(string? value)
    {
        var normalized = (value ?? string.Empty).Trim();
        if (!IPAddress.TryParse(normalized, out var ipAddress))
        {
            return string.Empty;
        }

        var bytes = ipAddress.GetAddressBytes();
        if (ipAddress.AddressFamily == System.Net.Sockets.AddressFamily.InterNetwork && bytes.Length == 4)
        {
            return $"{bytes[0]}.{bytes[1]}.{bytes[2]}";
        }

        if (ipAddress.AddressFamily == System.Net.Sockets.AddressFamily.InterNetworkV6 && bytes.Length == 16)
        {
            return Convert.ToHexString(bytes.AsSpan(0, 8));
        }

        return string.Empty;
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

    private sealed record IdentitySignal(string Type, string Hash)
    {
        public string Key => Type + ":" + Hash;
    }
}

public sealed record ClientBanDecision(bool IsAllowed, string IdentityType, int SourceUserId)
{
    public static ClientBanDecision Allowed { get; } = new(true, string.Empty, 0);
}

public enum AccountBanResult
{
    Success,
    NotFound,
    SelfBanDenied,
    AdminBanDenied
}
