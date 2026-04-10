using System.Text.Json;

namespace BackNoDiscord.Infrastructure;

public sealed class MediaFrameData
{
    public double X { get; set; } = 50;
    public double Y { get; set; } = 50;
    public double Zoom { get; set; } = 1;
}

public static class MediaFrameSerializer
{
    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase
    };

    public static MediaFrameData? Normalize(MediaFrameData? value, bool allowNull = false)
    {
        var frame = value ?? new MediaFrameData();
        var normalized = new MediaFrameData
        {
            X = Clamp(frame.X, 0, 100, 50),
            Y = Clamp(frame.Y, 0, 100, 50),
            Zoom = Clamp(frame.Zoom, 1, 3, 1)
        };

        if (allowNull && IsDefault(normalized))
        {
            return null;
        }

        return normalized;
    }

    public static MediaFrameData? Parse(string? rawValue, bool allowNull = false)
    {
        if (string.IsNullOrWhiteSpace(rawValue))
        {
            return allowNull ? null : new MediaFrameData();
        }

        try
        {
            var parsed = JsonSerializer.Deserialize<MediaFrameData>(rawValue, JsonOptions);
            return Normalize(parsed, allowNull);
        }
        catch
        {
            return allowNull ? null : new MediaFrameData();
        }
    }

    public static string? Serialize(MediaFrameData? value, bool allowNull = false)
    {
        var normalized = Normalize(value, allowNull);
        return normalized is null ? null : JsonSerializer.Serialize(normalized, JsonOptions);
    }

    private static bool IsDefault(MediaFrameData value)
    {
        return Math.Abs(value.X - 50) < 0.01
            && Math.Abs(value.Y - 50) < 0.01
            && Math.Abs(value.Zoom - 1) < 0.01;
    }

    private static double Clamp(double value, double min, double max, double fallback)
    {
        if (!double.IsFinite(value))
        {
            return fallback;
        }

        return Math.Min(max, Math.Max(min, value));
    }
}
