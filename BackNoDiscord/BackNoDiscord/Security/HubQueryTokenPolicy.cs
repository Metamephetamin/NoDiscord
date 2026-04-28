using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Configuration;

namespace BackNoDiscord.Security;

public static class HubQueryTokenPolicy
{
    public static bool CanAcceptQueryToken(string? accessToken, PathString path, string? origin, IConfiguration configuration)
    {
        if (string.IsNullOrWhiteSpace(accessToken))
        {
            return false;
        }

        if (!path.StartsWithSegments("/chatHub") && !path.StartsWithSegments("/voiceHub"))
        {
            return false;
        }

        return FrontendOriginPolicy.IsAllowed(origin, configuration);
    }
}
