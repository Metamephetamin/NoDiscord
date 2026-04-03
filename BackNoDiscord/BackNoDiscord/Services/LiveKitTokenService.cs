using BackNoDiscord.Security;
using Microsoft.IdentityModel.Tokens;
using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;
using System.Text.Json;

namespace BackNoDiscord.Services;

public interface ILiveKitTokenService
{
    LiveKitSession CreateVoiceSession(string roomName, AuthenticatedUser currentUser, string? avatarUrl);
}

public sealed class LiveKitTokenService : ILiveKitTokenService
{
    private readonly LiveKitOptions _options;

    public LiveKitTokenService(IConfiguration configuration)
    {
        _options = ResolveOptions(configuration);
    }

    public LiveKitSession CreateVoiceSession(string roomName, AuthenticatedUser currentUser, string? avatarUrl)
    {
        if (string.IsNullOrWhiteSpace(roomName))
        {
            throw new InvalidOperationException("LiveKit room name is required.");
        }

        if (string.IsNullOrWhiteSpace(_options.ApiKey) || string.IsNullOrWhiteSpace(_options.ApiSecret))
        {
            throw new InvalidOperationException(
                "LiveKit credentials are not configured. Set LiveKit__ApiKey / LiveKit__ApiSecret or LIVEKIT_KEYS.");
        }

        var now = DateTimeOffset.UtcNow;
        var expiresAt = now.AddMinutes(Math.Max(15, _options.TokenLifetimeMinutes));
        var identity = currentUser.UserId;
        var participantMetadata = JsonSerializer.Serialize(new Dictionary<string, string>
        {
            ["userId"] = currentUser.UserId,
            ["displayName"] = currentUser.DisplayName,
            ["avatarUrl"] = avatarUrl ?? string.Empty,
        });

        var header = new JwtHeader(new SigningCredentials(
            new SymmetricSecurityKey(Encoding.UTF8.GetBytes(_options.ApiSecret)),
            SecurityAlgorithms.HmacSha256));

        var payload = new JwtPayload
        {
            { JwtRegisteredClaimNames.Sub, identity },
            { JwtRegisteredClaimNames.Nbf, now.ToUnixTimeSeconds() },
            { JwtRegisteredClaimNames.Exp, expiresAt.ToUnixTimeSeconds() },
            { JwtRegisteredClaimNames.Iss, _options.ApiKey },
            { "name", currentUser.DisplayName },
            { "metadata", participantMetadata },
            {
                "video",
                new Dictionary<string, object>
                {
                    ["room"] = roomName,
                    ["roomJoin"] = true,
                    ["canPublish"] = true,
                    ["canPublishData"] = true,
                    ["canSubscribe"] = true,
                }
            }
        };

        var token = new JwtSecurityToken(header, payload);
        var encodedToken = new JwtSecurityTokenHandler().WriteToken(token);

        return new LiveKitSession
        {
            ServerUrl = _options.ServerUrl,
            ParticipantToken = encodedToken,
            RoomName = roomName,
            ParticipantIdentity = identity,
            ParticipantName = currentUser.DisplayName,
            MetadataJson = participantMetadata,
            ExpiresAtUtc = expiresAt
        };
    }

    private static LiveKitOptions ResolveOptions(IConfiguration configuration)
    {
        var options = new LiveKitOptions
        {
            ServerUrl = configuration["LiveKit:Url"]?.Trim()
                ?? configuration["ND_LIVEKIT_URL"]?.Trim()
                ?? "ws://127.0.0.1:7880",
        };

        if (int.TryParse(configuration["LiveKit:TokenLifetimeMinutes"], out var lifetimeMinutes) && lifetimeMinutes > 0)
        {
            options.TokenLifetimeMinutes = lifetimeMinutes;
        }

        var configuredApiKey = configuration["LiveKit:ApiKey"]?.Trim();
        var configuredApiSecret = configuration["LiveKit:ApiSecret"]?.Trim();
        if (!string.IsNullOrWhiteSpace(configuredApiKey) && !string.IsNullOrWhiteSpace(configuredApiSecret))
        {
            options.ApiKey = configuredApiKey;
            options.ApiSecret = configuredApiSecret;
            return options;
        }

        var rawKeys = configuration["LIVEKIT_KEYS"]?.Trim();
        if (string.IsNullOrWhiteSpace(rawKeys))
        {
            return options;
        }

        var firstPair = rawKeys
            .Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
            .Select(pair => pair.Split(':', 2, StringSplitOptions.TrimEntries))
            .FirstOrDefault(parts => parts.Length == 2
                && !string.IsNullOrWhiteSpace(parts[0])
                && !string.IsNullOrWhiteSpace(parts[1]));

        if (firstPair is not null)
        {
            options.ApiKey = firstPair[0].Trim();
            options.ApiSecret = firstPair[1].Trim();
        }

        return options;
    }
}

public sealed class LiveKitSession
{
    public string ServerUrl { get; set; } = string.Empty;
    public string ParticipantToken { get; set; } = string.Empty;
    public string RoomName { get; set; } = string.Empty;
    public string ParticipantIdentity { get; set; } = string.Empty;
    public string ParticipantName { get; set; } = string.Empty;
    public string MetadataJson { get; set; } = "{}";
    public DateTimeOffset ExpiresAtUtc { get; set; }
}
