using BackNoDiscord.Security;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Configuration;

namespace BackNoDiscord.Tests.Security;

public class HubQueryTokenPolicyTests
{
    [Fact]
    public void CanAcceptQueryToken_AllowsTrustedHubOrigins()
    {
        var configuration = new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["Cors:AllowedOrigins"] = "https://tendsec.ru"
            })
            .Build();

        Assert.True(HubQueryTokenPolicy.CanAcceptQueryToken("token", new PathString("/chatHub"), "https://tendsec.ru", configuration));
        Assert.True(HubQueryTokenPolicy.CanAcceptQueryToken("token", new PathString("/voiceHub"), "http://localhost:5173", configuration));
        Assert.True(HubQueryTokenPolicy.CanAcceptQueryToken("token", new PathString("/voiceHub"), "null", configuration));
    }

    [Fact]
    public void CanAcceptQueryToken_RejectsUntrustedOriginsAndNonHubPaths()
    {
        var configuration = new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["Cors:AllowedOrigins"] = "https://tendsec.ru"
            })
            .Build();

        Assert.False(HubQueryTokenPolicy.CanAcceptQueryToken("", new PathString("/chatHub"), "https://tendsec.ru", configuration));
        Assert.False(HubQueryTokenPolicy.CanAcceptQueryToken("token", new PathString("/api/user"), "https://tendsec.ru", configuration));
        Assert.False(HubQueryTokenPolicy.CanAcceptQueryToken("token", new PathString("/chatHub"), "https://evil.example.com", configuration));
    }
}
