using System.Collections.Concurrent;
using BackNoDiscord.Services;

namespace BackNoDiscord.Security;

public sealed class AbuseAutoBanService
{
    private const int MessageBurstViolationBanThreshold = 6;
    private const int FriendRequestBurstBanThreshold = 30;
    private const int RiskAutoBanThreshold = 100;
    private const int RiskReviewThreshold = 65;
    private const int NewDeviceRiskScore = 15;
    private const int NewIpFamilyRiskScore = 15;
    private const int MessageBurstViolationRiskScore = 35;
    private const int FriendRequestRiskScore = 2;
    private static readonly TimeSpan MessageBurstViolationWindow = TimeSpan.FromMinutes(5);
    private static readonly TimeSpan FriendRequestBurstWindow = TimeSpan.FromMinutes(10);
    private static readonly TimeSpan RiskSignalWindow = TimeSpan.FromMinutes(30);
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
            MessageBurstViolationRiskScore,
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
            FriendRequestRiskScore,
            "Mass outgoing friend requests",
            cancellationToken);
    }

    public Task<AbuseAutoBanResult> RecordLoginSecuritySignalAsync(
        int userId,
        LoginSecuritySignal? signal,
        DateTimeOffset now,
        CancellationToken cancellationToken = default)
    {
        if (userId <= 0 || signal is null || !signal.IsSuspicious)
        {
            return Task.FromResult(AbuseAutoBanResult.Allowed);
        }

        var riskScore = 0;
        if (signal.IsNewDevice)
        {
            riskScore += NewDeviceRiskScore;
        }

        if (signal.IsNewIpFamily)
        {
            riskScore += NewIpFamilyRiskScore;
        }

        if (riskScore <= 0)
        {
            return Task.FromResult(AbuseAutoBanResult.Allowed);
        }

        TrimState(now);
        var window = _windows.GetOrAdd(userId, _ => new UserAbuseWindow());
        int totalRiskScore;
        lock (window.Sync)
        {
            window.LastTouchedUtc = now;
            totalRiskScore = AddRiskSignal(window, now, riskScore, isLoginSecuritySignal: true);
        }

        return Task.FromResult(new AbuseAutoBanResult(
            IsBanned: false,
            Reason: "Login security signal",
            EventCount: 1,
            RiskScore: totalRiskScore,
            Action: totalRiskScore >= RiskReviewThreshold ? "review" : "allow"));
    }

    private async Task<AbuseAutoBanResult> RecordAsync(
        int userId,
        DateTimeOffset now,
        Func<UserAbuseWindow, Queue<DateTimeOffset>> queueSelector,
        TimeSpan windowDuration,
        int banThreshold,
        int riskScore,
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
        var totalRiskScore = 0;

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
            totalRiskScore = AddRiskSignal(window, now, riskScore, isLoginSecuritySignal: false);
            shouldBan = count >= banThreshold || (totalRiskScore >= RiskAutoBanThreshold && HasRecentLoginSecuritySignal(window));
        }

        if (!shouldBan)
        {
            return new AbuseAutoBanResult(
                IsBanned: false,
                Reason: string.Empty,
                EventCount: count,
                RiskScore: totalRiskScore,
                Action: totalRiskScore >= RiskReviewThreshold ? "throttle" : "allow");
        }

        var resolvedReason = count >= banThreshold
            ? reason
            : $"{reason}; risk score {totalRiskScore}";
        var banned = await BanForAbuseAsync(userId, resolvedReason, cancellationToken);
        return banned
            ? new AbuseAutoBanResult(true, resolvedReason, count, totalRiskScore, "ban")
            : new AbuseAutoBanResult(false, string.Empty, count, totalRiskScore, totalRiskScore >= RiskReviewThreshold ? "throttle" : "allow");
    }

    private static int AddRiskSignal(UserAbuseWindow window, DateTimeOffset now, int score, bool isLoginSecuritySignal)
    {
        var cutoff = now - RiskSignalWindow;
        while (window.RiskSignals.Count > 0 && window.RiskSignals.Peek().CreatedAt <= cutoff)
        {
            window.RiskSignals.Dequeue();
        }

        window.RiskSignals.Enqueue(new AbuseRiskSignal(now, score, isLoginSecuritySignal));
        return window.RiskSignals.Sum(signal => signal.Score);
    }

    private static bool HasRecentLoginSecuritySignal(UserAbuseWindow window)
    {
        return window.RiskSignals.Any(signal => signal.IsLoginSecuritySignal);
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
        public Queue<AbuseRiskSignal> RiskSignals { get; } = new();
        public DateTimeOffset LastTouchedUtc { get; set; }
    }

    private sealed record AbuseRiskSignal(DateTimeOffset CreatedAt, int Score, bool IsLoginSecuritySignal);
}

public sealed record AbuseAutoBanResult(bool IsBanned, string Reason, int EventCount, int RiskScore = 0, string Action = "allow")
{
    public static AbuseAutoBanResult Allowed { get; } = new(false, string.Empty, 0);
}
