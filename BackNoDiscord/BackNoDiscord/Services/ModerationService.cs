using BackNoDiscord.Security;
using Microsoft.EntityFrameworkCore;

namespace BackNoDiscord.Services;

public sealed class ModerationService
{
    private const int MaxServerIdLength = 160;
    private const int MaxChannelIdLength = 180;
    private const int MaxUserIdLength = 80;
    private const int MaxReasonLength = 240;
    private static readonly HashSet<string> AllowedReportStatuses = new(StringComparer.OrdinalIgnoreCase)
    {
        "open",
        "reviewed",
        "actioned",
        "dismissed"
    };
    private static readonly HashSet<string> AllowedActionTypes = new(StringComparer.OrdinalIgnoreCase)
    {
        "mute",
        "ban",
        "block"
    };
    private static readonly string[] MessageContentFragments =
    [
        "message body",
        "текст сообщения",
        "содержимое сообщения"
    ];

    private readonly AppDbContext _context;

    public ModerationService(AppDbContext context)
    {
        _context = context;
    }

    public async Task<ChatModerationReportRecord> CreateReportAsync(
        string? serverId,
        string? channelId,
        string? reporterUserId,
        string? targetUserId,
        int? messageId,
        string? reason,
        CancellationToken cancellationToken)
    {
        var now = DateTimeOffset.UtcNow;
        var report = new ChatModerationReportRecord
        {
            ServerId = Normalize(serverId, MaxServerIdLength),
            ChannelId = Normalize(channelId, MaxChannelIdLength),
            ReporterUserId = Normalize(reporterUserId, MaxUserIdLength),
            TargetUserId = Normalize(targetUserId, MaxUserIdLength),
            MessageId = messageId > 0 ? messageId : null,
            Reason = SanitizeReason(reason),
            Status = "open",
            CreatedAt = now
        };

        if (string.IsNullOrWhiteSpace(report.ServerId) ||
            string.IsNullOrWhiteSpace(report.ChannelId) ||
            string.IsNullOrWhiteSpace(report.ReporterUserId) ||
            string.IsNullOrWhiteSpace(report.TargetUserId))
        {
            throw new ArgumentException("serverId, channelId, reporterUserId and targetUserId are required.");
        }

        _context.ChatModerationReports.Add(report);
        await _context.SaveChangesAsync(cancellationToken);
        return report;
    }

    public async Task<IReadOnlyList<ChatModerationReportRecord>> GetReportsAsync(
        string? serverId,
        string? status,
        int limit,
        CancellationToken cancellationToken)
    {
        var normalizedServerId = Normalize(serverId, MaxServerIdLength);
        if (string.IsNullOrWhiteSpace(normalizedServerId))
        {
            return [];
        }

        var normalizedStatus = NormalizeStatus(status);
        var pageSize = Math.Max(1, Math.Min(100, limit));
        var query = _context.ChatModerationReports
            .AsNoTracking()
            .Where(item => item.ServerId == normalizedServerId);
        if (!string.IsNullOrWhiteSpace(normalizedStatus))
        {
            query = query.Where(item => item.Status == normalizedStatus);
        }

        return await query
            .OrderByDescending(item => item.CreatedAt)
            .ThenByDescending(item => item.Id)
            .Take(pageSize)
            .ToListAsync(cancellationToken);
    }

    public async Task<ChatModerationReportRecord?> UpdateReportStatusAsync(
        int reportId,
        string? status,
        string? reviewerUserId,
        CancellationToken cancellationToken)
    {
        var normalizedStatus = NormalizeStatus(status);
        if (string.IsNullOrWhiteSpace(normalizedStatus))
        {
            throw new ArgumentException("status is invalid.");
        }

        var report = await _context.ChatModerationReports.FirstOrDefaultAsync(item => item.Id == reportId, cancellationToken);
        if (report is null)
        {
            return null;
        }

        report.Status = normalizedStatus;
        report.ReviewedAt = DateTimeOffset.UtcNow;
        report.ReviewedByUserId = Normalize(reviewerUserId, MaxUserIdLength);
        await _context.SaveChangesAsync(cancellationToken);
        return report;
    }

    public async Task<ChatModerationReportRecord?> GetReportAsync(int reportId, CancellationToken cancellationToken)
    {
        return await _context.ChatModerationReports
            .AsNoTracking()
            .FirstOrDefaultAsync(item => item.Id == reportId, cancellationToken);
    }

    public async Task<ChatModerationActionRecord> ApplyActionAsync(
        string? serverId,
        string? actorUserId,
        string? targetUserId,
        string? actionType,
        string? reason,
        DateTimeOffset? expiresAt,
        CancellationToken cancellationToken)
    {
        var normalizedActionType = NormalizeActionType(actionType);
        if (string.IsNullOrWhiteSpace(normalizedActionType))
        {
            throw new ArgumentException("actionType is invalid.");
        }

        var action = new ChatModerationActionRecord
        {
            ServerId = Normalize(serverId, MaxServerIdLength),
            ActorUserId = Normalize(actorUserId, MaxUserIdLength),
            TargetUserId = Normalize(targetUserId, MaxUserIdLength),
            ActionType = normalizedActionType,
            Reason = SanitizeReason(reason),
            CreatedAt = DateTimeOffset.UtcNow,
            ExpiresAt = expiresAt
        };

        if (string.IsNullOrWhiteSpace(action.ServerId) ||
            string.IsNullOrWhiteSpace(action.ActorUserId) ||
            string.IsNullOrWhiteSpace(action.TargetUserId))
        {
            throw new ArgumentException("serverId, actorUserId and targetUserId are required.");
        }

        _context.ChatModerationActions.Add(action);
        await _context.SaveChangesAsync(cancellationToken);
        return action;
    }

    public async Task<ChatModerationActionRecord?> RevokeActionAsync(
        int actionId,
        string? revokedByUserId,
        CancellationToken cancellationToken)
    {
        var action = await _context.ChatModerationActions.FirstOrDefaultAsync(item => item.Id == actionId, cancellationToken);
        if (action is null)
        {
            return null;
        }

        action.RevokedAt = DateTimeOffset.UtcNow;
        action.RevokedByUserId = Normalize(revokedByUserId, MaxUserIdLength);
        await _context.SaveChangesAsync(cancellationToken);
        return action;
    }

    public async Task<ChatModerationActionRecord?> GetActionAsync(int actionId, CancellationToken cancellationToken)
    {
        return await _context.ChatModerationActions
            .AsNoTracking()
            .FirstOrDefaultAsync(item => item.Id == actionId, cancellationToken);
    }

    public async Task<ChatModerationActionRecord?> GetActiveActionAsync(
        string? serverId,
        string? targetUserId,
        IReadOnlyCollection<string> actionTypes,
        CancellationToken cancellationToken)
    {
        var normalizedServerId = Normalize(serverId, MaxServerIdLength);
        var normalizedTargetUserId = Normalize(targetUserId, MaxUserIdLength);
        var normalizedActionTypes = actionTypes
            .Select(NormalizeActionType)
            .Where(item => !string.IsNullOrWhiteSpace(item))
            .Distinct(StringComparer.Ordinal)
            .ToList();

        if (string.IsNullOrWhiteSpace(normalizedServerId) ||
            string.IsNullOrWhiteSpace(normalizedTargetUserId) ||
            normalizedActionTypes.Count == 0)
        {
            return null;
        }

        var now = DateTimeOffset.UtcNow;
        return await _context.ChatModerationActions
            .AsNoTracking()
            .Where(item =>
                item.ServerId == normalizedServerId &&
                item.TargetUserId == normalizedTargetUserId &&
                normalizedActionTypes.Contains(item.ActionType) &&
                item.RevokedAt == null &&
                (item.ExpiresAt == null || item.ExpiresAt > now))
            .OrderByDescending(item => item.CreatedAt)
            .ThenByDescending(item => item.Id)
            .FirstOrDefaultAsync(cancellationToken);
    }

    private static string Normalize(string? value, int maxLength)
    {
        return UploadPolicies.TrimToLength(value, maxLength).Trim();
    }

    private static string NormalizeStatus(string? value)
    {
        var normalized = Normalize(value, 32).ToLowerInvariant();
        return AllowedReportStatuses.Contains(normalized) ? normalized : string.Empty;
    }

    private static string NormalizeActionType(string? value)
    {
        var normalized = Normalize(value, 32).ToLowerInvariant();
        return AllowedActionTypes.Contains(normalized) ? normalized : string.Empty;
    }

    private static string SanitizeReason(string? value)
    {
        var sanitized = Normalize(value, MaxReasonLength);
        foreach (var fragment in MessageContentFragments)
        {
            sanitized = sanitized.Replace(fragment, "[redacted]", StringComparison.OrdinalIgnoreCase);
        }

        return string.IsNullOrWhiteSpace(sanitized) ? "not_specified" : sanitized;
    }
}
