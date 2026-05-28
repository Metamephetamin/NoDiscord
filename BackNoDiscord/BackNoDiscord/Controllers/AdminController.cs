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
    private readonly PushNotificationService _pushNotificationService;

    public AdminController(
        AppDbContext context,
        AccountBanService accountBanService,
        AdminSecurityOverviewService securityOverviewService,
        PushNotificationService pushNotificationService)
    {
        _context = context;
        _accountBanService = accountBanService;
        _securityOverviewService = securityOverviewService;
        _pushNotificationService = pushNotificationService;
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
        if (result == AccountBanResult.Success)
        {
            await SendAdminDecisionPushAsync(
                userId,
                "Аккаунт заблокирован",
                BuildBanNotificationBody(request?.Reason),
                "admin_ban",
                cancellationToken);
        }

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
        if (result == AccountBanResult.Success)
        {
            await SendAdminDecisionPushAsync(
                userId,
                "Блокировка снята",
                "Администратор снял блокировку с вашего аккаунта.",
                "admin_unban",
                cancellationToken);
        }

        return result == AccountBanResult.Success
            ? Ok(new { banned = false })
            : NotFound(new { message = "Пользователь не найден." });
    }

    [HttpPost("reports/chat/{reportId:int}/dismiss")]
    public async Task<IActionResult> DismissChatReport([FromRoute] int reportId, [FromBody] AdminReportResolutionRequest? request, CancellationToken cancellationToken)
    {
        var currentUser = await RequireAdminAsync(cancellationToken);
        if (currentUser == null)
        {
            return Forbid();
        }

        var report = await _context.ChatModerationReports.FirstOrDefaultAsync(item => item.Id == reportId, cancellationToken);
        if (report == null)
        {
            return NotFound(new { message = "Жалоба не найдена." });
        }

        report.Status = "dismissed";
        report.ReviewedAt = DateTimeOffset.UtcNow;
        report.ReviewedByUserId = currentUser.id.ToString();
        await _context.SaveChangesAsync(cancellationToken);

        if (int.TryParse(report.ReporterUserId, out var reporterUserId))
        {
            await SendAdminDecisionPushAsync(
                reporterUserId,
                "Жалоба проверена",
                NormalizeAdminMessage(request?.Message, "Мы проверили жалобу и не нашли нарушения."),
                "admin_report_dismissed",
                cancellationToken);
        }

        return Ok(new { dismissed = true });
    }

    [HttpPost("reports/user/{reportId:int}/dismiss")]
    public async Task<IActionResult> DismissUserReport([FromRoute] int reportId, [FromBody] AdminReportResolutionRequest? request, CancellationToken cancellationToken)
    {
        var currentUser = await RequireAdminAsync(cancellationToken);
        if (currentUser == null)
        {
            return Forbid();
        }

        var report = await _context.UserReports.FirstOrDefaultAsync(item => item.Id == reportId, cancellationToken);
        if (report == null)
        {
            return NotFound(new { message = "Жалоба не найдена." });
        }

        report.Status = "dismissed";
        report.ReviewedAt = DateTimeOffset.UtcNow;
        report.ReviewedByUserId = currentUser.id;
        await _context.SaveChangesAsync(cancellationToken);

        await SendAdminDecisionPushAsync(
            report.ReporterUserId,
            "Жалоба проверена",
            NormalizeAdminMessage(request?.Message, "Мы проверили жалобу и не нашли нарушения."),
            "admin_report_dismissed",
            cancellationToken);

        return Ok(new { dismissed = true });
    }

    private async Task<User?> RequireAdminAsync(CancellationToken cancellationToken)
    {
        var user = await _accountBanService.GetCurrentUserAsync(User, cancellationToken);
        return user != null && user.is_totp_enabled && _accountBanService.IsAdmin(user) ? user : null;
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

    private async Task SendAdminDecisionPushAsync(int userId, string title, string body, string type, CancellationToken cancellationToken)
    {
        if (userId <= 0)
        {
            return;
        }

        await _pushNotificationService.SendToUsersAsync(
            [userId],
            new PushNotificationPayload
            {
                Title = title,
                Body = NormalizeAdminMessage(body, title),
                Tag = $"{type}:{userId}",
                Type = type,
                Url = "/"
            },
            cancellationToken);
    }

    private static string BuildBanNotificationBody(string? reason)
    {
        var normalizedReason = NormalizeAdminMessage(reason, string.Empty);
        return string.IsNullOrWhiteSpace(normalizedReason)
            ? "Администратор заблокировал ваш аккаунт."
            : $"Администратор заблокировал ваш аккаунт. Причина: {normalizedReason}";
    }

    private static string NormalizeAdminMessage(string? value, string fallback)
    {
        var normalized = Convert.ToString(value)?.Trim() ?? string.Empty;
        if (string.IsNullOrWhiteSpace(normalized))
        {
            normalized = fallback.Trim();
        }

        return normalized.Length <= 220 ? normalized : normalized[..220];
    }
}

public sealed class AdminBanRequest
{
    public string? Reason { get; set; }
}

public sealed class AdminReportResolutionRequest
{
    public string? Message { get; set; }
}
