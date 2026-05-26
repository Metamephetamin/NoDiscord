using BackNoDiscord.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace BackNoDiscord.Controllers;

[ApiController]
[AllowAnonymous]
[Route("api/public/stats")]
public sealed class PublicStatsController : ControllerBase
{
    private readonly AppDbContext _context;
    private readonly UserPresenceService _presence;

    public PublicStatsController(AppDbContext context, UserPresenceService presence)
    {
        _context = context;
        _presence = presence;
    }

    [HttpGet]
    public async Task<IActionResult> Get(CancellationToken cancellationToken)
    {
        var totalUsers = await _context.Users.AsNoTracking().CountAsync(cancellationToken);

        return Ok(new PublicStatsResponse(
            totalUsers,
            _presence.OnlineUserCount,
            DateTimeOffset.UtcNow));
    }
}

public sealed record PublicStatsResponse(
    int TotalUsers,
    int OnlineUsers,
    DateTimeOffset UpdatedAtUtc);
