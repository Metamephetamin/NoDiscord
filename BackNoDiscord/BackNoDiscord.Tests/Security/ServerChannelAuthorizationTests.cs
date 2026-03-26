using BackNoDiscord.Security;
using BackNoDiscord.Services;

namespace BackNoDiscord.Tests.Security;

public class ServerChannelAuthorizationTests
{
    [Fact]
    public void TryGetServerIdFromChatChannelId_ReturnsScopedServerId()
    {
        var success = ServerChannelAuthorization.TryGetServerIdFromChatChannelId(
            "server:server-73-room::channel:text-1",
            out var serverId);

        Assert.True(success);
        Assert.Equal("server-73-room", serverId);
    }

    [Fact]
    public void TryGetServerIdFromVoiceChannelName_ReturnsScopedServerId()
    {
        var success = ServerChannelAuthorization.TryGetServerIdFromVoiceChannelName(
            "server-73-room::general_voice",
            out var serverId);

        Assert.True(success);
        Assert.Equal("server-73-room", serverId);
    }

    [Fact]
    public void CanAccessServer_AllowsPersonalAndPrivateScopedServersForOwner()
    {
        var user = new AuthenticatedUser("73", "user@example.com", "Ivan", "Petrov");

        Assert.True(ServerChannelAuthorization.CanAccessServer("server-main-73", user, snapshot: null));
        Assert.True(ServerChannelAuthorization.CanAccessServer("server-73-my-room", user, snapshot: null));
        Assert.False(ServerChannelAuthorization.CanAccessServer("server-91-my-room", user, snapshot: null));
    }

    [Fact]
    public void CanAccessServer_UsesSnapshotMembershipForSharedServers()
    {
        var snapshot = new ServerSnapshot
        {
            Id = "server-shared",
            OwnerId = "owner",
            Members =
            [
                new ServerMemberSnapshot { UserId = "owner", RoleId = "owner", Name = "Owner" },
                new ServerMemberSnapshot { UserId = "73", RoleId = "member", Name = "Member" }
            ],
            Roles =
            [
                new ServerRoleSnapshot { Id = "owner", Priority = 400, Permissions = ["manage_server"] },
                new ServerRoleSnapshot { Id = "member", Priority = 100, Permissions = [] }
            ]
        };

        var member = new AuthenticatedUser("73", "user@example.com", "Ivan", "Petrov");
        var outsider = new AuthenticatedUser("74", "outsider@example.com", "Petr", "Sidorov");

        Assert.True(ServerChannelAuthorization.CanAccessServer(snapshot.Id, member, snapshot));
        Assert.False(ServerChannelAuthorization.CanAccessServer(snapshot.Id, outsider, snapshot));
    }
}
