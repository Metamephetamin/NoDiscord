using System.Security.Claims;
using BackNoDiscord.Controllers;
using BackNoDiscord.Services;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;

namespace BackNoDiscord.Tests.Controllers;

public sealed class AdminControllerTests : IDisposable
{
    private readonly AppDbContext _context = CreateContext();

    [Fact]
    public async Task SearchUsers_ForbidsNonConfiguredAdminEvenWithSpoofedClaim()
    {
        _context.Users.Add(BuildUser(1, "user@example.com"));
        await _context.SaveChangesAsync();
        var controller = BuildController(adminUserIds: "", currentUserId: 1, extraClaims:
        [
            new Claim("is_admin", "true"),
            new Claim(ClaimTypes.Role, "Admin")
        ]);

        var result = await controller.SearchUsers(null, null, CancellationToken.None);

        Assert.IsType<ForbidResult>(result);
    }

    [Fact]
    public async Task SearchUsers_AllowsConfiguredAdmin()
    {
        _context.Users.AddRange(
            BuildUser(1, "admin@example.com", isTotpEnabled: true),
            BuildUser(2, "target@example.com"));
        await _context.SaveChangesAsync();
        var controller = BuildController(adminUserIds: "1", currentUserId: 1);

        var result = await controller.SearchUsers("target", null, CancellationToken.None);

        var ok = Assert.IsType<OkObjectResult>(result);
        Assert.NotNull(ok.Value);
    }

    [Fact]
    public async Task SearchUsers_ForbidsConfiguredAdminWithoutTotp()
    {
        _context.Users.AddRange(
            BuildUser(1, "admin@example.com", isTotpEnabled: false),
            BuildUser(2, "target@example.com"));
        await _context.SaveChangesAsync();
        var controller = BuildController(adminUserIds: "1", currentUserId: 1);

        var result = await controller.SearchUsers("target", null, CancellationToken.None);

        Assert.IsType<ForbidResult>(result);
    }

    [Fact]
    public async Task BanUser_ForbidsNonConfiguredAdmin()
    {
        _context.Users.AddRange(
            BuildUser(1, "user@example.com"),
            BuildUser(2, "target@example.com"));
        await _context.SaveChangesAsync();
        var controller = BuildController(adminUserIds: "", currentUserId: 1);

        var result = await controller.BanUser(2, new AdminBanRequest { Reason = "test" }, CancellationToken.None);

        Assert.IsType<ForbidResult>(result);
        Assert.False((await _context.Users.SingleAsync(user => user.id == 2)).IsBanned);
    }

    public void Dispose()
    {
        _context.Dispose();
    }

    private AdminController BuildController(string adminUserIds, int currentUserId, IReadOnlyCollection<Claim>? extraClaims = null)
    {
        var configuration = new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["Admin:UserIds"] = adminUserIds
            })
            .Build();
        var accountBanService = new AccountBanService(_context, configuration);
        var controller = new AdminController(
            _context,
            accountBanService,
            new AdminSecurityOverviewService(_context));
        var claims = new List<Claim>
        {
            new(ClaimTypes.NameIdentifier, currentUserId.ToString())
        };
        if (extraClaims is not null)
        {
            claims.AddRange(extraClaims);
        }

        controller.ControllerContext = new ControllerContext
        {
            HttpContext = new DefaultHttpContext
            {
                User = new ClaimsPrincipal(new ClaimsIdentity(claims, "test"))
            }
        };
        return controller;
    }

    private static User BuildUser(int id, string email, bool isTotpEnabled = false)
    {
        return new User
        {
            id = id,
            first_name = "Lanaya",
            last_name = "User",
            nickname = $"LanayaUser{id}",
            email = email,
            is_email_verified = true,
            is_totp_enabled = isTotpEnabled,
            totp_secret = isTotpEnabled ? "encrypted-secret" : null,
            totp_enabled_at = isTotpEnabled ? DateTimeOffset.UtcNow : null,
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
