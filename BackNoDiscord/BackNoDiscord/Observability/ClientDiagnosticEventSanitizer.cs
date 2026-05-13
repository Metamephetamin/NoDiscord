using System.Text.Json;
using System.Text.RegularExpressions;

namespace BackNoDiscord.Observability;

public sealed record ClientDiagnosticEvent(
    string Type,
    string Surface,
    string Route,
    string AppVersion,
    string ErrorName,
    string Phase,
    string Status,
    DateTimeOffset Timestamp);

public static partial class ClientDiagnosticEventSanitizer
{
    private const int MaxFieldLength = 160;
    private const int MaxRouteLength = 240;

    private static readonly HashSet<string> AllowedFields = new(StringComparer.OrdinalIgnoreCase)
    {
        "type",
        "surface",
        "route",
        "appVersion",
        "errorName",
        "phase",
        "status",
        "timestamp"
    };

    private static readonly HashSet<string> SensitiveFieldNames = new(StringComparer.OrdinalIgnoreCase)
    {
        "authorization",
        "body",
        "content",
        "cookie",
        "message",
        "password",
        "secret",
        "stack",
        "text",
        "token"
    };

    public static bool TrySanitize(JsonElement element, out ClientDiagnosticEvent diagnostic, out string reason)
    {
        diagnostic = new ClientDiagnosticEvent("", "", "", "", "", "", "", DateTimeOffset.UtcNow);
        reason = "";

        if (element.ValueKind != JsonValueKind.Object)
        {
            reason = "diagnostic payload must be an object";
            return false;
        }

        if (ContainsSensitiveFieldName(element))
        {
            reason = "diagnostic payload contains sensitive field";
            return false;
        }

        var type = "";
        var surface = "";
        var route = "";
        var appVersion = "";
        var errorName = "";
        var phase = "";
        var status = "";
        var timestamp = DateTimeOffset.UtcNow;

        foreach (var property in element.EnumerateObject())
        {
            if (!AllowedFields.Contains(property.Name))
            {
                continue;
            }

            var value = property.Value.ValueKind == JsonValueKind.String
                ? property.Value.GetString() ?? ""
                : property.Value.ToString();

            switch (property.Name)
            {
                case "type":
                    type = NormalizeText(value, MaxFieldLength);
                    break;
                case "surface":
                    surface = NormalizeText(value, MaxFieldLength);
                    break;
                case "route":
                    route = RedactRoute(NormalizeText(value, MaxRouteLength));
                    break;
                case "appVersion":
                    appVersion = NormalizeText(value, MaxFieldLength);
                    break;
                case "errorName":
                    errorName = NormalizeText(value, MaxFieldLength);
                    break;
                case "phase":
                    phase = NormalizeText(value, MaxFieldLength);
                    break;
                case "status":
                    status = NormalizeText(value, MaxFieldLength);
                    break;
                case "timestamp":
                    if (DateTimeOffset.TryParse(value, out var parsedTimestamp))
                    {
                        timestamp = parsedTimestamp.ToUniversalTime();
                    }
                    break;
            }
        }

        if (string.IsNullOrWhiteSpace(type) || string.IsNullOrWhiteSpace(surface))
        {
            reason = "diagnostic type and surface are required";
            return false;
        }

        diagnostic = new ClientDiagnosticEvent(type, surface, route, appVersion, errorName, phase, status, timestamp);
        return true;
    }

    private static bool ContainsSensitiveFieldName(JsonElement element)
    {
        if (element.ValueKind == JsonValueKind.Object)
        {
            foreach (var property in element.EnumerateObject())
            {
                if (SensitiveFieldNames.Contains(property.Name) || SensitiveNamePattern().IsMatch(property.Name))
                {
                    return true;
                }

                if (ContainsSensitiveFieldName(property.Value))
                {
                    return true;
                }
            }
        }
        else if (element.ValueKind == JsonValueKind.Array)
        {
            foreach (var item in element.EnumerateArray())
            {
                if (ContainsSensitiveFieldName(item))
                {
                    return true;
                }
            }
        }

        return false;
    }

    private static string NormalizeText(string? value, int maxLength)
    {
        var normalized = WhitespacePattern().Replace(value ?? "", " ").Trim();
        return normalized.Length <= maxLength ? normalized : normalized[..maxLength];
    }

    private static string RedactRoute(string route)
    {
        return SensitiveRouteValuePattern().Replace(route, "$1[redacted]");
    }

    [GeneratedRegex("(token|authorization|cookie|password|secret)", RegexOptions.IgnoreCase | RegexOptions.CultureInvariant)]
    private static partial Regex SensitiveNamePattern();

    [GeneratedRegex("\\s+", RegexOptions.CultureInvariant)]
    private static partial Regex WhitespacePattern();

    [GeneratedRegex("([?&][^=]*(?:token|authorization|cookie|password|secret)[^=]*=)[^&#\\s]+", RegexOptions.IgnoreCase | RegexOptions.CultureInvariant)]
    private static partial Regex SensitiveRouteValuePattern();
}
