using YourApp.Models;

namespace BackNoDiscord.Tests.Services;

public class ChannelServiceTests
{
    [Fact]
    public void RegisterConnection_RestoresUserIntoExistingChannelOnReconnect()
    {
        var service = new ChannelService();
        var participant = new Participant
        {
            UserId = "user-1",
            Name = "Alice",
            Avatar = "avatar.png"
        };

        service.SetUserChannel("voice:general", participant, "conn-1");

        service.RegisterConnection("conn-2", new Participant
        {
            UserId = "user-1",
            Name = "Alice Updated"
        });

        var participants = service.GetParticipantsInChannel("voice:general");

        Assert.Single(participants);
        Assert.Equal("user-1", participants[0].UserId);
        Assert.Equal("Alice Updated", participants[0].Name);
        Assert.Equal("avatar.png", participants[0].Avatar);
        Assert.True(service.TryGetConnectionId("user-1", out var connectionId));
        Assert.Equal("conn-2", connectionId);
        Assert.False(service.TryGetUserId("conn-1", out _));
    }

    [Fact]
    public void SetVoiceState_RespectsForcedMuteLocks()
    {
        var service = new ChannelService();
        service.SetUserChannel("voice:general", new Participant
        {
            UserId = "user-2",
            Name = "Bob"
        }, "conn-voice");

        var forcedState = service.SetVoiceState("user-2", isMicMuted: true, applyForceLocks: true);
        var attemptedUnmute = service.SetVoiceState("user-2", isMicMuted: false, respectForceLocks: true);

        Assert.NotNull(forcedState);
        Assert.True(forcedState!.IsMicMuted);
        Assert.True(forcedState.IsMicForced);

        Assert.NotNull(attemptedUnmute);
        Assert.True(attemptedUnmute!.IsMicMuted);
        Assert.True(attemptedUnmute.IsMicForced);

        var participants = service.GetParticipantsInChannel("voice:general");
        Assert.Single(participants);
        Assert.True(participants[0].IsMicMuted);
        Assert.True(participants[0].IsMicForced);
    }

    [Fact]
    public void SetVoiceState_WhenStateChanges_MarksVoiceStateChanged()
    {
        var service = new ChannelService();
        service.SetUserChannel("voice:general", new Participant
        {
            UserId = "user-state-change",
            Name = "Mira"
        }, "conn-state-change");

        var updated = service.SetVoiceState(
            "user-state-change",
            isMicMuted: true,
            isDeafened: false,
            applyForceLocks: false,
            respectForceLocks: false,
            voiceStateChanged: out var voiceStateChanged);

        Assert.NotNull(updated);
        Assert.True(updated!.IsMicMuted);
        Assert.True(voiceStateChanged);
    }

    [Fact]
    public void SetVoiceState_WhenStateIsSame_DoesNotMarkVoiceStateChanged()
    {
        var service = new ChannelService();
        service.SetUserChannel("voice:general", new Participant
        {
            UserId = "user-state-same",
            Name = "Nika",
            IsMicMuted = true
        }, "conn-state-same");

        var updated = service.SetVoiceState(
            "user-state-same",
            isMicMuted: true,
            isDeafened: false,
            applyForceLocks: false,
            respectForceLocks: false,
            voiceStateChanged: out var voiceStateChanged);

        Assert.NotNull(updated);
        Assert.True(updated!.IsMicMuted);
        Assert.False(updated.IsDeafened);
        Assert.False(voiceStateChanged);
    }

    [Fact]
    public void RemoveConnection_ClearsChannelAndScreenShareState()
    {
        var service = new ChannelService();
        service.SetUserChannel("voice:general", new Participant
        {
            UserId = "user-3",
            Name = "Carol"
        }, "conn-remove");
        service.SetScreenShareState("user-3", true);

        var result = service.RemoveConnection("conn-remove");

        Assert.Equal("voice:general", result.ChannelName);
        Assert.NotNull(result.Participant);
        Assert.True(result.VoiceStateChanged);
        Assert.Empty(service.GetParticipantsInChannel("voice:general"));
        Assert.Empty(service.GetScreenSharingUserIds());
        Assert.False(service.TryGetConnectionId("user-3", out _));
        Assert.False(service.TryGetUserId("conn-remove", out _));
    }

    [Fact]
    public void LeaveChannel_PreservesConnectionForDirectCallSignaling()
    {
        var service = new ChannelService();
        service.SetUserChannel("voice:general", new Participant
        {
            UserId = "user-4",
            Name = "Daria"
        }, "conn-direct-call");
        service.SetScreenShareState("user-4", true);

        var result = service.LeaveChannel("user-4");

        Assert.Equal("voice:general", result.ChannelName);
        Assert.NotNull(result.Participant);
        Assert.True(result.VoiceStateChanged);
        Assert.Empty(service.GetParticipantsInChannel("voice:general"));
        Assert.Empty(service.GetScreenSharingUserIds());
        Assert.True(service.TryGetConnectionId("user-4", out var connectionId));
        Assert.Equal("conn-direct-call", connectionId);
        Assert.True(service.TryGetUserId("conn-direct-call", out var userId));
        Assert.Equal("user-4", userId);
    }

    [Fact]
    public void LeaveChannel_WhenUserIsOnlyRegistered_DoesNotMarkVoiceStateChanged()
    {
        var service = new ChannelService();
        service.RegisterConnection("conn-idle", new Participant
        {
            UserId = "user-5",
            Name = "Egor"
        });

        var result = service.LeaveChannel("user-5");

        Assert.Null(result.ChannelName);
        Assert.NotNull(result.Participant);
        Assert.False(result.VoiceStateChanged);
        Assert.True(service.TryGetConnectionId("user-5", out var connectionId));
        Assert.Equal("conn-idle", connectionId);
    }

    [Fact]
    public void RemoveConnection_WhenConnectionIsUnknown_DoesNotMarkVoiceStateChanged()
    {
        var service = new ChannelService();

        var result = service.RemoveConnection("missing-connection");

        Assert.Null(result.ChannelName);
        Assert.Null(result.Participant);
        Assert.False(result.VoiceStateChanged);
    }
}
