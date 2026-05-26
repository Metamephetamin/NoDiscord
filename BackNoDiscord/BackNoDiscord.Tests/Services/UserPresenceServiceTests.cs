using BackNoDiscord.Services;

namespace BackNoDiscord.Tests.Services;

public sealed class UserPresenceServiceTests
{
    [Fact]
    public void OnlineUserCount_CountsUniqueConnectedUsers()
    {
        var service = new UserPresenceService();

        service.MarkConnected("42");
        service.MarkConnected("42");
        service.MarkConnected("84");

        Assert.Equal(2, service.OnlineUserCount);
    }

    [Fact]
    public void OnlineUserCount_DecreasesOnlyAfterLastConnectionDisconnects()
    {
        var service = new UserPresenceService();

        service.MarkConnected("42");
        service.MarkConnected("42");
        service.MarkDisconnected("42", out _);

        Assert.Equal(1, service.OnlineUserCount);

        service.MarkDisconnected("42", out _);

        Assert.Equal(0, service.OnlineUserCount);
    }
}
