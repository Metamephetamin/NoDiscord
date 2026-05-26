using BackNoDiscord.Controllers;
using BackNoDiscord.Services;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace BackNoDiscord.Tests.Controllers;

public sealed class PublicStatsControllerTests : IDisposable
{
    private readonly AppDbContext _context = CreateContext();

    [Fact]
    public async Task Get_ReturnsTotalUsersAndOnlineUsers()
    {
        _context.Users.AddRange(
            BuildUser(1, "first@example.com"),
            BuildUser(2, "second@example.com"),
            BuildUser(3, "third@example.com"));
        await _context.SaveChangesAsync();
        var presence = new UserPresenceService();
        presence.MarkConnected("1");
        presence.MarkConnected("1");
        presence.MarkConnected("3");
        var controller = new PublicStatsController(_context, presence);

        var result = await controller.Get(CancellationToken.None);

        var ok = Assert.IsType<OkObjectResult>(result);
        var payload = Assert.IsType<PublicStatsResponse>(ok.Value);
        Assert.Equal(3, payload.TotalUsers);
        Assert.Equal(2, payload.OnlineUsers);
        Assert.True(payload.UpdatedAtUtc <= DateTimeOffset.UtcNow);
    }

    public void Dispose()
    {
        _context.Dispose();
    }

    private static User BuildUser(int id, string email)
    {
        return new User
        {
            id = id,
            first_name = "Lanaya",
            last_name = "User",
            nickname = $"LanayaUser{id}",
            email = email,
            is_email_verified = true,
            password_hash = "hash"
        };
    }

    private static AppDbContext CreateContext()
    {
        var options = new DbContextOptionsBuilder<AppDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString("N"))
            .Options;
        return new AppDbContext(options);
    }
}
