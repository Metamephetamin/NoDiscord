using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Configuration;

namespace BackNoDiscord.Security;

public static class HubCookieTokenPolicy
{
    public static bool CanAcceptCookieToken(
        PathString path,
        string? origin,
        IConfiguration configuration,
        bool allowDevelopmentOrigins = false)
    {
        if (!path.StartsWithSegments("/chatHub") && !path.StartsWithSegments("/voiceHub"))
        {
            return false;
        }

        return FrontendOriginPolicy.IsAllowed(origin, configuration, allowDevelopmentOrigins);
    }
}
