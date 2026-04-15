using BackNoDiscord.Security;
using BackNoDiscord.Services;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace BackNoDiscord.Controllers;

public sealed class PushSubscriptionKeysRequest
{
    public string? P256dh { get; set; }
    public string? Auth { get; set; }
}

public sealed class UpsertPushSubscriptionRequest
{
    public string? Endpoint { get; set; }
    public PushSubscriptionKeysRequest? Keys { get; set; }
    public string? DeviceLabel { get; set; }
}

public sealed class RemovePushSubscriptionRequest
{
    public string? Endpoint { get; set; }
}

[ApiController]
[Route("api/push")]
public class PushNotificationsController : ControllerBase
{
    private readonly PushNotificationService _pushNotificationService;

    public PushNotificationsController(PushNotificationService pushNotificationService)
    {
        _pushNotificationService = pushNotificationService;
    }

    [AllowAnonymous]
    [HttpGet("public-key")]
    public IActionResult GetPublicKey()
    {
        return Ok(new
        {
            enabled = _pushNotificationService.IsConfigured,
            publicKey = _pushNotificationService.PublicKey,
        });
    }

    [Authorize(AuthenticationSchemes = JwtBearerDefaults.AuthenticationScheme)]
    [HttpPost("subscriptions")]
    public async Task<IActionResult> UpsertSubscription([FromBody] UpsertPushSubscriptionRequest request, CancellationToken cancellationToken)
    {
        if (!AuthenticatedUserAccessor.TryGetAuthenticatedUser(User, out var currentUser) ||
            !int.TryParse(currentUser.UserId, out var currentUserId))
        {
            return Unauthorized();
        }

        var result = await _pushNotificationService.UpsertSubscriptionAsync(
            currentUserId,
            new PushSubscriptionUpsertRequest
            {
                Endpoint = Convert.ToString(request.Endpoint ?? string.Empty)?.Trim() ?? string.Empty,
                P256dhKey = Convert.ToString(request.Keys?.P256dh ?? string.Empty)?.Trim() ?? string.Empty,
                AuthKey = Convert.ToString(request.Keys?.Auth ?? string.Empty)?.Trim() ?? string.Empty,
                DeviceLabel = Convert.ToString(request.DeviceLabel ?? string.Empty)?.Trim() ?? string.Empty,
                UserAgent = Request.Headers.UserAgent.ToString().Trim(),
            },
            cancellationToken);

        if (!result)
        {
            return BadRequest(new { message = "Некорректная push-подписка." });
        }

        return Ok(new { saved = true });
    }

    [Authorize(AuthenticationSchemes = JwtBearerDefaults.AuthenticationScheme)]
    [HttpDelete("subscriptions")]
    public async Task<IActionResult> RemoveSubscription([FromBody] RemovePushSubscriptionRequest request, CancellationToken cancellationToken)
    {
        if (!AuthenticatedUserAccessor.TryGetAuthenticatedUser(User, out var currentUser) ||
            !int.TryParse(currentUser.UserId, out var currentUserId))
        {
            return Unauthorized();
        }

        await _pushNotificationService.RemoveSubscriptionAsync(
            currentUserId,
            Convert.ToString(request.Endpoint ?? string.Empty)?.Trim() ?? string.Empty,
            cancellationToken);
        return Ok(new { removed = true });
    }

    [Authorize(AuthenticationSchemes = JwtBearerDefaults.AuthenticationScheme)]
    [HttpPost("test")]
    public async Task<IActionResult> SendTestPush(CancellationToken cancellationToken)
    {
        if (!AuthenticatedUserAccessor.TryGetAuthenticatedUser(User, out var currentUser) ||
            !int.TryParse(currentUser.UserId, out var currentUserId))
        {
            return Unauthorized();
        }

        var deliveredCount = await _pushNotificationService.SendToUsersAsync(
            [currentUserId],
            new PushNotificationPayload
            {
                Title = "Tend",
                Body = "Тестовое push-уведомление работает.",
                Tag = $"push-test:{currentUserId}",
                Url = "/",
                Type = "push_test",
            },
            cancellationToken);

        return Ok(new
        {
            delivered = deliveredCount > 0,
            count = deliveredCount,
            configured = _pushNotificationService.IsConfigured,
        });
    }
}
