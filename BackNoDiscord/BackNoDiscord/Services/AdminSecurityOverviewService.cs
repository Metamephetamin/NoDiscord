using System.Text.Json;
using Microsoft.EntityFrameworkCore;

namespace BackNoDiscord.Services;

public sealed class AdminSecurityOverviewService
{
    private const string MessagePayloadPrefix = "__CHAT_PAYLOAD__:";
    private const int RecentMessagesLimit = 40;
    private const int RecentFilesLimit = 40;
    private const int RecentReportsLimit = 40;
    private const int RecentUserReportsLimit = 60;
    private const int SuspiciousUsersLimit = 50;
    private const int UserRowsLimit = 120;
    private const int MessageSpikeAlertThreshold = 500;
    private const int FileSpikeAlertThreshold = 120;
    private const int OpenReportAlertThreshold = 8;

    private readonly AppDbContext _context;

    public AdminSecurityOverviewService(AppDbContext context)
    {
        _context = context;
    }

    public async Task<AdminSecurityOverviewDto> GetOverviewAsync(CancellationToken cancellationToken)
    {
        var now = DateTimeOffset.UtcNow;
        var messagesSinceUtc = now.UtcDateTime.AddHours(-24);
        var filesSinceUtc = now.AddDays(-7);

        var totalUsers = await _context.Users.AsNoTracking().CountAsync(cancellationToken);
        var bannedUsers = await _context.Users.AsNoTracking().CountAsync(user => user.IsBanned, cancellationToken);
        var recentMessageCount = await _context.Messages.AsNoTracking()
            .CountAsync(message => !message.IsDeleted && message.Timestamp >= messagesSinceUtc, cancellationToken);
        var recentFileCount = await _context.ChatFileUploads.AsNoTracking()
            .CountAsync(file => file.DeletedAt == null && file.CreatedAt >= filesSinceUtc, cancellationToken);
        var openChatReportCount = await _context.ChatModerationReports.AsNoTracking()
            .CountAsync(report => report.Status == "open", cancellationToken);
        var openUserReportCount = await _context.UserReports.AsNoTracking()
            .CountAsync(report => report.Status == "open", cancellationToken);
        var openReportCount = openChatReportCount + openUserReportCount;

        var messageActivity = await _context.Messages.AsNoTracking()
            .Where(message => !message.IsDeleted && message.AuthorUserId != null && message.Timestamp >= messagesSinceUtc)
            .GroupBy(message => message.AuthorUserId!)
            .Select(group => new UserActivityAggregate(group.Key, group.Count(), group.Max(message => message.Timestamp)))
            .ToListAsync(cancellationToken);

        var fileActivity = await _context.ChatFileUploads.AsNoTracking()
            .Where(file => file.DeletedAt == null && file.CreatedAt >= filesSinceUtc)
            .GroupBy(file => file.OwnerUserId)
            .Select(group => new UserOffsetActivityAggregate(group.Key, group.Count(), group.Sum(file => file.Size), group.Max(file => file.CreatedAt)))
            .ToListAsync(cancellationToken);

        var reportActivity = await _context.ChatModerationReports.AsNoTracking()
            .Where(report => report.Status == "open")
            .GroupBy(report => report.TargetUserId)
            .Select(group => new UserOffsetActivityAggregate(group.Key, group.Count(), 0, group.Max(report => report.CreatedAt)))
            .ToListAsync(cancellationToken);

        var userReportActivity = await _context.UserReports.AsNoTracking()
            .Where(report => report.Status == "open")
            .GroupBy(report => report.TargetUserId)
            .Select(group => new UserOffsetActivityAggregate(group.Key.ToString(), group.Count(), 0, group.Max(report => report.CreatedAt)))
            .ToListAsync(cancellationToken);

        var identityMatchActivity = await _context.BannedIdentityRecords.AsNoTracking()
            .Where(identity => identity.RevokedAt == null && identity.MatchCount > 0)
            .GroupBy(identity => identity.SourceUserId)
            .Select(group => new UserIdentityMatchAggregate(group.Key, group.Sum(identity => identity.MatchCount), group.Max(identity => identity.LastMatchedAt)))
            .ToListAsync(cancellationToken);

        var signalsByUserId = BuildSuspicionSignals(messageActivity, fileActivity, reportActivity, userReportActivity, identityMatchActivity);
        var suspiciousUserIds = signalsByUserId
            .OrderByDescending(pair => pair.Value.Score)
            .ThenBy(pair => pair.Key)
            .Take(SuspiciousUsersLimit)
            .Select(pair => pair.Key)
            .ToArray();

        var baselineUsers = await _context.Users.AsNoTracking()
            .OrderByDescending(user => user.IsBanned)
            .ThenByDescending(user => user.last_seen_at)
            .ThenBy(user => user.nickname)
            .Take(UserRowsLimit)
            .ToListAsync(cancellationToken);

        var baselineUserIds = baselineUsers.Select(user => user.id).ToHashSet();
        var missingSuspiciousUserIds = suspiciousUserIds.Where(userId => !baselineUserIds.Contains(userId)).ToArray();
        var extraSuspiciousUsers = missingSuspiciousUserIds.Length == 0
            ? []
            : await _context.Users.AsNoTracking()
                .Where(user => missingSuspiciousUserIds.Contains(user.id))
                .ToListAsync(cancellationToken);

        var dashboardUsers = baselineUsers
            .Concat(extraSuspiciousUsers)
            .GroupBy(user => user.id)
            .Select(group => group.First())
            .Select(user => BuildUserDto(user, signalsByUserId.TryGetValue(user.id, out var signals) ? signals : UserSuspicionSignals.Empty))
            .OrderByDescending(user => user.IsBanned)
            .ThenByDescending(user => user.SuspicionScore)
            .ThenBy(user => user.DisplayName)
            .Take(UserRowsLimit)
            .ToList();

        var suspiciousUsers = dashboardUsers
            .Where(user => user.SuspicionScore > 0)
            .OrderByDescending(user => user.SuspicionScore)
            .ThenBy(user => user.DisplayName)
            .Take(SuspiciousUsersLimit)
            .ToList();

        var recentMessages = await LoadRecentMessagesAsync(cancellationToken);
        var recentFiles = await LoadRecentFilesAsync(cancellationToken);
        var recentReports = await LoadRecentReportsAsync(cancellationToken);
        var recentUserReports = await LoadRecentUserReportsAsync(cancellationToken);
        var alerts = BuildAlerts(recentMessageCount, recentFileCount, openChatReportCount, openUserReportCount, now);

        return new AdminSecurityOverviewDto(
            totalUsers,
            bannedUsers,
            recentMessageCount,
            recentFileCount,
            openReportCount,
            dashboardUsers,
            suspiciousUsers,
            recentMessages,
            recentFiles,
            recentReports,
            recentUserReports,
            alerts);
    }

    private async Task<IReadOnlyList<AdminSecurityMessageDto>> LoadRecentMessagesAsync(CancellationToken cancellationToken)
    {
        var messages = await _context.Messages.AsNoTracking()
            .Where(message => !message.IsDeleted)
            .OrderByDescending(message => message.Timestamp)
            .Take(RecentMessagesLimit)
            .Select(message => new Message
            {
                Id = message.Id,
                ChannelId = message.ChannelId,
                Username = message.Username,
                Content = message.Content,
                EncryptedContent = message.EncryptedContent,
                AuthorUserId = message.AuthorUserId,
                Timestamp = message.Timestamp
            })
            .ToListAsync(cancellationToken);

        return messages
            .Select(message => new AdminSecurityMessageDto(
                message.Id,
                message.ChannelId,
                ExtractServerId(message.ChannelId),
                message.AuthorUserId ?? string.Empty,
                message.Username,
                BuildMessagePreview(message),
                message.EncryptedContent != null,
                new DateTimeOffset(DateTime.SpecifyKind(message.Timestamp, DateTimeKind.Utc)).ToString("O")))
            .ToList();
    }

    private async Task<IReadOnlyList<AdminSecurityFileDto>> LoadRecentFilesAsync(CancellationToken cancellationToken)
    {
        return await _context.ChatFileUploads.AsNoTracking()
            .Where(file => file.DeletedAt == null)
            .OrderByDescending(file => file.CreatedAt)
            .Take(RecentFilesLimit)
            .Select(file => new AdminSecurityFileDto(
                file.Id,
                file.OwnerUserId,
                file.DisplayFileName,
                file.ContentType,
                file.Size,
                file.ChannelId ?? string.Empty,
                file.MessageId,
                file.ChecksumSha256,
                file.CreatedAt.ToString("O")))
            .ToListAsync(cancellationToken);
    }

    private async Task<IReadOnlyList<AdminSecurityReportDto>> LoadRecentReportsAsync(CancellationToken cancellationToken)
    {
        return await _context.ChatModerationReports.AsNoTracking()
            .OrderByDescending(report => report.CreatedAt)
            .Take(RecentReportsLimit)
            .Select(report => new AdminSecurityReportDto(
                report.Id,
                report.ServerId,
                report.ChannelId,
                report.MessageId,
                report.ReporterUserId,
                report.TargetUserId,
                report.Reason,
                report.Status,
                report.CreatedAt.ToString("O")))
            .ToListAsync(cancellationToken);
    }

    private async Task<IReadOnlyList<AdminSecurityUserReportDto>> LoadRecentUserReportsAsync(CancellationToken cancellationToken)
    {
        var reports = await _context.UserReports.AsNoTracking()
            .OrderByDescending(report => report.CreatedAt)
            .Take(RecentUserReportsLimit)
            .ToListAsync(cancellationToken);
        if (reports.Count == 0)
        {
            return [];
        }

        var userIds = reports
            .SelectMany(report => new[] { report.ReporterUserId, report.TargetUserId })
            .Distinct()
            .ToArray();
        var usersById = await _context.Users.AsNoTracking()
            .Where(user => userIds.Contains(user.id))
            .ToDictionaryAsync(user => user.id, user => GetDisplayName(user), cancellationToken);

        return reports
            .Select(report => new AdminSecurityUserReportDto(
                report.Id,
                report.ReporterUserId,
                usersById.TryGetValue(report.ReporterUserId, out var reporterName) ? reporterName : $"User {report.ReporterUserId}",
                report.TargetUserId,
                usersById.TryGetValue(report.TargetUserId, out var targetName) ? targetName : $"User {report.TargetUserId}",
                report.Reason,
                report.Status,
                report.CreatedAt.ToString("O")))
            .ToList();
    }

    private static IReadOnlyList<AdminSecurityAlertDto> BuildAlerts(
        int recentMessageCount,
        int recentFileCount,
        int openChatReportCount,
        int openUserReportCount,
        DateTimeOffset now)
    {
        var alerts = new List<AdminSecurityAlertDto>();
        if (recentMessageCount >= MessageSpikeAlertThreshold)
        {
            alerts.Add(new AdminSecurityAlertDto(
                "message_spike",
                "Всплеск сообщений",
                $"За 24 часа отправлено {recentMessageCount} сообщений.",
                "warning",
                recentMessageCount,
                now.ToString("O")));
        }

        if (recentFileCount >= FileSpikeAlertThreshold)
        {
            alerts.Add(new AdminSecurityAlertDto(
                "file_spike",
                "Всплеск файлов",
                $"За 7 дней загружено {recentFileCount} файлов.",
                "warning",
                recentFileCount,
                now.ToString("O")));
        }

        if (openChatReportCount + openUserReportCount >= OpenReportAlertThreshold)
        {
            alerts.Add(new AdminSecurityAlertDto(
                "report_spike",
                "Много открытых жалоб",
                $"Открытых жалоб: {openChatReportCount + openUserReportCount}.",
                "danger",
                openChatReportCount + openUserReportCount,
                now.ToString("O")));
        }

        if (openUserReportCount > 0)
        {
            alerts.Add(new AdminSecurityAlertDto(
                "user_reports",
                "Новые жалобы на пользователей",
                $"Открытых профильных жалоб: {openUserReportCount}.",
                "danger",
                openUserReportCount,
                now.ToString("O")));
        }

        return alerts;
    }

    private static Dictionary<int, UserSuspicionSignals> BuildSuspicionSignals(
        IReadOnlyCollection<UserActivityAggregate> messageActivity,
        IReadOnlyCollection<UserOffsetActivityAggregate> fileActivity,
        IReadOnlyCollection<UserOffsetActivityAggregate> reportActivity,
        IReadOnlyCollection<UserOffsetActivityAggregate> userReportActivity,
        IReadOnlyCollection<UserIdentityMatchAggregate> identityMatchActivity)
    {
        var signals = new Dictionary<int, UserSuspicionSignals>();

        foreach (var activity in messageActivity)
        {
            if (TryParseUserId(activity.UserId, out var userId))
            {
                var current = GetSignals(signals, userId);
                current.MessageCount24h = activity.Count;
                current.LastMessageAt = new DateTimeOffset(DateTime.SpecifyKind(activity.LastAt, DateTimeKind.Utc));
            }
        }

        foreach (var activity in fileActivity)
        {
            if (TryParseUserId(activity.UserId, out var userId))
            {
                var current = GetSignals(signals, userId);
                current.FileCount7d = activity.Count;
                current.FileBytes7d = activity.Bytes;
                current.LastFileAt = activity.LastAt;
            }
        }

        foreach (var activity in reportActivity)
        {
            if (TryParseUserId(activity.UserId, out var userId))
            {
                var current = GetSignals(signals, userId);
                current.OpenReportCount = activity.Count;
                current.LastReportAt = activity.LastAt;
            }
        }

        foreach (var activity in userReportActivity)
        {
            if (TryParseUserId(activity.UserId, out var userId))
            {
                var current = GetSignals(signals, userId);
                current.OpenUserReportCount = activity.Count;
                current.LastUserReportAt = activity.LastAt;
            }
        }

        foreach (var activity in identityMatchActivity)
        {
            var current = GetSignals(signals, activity.UserId);
            current.BannedIdentityMatchCount = activity.MatchCount;
            current.LastBannedIdentityMatchAt = activity.LastMatchedAt;
        }

        foreach (var entry in signals.Values)
        {
            entry.Score = CalculateSuspicionScore(entry);
            entry.Reasons = BuildSuspicionReasons(entry);
        }

        return signals
            .Where(pair => pair.Value.Score > 0)
            .ToDictionary(pair => pair.Key, pair => pair.Value);
    }

    private static int CalculateSuspicionScore(UserSuspicionSignals signals)
    {
        var score = 0;
        if (signals.MessageCount24h >= 120)
        {
            score += 45 + Math.Min(45, signals.MessageCount24h / 20);
        }

        if (signals.FileCount7d >= 20)
        {
            score += 25 + Math.Min(35, signals.FileCount7d / 5);
        }

        if (signals.OpenReportCount > 0)
        {
            score += Math.Min(40, signals.OpenReportCount * 20);
        }

        if (signals.OpenUserReportCount > 0)
        {
            score += Math.Min(50, 25 + signals.OpenUserReportCount * 15);
        }

        if (signals.BannedIdentityMatchCount > 0)
        {
            score += Math.Min(60, 30 + signals.BannedIdentityMatchCount * 5);
        }

        return Math.Min(100, score);
    }

    private static IReadOnlyList<string> BuildSuspicionReasons(UserSuspicionSignals signals)
    {
        var reasons = new List<string>(4);
        if (signals.MessageCount24h >= 120)
        {
            reasons.Add($"много сообщений за 24ч: {signals.MessageCount24h}");
        }

        if (signals.FileCount7d >= 20)
        {
            reasons.Add($"много файлов за 7д: {signals.FileCount7d}");
        }

        if (signals.OpenReportCount > 0)
        {
            reasons.Add($"открытые жалобы: {signals.OpenReportCount}");
        }

        if (signals.OpenUserReportCount > 0)
        {
            reasons.Add($"жалобы на профиль: {signals.OpenUserReportCount}");
        }

        if (signals.BannedIdentityMatchCount > 0)
        {
            reasons.Add($"совпадения с бан-сигналами: {signals.BannedIdentityMatchCount}");
        }

        return reasons;
    }

    private static AdminSecurityUserDto BuildUserDto(User user, UserSuspicionSignals signals)
    {
        return new AdminSecurityUserDto(
            user.id,
            GetDisplayName(user),
            user.nickname,
            user.email ?? string.Empty,
            user.avatar_url ?? string.Empty,
            user.IsBanned,
            user.BannedAt?.ToString("O"),
            user.BanReason ?? string.Empty,
            user.last_seen_at?.ToString("O"),
            signals.Score,
            signals.MessageCount24h,
            signals.FileCount7d,
            signals.OpenReportCount + signals.OpenUserReportCount,
            signals.BannedIdentityMatchCount,
            signals.Reasons);
    }

    private static UserSuspicionSignals GetSignals(Dictionary<int, UserSuspicionSignals> signals, int userId)
    {
        if (!signals.TryGetValue(userId, out var current))
        {
            current = new UserSuspicionSignals();
            signals[userId] = current;
        }

        return current;
    }

    private static string BuildMessagePreview(Message message)
    {
        if (!string.IsNullOrWhiteSpace(message.EncryptedContent))
        {
            return "зашифрованное сообщение";
        }

        var payload = TryDeserializePayload(message.Content);
        if (payload != null)
        {
            var payloadMessage = TrimToLength(payload.Message, 180).Trim();
            if (!string.IsNullOrWhiteSpace(payloadMessage))
            {
                return payloadMessage;
            }

            if (payload.Attachments?.Count > 0)
            {
                var firstAttachment = payload.Attachments[0];
                return string.IsNullOrWhiteSpace(firstAttachment.AttachmentName)
                    ? $"вложения: {payload.Attachments.Count}"
                    : TrimToLength(firstAttachment.AttachmentName, 180);
            }
        }

        return string.IsNullOrWhiteSpace(message.Content)
            ? "сообщение без текста"
            : TrimToLength(message.Content, 180);
    }

    private static ChatMessagePayload? TryDeserializePayload(string? raw)
    {
        if (string.IsNullOrWhiteSpace(raw) || !raw.StartsWith(MessagePayloadPrefix, StringComparison.Ordinal))
        {
            return null;
        }

        try
        {
            return JsonSerializer.Deserialize<ChatMessagePayload>(
                raw[MessagePayloadPrefix.Length..],
                new JsonSerializerOptions(JsonSerializerDefaults.Web));
        }
        catch (JsonException)
        {
            return null;
        }
    }

    private static string ExtractServerId(string? channelId)
    {
        const string serverPrefix = "server:";
        const string channelMarker = "::channel:";
        var normalized = channelId ?? string.Empty;
        if (!normalized.StartsWith(serverPrefix, StringComparison.Ordinal))
        {
            return string.Empty;
        }

        var markerIndex = normalized.IndexOf(channelMarker, StringComparison.Ordinal);
        return markerIndex > serverPrefix.Length
            ? normalized[serverPrefix.Length..markerIndex]
            : string.Empty;
    }

    private static bool TryParseUserId(string? raw, out int userId)
    {
        return int.TryParse((raw ?? string.Empty).Trim(), out userId) && userId > 0;
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

    private static string TrimToLength(string? value, int maxLength)
    {
        var normalized = (value ?? string.Empty).Trim();
        return normalized.Length <= maxLength ? normalized : normalized[..maxLength];
    }

    private sealed record UserActivityAggregate(string UserId, int Count, DateTime LastAt);

    private sealed record UserOffsetActivityAggregate(string UserId, int Count, long Bytes, DateTimeOffset LastAt);

    private sealed record UserIdentityMatchAggregate(int UserId, int MatchCount, DateTimeOffset? LastMatchedAt);

    private sealed class UserSuspicionSignals
    {
        public static UserSuspicionSignals Empty { get; } = new();

        public int Score { get; set; }
        public int MessageCount24h { get; set; }
        public int FileCount7d { get; set; }
        public long FileBytes7d { get; set; }
        public int OpenReportCount { get; set; }
        public int OpenUserReportCount { get; set; }
        public int BannedIdentityMatchCount { get; set; }
        public DateTimeOffset? LastMessageAt { get; set; }
        public DateTimeOffset? LastFileAt { get; set; }
        public DateTimeOffset? LastReportAt { get; set; }
        public DateTimeOffset? LastUserReportAt { get; set; }
        public DateTimeOffset? LastBannedIdentityMatchAt { get; set; }
        public IReadOnlyList<string> Reasons { get; set; } = [];
    }
}

public sealed record AdminSecurityOverviewDto(
    int TotalUsers,
    int BannedUsers,
    int RecentMessageCount24h,
    int RecentFileCount7d,
    int OpenReportCount,
    IReadOnlyList<AdminSecurityUserDto> Users,
    IReadOnlyList<AdminSecurityUserDto> SuspiciousUsers,
    IReadOnlyList<AdminSecurityMessageDto> RecentMessages,
    IReadOnlyList<AdminSecurityFileDto> RecentFiles,
    IReadOnlyList<AdminSecurityReportDto> RecentReports,
    IReadOnlyList<AdminSecurityUserReportDto> RecentUserReports,
    IReadOnlyList<AdminSecurityAlertDto> Alerts);

public sealed record AdminSecurityUserDto(
    int Id,
    string DisplayName,
    string Nickname,
    string Email,
    string AvatarUrl,
    bool IsBanned,
    string? BannedAt,
    string BanReason,
    string? LastSeenAt,
    int SuspicionScore,
    int MessageCount24h,
    int FileCount7d,
    int OpenReportCount,
    int BannedIdentityMatchCount,
    IReadOnlyList<string> SuspicionReasons);

public sealed record AdminSecurityMessageDto(
    int Id,
    string ChannelId,
    string ServerId,
    string AuthorUserId,
    string Username,
    string Preview,
    bool IsEncrypted,
    string Timestamp);

public sealed record AdminSecurityFileDto(
    int Id,
    string OwnerUserId,
    string DisplayFileName,
    string ContentType,
    long Size,
    string ChannelId,
    int? MessageId,
    string ChecksumSha256,
    string CreatedAt);

public sealed record AdminSecurityReportDto(
    int Id,
    string ServerId,
    string ChannelId,
    int? MessageId,
    string ReporterUserId,
    string TargetUserId,
    string Reason,
    string Status,
    string CreatedAt);

public sealed record AdminSecurityUserReportDto(
    int Id,
    int ReporterUserId,
    string ReporterName,
    int TargetUserId,
    string TargetName,
    string Reason,
    string Status,
    string CreatedAt);

public sealed record AdminSecurityAlertDto(
    string Kind,
    string Title,
    string Description,
    string Severity,
    int Count,
    string CreatedAt);
