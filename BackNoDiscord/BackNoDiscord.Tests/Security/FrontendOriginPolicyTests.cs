using BackNoDiscord.Security;
using Microsoft.Extensions.Configuration;

namespace BackNoDiscord.Tests.Security;

public class FrontendOriginPolicyTests
{
    [Fact]
    public void IsAllowed_AllowsLoopbackAndNullOrigins()
    {
        var configuration = BuildConfiguration();

        Assert.True(FrontendOriginPolicy.IsAllowed(null, configuration));
        Assert.True(FrontendOriginPolicy.IsAllowed("null", configuration));
        Assert.True(FrontendOriginPolicy.IsAllowed("http://localhost:5173", configuration));
        Assert.True(FrontendOriginPolicy.IsAllowed("https://127.0.0.1:3000", configuration));
    }

    [Fact]
    public void IsAllowed_UsesConfiguredOrigins()
    {
        var configuration = BuildConfiguration(new Dictionary<string, string?>
        {
            ["ND_PUBLIC_APP_URL"] = "https://app.example.com/invite",
            ["ND_ALLOWED_ORIGINS"] = "https://admin.example.com, https://api.example.com"
        });

        Assert.True(FrontendOriginPolicy.IsAllowed("https://app.example.com", configuration));
        Assert.True(FrontendOriginPolicy.IsAllowed("https://admin.example.com", configuration));
        Assert.True(FrontendOriginPolicy.IsAllowed("https://api.example.com", configuration));
        Assert.False(FrontendOriginPolicy.IsAllowed("https://evil.example.com", configuration));
    }

    [Fact]
    public void GetConfiguredOrigins_NormalizesAndFiltersValues()
    {
        var configuration = BuildConfiguration(new Dictionary<string, string?>
        {
            ["Cors:AllowedOrigins"] = "https://app.example.com/path; https://admin.example.com",
            ["ND_ALLOWED_ORIGINS"] = "https://app.example.com, not-a-url",
        });

        var origins = FrontendOriginPolicy.GetConfiguredOrigins(configuration);

        Assert.Contains("https://app.example.com", origins);
        Assert.Contains("https://admin.example.com", origins);
        Assert.DoesNotContain("not-a-url", origins);
    }

    private static IConfiguration BuildConfiguration(Dictionary<string, string?>? values = null)
    {
        return new ConfigurationBuilder()
            .AddInMemoryCollection(values ?? [])
            .Build();
    }
}
