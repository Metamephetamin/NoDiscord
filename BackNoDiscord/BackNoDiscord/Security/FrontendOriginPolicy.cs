using Microsoft.Extensions.Configuration;

namespace BackNoDiscord.Security;

public static class FrontendOriginPolicy
{
    private static readonly char[] ValueSeparators = [',', ';', '\n', '\r'];

    public static bool IsAllowed(string? origin, IConfiguration configuration)
    {
        if (string.IsNullOrWhiteSpace(origin) || string.Equals(origin, "null", StringComparison.OrdinalIgnoreCase))
        {
            return true;
        }

        if (!TryNormalizeOrigin(origin, out var normalizedOrigin))
        {
            return false;
        }

        if (IsLoopbackOrigin(normalizedOrigin))
        {
            return true;
        }

        foreach (var configuredOrigin in GetConfiguredOrigins(configuration))
        {
            if (string.Equals(configuredOrigin, normalizedOrigin, StringComparison.OrdinalIgnoreCase))
            {
                return true;
            }
        }

        return false;
    }

    public static IReadOnlyCollection<string> GetConfiguredOrigins(IConfiguration configuration)
    {
        var configuredOrigins = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

        AddConfiguredOrigins(configuredOrigins, configuration["Cors:AllowedOrigins"]);
        AddConfiguredOrigins(configuredOrigins, configuration["ND_ALLOWED_ORIGINS"]);
        AddConfiguredOrigins(configuredOrigins, configuration["ND_PUBLIC_APP_URL"]);

        return configuredOrigins;
    }

    private static void AddConfiguredOrigins(ISet<string> target, string? rawValue)
    {
        if (string.IsNullOrWhiteSpace(rawValue))
        {
            return;
        }

        foreach (var candidate in rawValue.Split(ValueSeparators, StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries))
        {
            if (TryNormalizeOrigin(candidate, out var normalizedOrigin))
            {
                target.Add(normalizedOrigin);
            }
        }
    }

    private static bool TryNormalizeOrigin(string? value, out string normalizedOrigin)
    {
        normalizedOrigin = string.Empty;

        if (!Uri.TryCreate(value, UriKind.Absolute, out var uri))
        {
            return false;
        }

        if (!uri.Scheme.Equals(Uri.UriSchemeHttp, StringComparison.OrdinalIgnoreCase)
            && !uri.Scheme.Equals(Uri.UriSchemeHttps, StringComparison.OrdinalIgnoreCase))
        {
            return false;
        }

        if (string.IsNullOrWhiteSpace(uri.Host))
        {
            return false;
        }

        var builder = new UriBuilder(uri.Scheme, uri.Host)
        {
            Port = uri.IsDefaultPort ? -1 : uri.Port
        };

        normalizedOrigin = builder.Uri.GetLeftPart(UriPartial.Authority);
        return true;
    }

    private static bool IsLoopbackOrigin(string normalizedOrigin)
    {
        if (!Uri.TryCreate(normalizedOrigin, UriKind.Absolute, out var uri))
        {
            return false;
        }

        return uri.Host.Equals("localhost", StringComparison.OrdinalIgnoreCase)
               || uri.Host.Equals("127.0.0.1", StringComparison.OrdinalIgnoreCase);
    }
}
