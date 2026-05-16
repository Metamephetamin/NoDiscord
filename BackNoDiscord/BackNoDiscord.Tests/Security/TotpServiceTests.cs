using BackNoDiscord.Security;

namespace BackNoDiscord.Tests.Security;

public sealed class TotpServiceTests
{
    [Fact]
    public void VerifyCode_AcceptsRfc6238Sha1Vector()
    {
        const string secret = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ";
        var now = DateTimeOffset.FromUnixTimeSeconds(59);

        Assert.True(TotpService.VerifyCode(secret, "287082", now));
    }

    [Fact]
    public void VerifyCode_AllowsModerateClockDrift()
    {
        const string secret = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ";
        var serverTime = DateTimeOffset.FromUnixTimeSeconds(119);

        Assert.True(TotpService.VerifyCode(secret, "287082", serverTime));
    }

    [Fact]
    public void BuildOtpAuthUri_LeavesIssuerSeparatorReadable()
    {
        var uri = TotpService.BuildOtpAuthUri("MAX", "user@example.com", "JBSWY3DPEHPK3PXP");

        Assert.StartsWith("otpauth://totp/MAX:user%40example.com?", uri);
    }
}
