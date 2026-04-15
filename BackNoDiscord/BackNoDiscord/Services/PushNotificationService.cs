using System.Net;
using System.Text.Json;
using BackNoDiscord.Security;
using Microsoft.EntityFrameworkCore;
using WebPush;

namespace BackNoDiscord.Services;

public sealed class WebPushOptions
{
    public string Subject { get; init; } = string.Empty;
    public string PublicKey { get; init; } = string.Empty;
    public string PrivateKey { get; init; } = string.Empty;
}

public sealed class PushNotificationPayload
{
    public string Title { get; init; } = string.Empty;
    public string Body { get; init; } = string.Empty;
    public string Icon { get; init; } = "/image/image.png";
    public string Badge { get; init; } = "/image/image.png";
    public string Tag { get; init; } = string.Empty;
    public string Url { get; init; } = "/";
    public string Type { get; init; } = "message";
    public Dictionary<string, string> Data { get; init; } = [];
}

public sealed class PushSubscriptionUpsertRequest
{
    public string Endpoint { get; init; } = string.Empty;
    public string P256dhKey { get; init; } = string.Empty;
    public string AuthKey { get; init; } = string.Empty;
    public string UserAgent { get; init; } = string.Empty;
    public string DeviceLabel { get; init; } = string.Empty;
}

public sealed class PushNotificationService
{
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web)
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase
    };

    private readonly AppDbContext _dbContext;
    private readonly ILogger<PushNotificationService> _logger;
    private readonly WebPushOptions _options;
    private readonly WebPushClient _client = new();

    public PushNotificationService(AppDbContext dbContext, IConfiguration configuration, ILogger<PushNotificationService> logger)
    {
        _dbContext = dbContext;
        _logger = logger;
        _options = new WebPushOptions
        {
            Subject = Convert.ToString(configuration["WebPush:Subject"] ?? configuration["WEBPUSH_SUBJECT"])?.Trim() ?? string.Empty,
            PublicKey = Convert.ToString(configuration["WebPush:PublicKey"] ?? configuration["WEBPUSH_PUBLIC_KEY"])?.Trim() ?? string.Empty,
            PrivateKey = Convert.ToString(configuration["WebPush:PrivateKey"] ?? configuration["WEBPUSH_PRIVATE_KEY"])?.Trim() ?? string.Empty,
        };
    }

    public bool IsConfigured =>
        !string.IsNullOrWhiteSpace(_options.Subject) &&
        !string.IsNullOrWhiteSpace(_options.PublicKey) &&
        !string.IsNullOrWhiteSpace(_options.PrivateKey);

    public string PublicKey => _options.PublicKey;

    public async Task<bool> UpsertSubscriptionAsync(int userId, PushSubscriptionUpsertRequest request, CancellationToken cancellationToken)
    {
        if (userId <= 0 || string.IsNullOrWhiteSpace(request.Endpoint) || string.IsNullOrWhiteSpace(request.P256dhKey) || string.IsNullOrWhiteSpace(request.AuthKey))
        {
            return false;
        }

        var now = DateTimeOffset.UtcNow;
        var normalizedEndpoint = request.Endpoint.Trim();
        var existing = await _dbContext.PushSubscriptions
            .FirstOrDefaultAsync(item => item.Endpoint == normalizedEndpoint, cancellationToken);

        if (existing == null)
        {
            existing = new PushSubscriptionRecord
            {
                UserId = userId,
                Endpoint = normalizedEndpoint,
                P256dhKey = request.P256dhKey.Trim(),
                AuthKey = request.AuthKey.Trim(),
                UserAgent = request.UserAgent.Trim(),
                DeviceLabel = request.DeviceLabel.Trim(),
                CreatedAt = now,
                UpdatedAt = now,
                IsActive = true,
            };
            _dbContext.PushSubscriptions.Add(existing);
        }
        else
        {
            existing.UserId = userId;
            existing.P256dhKey = request.P256dhKey.Trim();
            existing.AuthKey = request.AuthKey.Trim();
            existing.UserAgent = request.UserAgent.Trim();
            existing.DeviceLabel = request.DeviceLabel.Trim();
            existing.UpdatedAt = now;
            existing.LastFailureAt = null;
            existing.LastFailureReason = null;
            existing.IsActive = true;
        }

        await _dbContext.SaveChangesAsync(cancellationToken);
        return true;
    }

    public async Task<bool> RemoveSubscriptionAsync(int userId, string endpoint, CancellationToken cancellationToken)
    {
        var normalizedEndpoint = Convert.ToString(endpoint)?.Trim() ?? string.Empty;
        if (userId <= 0 || string.IsNullOrWhiteSpace(normalizedEndpoint))
        {
            return false;
        }

        var existing = await _dbContext.PushSubscriptions
            .FirstOrDefaultAsync(item => item.UserId == userId && item.Endpoint == normalizedEndpoint, cancellationToken);
        if (existing == null)
        {
            return false;
        }

        _dbContext.PushSubscriptions.Remove(existing);
        await _dbContext.SaveChangesAsync(cancellationToken);
        return true;
    }

    public async Task<int> SendToUsersAsync(IEnumerable<int> userIds, PushNotificationPayload payload, CancellationToken cancellationToken)
    {
        if (!IsConfigured)
        {
            return 0;
        }

        var targetUserIds = userIds
            .Where(userId => userId > 0)
            .Distinct()
            .ToArray();
        if (targetUserIds.Length == 0)
        {
            return 0;
        }

        var subscriptions = await _dbContext.PushSubscriptions
            .Where(item => targetUserIds.Contains(item.UserId) && item.IsActive)
            .ToListAsync(cancellationToken);
        if (subscriptions.Count == 0)
        {
            return 0;
        }

        var serializedPayload = JsonSerializer.Serialize(payload, JsonOptions);
        var vapidDetails = new VapidDetails(_options.Subject, _options.PublicKey, _options.PrivateKey);
        var deliveredCount = 0;
        var now = DateTimeOffset.UtcNow;

        foreach (var subscriptionRecord in subscriptions)
        {
            var pushSubscription = new PushSubscription(
                subscriptionRecord.Endpoint,
                subscriptionRecord.P256dhKey,
                subscriptionRecord.AuthKey);

            try
            {
                await _client.SendNotificationAsync(pushSubscription, serializedPayload, vapidDetails, cancellationToken: cancellationToken);
                subscriptionRecord.LastSuccessAt = now;
                subscriptionRecord.LastFailureAt = null;
                subscriptionRecord.LastFailureReason = null;
                subscriptionRecord.UpdatedAt = now;
                subscriptionRecord.IsActive = true;
                deliveredCount += 1;
            }
            catch (WebPushException error) when (error.StatusCode == HttpStatusCode.Gone || error.StatusCode == HttpStatusCode.NotFound)
            {
                subscriptionRecord.IsActive = false;
                subscriptionRecord.LastFailureAt = now;
                subscriptionRecord.LastFailureReason = $"push endpoint expired: {(int)error.StatusCode}";
                subscriptionRecord.UpdatedAt = now;
            }
            catch (Exception error)
            {
                subscriptionRecord.LastFailureAt = now;
                subscriptionRecord.LastFailureReason = UploadPolicies.TrimToLength(error.Message, 500);
                subscriptionRecord.UpdatedAt = now;
                _logger.LogWarning(error, "Failed to send web push notification to user {UserId}", subscriptionRecord.UserId);
            }
        }

        await _dbContext.SaveChangesAsync(cancellationToken);
        return deliveredCount;
    }
}
