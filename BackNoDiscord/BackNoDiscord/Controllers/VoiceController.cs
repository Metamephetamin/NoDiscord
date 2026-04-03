using BackNoDiscord;
using BackNoDiscord.Security;
using BackNoDiscord.Services;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.SignalR;
using Microsoft.Extensions.DependencyInjection;
using YourApp.Models;

namespace BackNoDiscord.Controllers;

[ApiController]
[Route("api/voice")]
[Authorize(AuthenticationSchemes = JwtBearerDefaults.AuthenticationScheme)]
public class VoiceController : ControllerBase
{
    public class JoinVoiceDto
    {
        public string Channel { get; set; } = string.Empty;
        public string UserId { get; set; } = string.Empty;
        public string Name { get; set; } = string.Empty;
        public string? Avatar { get; set; }
    }

    public class LeaveVoiceDto
    {
        public string UserId { get; set; } = string.Empty;
    }

    public class LiveKitSessionDto
    {
        public string Channel { get; set; } = string.Empty;
        public string? Avatar { get; set; }
    }

    private readonly ChannelService _channels;
    private readonly IHubContext<VoiceHub> _hub;
    private readonly ILiveKitTokenService _liveKitTokenService;

    public VoiceController(ChannelService channels, IHubContext<VoiceHub> hub, ILiveKitTokenService liveKitTokenService)
    {
        _channels = channels;
        _hub = hub;
        _liveKitTokenService = liveKitTokenService;
    }

    [HttpPost("join")]
    public async Task<IActionResult> Join([FromBody] JoinVoiceDto dto)
    {
        if (!AuthenticatedUserAccessor.TryGetAuthenticatedUser(User, out var currentUser))
        {
            return Unauthorized();
        }

        if (string.IsNullOrWhiteSpace(dto.Channel))
        {
            return BadRequest(new { message = "Channel is required" });
        }

        var normalizedChannel = UploadPolicies.TrimToLength(dto.Channel, 160);
        if (!ServerChannelAuthorization.TryGetServerIdFromVoiceChannelName(normalizedChannel, out var serverId))
        {
            return Forbid();
        }

        var currentUserSnapshot = new AuthenticatedUser(
            currentUser.UserId,
            currentUser.Email,
            currentUser.FirstName,
            currentUser.LastName);
        var serverSnapshot = HttpContext.RequestServices
            .GetRequiredService<ServerStateService>()
            .GetSnapshot(serverId);

        if (!ServerChannelAuthorization.CanAccessServer(serverId, currentUserSnapshot, serverSnapshot))
        {
            return Forbid();
        }

        _channels.SetUserChannel(normalizedChannel, new Participant
        {
            UserId = currentUser.UserId,
            Name = currentUser.DisplayName,
            Avatar = UploadPolicies.SanitizeRelativeAssetUrl(dto.Avatar, "/avatars/")
        });

        await _hub.Clients.All.SendAsync("voice:update", _channels.GetAllChannels());
        return Ok();
    }

    [HttpPost("leave")]
    public async Task<IActionResult> Leave([FromBody] LeaveVoiceDto dto)
    {
        if (!AuthenticatedUserAccessor.TryGetAuthenticatedUser(User, out var currentUser))
        {
            return Unauthorized();
        }

        _channels.RemoveUser(currentUser.UserId);

        await _hub.Clients.All.SendAsync("voice:update", _channels.GetAllChannels());
        return Ok();
    }

    [HttpPost("livekit-session")]
    public IActionResult CreateLiveKitSession([FromBody] LiveKitSessionDto dto)
    {
        if (!AuthenticatedUserAccessor.TryGetAuthenticatedUser(User, out var currentUser))
        {
            return Unauthorized();
        }

        if (!TryAuthorizeChannel(dto.Channel, currentUser, out var normalizedChannel))
        {
            return Forbid();
        }

        var avatarUrl = UploadPolicies.SanitizeRelativeAssetUrl(dto.Avatar, "/avatars/");
        var session = _liveKitTokenService.CreateVoiceSession(normalizedChannel, currentUser, avatarUrl);

        return Ok(new
        {
            roomName = session.RoomName,
            serverUrl = session.ServerUrl,
            participantToken = session.ParticipantToken,
            participantIdentity = session.ParticipantIdentity,
            participantName = session.ParticipantName,
            metadata = session.MetadataJson,
            expiresAt = session.ExpiresAtUtc
        });
    }

    private bool TryAuthorizeChannel(string? rawChannelName, AuthenticatedUser currentUser, out string normalizedChannel)
    {
        normalizedChannel = UploadPolicies.TrimToLength(rawChannelName, 160);
        if (string.IsNullOrWhiteSpace(normalizedChannel))
        {
            return false;
        }

        if (!ServerChannelAuthorization.TryGetServerIdFromVoiceChannelName(normalizedChannel, out var serverId))
        {
            return false;
        }

        var currentUserSnapshot = new AuthenticatedUser(
            currentUser.UserId,
            currentUser.Email,
            currentUser.FirstName,
            currentUser.LastName);
        var serverSnapshot = HttpContext.RequestServices
            .GetRequiredService<ServerStateService>()
            .GetSnapshot(serverId);

        return ServerChannelAuthorization.CanAccessServer(serverId, currentUserSnapshot, serverSnapshot);
    }
}
