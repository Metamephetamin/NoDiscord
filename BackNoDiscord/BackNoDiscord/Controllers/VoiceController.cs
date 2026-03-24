using BackNoDiscord;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.SignalR;
using YourApp.Models;

namespace BackNoDiscord.Controllers;

[ApiController]
[Route("api/voice")]
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

    private readonly ChannelService _channels;
    private readonly IHubContext<VoiceHub> _hub;

    public VoiceController(ChannelService channels, IHubContext<VoiceHub> hub)
    {
        _channels = channels;
        _hub = hub;
    }

    [HttpPost("join")]
    public async Task<IActionResult> Join([FromBody] JoinVoiceDto dto)
    {
        if (string.IsNullOrWhiteSpace(dto.Channel) ||
            string.IsNullOrWhiteSpace(dto.UserId) ||
            string.IsNullOrWhiteSpace(dto.Name))
        {
            return BadRequest(new { message = "Channel, userId and name are required" });
        }

        _channels.SetUserChannel(dto.Channel, new Participant
        {
            UserId = dto.UserId,
            Name = dto.Name,
            Avatar = dto.Avatar ?? string.Empty
        });

        await _hub.Clients.All.SendAsync(
            "voice:update",
            _channels.GetAllChannels()
        );

        return Ok();
    }

    [HttpPost("leave")]
    public async Task<IActionResult> Leave([FromBody] LeaveVoiceDto dto)
    {
        if (string.IsNullOrWhiteSpace(dto.UserId))
        {
            return BadRequest(new { message = "UserId is required" });
        }

        _channels.RemoveUser(dto.UserId);

        await _hub.Clients.All.SendAsync(
            "voice:update",
            _channels.GetAllChannels()
        );

        return Ok();
    }
}
