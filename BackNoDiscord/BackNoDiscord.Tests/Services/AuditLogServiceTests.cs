using System.Text.Json;
using BackNoDiscord;
using BackNoDiscord.Services;
using Microsoft.EntityFrameworkCore;

namespace BackNoDiscord.Tests.Services;

public sealed class AuditLogServiceTests
{
    [Fact]
    public async Task RecordAsync_StoresNonSensitiveAuditMetadata()
    {
        await using var context = CreateContext();
        var service = new AuditLogService(context);

        await service.RecordAsync(
            "server-1",
            "actor-1",
            "server.roles.update",
            "role-1",
            new Dictionary<string, string?>
            {
                ["roleName"] = "Admin",
                ["authToken"] = "secret",
                ["messageBody"] = "do not store"
            });

        var record = Assert.Single(context.ServerAuditLogs);
        var metadata = JsonSerializer.Deserialize<Dictionary<string, string>>(record.MetadataJson)!;
        Assert.Equal("server-1", record.ServerId);
        Assert.Equal("actor-1", record.ActorUserId);
        Assert.Equal("server.roles.update", record.ActionType);
        Assert.Equal("Admin", metadata["roleName"]);
        Assert.DoesNotContain("authToken", metadata.Keys);
        Assert.DoesNotContain("messageBody", metadata.Keys);
    }

    [Fact]
    public async Task GetRecentAsync_ReturnsNewestServerEntriesOnly()
    {
        await using var context = CreateContext();
        var service = new AuditLogService(context);
        await service.RecordAsync("server-1", "actor-1", "server.settings.update");
        await service.RecordAsync("server-2", "actor-1", "server.settings.update");
        await service.RecordAsync("server-1", "actor-2", "server.channels.update");

        var entries = await service.GetRecentAsync("server-1", limit: 10);

        Assert.Equal(2, entries.Count);
        Assert.All(entries, entry => Assert.Equal("server-1", entry.ServerId));
        Assert.Equal("server.channels.update", entries[0].ActionType);
    }

    private static AppDbContext CreateContext()
    {
        var options = new DbContextOptionsBuilder<AppDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString("N"))
            .Options;

        return new AppDbContext(options);
    }
}
