namespace BackNoDiscord.Tests.Services;

public class DirectMessageChannelsTests
{
    [Fact]
    public void BuildChannelId_UsesSelfFormatForOwnChat()
    {
        var channelId = DirectMessageChannels.BuildChannelId(42, 42);

        Assert.Equal("dm:self:42", channelId);
    }

    [Fact]
    public void TryParse_ParsesSelfChannel()
    {
        var success = DirectMessageChannels.TryParse("dm:self:42", out var firstUserId, out var secondUserId, out var isSelfChannel);

        Assert.True(success);
        Assert.Equal(42, firstUserId);
        Assert.Equal(42, secondUserId);
        Assert.True(isSelfChannel);
    }

    [Fact]
    public void TryParse_ParsesRegularChannel()
    {
        var success = DirectMessageChannels.TryParse("dm:4:15", out var firstUserId, out var secondUserId, out var isSelfChannel);

        Assert.True(success);
        Assert.Equal(4, firstUserId);
        Assert.Equal(15, secondUserId);
        Assert.False(isSelfChannel);
    }

    [Fact]
    public void NormalizeChannelId_NormalizesLegacySelfChannel()
    {
        var channelId = DirectMessageChannels.NormalizeChannelId("dm:42:42");

        Assert.Equal("dm:self:42", channelId);
    }

    [Fact]
    public void GetEquivalentChannelIds_IncludesLegacyAndCanonicalSelfFormats()
    {
        var channelIds = DirectMessageChannels.GetEquivalentChannelIds("dm:self:42");

        Assert.Contains("dm:self:42", channelIds);
        Assert.Contains("dm:42:42", channelIds);
    }
}
