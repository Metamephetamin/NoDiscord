using BackNoDiscord.Security;
using BackNoDiscord.Services;

namespace BackNoDiscord.Tests.Security;

public class ServerPermissionEvaluatorTests
{
    [Fact]
    public void CanManageServer_AllowsOwnerAndAdminWithPermission()
    {
        var snapshot = CreateSnapshot();

        Assert.True(ServerPermissionEvaluator.CanManageServer(snapshot, "owner"));
        Assert.True(ServerPermissionEvaluator.CanManageServer(snapshot, "admin"));
        Assert.False(ServerPermissionEvaluator.CanManageServer(snapshot, "member"));
    }

    [Fact]
    public void CanManageVoiceState_RequiresHigherPriorityRoleAndPermission()
    {
        var snapshot = CreateSnapshot();

        Assert.True(ServerPermissionEvaluator.CanManageVoiceState(snapshot, "admin", "member", "mute_members"));
        Assert.False(ServerPermissionEvaluator.CanManageVoiceState(snapshot, "member", "admin", "mute_members"));
        Assert.False(ServerPermissionEvaluator.CanManageVoiceState(snapshot, "admin", "owner", "mute_members"));
    }

    [Fact]
    public void CanInviteMembers_AllowsOwnerAndInviteRole()
    {
        var snapshot = CreateSnapshot();

        Assert.True(ServerPermissionEvaluator.CanInviteMembers(snapshot, "owner"));
        Assert.True(ServerPermissionEvaluator.CanInviteMembers(snapshot, "admin"));
        Assert.False(ServerPermissionEvaluator.CanInviteMembers(snapshot, "member"));
    }

    private static ServerSnapshot CreateSnapshot()
    {
        return new ServerSnapshot
        {
            Id = "server-1",
            OwnerId = "owner",
            Roles =
            [
                new ServerRoleSnapshot { Id = "owner", Priority = 400, Permissions = ["manage_server", "mute_members", "deafen_members"] },
                new ServerRoleSnapshot { Id = "admin", Priority = 300, Permissions = ["manage_server", "mute_members", "deafen_members"] },
                new ServerRoleSnapshot { Id = "member", Priority = 100, Permissions = [] }
            ],
            Members =
            [
                new ServerMemberSnapshot { UserId = "owner", RoleId = "owner", Name = "Owner" },
                new ServerMemberSnapshot { UserId = "admin", RoleId = "admin", Name = "Admin" },
                new ServerMemberSnapshot { UserId = "member", RoleId = "member", Name = "Member" }
            ]
        };
    }
}
