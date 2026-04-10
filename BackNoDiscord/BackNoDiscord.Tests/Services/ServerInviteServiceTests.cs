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
        Assert.Equal(20, result.InviteCode.Length);
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

    [Fact]
    public void GetInvitePreview_ReturnsServerSummaryAndMembershipState()
    {
        using var context = CreateContext();
        var service = new ServerInviteService(context);
        var invite = service.CreateInvite("owner-5", new ServerSnapshot
        {
            Id = "server-owner-5-lounge",
            Name = "Lounge",
            Description = "Сервер для команды разработки и быстрых голосовых созвонов.",
            TextChannels = new List<ChannelSnapshot> { new() { Id = "text-1", Name = "# general" } },
            VoiceChannels = new List<ChannelSnapshot> { new() { Id = "voice-1", Name = "General" } }
        });

        var preview = service.GetInvitePreview(invite.InviteCode, "owner-5");

        Assert.Equal(invite.InviteCode, preview.InviteCode);
        Assert.Equal("server-lounge", preview.ServerId);
        Assert.Equal("Lounge", preview.ServerName);
        Assert.Equal("Сервер для команды разработки и быстрых голосовых созвонов.", preview.ServerDescription);
        Assert.Equal(1, preview.TextChannelCount);
        Assert.Equal(1, preview.VoiceChannelCount);
        Assert.True(preview.CurrentUserAlreadyMember);
        Assert.False(preview.IsExpired);
    }

    [Fact]
    public void DeleteInvitesForServer_RemovesOnlyMatchingOwnerServerInvites()
    {
        using var context = CreateContext();
        var service = new ServerInviteService(context);

        var firstInvite = service.CreateInvite("owner-5", new ServerSnapshot
        {
            Id = "server-owner-5-lounge",
            Name = "Lounge",
        });
        var secondInvite = service.CreateInvite("owner-5", new ServerSnapshot
        {
            Id = "server-owner-5-guild",
            Name = "Guild",
        });
        service.CreateInvite("owner-9", new ServerSnapshot
        {
            Id = "server-owner-9-lounge",
            Name = "Lounge",
        });

        var deletedCount = service.DeleteInvitesForServer("server-lounge", "owner-5");

        Assert.Equal(1, deletedCount);
        Assert.Throws<KeyNotFoundException>(() => service.GetInvitePreview(firstInvite.InviteCode));
        Assert.Equal("server-guild", service.GetInvitePreview(secondInvite.InviteCode).ServerId);
        Assert.Equal(2, context.ServerInvites.Count());
    }

    [Fact]
    public void RedeemInvite_AcceptsFormattedCodeInput()
    {
        using var context = CreateContext();
        var service = new ServerInviteService(context);
        var invite = service.CreateInvite("owner-7", new ServerSnapshot
        {
            Id = "server-owner-7-lounge",
            Name = "Lounge",
        });

        var formattedCode = string.Join("-", Enumerable.Range(0, invite.InviteCode.Length / 5 + (invite.InviteCode.Length % 5 == 0 ? 0 : 1))
            .Select((index) => invite.InviteCode.Substring(index * 5, Math.Min(5, invite.InviteCode.Length - (index * 5)))));

        var redeemed = service.RedeemInvite(formattedCode, "member-9", "Member", "");

        Assert.Equal(invite.InviteCode, redeemed.InviteCode);
        Assert.Contains(redeemed.Snapshot.Members, member => member.UserId == "member-9");
    }

    private static AppDbContext CreateContext()
    {
        var options = new DbContextOptionsBuilder<AppDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString("N"))
            .Options;

        return new AppDbContext(options);
    }
}
