using BackNoDiscord.Services;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace BackNoDiscord.Controllers;

[ApiController]
[Route("api/admin")]
[Authorize(AuthenticationSchemes = JwtBearerDefaults.AuthenticationScheme)]
public sealed class AdminController : ControllerBase
{
    private const int MaxUserSearchLimit = 100;

    private readonly AppDbContext _context;
    private readonly AccountBanService _accountBanService;
    private readonly AdminSecurityOverviewService _securityOverviewService;

    public AdminController(
        AppDbContext context,
        AccountBanService accountBanService,
        AdminSecurityOverviewService securityOverviewService)
    {
        _context = context;
        _accountBanService = accountBanService;
        _securityOverviewService = securityOverviewService;
    }

    [HttpGet("users")]
    public async Task<IActionResult> SearchUsers([FromQuery] string? query, [FromQuery] int? limit, CancellationToken cancellationToken)
    {
        var currentUser = await RequireAdminAsync(cancellationToken);
        if (currentUser == null)
        {
            return Forbid();
        }

        var normalizedQuery = (query ?? string.Empty).Trim().ToLowerInvariant();
        var take = Math.Clamp(limit.GetValueOrDefault(50), 1, MaxUserSearchLimit);
        var usersQuery = _context.Users.AsNoTracking();

        if (!string.IsNullOrWhiteSpace(normalizedQuery))
        {
            var hasUserIdQuery = int.TryParse(normalizedQuery, out var queryUserId);
            usersQuery = usersQuery.Where(user =>
                (hasUserIdQuery && user.id == queryUserId) ||
                (user.email != null && user.email.ToLower().Contains(normalizedQuery)) ||
                user.nickname.ToLower().Contains(normalizedQuery) ||
                user.first_name.ToLower().Contains(normalizedQuery) ||
                user.last_name.ToLower().Contains(normalizedQuery));
        }

        var users = await usersQuery
            .OrderByDescending(user => user.IsBanned)
            .ThenBy(user => user.nickname)
            .Take(take)
            .ToListAsync(cancellationToken);

        return Ok(new
        {
            users = users.Select(user => BuildAdminUserPayload(user, currentUser.id))
        });
    }

    [HttpGet("security-overview")]
    public async Task<IActionResult> GetSecurityOverview(CancellationToken cancellationToken)
    {
        var currentUser = await RequireAdminAsync(cancellationToken);
        if (currentUser == null)
        {
            return Forbid();
        }

        return Ok(await _securityOverviewService.GetOverviewAsync(cancellationToken));
    }

    [HttpPost("users/{userId:int}/ban")]
    public async Task<IActionResult> BanUser([FromRoute] int userId, [FromBody] AdminBanRequest? request, CancellationToken cancellationToken)
    {
        var currentUser = await RequireAdminAsync(cancellationToken);
        if (currentUser == null)
        {
            return Forbid();
        }

        var result = await _accountBanService.BanUserAsync(currentUser.id, userId, request?.Reason, cancellationToken);
        return result switch
        {
            AccountBanResult.Success => Ok(new { banned = true }),
            AccountBanResult.SelfBanDenied => BadRequest(new { message = "Нельзя заблокировать собственную учётную запись." }),
            AccountBanResult.AdminBanDenied => BadRequest(new { message = "Нельзя заблокировать администратора." }),
            _ => NotFound(new { message = "Пользователь не найден." })
        };
    }

    [HttpPost("users/{userId:int}/unban")]
    public async Task<IActionResult> UnbanUser([FromRoute] int userId, CancellationToken cancellationToken)
    {
        var currentUser = await RequireAdminAsync(cancellationToken);
        if (currentUser == null)
        {
            return Forbid();
        }

        var result = await _accountBanService.UnbanUserAsync(userId, cancellationToken);
        return result == AccountBanResult.Success
            ? Ok(new { banned = false })
            : NotFound(new { message = "Пользователь не найден." });
    }

    private async Task<User?> RequireAdminAsync(CancellationToken cancellationToken)
    {
        var user = await _accountBanService.GetCurrentUserAsync(User, cancellationToken);
        return user != null && _accountBanService.IsAdmin(user) ? user : null;
    }

    private object BuildAdminUserPayload(User user, int currentUserId)
    {
        return new
        {
            id = user.id,
            displayName = GetDisplayName(user),
            nickname = user.nickname,
            email = user.email ?? string.Empty,
            avatarUrl = user.avatar_url ?? string.Empty,
            isAdmin = _accountBanService.IsAdmin(user),
            isSelf = user.id == currentUserId,
            isBanned = user.IsBanned,
            bannedAt = user.BannedAt?.ToString("O"),
            bannedByUserId = user.BannedByUserId,
            banReason = user.BanReason ?? string.Empty,
            lastSeenAt = user.last_seen_at?.ToString("O")
        };
    }

    private static string GetDisplayName(User user)
    {
        var nickname = (user.nickname ?? string.Empty).Trim();
        if (!string.IsNullOrWhiteSpace(nickname))
        {
            return nickname;
        }

        var fullName = $"{user.first_name} {user.last_name}".Trim();
        return string.IsNullOrWhiteSpace(fullName) ? user.email ?? $"User {user.id}" : fullName;
    }
}

public sealed class AdminBanRequest
{
    public string? Reason { get; set; }
}
