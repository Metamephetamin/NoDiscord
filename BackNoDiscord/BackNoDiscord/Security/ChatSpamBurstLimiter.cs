using System.Collections.Concurrent;

namespace BackNoDiscord.Security;

public sealed class ChatSpamBurstLimiter
{
    private const int MaxMessagesPerWindow = 12;
    private static readonly TimeSpan Window = TimeSpan.FromSeconds(10);
    private static readonly TimeSpan EntryMaxAge = TimeSpan.FromMinutes(30);
    private static readonly TimeSpan CleanupInterval = TimeSpan.FromMinutes(5);

    private readonly ConcurrentDictionary<string, UserMessageWindow> _windows = new();
    private readonly object _cleanupSync = new();
    private DateTime _lastCleanupUtc = DateTime.MinValue;

    public bool TryRecord(string userId, DateTime nowUtc, out TimeSpan retryAfter)
    {
        retryAfter = TimeSpan.Zero;
        var normalizedUserId = userId.Trim();
        if (string.IsNullOrWhiteSpace(normalizedUserId))
        {
            return false;
        }

        TrimState(nowUtc);
        var window = _windows.GetOrAdd(normalizedUserId, _ => new UserMessageWindow());
        lock (window.Sync)
        {
            window.LastTouchedUtc = nowUtc;
            var cutoff = nowUtc - Window;
            while (window.SentAtUtc.Count > 0 && window.SentAtUtc.Peek() <= cutoff)
            {
                window.SentAtUtc.Dequeue();
            }

            if (window.SentAtUtc.Count >= MaxMessagesPerWindow)
            {
                retryAfter = (window.SentAtUtc.Peek() + Window) - nowUtc;
                return false;
            }

            window.SentAtUtc.Enqueue(nowUtc);
            return true;
        }
    }

    private void TrimState(DateTime nowUtc)
    {
        if (nowUtc - _lastCleanupUtc < CleanupInterval)
        {
            return;
        }

        lock (_cleanupSync)
        {
            if (nowUtc - _lastCleanupUtc < CleanupInterval)
            {
                return;
            }

            _lastCleanupUtc = nowUtc;
            foreach (var entry in _windows)
            {
                if (nowUtc - entry.Value.LastTouchedUtc > EntryMaxAge)
                {
                    _windows.TryRemove(entry.Key, out _);
                }
            }
        }
    }

    private sealed class UserMessageWindow
    {
        public object Sync { get; } = new();
        public Queue<DateTime> SentAtUtc { get; } = new();
        public DateTime LastTouchedUtc { get; set; }
    }
}
