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
        Assert.Empty(service.GetParticipantsInChannel("voice:general"));
        Assert.Empty(service.GetScreenSharingUserIds());
        Assert.True(service.TryGetConnectionId("user-4", out var connectionId));
        Assert.Equal("conn-direct-call", connectionId);
        Assert.True(service.TryGetUserId("conn-direct-call", out var userId));
        Assert.Equal("user-4", userId);
    }
}
