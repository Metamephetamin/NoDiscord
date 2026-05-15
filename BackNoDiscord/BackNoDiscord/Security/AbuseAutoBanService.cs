using System.Collections.Concurrent;
using BackNoDiscord.Services;

namespace BackNoDiscord.Security;

public sealed class AbuseAutoBanService
{
    private const int MessageBurstViolationBanThreshold = 6;
    private const int FriendRequestBurstBanThreshold = 30;
    private static readonly TimeSpan MessageBurstViolationWindow = TimeSpan.FromMinutes(5);
    private static readonly TimeSpan FriendRequestBurstWindow = TimeSpan.FromMinutes(10);
    private static readonly TimeSpan EntryMaxAge = TimeSpan.FromMinutes(30);
    private static readonly TimeSpan CleanupInterval = TimeSpan.FromMinutes(5);

    private readonly ConcurrentDictionary<int, UserAbuseWindow> _windows = new();
    private readonly IServiceScopeFactory _scopeFactory;
    private readonly ILogger<AbuseAutoBanService> _logger;
    private readonly object _cleanupSync = new();
    private DateTimeOffset _lastCleanupUtc = DateTimeOffset.MinValue;

    public AbuseAutoBanService(IServiceScopeFactory scopeFactory, ILogger<AbuseAutoBanService> logger)
    {
        _scopeFactory = scopeFactory;
        _logger = logger;
    }

    public async Task<AbuseAutoBanResult> RecordMessageBurstViolationAsync(
        int userId,
        DateTimeOffset now,
        CancellationToken cancellationToken = default)
    {
        return await RecordAsync(
            userId,
            now,
            window => window.MessageBurstViolations,
            MessageBurstViolationWindow,
            MessageBurstViolationBanThreshold,
            "Repeated chat message burst violations",
            cancellationToken);
    }

    public async Task<AbuseAutoBanResult> RecordOutgoingFriendRequestAsync(
        int userId,
        DateTimeOffset now,
        CancellationToken cancellationToken = default)
    {
        return await RecordAsync(
            userId,
            now,
            window => window.OutgoingFriendRequests,
            FriendRequestBurstWindow,
            FriendRequestBurstBanThreshold,
            "Mass outgoing friend requests",
            cancellationToken);
    }

    private async Task<AbuseAutoBanResult> RecordAsync(
        int userId,
        DateTimeOffset now,
        Func<UserAbuseWindow, Queue<DateTimeOffset>> queueSelector,
        TimeSpan windowDuration,
        int banThreshold,
        string reason,
        CancellationToken cancellationToken)
    {
        if (userId <= 0)
        {
            return AbuseAutoBanResult.Allowed;
        }

        TrimState(now);
        var window = _windows.GetOrAdd(userId, _ => new UserAbuseWindow());
        var shouldBan = false;
        var count = 0;

        lock (window.Sync)
        {
            window.LastTouchedUtc = now;
            var events = queueSelector(window);
            var cutoff = now - windowDuration;
            while (events.Count > 0 && events.Peek() <= cutoff)
            {
                events.Dequeue();
            }

            events.Enqueue(now);
            count = events.Count;
            shouldBan = count >= banThreshold;
        }

        if (!shouldBan)
        {
            return AbuseAutoBanResult.Allowed;
        }

        var banned = await BanForAbuseAsync(userId, reason, cancellationToken);
        return banned
            ? new AbuseAutoBanResult(true, reason, count)
            : AbuseAutoBanResult.Allowed;
    }

    private async Task<bool> BanForAbuseAsync(int userId, string reason, CancellationToken cancellationToken)
    {
        try
        {
            await using var scope = _scopeFactory.CreateAsyncScope();
            var accountBanService = scope.ServiceProvider.GetRequiredService<AccountBanService>();
            var result = await accountBanService.BanUserForAbuseAsync(userId, reason, cancellationToken);
            if (result == AccountBanResult.Success)
            {
                _logger.LogWarning("Auto-banned user {UserId} for abuse reason {Reason}", userId, reason);
                return true;
            }

            _logger.LogWarning("Skipped auto-ban for user {UserId}; result {Result}", userId, result);
            return false;
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            _logger.LogError(ex, "Failed to auto-ban user {UserId} for abuse", userId);
            return false;
        }
    }

    private void TrimState(DateTimeOffset now)
    {
        if (now - _lastCleanupUtc < CleanupInterval)
        {
            return;
        }

        lock (_cleanupSync)
        {
            if (now - _lastCleanupUtc < CleanupInterval)
            {
                return;
            }

            _lastCleanupUtc = now;
            foreach (var entry in _windows)
            {
                if (now - entry.Value.LastTouchedUtc > EntryMaxAge)
                {
                    _windows.TryRemove(entry.Key, out _);
                }
            }
        }
    }

    private sealed class UserAbuseWindow
    {
        public object Sync { get; } = new();
        public Queue<DateTimeOffset> MessageBurstViolations { get; } = new();
        public Queue<DateTimeOffset> OutgoingFriendRequests { get; } = new();
        public DateTimeOffset LastTouchedUtc { get; set; }
    }
}

public sealed record AbuseAutoBanResult(bool IsBanned, string Reason, int EventCount)
{
    public static AbuseAutoBanResult Allowed { get; } = new(false, string.Empty, 0);
}
