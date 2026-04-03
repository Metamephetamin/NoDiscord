using BackNoDiscord;
using BackNoDiscord.Security;
using BackNoDiscord.Services;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;
using YourApp.Models;

[Authorize(AuthenticationSchemes = JwtBearerDefaults.AuthenticationScheme)]
public class VoiceHub : Hub
{
    private const int MaxChannelNameLength = 160;
    private const int MaxMimeTypeLength = 64;
    private const int MaxSdpLength = 128_000;
    private const int MaxIceCandidateLength = 8_000;
    private const int MaxScreenFrameBytes = 512 * 1024;
    private const int MaxScreenChunkBytes = 3 * 1024 * 1024;

    private readonly ChannelService _channels;
    private readonly ServerStateService _serverState;
    private readonly AppDbContext _context;

    public VoiceHub(ChannelService channels, ServerStateService serverState, AppDbContext context)
    {
        _channels = channels;
        _serverState = serverState;
        _context = context;
    }

    public override async Task OnConnectedAsync()
    {
        await Clients.Caller.SendAsync("voice:update", _channels.GetAllChannels());
        await Clients.Caller.SendAsync("voice:screen-share-users", _channels.GetScreenSharingUserIds());
        await base.OnConnectedAsync();
    }

    public async Task Register(string userId, string name, string avatar)
    {
        if (!TryBuildCurrentParticipant(avatar, out var participant))
        {
            return;
        }

        _channels.RegisterConnection(Context.ConnectionId, participant);

        await Clients.Caller.SendAsync("voice:update", _channels.GetAllChannels());
        await Clients.Caller.SendAsync("voice:screen-share-users", _channels.GetScreenSharingUserIds());

        if (_channels.TryGetParticipant(participant.UserId, out var updatedParticipant))
        {
            await Clients.Caller.SendAsync("voice:self-state", new VoiceStatePayload
            {
                UserId = updatedParticipant.UserId,
                IsMicMuted = updatedParticipant.IsMicMuted,
                IsDeafened = updatedParticipant.IsDeafened,
                IsMicForced = updatedParticipant.IsMicForced,
                IsDeafenedForced = updatedParticipant.IsDeafenedForced
            });
        }
    }

    public async Task<JoinChannelResponse> JoinChannel(string channelName, string userId, string name, string avatar)
    {
        if (!TryBuildCurrentParticipant(avatar, out var participant))
        {
            throw new HubException("Unauthorized");
        }

        var normalizedChannelName = UploadPolicies.TrimToLength(channelName, MaxChannelNameLength);
        if (string.IsNullOrWhiteSpace(normalizedChannelName))
        {
            throw new HubException("channelName is required");
        }

        if (!TryAuthorizeChannelAccess(normalizedChannelName, participant.UserId))
        {
            throw new HubException("Forbidden");
        }

        var previousChannel = _channels.GetChannelForUser(participant.UserId);
        if (!string.IsNullOrWhiteSpace(previousChannel))
        {
            await Groups.RemoveFromGroupAsync(Context.ConnectionId, previousChannel);
        }

        var existingParticipants = _channels
            .GetParticipantsInChannel(normalizedChannelName)
            .Where(item => !string.Equals(item.UserId, participant.UserId, StringComparison.Ordinal))
            .ToList();

        _channels.SetUserChannel(normalizedChannelName, participant, Context.ConnectionId);

        await Groups.AddToGroupAsync(Context.ConnectionId, normalizedChannelName);
        await Clients.All.SendAsync("voice:update", _channels.GetAllChannels());
        await Clients.Caller.SendAsync("voice:screen-share-users", _channels.GetScreenSharingUserIds());

        if (_channels.TryGetParticipant(participant.UserId, out var updatedParticipant))
        {
            await Clients.Caller.SendAsync("voice:self-state", new VoiceStatePayload
            {
                UserId = updatedParticipant.UserId,
                IsMicMuted = updatedParticipant.IsMicMuted,
                IsDeafened = updatedParticipant.IsDeafened,
                IsMicForced = updatedParticipant.IsMicForced,
                IsDeafenedForced = updatedParticipant.IsDeafenedForced
            });
        }

        return new JoinChannelResponse
        {
            Channel = normalizedChannelName,
            Participants = existingParticipants
        };
    }

    public async Task LeaveChannel(string userId)
    {
        if (!AuthenticatedUserAccessor.TryGetAuthenticatedUser(Context.User, out var currentUser))
        {
            return;
        }

        var currentChannel = _channels.GetChannelForUser(currentUser.UserId);
        if (!string.IsNullOrWhiteSpace(currentChannel))
        {
            await Groups.RemoveFromGroupAsync(Context.ConnectionId, currentChannel);
        }

        _channels.RemoveUser(currentUser.UserId);
        await Clients.All.SendAsync("voice:update", _channels.GetAllChannels());
        await Clients.All.SendAsync("voice:screen-share-users", _channels.GetScreenSharingUserIds());
    }

    public async Task UpdateScreenShareStatus(string userId, bool isSharing)
    {
        if (!AuthenticatedUserAccessor.TryGetAuthenticatedUser(Context.User, out var currentUser))
        {
            return;
        }

        _channels.SetScreenShareState(currentUser.UserId, isSharing);
        await Clients.All.SendAsync("voice:update", _channels.GetAllChannels());
        await Clients.All.SendAsync("voice:screen-share-users", _channels.GetScreenSharingUserIds());
    }

    public async Task UpdateVoiceState(string targetUserId, bool isMicMuted, bool isDeafened)
    {
        if (string.IsNullOrWhiteSpace(targetUserId) ||
            !_channels.TryGetParticipantByConnectionId(Context.ConnectionId, out var actor))
        {
            return;
        }

        var isSelfUpdate = string.Equals(actor.UserId, targetUserId, StringComparison.Ordinal);
        if (!isSelfUpdate)
        {
            var actorChannel = _channels.GetChannelForUser(actor.UserId);
            if (string.IsNullOrWhiteSpace(actorChannel))
            {
                return;
            }

            var serverSnapshot = ResolveServerSnapshot(actorChannel);
            if (serverSnapshot is null)
            {
                return;
            }

            var permission = isDeafened ? "deafen_members" : "mute_members";
            if (!ServerPermissionEvaluator.CanManageVoiceState(serverSnapshot, actor.UserId, targetUserId, permission))
            {
                return;
            }
        }

        var updatedParticipant = _channels.SetVoiceState(
            targetUserId,
            isMicMuted,
            isDeafened,
            applyForceLocks: !isSelfUpdate,
            respectForceLocks: isSelfUpdate);

        if (updatedParticipant is null)
        {
            return;
        }

        await Clients.All.SendAsync("voice:update", _channels.GetAllChannels());

        if (_channels.TryGetConnectionId(targetUserId, out var targetConnectionId))
        {
            await Clients.Client(targetConnectionId).SendAsync("voice:self-state", new VoiceStatePayload
            {
                UserId = updatedParticipant.UserId,
                IsMicMuted = updatedParticipant.IsMicMuted,
                IsDeafened = updatedParticipant.IsDeafened,
                IsMicForced = updatedParticipant.IsMicForced,
                IsDeafenedForced = updatedParticipant.IsDeafenedForced
            });
        }
    }

    public async Task RequestVoiceE2eeKey(string channelName)
    {
        if (!AuthenticatedUserAccessor.TryGetAuthenticatedUser(Context.User, out var currentUser))
        {
            return;
        }

        var normalizedChannelName = UploadPolicies.TrimToLength(channelName, MaxChannelNameLength);
        if (string.IsNullOrWhiteSpace(normalizedChannelName) ||
            !string.Equals(_channels.GetChannelForUser(currentUser.UserId), normalizedChannelName, StringComparison.Ordinal))
        {
            return;
        }

        var requesterKeyRecord = await ResolveUserE2eeKeyAsync(currentUser.UserId);
        if (requesterKeyRecord is null)
        {
            throw new HubException("Current user has not published an E2EE key yet.");
        }

        var recipients = _channels
            .GetParticipantsInChannel(normalizedChannelName)
            .Where(item => !string.Equals(item.UserId, currentUser.UserId, StringComparison.Ordinal))
            .Select(item => item.UserId)
            .Distinct(StringComparer.Ordinal)
            .ToList();

        foreach (var recipientUserId in recipients)
        {
            if (_channels.TryGetConnectionId(recipientUserId, out var recipientConnectionId))
            {
                await Clients.Client(recipientConnectionId).SendAsync("voice:e2ee-key-request", new VoiceE2eeKeyRequestPayload
                {
                    Channel = normalizedChannelName,
                    RequesterUserId = currentUser.UserId,
                    RequesterName = currentUser.DisplayName,
                    RequesterFingerprint = requesterKeyRecord.Fingerprint,
                    RequesterPublicKeyJwk = requesterKeyRecord.PublicKeyJwk
                });
            }
        }
    }

    public async Task SubmitVoiceE2eeEnvelope(string channelName, string targetUserId, VoiceE2eeKeyEnvelopeSubmission payload)
    {
        if (!AuthenticatedUserAccessor.TryGetAuthenticatedUser(Context.User, out var currentUser))
        {
            return;
        }

        var normalizedChannelName = UploadPolicies.TrimToLength(channelName, MaxChannelNameLength);
        var normalizedTargetUserId = UploadPolicies.TrimToLength(targetUserId, 64);
        if (string.IsNullOrWhiteSpace(normalizedChannelName) || string.IsNullOrWhiteSpace(normalizedTargetUserId))
        {
            return;
        }

        if (!string.Equals(_channels.GetChannelForUser(currentUser.UserId), normalizedChannelName, StringComparison.Ordinal) ||
            !string.Equals(_channels.GetChannelForUser(normalizedTargetUserId), normalizedChannelName, StringComparison.Ordinal))
        {
            return;
        }

        if (!_channels.TryGetConnectionId(normalizedTargetUserId, out var targetConnectionId))
        {
            return;
        }

        var senderKeyRecord = await ResolveUserE2eeKeyAsync(currentUser.UserId);
        if (senderKeyRecord is null)
        {
            throw new HubException("Current user has not published an E2EE key yet.");
        }

        var wrappedKey = UploadPolicies.TrimToLength(payload?.WrappedKey, 4096);
        var wrapIv = UploadPolicies.TrimToLength(payload?.WrapIv, 256);
        if (string.IsNullOrWhiteSpace(wrappedKey) || string.IsNullOrWhiteSpace(wrapIv))
        {
            return;
        }

        await Clients.Client(targetConnectionId).SendAsync("voice:e2ee-key-envelope", new VoiceE2eeKeyEnvelopePayload
        {
            Channel = normalizedChannelName,
            SenderUserId = currentUser.UserId,
            SenderName = currentUser.DisplayName,
            SenderFingerprint = senderKeyRecord.Fingerprint,
            SenderPublicKeyJwk = senderKeyRecord.PublicKeyJwk,
            WrapIv = wrapIv,
            WrappedKey = wrappedKey
        });
    }

    public async Task RequestScreenShareOffer(string targetUserId)
    {
        if (string.IsNullOrWhiteSpace(targetUserId) ||
            !_channels.TryGetConnectionId(targetUserId, out var targetConnectionId) ||
            !_channels.TryGetParticipantByConnectionId(Context.ConnectionId, out var requester) ||
            !_channels.TryGetParticipant(targetUserId, out var targetParticipant) ||
            !targetParticipant.IsScreenSharing ||
            !AreUsersInSameChannel(requester.UserId, targetUserId))
        {
            return;
        }

        await Clients.Client(targetConnectionId).SendAsync("screen-share:refresh-request", new SignalingPayload
        {
            FromUserId = requester.UserId,
            FromName = requester.Name,
            FromAvatar = requester.Avatar
        });
    }

    public async Task SendScreenShareFrame(string userId, byte[] frameBytes, string mimeType, int width, int height)
    {
        if (frameBytes is null ||
            frameBytes.Length == 0 ||
            frameBytes.Length > MaxScreenFrameBytes ||
            !_channels.TryGetParticipantByConnectionId(Context.ConnectionId, out var sender) ||
            !_channels.TryGetParticipant(sender.UserId, out var participant) ||
            !participant.IsScreenSharing)
        {
            return;
        }

        var channelName = _channels.GetChannelForUser(sender.UserId);
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
            MimeType = NormalizeMimeType(mimeType, "image/webp"),
            Width = width,
            Height = height
        });
    }

    public async Task SendScreenShareChunk(string userId, byte[] chunkBytes, string mimeType, bool hasAudio = false)
    {
        if (chunkBytes is null ||
            chunkBytes.Length == 0 ||
            chunkBytes.Length > MaxScreenChunkBytes ||
            !_channels.TryGetParticipantByConnectionId(Context.ConnectionId, out var sender) ||
            !_channels.TryGetParticipant(sender.UserId, out var participant) ||
            !participant.IsScreenSharing)
        {
            return;
        }

        var channelName = _channels.GetChannelForUser(sender.UserId);
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
            MimeType = NormalizeMimeType(mimeType, "video/webm"),
            HasAudio = hasAudio
        });
    }

    public async Task SendOffer(string targetUserId, string sdp)
    {
        if (string.IsNullOrWhiteSpace(sdp) ||
            sdp.Length > MaxSdpLength ||
            !_channels.TryGetConnectionId(targetUserId, out var targetConnectionId) ||
            !_channels.TryGetParticipantByConnectionId(Context.ConnectionId, out var sender) ||
            !AreUsersInSameChannel(sender.UserId, targetUserId))
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
        if (string.IsNullOrWhiteSpace(sdp) ||
            sdp.Length > MaxSdpLength ||
            !_channels.TryGetConnectionId(targetUserId, out var targetConnectionId) ||
            !_channels.TryGetParticipantByConnectionId(Context.ConnectionId, out var sender) ||
            !AreUsersInSameChannel(sender.UserId, targetUserId))
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
        if (string.IsNullOrWhiteSpace(candidate) ||
            candidate.Length > MaxIceCandidateLength ||
            !_channels.TryGetConnectionId(targetUserId, out var targetConnectionId) ||
            !_channels.TryGetParticipantByConnectionId(Context.ConnectionId, out var sender) ||
            !AreUsersInSameChannel(sender.UserId, targetUserId))
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

    private bool TryBuildCurrentParticipant(string avatar, out Participant participant)
    {
        participant = new Participant();

        if (!AuthenticatedUserAccessor.TryGetAuthenticatedUser(Context.User, out var currentUser))
        {
            return false;
        }

        participant = new Participant
        {
            UserId = currentUser.UserId,
            Name = currentUser.DisplayName,
            Avatar = UploadPolicies.SanitizeRelativeAssetUrl(avatar, "/avatars/")
        };

        return true;
    }

    private bool AreUsersInSameChannel(string firstUserId, string secondUserId)
    {
        var firstChannel = _channels.GetChannelForUser(firstUserId);
        var secondChannel = _channels.GetChannelForUser(secondUserId);

        return !string.IsNullOrWhiteSpace(firstChannel) &&
               string.Equals(firstChannel, secondChannel, StringComparison.Ordinal);
    }

    private ServerSnapshot? ResolveServerSnapshot(string channelName)
    {
        if (!ServerChannelAuthorization.TryGetServerIdFromVoiceChannelName(channelName, out var serverId))
        {
            return null;
        }

        return _serverState.GetSnapshot(serverId);
    }

    private bool TryAuthorizeChannelAccess(string channelName, string userId)
    {
        if (!ServerChannelAuthorization.TryGetServerIdFromVoiceChannelName(channelName, out var serverId))
        {
            return false;
        }

        var snapshot = _serverState.GetSnapshot(serverId);
        var currentUser = new AuthenticatedUser(userId, string.Empty, string.Empty, string.Empty);
        return ServerChannelAuthorization.CanAccessServer(serverId, currentUser, snapshot);
    }

    private static string NormalizeMimeType(string mimeType, string fallback)
    {
        var sanitized = UploadPolicies.TrimToLength(mimeType, MaxMimeTypeLength);
        return string.IsNullOrWhiteSpace(sanitized) ? fallback : sanitized;
    }

    private Task<UserE2eeKeyRecord?> ResolveUserE2eeKeyAsync(string userId)
    {
        if (!int.TryParse(userId, out var numericUserId) || numericUserId <= 0)
        {
            return Task.FromResult<UserE2eeKeyRecord?>(null);
        }

        return _context.UserE2eeKeys
            .AsNoTracking()
            .FirstOrDefaultAsync(item => item.UserId == numericUserId);
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

public class VoiceStatePayload
{
    public string UserId { get; set; } = string.Empty;
    public bool IsMicMuted { get; set; }
    public bool IsDeafened { get; set; }
    public bool IsMicForced { get; set; }
    public bool IsDeafenedForced { get; set; }
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

public class VoiceE2eeKeyRequestPayload
{
    public string Channel { get; set; } = string.Empty;
    public string RequesterUserId { get; set; } = string.Empty;
    public string RequesterName { get; set; } = string.Empty;
    public string RequesterFingerprint { get; set; } = string.Empty;
    public string RequesterPublicKeyJwk { get; set; } = string.Empty;
}

public class VoiceE2eeKeyEnvelopeSubmission
{
    public string WrapIv { get; set; } = string.Empty;
    public string WrappedKey { get; set; } = string.Empty;
}

public class VoiceE2eeKeyEnvelopePayload
{
    public string Channel { get; set; } = string.Empty;
    public string SenderUserId { get; set; } = string.Empty;
    public string SenderName { get; set; } = string.Empty;
    public string SenderFingerprint { get; set; } = string.Empty;
    public string SenderPublicKeyJwk { get; set; } = string.Empty;
    public string WrapIv { get; set; } = string.Empty;
    public string WrappedKey { get; set; } = string.Empty;
}
