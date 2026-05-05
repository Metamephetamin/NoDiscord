using BackNoDiscord.Security;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Configuration;

namespace BackNoDiscord.Tests.Security;

public class HubCookieTokenPolicyTests
{
    [Fact]
    public void CanAcceptCookieToken_AllowsTrustedHubOrigins()
    {
        var configuration = new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["Cors:AllowedOrigins"] = "https://lanaya.space"
            })
            .Build();

        Assert.True(HubCookieTokenPolicy.CanAcceptCookieToken(new PathString("/chatHub"), "https://lanaya.space", configuration));
        Assert.True(HubCookieTokenPolicy.CanAcceptCookieToken(new PathString("/voiceHub"), "https://lanaya.space", configuration));
        Assert.False(HubCookieTokenPolicy.CanAcceptCookieToken(new PathString("/api/user"), "https://lanaya.space", configuration));
        Assert.False(HubCookieTokenPolicy.CanAcceptCookieToken(new PathString("/chatHub"), "https://evil.example.com", configuration));
        Assert.False(HubCookieTokenPolicy.CanAcceptCookieToken(new PathString("/voiceHub"), "null", configuration));
    }
}
