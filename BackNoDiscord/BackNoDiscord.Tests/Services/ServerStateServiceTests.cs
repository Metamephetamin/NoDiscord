using BackNoDiscord.Services;
using Microsoft.EntityFrameworkCore;
namespace BackNoDiscord.Tests.Services;

public class ServerStateServiceTests
{
    [Fact]
    public void UpsertSnapshot_MergesExistingMembersAndRolesButReplacesChannels()
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
        Assert.DoesNotContain(merged.TextChannels, channel => channel.Id == "general");
        Assert.Contains(merged.VoiceChannels, channel => channel.Id == "voice");
    }

    [Fact]
    public void UpsertSnapshot_DoesNotRestoreDeletedChannels()
    {
        using var context = CreateContext();
        var service = new ServerStateService(context);

        service.UpsertSnapshot(new ServerSnapshot
        {
            Id = "server-guild",
            OwnerId = "owner-1",
            Name = "Guild",
            TextChannels = new List<ChannelSnapshot>
            {
                new() { Id = "general", Name = "General" },
                new() { Id = "old-chat", Name = "Old chat" }
            },
            VoiceChannels = new List<ChannelSnapshot>
            {
                new() { Id = "voice", Name = "Voice" }
            }
        }, "owner-1");

        var merged = service.UpsertSnapshot(new ServerSnapshot
        {
            Id = "server-guild",
            OwnerId = "owner-1",
            Name = "Guild",
            TextChannels = new List<ChannelSnapshot>
            {
                new() { Id = "general", Name = "General" }
            },
            VoiceChannels = new List<ChannelSnapshot>()
        }, "owner-1");

        Assert.Equal(new[] { "general" }, merged.TextChannels.Select(channel => channel.Id));
        Assert.Empty(merged.VoiceChannels);

        var persisted = service.GetSnapshot("server-guild");
        Assert.NotNull(persisted);
        Assert.Equal(new[] { "general" }, persisted!.TextChannels.Select(channel => channel.Id));
        Assert.Empty(persisted.VoiceChannels);
    }

    [Fact]
    public void UpsertSnapshot_ReplacesExistingChannelWhenIncomingChannelHasSameId()
    {
        using var context = CreateContext();
        var service = new ServerStateService(context);

        service.UpsertSnapshot(new ServerSnapshot
        {
            Id = "server-guild",
            OwnerId = "owner-1",
            Name = "Guild",
            TextChannels = new List<ChannelSnapshot>
            {
                new() { Id = "general", Name = "General", Topic = "Old topic" }
            }
        }, "owner-1");

        var merged = service.UpsertSnapshot(new ServerSnapshot
        {
            Id = "server-guild",
            OwnerId = "owner-1",
            Name = "Guild",
            TextChannels = new List<ChannelSnapshot>
            {
                new() { Id = "general", Name = "Announcements", Topic = "New topic" }
            }
        }, "owner-1");

        var channel = Assert.Single(merged.TextChannels);
        Assert.Equal("general", channel.Id);
        Assert.Equal("Announcements", channel.Name);
        Assert.Equal("New topic", channel.Topic);
    }

    [Fact]
    public void UpsertSnapshot_NormalizesAndPersistsVoiceChannelStatus()
    {
        using var context = CreateContext();
        var service = new ServerStateService(context);

        var merged = service.UpsertSnapshot(new ServerSnapshot
        {
            Id = "server-guild",
            OwnerId = "owner-1",
            Name = "Guild",
            VoiceChannels = new List<ChannelSnapshot>
            {
                new()
                {
                    Id = "voice",
                    Name = "Voice",
                    Status = "  one two three four five six seven eight nine ten eleven twelve thirteen fourteen  "
                }
            }
        }, "owner-1");

        var channel = Assert.Single(merged.VoiceChannels);
        Assert.Equal("one two three four five six seven eight nine ten eleven twelve", channel.Status);

        var persisted = service.GetSnapshot("server-guild");
        Assert.NotNull(persisted);
        Assert.Equal("one two three four five six seven eight nine ten eleven twelve", Assert.Single(persisted!.VoiceChannels).Status);
    }

    [Fact]
    public void ClearVoiceChannelStatus_RemovesPersistedStatusForScopedVoiceChannel()
    {
        using var context = CreateContext();
        var service = new ServerStateService(context);

        service.UpsertSnapshot(new ServerSnapshot
        {
            Id = "server-guild",
            OwnerId = "owner-1",
            Name = "Guild",
            VoiceChannels = new List<ChannelSnapshot>
            {
                new() { Id = "voice", Name = "Voice", Status = "Planning raid" },
                new() { Id = "other", Name = "Other", Status = "Still busy" }
            }
        }, "owner-1");

        var cleared = service.ClearVoiceChannelStatus("server-guild::voice");

        Assert.True(cleared);
        var persisted = service.GetSnapshot("server-guild");
        Assert.NotNull(persisted);
        Assert.Equal(string.Empty, persisted!.VoiceChannels.Single(channel => channel.Id == "voice").Status);
        Assert.Equal("Still busy", persisted.VoiceChannels.Single(channel => channel.Id == "other").Status);
    }

    [Fact]
    public void UpsertSnapshot_PreservesIncomingChannelOrderForExistingChannels()
    {
        using var context = CreateContext();
        var service = new ServerStateService(context);

        service.UpsertSnapshot(new ServerSnapshot
        {
            Id = "server-guild",
            OwnerId = "owner-1",
            Name = "Guild",
            TextChannels = new List<ChannelSnapshot>
            {
                new() { Id = "general", Name = "General", Order = 0 },
                new() { Id = "rules", Name = "Rules", Order = 1 },
                new() { Id = "chat", Name = "Chat", Order = 2 }
            }
        }, "owner-1");

        var merged = service.UpsertSnapshot(new ServerSnapshot
        {
            Id = "server-guild",
            OwnerId = "owner-1",
            Name = "Guild",
            TextChannels = new List<ChannelSnapshot>
            {
                new() { Id = "chat", Name = "Chat", Order = 0 },
                new() { Id = "general", Name = "General", Order = 1 },
                new() { Id = "rules", Name = "Rules", Order = 2 }
            }
        }, "owner-1");

        Assert.Equal(new[] { "chat", "general", "rules" }, merged.TextChannels.Select(channel => channel.Id));
        Assert.Equal(new[] { 0, 1, 2 }, merged.TextChannels.Select(channel => channel.Order));

        var persisted = service.GetSnapshot("server-guild");
        Assert.NotNull(persisted);
        Assert.Equal(new[] { "chat", "general", "rules" }, persisted!.TextChannels.Select(channel => channel.Id));
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
    public void UpsertSnapshot_ForNewSnapshotRebindsOwnerAndMembersToAuthenticatedUser()
    {
        using var context = CreateContext();
        var service = new ServerStateService(context);

        var snapshot = service.UpsertSnapshot(new ServerSnapshot
        {
            Id = "server-forged",
            OwnerId = "victim-user",
            Name = "Forged",
            Members = new List<ServerMemberSnapshot>
            {
                new() { UserId = "victim-user", Name = "Victim", RoleId = "owner" },
                new() { UserId = "attacker-user", Name = "Attacker", RoleId = "admin" },
                new() { UserId = "extra-admin", Name = "Extra", RoleId = "admin" }
            }
        }, "attacker-user");

        Assert.Equal("attacker-user", snapshot.OwnerId);
        var member = Assert.Single(snapshot.Members);
        Assert.Equal("attacker-user", member.UserId);
        Assert.Equal("owner", member.RoleId);

        var record = context.SharedServerSnapshots.Single();
        Assert.Equal("attacker-user", record.OwnerUserId);
        var persistedSnapshot = service.GetSnapshot("server-forged");
        Assert.NotNull(persistedSnapshot);
        Assert.Equal("attacker-user", persistedSnapshot!.OwnerId);
        Assert.DoesNotContain(persistedSnapshot.Members, item => item.UserId == "victim-user" || item.UserId == "extra-admin");
    }

    [Fact]
    public void UpsertSnapshot_ForExistingSnapshotPreservesStoredOwner()
    {
        using var context = CreateContext();
        var service = new ServerStateService(context);

        service.UpsertSnapshot(new ServerSnapshot
        {
            Id = "server-team",
            OwnerId = "owner-1",
            Name = "Team",
            Members = new List<ServerMemberSnapshot>
            {
                new() { UserId = "owner-1", Name = "Owner", RoleId = "owner" },
                new() { UserId = "manager-2", Name = "Manager", RoleId = "admin" }
            }
        }, "owner-1");

        var merged = service.UpsertSnapshot(new ServerSnapshot
        {
            Id = "server-team",
            OwnerId = "manager-2",
            Name = "Team Renamed",
            Members = new List<ServerMemberSnapshot>
            {
                new() { UserId = "manager-2", Name = "Manager", RoleId = "owner" }
            }
        }, "manager-2");

        Assert.Equal("owner-1", merged.OwnerId);
        Assert.Contains(merged.Members, member => member.UserId == "owner-1" && member.RoleId == "owner");
        Assert.Equal("owner-1", context.SharedServerSnapshots.Single().OwnerUserId);
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
                new() { UserId = "owner-5", Name = "Owner", RoleId = "owner" }
            }
        }, "owner-5");
        service.AddMember("server-team", "member-7", "Alice", "");

        var snapshot = service.AddMember("server-team", "member-7", "Alice Updated", "avatar.png");

        Assert.Single(snapshot.Members.Where(member => member.UserId == "member-7"));
        Assert.DoesNotContain(snapshot.Members, member => member.UserId == "member-7" && member.Name == "Alice Updated");
    }

    [Fact]
    public void SaveRole_CreatesRoleAndSanitizesPermissions()
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
                new() { UserId = "owner-5", Name = "Owner", RoleId = "owner" }
            }
        }, "owner-5");

        var snapshot = service.SaveRole("server-team", new ServerRoleSnapshot
        {
            Id = "role-custom",
            Name = "Custom",
            Color = "#AABBCC",
            Priority = 250,
            Permissions = new List<string> { "manage_channels", "bad_permission", "manage_channels" }
        }, create: true);

        var role = Assert.Single(snapshot.Roles.Where(item => item.Id == "role-custom"));
        Assert.Equal("#aabbcc", role.Color);
        Assert.Equal(new[] { "manage_channels" }, role.Permissions);
    }

    [Fact]
    public void DeleteRole_ReassignsMembersToMemberRole()
    {
        using var context = CreateContext();
        var service = new ServerStateService(context);

        service.UpsertSnapshot(new ServerSnapshot
        {
            Id = "server-team",
            OwnerId = "owner-5",
            Name = "Team",
            Roles = new List<ServerRoleSnapshot>
            {
                new() { Id = "owner", Name = "Owner", Priority = 400 },
                new() { Id = "member", Name = "Member", Priority = 100 },
                new() { Id = "role-custom", Name = "Custom", Priority = 250 }
            },
            Members = new List<ServerMemberSnapshot>
            {
                new() { UserId = "owner-5", Name = "Owner", RoleId = "owner" }
            }
        }, "owner-5");
        service.AddMember("server-team", "member-7", "Alice", "");
        service.UpdateMemberRole("server-team", "member-7", "role-custom");

        var snapshot = service.DeleteRole("server-team", "role-custom");

        Assert.DoesNotContain(snapshot.Roles, role => role.Id == "role-custom");
        Assert.Contains(snapshot.Members, member => member.UserId == "member-7" && member.RoleId == "member");
    }

    [Fact]
    public void UpdateMemberRole_AssignsExistingRole()
    {
        using var context = CreateContext();
        var service = new ServerStateService(context);

        service.UpsertSnapshot(new ServerSnapshot
        {
            Id = "server-team",
            OwnerId = "owner-5",
            Name = "Team",
            Roles = new List<ServerRoleSnapshot>
            {
                new() { Id = "owner", Name = "Owner", Priority = 400 },
                new() { Id = "member", Name = "Member", Priority = 100 },
                new() { Id = "moderator", Name = "Moderator", Priority = 200 }
            },
            Members = new List<ServerMemberSnapshot>
            {
                new() { UserId = "owner-5", Name = "Owner", RoleId = "owner" }
            }
        }, "owner-5");
        service.AddMember("server-team", "member-7", "Alice", "");

        var snapshot = service.UpdateMemberRole("server-team", "member-7", "moderator");

        Assert.Contains(snapshot.Members, member => member.UserId == "member-7" && member.RoleId == "moderator");
    }

    [Fact]
    public void DeleteSnapshot_RemovesSnapshotRecord()
    {
        using var context = CreateContext();
        var service = new ServerStateService(context);

        service.UpsertSnapshot(new ServerSnapshot
        {
            Id = "server-team",
            OwnerId = "owner-5",
            Name = "Team"
        }, "owner-5");

        var deleted = service.DeleteSnapshot("server-team");

        Assert.True(deleted);
        Assert.Null(service.GetSnapshot("server-team"));
        Assert.Empty(service.GetSnapshotsForUser("owner-5"));
    }

    private static AppDbContext CreateContext()
    {
        var options = new DbContextOptionsBuilder<AppDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString("N"))
            .Options;

        return new AppDbContext(options);
    }
}
