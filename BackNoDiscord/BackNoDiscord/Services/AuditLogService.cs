using System.Text.Json;
using BackNoDiscord.Security;
using Microsoft.EntityFrameworkCore;

namespace BackNoDiscord.Services;

public sealed class AuditLogService
{
    private const int MaxActionTypeLength = 80;
    private const int MaxTargetIdLength = 160;
    private const int MaxMetadataKeyLength = 80;
    private const int MaxMetadataValueLength = 240;
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);
    private static readonly string[] ForbiddenMetadataKeyFragments =
    [
        "token",
        "secret",
        "password",
        "cookie",
        "authorization",
        "auth",
        "message",
        "body",
        "content"
    ];

    private readonly AppDbContext _context;

    public AuditLogService(AppDbContext context)
    {
        _context = context;
    }

    public async Task RecordAsync(
        string serverId,
        string actorUserId,
        string actionType,
        string targetId = "",
        IReadOnlyDictionary<string, string?>? metadata = null,
        CancellationToken cancellationToken = default)
    {
        var normalizedServerId = UploadPolicies.TrimToLength(serverId, 160);
        var normalizedActorUserId = UploadPolicies.TrimToLength(actorUserId, 80);
        var normalizedActionType = UploadPolicies.TrimToLength(actionType, MaxActionTypeLength);
        if (string.IsNullOrWhiteSpace(normalizedServerId) ||
            string.IsNullOrWhiteSpace(normalizedActorUserId) ||
            string.IsNullOrWhiteSpace(normalizedActionType))
        {
            return;
        }

        _context.ServerAuditLogs.Add(new ServerAuditLogRecord
        {
            ServerId = normalizedServerId,
            ActorUserId = normalizedActorUserId,
            ActionType = normalizedActionType,
            TargetId = UploadPolicies.TrimToLength(targetId, MaxTargetIdLength),
            MetadataJson = JsonSerializer.Serialize(SanitizeMetadata(metadata), JsonOptions),
            CreatedAt = DateTimeOffset.UtcNow
        });
        await _context.SaveChangesAsync(cancellationToken);
    }

    public async Task<IReadOnlyList<ServerAuditLogDto>> GetRecentAsync(
        string serverId,
        int limit = 50,
        CancellationToken cancellationToken = default)
    {
        var normalizedServerId = UploadPolicies.TrimToLength(serverId, 160);
        if (string.IsNullOrWhiteSpace(normalizedServerId))
        {
            return [];
        }

        var pageSize = Math.Max(1, Math.Min(100, limit));
        return await _context.ServerAuditLogs
            .AsNoTracking()
            .Where(item => item.ServerId == normalizedServerId)
            .OrderByDescending(item => item.CreatedAt)
            .ThenByDescending(item => item.Id)
            .Take(pageSize)
            .Select(item => new ServerAuditLogDto
            {
                Id = item.Id,
                ServerId = item.ServerId,
                ActorUserId = item.ActorUserId,
                ActionType = item.ActionType,
                TargetId = item.TargetId,
                MetadataJson = item.MetadataJson,
                CreatedAt = item.CreatedAt
            })
            .ToListAsync(cancellationToken);
    }

    private static Dictionary<string, string> SanitizeMetadata(IReadOnlyDictionary<string, string?>? metadata)
    {
        var sanitized = new Dictionary<string, string>(StringComparer.Ordinal);
        foreach (var (key, value) in metadata ?? new Dictionary<string, string?>())
        {
            var normalizedKey = UploadPolicies.TrimToLength(key, MaxMetadataKeyLength);
            if (string.IsNullOrWhiteSpace(normalizedKey) ||
                ForbiddenMetadataKeyFragments.Any(fragment => normalizedKey.Contains(fragment, StringComparison.OrdinalIgnoreCase)))
            {
                continue;
            }

            sanitized[normalizedKey] = UploadPolicies.TrimToLength(value, MaxMetadataValueLength);
        }

        return sanitized;
    }
}

public sealed class ServerAuditLogDto
{
    public int Id { get; set; }
    public string ServerId { get; set; } = string.Empty;
    public string ActorUserId { get; set; } = string.Empty;
    public string ActionType { get; set; } = string.Empty;
    public string TargetId { get; set; } = string.Empty;
    public string MetadataJson { get; set; } = "{}";
    public DateTimeOffset CreatedAt { get; set; }
}
