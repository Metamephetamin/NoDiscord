using BackNoDiscord;
using Microsoft.AspNetCore.SignalR;
using YourApp.Models;

public class VoiceHub : Hub
{
    private readonly ChannelService _channels;

    public VoiceHub(ChannelService channels)
    {
        _channels = channels;
    }

    public override async Task OnConnectedAsync()
    {
        await Clients.Caller.SendAsync("voice:update", _channels.GetAllChannels());
        await Clients.Caller.SendAsync("voice:screen-share-users", _channels.GetScreenSharingUserIds());
        await base.OnConnectedAsync();
    }

    public async Task Register(string userId, string name, string avatar)
    {
        if (string.IsNullOrWhiteSpace(userId) || string.IsNullOrWhiteSpace(name))
        {
            return;
        }

        _channels.RegisterConnection(Context.ConnectionId, new Participant
        {
            UserId = userId,
            Name = name,
            Avatar = avatar ?? string.Empty
        });

        await Clients.Caller.SendAsync("voice:update", _channels.GetAllChannels());
        await Clients.Caller.SendAsync("voice:screen-share-users", _channels.GetScreenSharingUserIds());
    }

    public async Task<JoinChannelResponse> JoinChannel(string channelName, string userId, string name, string avatar)
    {
        if (string.IsNullOrWhiteSpace(channelName) ||
            string.IsNullOrWhiteSpace(userId) ||
            string.IsNullOrWhiteSpace(name))
        {
            throw new HubException("channelName, userId and name are required");
        }

        var previousChannel = _channels.GetChannelForUser(userId);
        if (!string.IsNullOrWhiteSpace(previousChannel))
        {
            await Groups.RemoveFromGroupAsync(Context.ConnectionId, previousChannel);
        }

        var participant = new Participant
        {
            UserId = userId,
            Name = name,
            Avatar = avatar ?? string.Empty
        };

        var existingParticipants = _channels
            .GetParticipantsInChannel(channelName)
            .Where(item => !string.Equals(item.UserId, userId, StringComparison.Ordinal))
            .ToList();

        _channels.SetUserChannel(channelName, participant, Context.ConnectionId);

        await Groups.AddToGroupAsync(Context.ConnectionId, channelName);
        await Clients.All.SendAsync("voice:update", _channels.GetAllChannels());
        await Clients.Caller.SendAsync("voice:screen-share-users", _channels.GetScreenSharingUserIds());

        return new JoinChannelResponse
        {
            Channel = channelName,
            Participants = existingParticipants
        };
    }

    public async Task LeaveChannel(string userId)
    {
        if (string.IsNullOrWhiteSpace(userId))
        {
            return;
        }

        var currentChannel = _channels.GetChannelForUser(userId);
        if (!string.IsNullOrWhiteSpace(currentChannel))
        {
            await Groups.RemoveFromGroupAsync(Context.ConnectionId, currentChannel);
        }

        _channels.RemoveUser(userId);
        await Clients.All.SendAsync("voice:update", _channels.GetAllChannels());
        await Clients.All.SendAsync("voice:screen-share-users", _channels.GetScreenSharingUserIds());
    }

    public async Task UpdateScreenShareStatus(string userId, bool isSharing)
    {
        _channels.SetScreenShareState(userId, isSharing);
        await Clients.All.SendAsync("voice:update", _channels.GetAllChannels());
        await Clients.All.SendAsync("voice:screen-share-users", _channels.GetScreenSharingUserIds());
    }

    public async Task RequestScreenShareOffer(string targetUserId)
    {
        if (string.IsNullOrWhiteSpace(targetUserId) ||
            !_channels.TryGetConnectionId(targetUserId, out var targetConnectionId) ||
            !_channels.TryGetParticipantByConnectionId(Context.ConnectionId, out var requester) ||
            !_channels.TryGetParticipant(targetUserId, out var targetParticipant) ||
            !targetParticipant.IsScreenSharing)
        {
            return;
        }

        await Clients.Client(targetConnectionId).SendAsync("screen-share:refresh-request", new SignalingPayload
        {
            FromUserId = requester.UserId,
            FromName = requester.Name,
            FromAvatar = requester.Avatar,
        });
    }

    public async Task SendScreenShareFrame(string userId, byte[] frameBytes, string mimeType, int width, int height)
    {
        if (string.IsNullOrWhiteSpace(userId) ||
            frameBytes is null ||
            frameBytes.Length == 0 ||
            !_channels.TryGetParticipantByConnectionId(Context.ConnectionId, out var sender) ||
            !string.Equals(sender.UserId, userId, StringComparison.Ordinal) ||
            !_channels.TryGetParticipant(userId, out var participant) ||
            !participant.IsScreenSharing)
        {
            return;
        }

        var channelName = _channels.GetChannelForUser(userId);
        if (string.IsNullOrWhiteSpace(channelName))
        {
            return;
        }

        await Clients.OthersInGroup(channelName).SendAsync("screen-share:frame", new ScreenShareFramePayload
        {
            FromUserId = sender.UserId,
            FromName = sender.Name,
            FromAvatar = sender.Avatar,
            FrameBytes = frameBytes,
            MimeType = string.IsNullOrWhiteSpace(mimeType) ? "image/webp" : mimeType,
            Width = width,
            Height = height
        });
    }

    public async Task SendScreenShareChunk(string userId, byte[] chunkBytes, string mimeType, bool hasAudio = false)
    {
        if (string.IsNullOrWhiteSpace(userId) ||
            chunkBytes is null ||
            chunkBytes.Length == 0 ||
            !_channels.TryGetParticipantByConnectionId(Context.ConnectionId, out var sender) ||
            !string.Equals(sender.UserId, userId, StringComparison.Ordinal) ||
            !_channels.TryGetParticipant(userId, out var participant) ||
            !participant.IsScreenSharing)
        {
            return;
        }

        var channelName = _channels.GetChannelForUser(userId);
        if (string.IsNullOrWhiteSpace(channelName))
        {
            return;
        }

        await Clients.OthersInGroup(channelName).SendAsync("screen-share:chunk", new ScreenShareChunkPayload
        {
            FromUserId = sender.UserId,
            FromName = sender.Name,
            FromAvatar = sender.Avatar,
            ChunkBytes = chunkBytes,
            MimeType = string.IsNullOrWhiteSpace(mimeType) ? "video/webm" : mimeType,
            HasAudio = hasAudio
        });
    }

    public async Task SendOffer(string targetUserId, string sdp)
    {
        if (!_channels.TryGetConnectionId(targetUserId, out var targetConnectionId) ||
            !_channels.TryGetParticipantByConnectionId(Context.ConnectionId, out var sender))
        {
            return;
        }

        await Clients.Client(targetConnectionId).SendAsync("webrtc:offer", new SignalingPayload
        {
            FromUserId = sender.UserId,
            FromName = sender.Name,
            FromAvatar = sender.Avatar,
            Sdp = sdp
        });
    }

    public async Task SendAnswer(string targetUserId, string sdp)
    {
        if (!_channels.TryGetConnectionId(targetUserId, out var targetConnectionId) ||
            !_channels.TryGetParticipantByConnectionId(Context.ConnectionId, out var sender))
        {
            return;
        }

        await Clients.Client(targetConnectionId).SendAsync("webrtc:answer", new SignalingPayload
        {
            FromUserId = sender.UserId,
            FromName = sender.Name,
            FromAvatar = sender.Avatar,
            Sdp = sdp
        });
    }

    public async Task SendIceCandidate(string targetUserId, string candidate)
    {
        if (!_channels.TryGetConnectionId(targetUserId, out var targetConnectionId) ||
            !_channels.TryGetParticipantByConnectionId(Context.ConnectionId, out var sender))
        {
            return;
        }

        await Clients.Client(targetConnectionId).SendAsync("webrtc:ice-candidate", new IceCandidatePayload
        {
            FromUserId = sender.UserId,
            Candidate = candidate
        });
    }

    public override async Task OnDisconnectedAsync(Exception? exception)
    {
        var removed = _channels.RemoveConnection(Context.ConnectionId);

        if (!string.IsNullOrWhiteSpace(removed.ChannelName))
        {
            await Groups.RemoveFromGroupAsync(Context.ConnectionId, removed.ChannelName);
        }

        await Clients.All.SendAsync("voice:update", _channels.GetAllChannels());
        await Clients.All.SendAsync("voice:screen-share-users", _channels.GetScreenSharingUserIds());
        await base.OnDisconnectedAsync(exception);
    }
}

public class JoinChannelResponse
{
    public string Channel { get; set; } = string.Empty;
    public List<Participant> Participants { get; set; } = new();
}

public class SignalingPayload
{
    public string FromUserId { get; set; } = string.Empty;
    public string FromName { get; set; } = string.Empty;
    public string FromAvatar { get; set; } = string.Empty;
    public string Sdp { get; set; } = string.Empty;
}

public class IceCandidatePayload
{
    public string FromUserId { get; set; } = string.Empty;
    public string Candidate { get; set; } = string.Empty;
}

public class ScreenShareFramePayload
{
    public string FromUserId { get; set; } = string.Empty;
    public string FromName { get; set; } = string.Empty;
    public string FromAvatar { get; set; } = string.Empty;
    public byte[] FrameBytes { get; set; } = Array.Empty<byte>();
    public string MimeType { get; set; } = "image/webp";
    public int Width { get; set; }
    public int Height { get; set; }
}

public class ScreenShareChunkPayload
{
    public string FromUserId { get; set; } = string.Empty;
    public string FromName { get; set; } = string.Empty;
    public string FromAvatar { get; set; } = string.Empty;
    public byte[] ChunkBytes { get; set; } = Array.Empty<byte>();
    public string MimeType { get; set; } = "video/webm";
    public bool HasAudio { get; set; }
}
