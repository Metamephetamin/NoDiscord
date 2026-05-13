using BackNoDiscord.Security;

namespace BackNoDiscord.Tests.Security;

public sealed class ChatSpamBurstLimiterTests
{
    [Fact]
    public void TryRecord_BlocksOnlyAfterModerateBurst()
    {
        var limiter = new ChatSpamBurstLimiter();
        var nowUtc = new DateTime(2026, 5, 13, 12, 0, 0, DateTimeKind.Utc);

        for (var index = 0; index < 12; index++)
        {
            Assert.True(limiter.TryRecord("user-1", nowUtc.AddMilliseconds(index), out var allowedRetryAfter));
            Assert.Equal(TimeSpan.Zero, allowedRetryAfter);
        }

        Assert.False(limiter.TryRecord("user-1", nowUtc.AddSeconds(1), out var retryAfter));
        Assert.True(retryAfter > TimeSpan.Zero);
        Assert.True(retryAfter <= TimeSpan.FromSeconds(10));
    }

    [Fact]
    public void TryRecord_AllowsUserAfterWindowExpires()
    {
        var limiter = new ChatSpamBurstLimiter();
        var nowUtc = new DateTime(2026, 5, 13, 12, 0, 0, DateTimeKind.Utc);

        for (var index = 0; index < 12; index++)
        {
            Assert.True(limiter.TryRecord("user-1", nowUtc, out _));
        }

        Assert.True(limiter.TryRecord("user-1", nowUtc.AddSeconds(11), out var retryAfter));
        Assert.Equal(TimeSpan.Zero, retryAfter);
    }

    [Fact]
    public void TryRecord_LimitsUsersIndependently()
    {
        var limiter = new ChatSpamBurstLimiter();
        var nowUtc = new DateTime(2026, 5, 13, 12, 0, 0, DateTimeKind.Utc);

        for (var index = 0; index < 12; index++)
        {
            Assert.True(limiter.TryRecord("user-1", nowUtc, out _));
        }

        Assert.True(limiter.TryRecord("user-2", nowUtc, out var retryAfter));
        Assert.Equal(TimeSpan.Zero, retryAfter);
    }
}
