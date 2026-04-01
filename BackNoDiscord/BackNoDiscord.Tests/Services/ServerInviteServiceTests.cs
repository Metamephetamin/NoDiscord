using BackNoDiscord.Services;
using Microsoft.EntityFrameworkCore;

namespace BackNoDiscord.Tests.Services;

public class ServerInviteServiceTests
{
    [Fact]
    public void CreateInvite_NormalizesSnapshotAndInjectsOwnerMember()
    {
        using var context = CreateContext();
        var service = new ServerInviteService(context);

        var result = service.CreateInvite("owner-42", new ServerSnapshot
        {
            Id = "server-owner-42-guild",
            Name = "  Guild  ",
            OwnerId = "",
            Members = new List<ServerMemberSnapshot>(),
        });

        var redeemed = service.RedeemInvite(result.InviteCode, "member-1", "Member", "avatar.png");

        Assert.Equal(result.InviteCode, redeemed.InviteCode);
        Assert.True(redeemed.Snapshot.IsShared);
        Assert.Equal("server-guild", redeemed.Snapshot.Id);
        Assert.Equal("Guild", redeemed.Snapshot.Name);
        Assert.Contains(redeemed.Snapshot.Members, member => member.UserId == "owner-42" && member.RoleId == "owner");
        Assert.Contains(redeemed.Snapshot.Members, member => member.UserId == "member-1" && member.RoleId == "member");
    }

    [Fact]
    public void RedeemInvite_CannotBeUsedTwiceBySameUser()
    {
        using var context = CreateContext();
        var service = new ServerInviteService(context);
        var invite = service.CreateInvite("owner-1", new ServerSnapshot
        {
            Id = "server-shared",
            Name = "Shared"
        });

        service.RedeemInvite(invite.InviteCode, "member-1", "Member", "");

        var exception = Assert.Throws<InvalidOperationException>(() =>
            service.RedeemInvite(invite.InviteCode, "member-1", "Member", ""));

        Assert.Contains("already been used", exception.Message);
    }

    private static AppDbContext CreateContext()
    {
        var options = new DbContextOptionsBuilder<AppDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString("N"))
            .Options;

        return new AppDbContext(options);
    }
}
