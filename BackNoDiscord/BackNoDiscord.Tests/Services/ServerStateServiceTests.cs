using BackNoDiscord.Services;
using Microsoft.EntityFrameworkCore;
namespace BackNoDiscord.Tests.Services;

public class ServerStateServiceTests
{
    [Fact]
    public void UpsertSnapshot_MergesExistingMembersRolesAndChannels()
    {
        using var context = CreateContext();
        var service = new ServerStateService(context);

        service.UpsertSnapshot(new ServerSnapshot
        {
            Id = "server-guild",
            OwnerId = "owner-1",
            Name = "Guild",
            Roles = new List<ServerRoleSnapshot>
            {
                new() { Id = "owner", Name = "Owner", Priority = 100 }
            },
            Members = new List<ServerMemberSnapshot>
            {
                new() { UserId = "owner-1", Name = "Owner", RoleId = "owner" }
            },
            TextChannels = new List<ChannelSnapshot>
            {
                new() { Id = "general", Name = "General" }
            }
        }, "owner-1");

        var merged = service.UpsertSnapshot(new ServerSnapshot
        {
            Id = "server-guild",
            OwnerId = "owner-1",
            Name = "Guild",
            Roles = new List<ServerRoleSnapshot>
            {
                new() { Id = "member", Name = "Member", Priority = 10 }
            },
            Members = new List<ServerMemberSnapshot>
            {
                new() { UserId = "member-2", Name = "Bob", RoleId = "member" }
            },
            VoiceChannels = new List<ChannelSnapshot>
            {
                new() { Id = "voice", Name = "Voice" }
            }
        }, "owner-1");

        Assert.Contains(merged.Roles, role => role.Id == "owner");
        Assert.Contains(merged.Roles, role => role.Id == "member");
        Assert.Contains(merged.Members, member => member.UserId == "owner-1");
        Assert.Contains(merged.Members, member => member.UserId == "member-2");
        Assert.Contains(merged.TextChannels, channel => channel.Id == "general");
        Assert.Contains(merged.VoiceChannels, channel => channel.Id == "voice");
    }

    [Fact]
    public void GetSnapshot_ResolvesLegacyScopedServerIdToCanonicalId()
    {
        using var context = CreateContext();
        var service = new ServerStateService(context);

        service.UpsertSnapshot(new ServerSnapshot
        {
            Id = "server-guild",
            OwnerId = "owner-9",
            Name = "Guild",
            Members = new List<ServerMemberSnapshot>()
            {
                new() { UserId = "owner-9", Name = "Owner", RoleId = "owner" }
            }
        }, "owner-9");

        var record = context.SharedServerSnapshots.Single();
        record.ServerId = "server-owner-9-guild";
        context.SaveChanges();

        var snapshot = service.GetSnapshot("server-guild");

        Assert.NotNull(snapshot);
        Assert.Equal("server-guild", snapshot!.Id);
        Assert.Equal("owner-9", snapshot.OwnerId);
        Assert.Contains(snapshot.Members, member => member.UserId == "owner-9" && member.RoleId == "owner");
    }

    [Fact]
    public void AddMember_DoesNotDuplicateExistingMember()
    {
        using var context = CreateContext();
        var service = new ServerStateService(context);

        service.UpsertSnapshot(new ServerSnapshot
        {
            Id = "server-team",
            OwnerId = "owner-5",
            Name = "Team",
            Members = new List<ServerMemberSnapshot>
            {
                new() { UserId = "owner-5", Name = "Owner", RoleId = "owner" },
                new() { UserId = "member-7", Name = "Alice", RoleId = "member" }
            }
        }, "owner-5");

        var snapshot = service.AddMember("server-team", "member-7", "Alice Updated", "avatar.png");

        Assert.Single(snapshot.Members.Where(member => member.UserId == "member-7"));
        Assert.DoesNotContain(snapshot.Members, member => member.UserId == "member-7" && member.Name == "Alice Updated");
    }

    private static AppDbContext CreateContext()
    {
        var options = new DbContextOptionsBuilder<AppDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString("N"))
            .Options;

        return new AppDbContext(options);
    }
}
