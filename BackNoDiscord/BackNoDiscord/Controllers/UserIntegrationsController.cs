using BackNoDiscord.Security;
using BackNoDiscord.Services;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;
using System.Collections.Concurrent;
using System.Net;
using System.Net.Http.Headers;
using System.Security.Cryptography;
using System.Text.Json;

namespace BackNoDiscord.Controllers;

public class ConnectUserIntegrationRequest
{
    public string? DisplayName { get; set; }
    public string? ExternalUserId { get; set; }
}

public class UpdateUserIntegrationSettingsRequest
{
    public bool? DisplayInProfile { get; set; }
    public bool? UseAsStatus { get; set; }
}

public class UpdateUserIntegrationActivityRequest
{
    public string? Kind { get; set; }
    public string? Title { get; set; }
    public string? Subtitle { get; set; }
    public string? Details { get; set; }
}

[ApiController]
[Route("api/integrations")]
[Authorize(AuthenticationSchemes = JwtBearerDefaults.AuthenticationScheme)]
public class UserIntegrationsController : ControllerBase
{
    private const string SpotifyProviderId = "spotify";
    private const string SpotifyScope = "user-read-currently-playing user-read-playback-state";
    private static readonly Uri SpotifyAccountsApi = new("https://accounts.spotify.com/");
    private static readonly Uri SpotifyWebApi = new("https://api.spotify.com/");
    private static readonly TimeSpan OAuthStateLifetime = TimeSpan.FromMinutes(10);
    private static readonly ConcurrentDictionary<string, OAuthStateRecord> OAuthStates = new(StringComparer.Ordinal);

    private static readonly IntegrationProviderInfo[] Providers =
    [
        new("spotify", "Spotify", "music", true),
        new("steam", "Steam", "game", false),
        new("battlenet", "Battle.net", "game", false),
        new("github", "GitHub", "profile", false),
        new("yandex_music", "Яндекс Музыка", "music", false)
    ];

    private static readonly Dictionary<string, IntegrationProviderInfo> ProviderById =
        Providers.ToDictionary(item => item.Id, StringComparer.OrdinalIgnoreCase);

    private static readonly HashSet<string> ProviderIds =
        Providers.Select(item => item.Id).ToHashSet(StringComparer.OrdinalIgnoreCase);

    private readonly AppDbContext _context;
    private readonly IHubContext<ChatHub> _chatHubContext;
    private readonly IHttpClientFactory _httpClientFactory;
    private readonly IConfiguration _configuration;
    private readonly CryptoService _cryptoService;

    public UserIntegrationsController(
        AppDbContext context,
        IHubContext<ChatHub> chatHubContext,
        IHttpClientFactory httpClientFactory,
        IConfiguration configuration,
        CryptoService cryptoService)
    {
        _context = context;
        _chatHubContext = chatHubContext;
        _httpClientFactory = httpClientFactory;
        _configuration = configuration;
        _cryptoService = cryptoService;
    }

    [HttpGet]
    public async Task<IActionResult> GetIntegrations(CancellationToken cancellationToken)
    {
        if (!TryGetCurrentUserId(out var currentUserId))
        {
            return Unauthorized();
        }

        var records = await _context.UserIntegrations
            .AsNoTracking()
            .Where(item => item.UserId == currentUserId)
            .ToListAsync(cancellationToken);

        return Ok(BuildIntegrationsPayload(records));
    }

    [HttpGet("spotify/connect-url")]
    public IActionResult GetSpotifyConnectUrl()
    {
        if (!TryGetCurrentUserId(out var currentUserId))
        {
            return Unauthorized();
        }

        var spotifyOptions = GetSpotifyOptions();
        if (!spotifyOptions.IsConfigured)
        {
            return BadRequest(new { message = "Spotify OAuth не настроен: добавьте Spotify__ClientId и Spotify__ClientSecret на бэке." });
        }

        PurgeExpiredOAuthStates();

        var state = CreateSecureState();
        OAuthStates[state] = new OAuthStateRecord(currentUserId, DateTimeOffset.UtcNow.Add(OAuthStateLifetime));

        var query = BuildQueryString(new Dictionary<string, string>
        {
            ["client_id"] = spotifyOptions.ClientId,
            ["response_type"] = "code",
            ["redirect_uri"] = spotifyOptions.RedirectUri,
            ["scope"] = SpotifyScope,
            ["state"] = state,
            ["show_dialog"] = "true"
        });

        return Ok(new { url = $"https://accounts.spotify.com/authorize?{query}" });
    }

    [AllowAnonymous]
    [HttpGet("spotify/callback")]
    public async Task<IActionResult> SpotifyCallback([FromQuery] string? code, [FromQuery] string? state, [FromQuery] string? error, CancellationToken cancellationToken)
    {
        if (!string.IsNullOrWhiteSpace(error))
        {
            return Content(BuildCallbackHtml("Spotify не подключен", "Авторизация была отменена или Spotify вернул ошибку."), "text/html; charset=utf-8");
        }

        if (string.IsNullOrWhiteSpace(code) || string.IsNullOrWhiteSpace(state) ||
            !OAuthStates.TryRemove(state, out var stateRecord) ||
            stateRecord.ExpiresAt <= DateTimeOffset.UtcNow)
        {
            return Content(BuildCallbackHtml("Spotify не подключен", "Сессия подключения устарела. Закройте окно и попробуйте ещё раз."), "text/html; charset=utf-8");
        }

        var spotifyOptions = GetSpotifyOptions();
        if (!spotifyOptions.IsConfigured)
        {
            return Content(BuildCallbackHtml("Spotify не подключен", "На сервере не настроены ключи Spotify OAuth."), "text/html; charset=utf-8");
        }

        try
        {
            var token = await ExchangeSpotifyCodeAsync(code, spotifyOptions, cancellationToken);
            if (string.IsNullOrWhiteSpace(token.AccessToken) || string.IsNullOrWhiteSpace(token.RefreshToken))
            {
                return Content(BuildCallbackHtml("Spotify не подключен", "Spotify не вернул токен доступа."), "text/html; charset=utf-8");
            }

            var profile = await FetchSpotifyProfileAsync(token.AccessToken, cancellationToken);
            await UpsertSpotifyIntegrationAsync(stateRecord.UserId, token, profile, cancellationToken);
            await BroadcastActivityUpdatedAsync(stateRecord.UserId, cancellationToken);

            return Content(BuildCallbackHtml("Spotify подключен", "Можно закрыть это окно и вернуться в Tend."), "text/html; charset=utf-8");
        }
        catch
        {
            return Content(BuildCallbackHtml("Spotify не подключен", "Не удалось завершить обмен OAuth-кода. Попробуйте подключить Spotify ещё раз."), "text/html; charset=utf-8");
        }
    }

    [HttpPost("spotify/activity/refresh")]
    public async Task<IActionResult> RefreshSpotifyActivity(CancellationToken cancellationToken)
    {
        if (!TryGetCurrentUserId(out var currentUserId))
        {
            return Unauthorized();
        }

        var record = await _context.UserIntegrations
            .FirstOrDefaultAsync(item => item.UserId == currentUserId && item.Provider == SpotifyProviderId, cancellationToken);
        if (record is null || string.IsNullOrWhiteSpace(record.RefreshTokenEncrypted))
        {
            return NotFound(new { message = "Сначала подключите Spotify через OAuth." });
        }

        var accessToken = await GetUsableSpotifyAccessTokenAsync(record, cancellationToken);
        if (string.IsNullOrWhiteSpace(accessToken))
        {
            return BadRequest(new { message = "Spotify нужно подключить заново." });
        }

        var client = _httpClientFactory.CreateClient();
        client.BaseAddress = SpotifyWebApi;

        using var request = new HttpRequestMessage(HttpMethod.Get, "v1/me/player/currently-playing?additional_types=track,episode");
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", accessToken);
        using var response = await client.SendAsync(request, cancellationToken);

        var changed = false;
        if (response.StatusCode == HttpStatusCode.NoContent)
        {
            changed = SetIntegrationActivity(record, record.ActivityKind, string.Empty, string.Empty, string.Empty);
        }
        else if (response.StatusCode == HttpStatusCode.Unauthorized)
        {
            return BadRequest(new { message = "Spotify вернул ошибку авторизации. Подключите аккаунт заново." });
        }
        else if (!response.IsSuccessStatusCode)
        {
            return StatusCode((int)response.StatusCode, new { message = "Spotify сейчас не отдал текущий трек." });
        }
        else
        {
            await using var stream = await response.Content.ReadAsStreamAsync(cancellationToken);
            using var document = await JsonDocument.ParseAsync(stream, cancellationToken: cancellationToken);
            changed = ApplySpotifyCurrentlyPlaying(record, document.RootElement);
        }

        record.UpdatedAt = DateTimeOffset.UtcNow;
        await _context.SaveChangesAsync(cancellationToken);

        if (changed)
        {
            await BroadcastActivityUpdatedAsync(currentUserId, cancellationToken);
        }

        var records = await _context.UserIntegrations
            .AsNoTracking()
            .Where(item => item.UserId == currentUserId)
            .ToListAsync(cancellationToken);

        return Ok(new
        {
            provider = BuildProviderPayload(ProviderById[SpotifyProviderId], records.FirstOrDefault(item => item.Provider == SpotifyProviderId)),
            activity = BuildActivityPayload(ResolveActiveActivity(records))
        });
    }

    [HttpPost("{provider}/connect")]
    public IActionResult Connect([FromRoute] string provider)
    {
        if (!TryNormalizeProvider(provider, out var providerId))
        {
            return NotFound(new { message = "Интеграция не найдена." });
        }

        var providerInfo = ProviderById[providerId];
        if (providerInfo.Id == SpotifyProviderId)
        {
            return BadRequest(new { message = "Для Spotify используйте OAuth-подключение." });
        }

        return BadRequest(new { message = $"Для {providerInfo.Name} ещё не добавлено настоящее OAuth/API-подключение." });
    }

    [HttpDelete("{provider}")]
    public async Task<IActionResult> Disconnect([FromRoute] string provider, CancellationToken cancellationToken)
    {
        if (!TryGetCurrentUserId(out var currentUserId))
        {
            return Unauthorized();
        }

        if (!TryNormalizeProvider(provider, out var providerId))
        {
            return NotFound(new { message = "Интеграция не найдена." });
        }

        var record = await _context.UserIntegrations
            .FirstOrDefaultAsync(item => item.UserId == currentUserId && item.Provider == providerId, cancellationToken);
        if (record is not null)
        {
            _context.UserIntegrations.Remove(record);
            await _context.SaveChangesAsync(cancellationToken);
            await BroadcastActivityUpdatedAsync(currentUserId, cancellationToken);
        }

        return NoContent();
    }

    [HttpPut("{provider}/settings")]
    public async Task<IActionResult> UpdateSettings([FromRoute] string provider, [FromBody] UpdateUserIntegrationSettingsRequest request, CancellationToken cancellationToken)
    {
        if (!TryGetCurrentUserId(out var currentUserId))
        {
            return Unauthorized();
        }

        if (!TryNormalizeProvider(provider, out var providerId))
        {
            return NotFound(new { message = "Интеграция не найдена." });
        }

        var providerInfo = ProviderById[providerId];
        var record = await _context.UserIntegrations
            .FirstOrDefaultAsync(item => item.UserId == currentUserId && item.Provider == providerId, cancellationToken);
        if (record is null || !IsProviderConnected(providerInfo, record))
        {
            return NotFound(new { message = "Сначала подключите интеграцию." });
        }

        record.DisplayInProfile = request.DisplayInProfile ?? record.DisplayInProfile;
        record.UseAsStatus = request.UseAsStatus ?? record.UseAsStatus;
        record.UpdatedAt = DateTimeOffset.UtcNow;

        await _context.SaveChangesAsync(cancellationToken);
        await BroadcastActivityUpdatedAsync(currentUserId, cancellationToken);

        return Ok(BuildProviderPayload(providerInfo, record));
    }

    [HttpPut("{provider}/activity")]
    public async Task<IActionResult> UpdateActivity([FromRoute] string provider, [FromBody] UpdateUserIntegrationActivityRequest request, CancellationToken cancellationToken)
    {
        if (!TryGetCurrentUserId(out var currentUserId))
        {
            return Unauthorized();
        }

        if (!TryNormalizeProvider(provider, out var providerId))
        {
            return NotFound(new { message = "Интеграция не найдена." });
        }

        var providerInfo = ProviderById[providerId];
        var record = await _context.UserIntegrations
            .FirstOrDefaultAsync(item => item.UserId == currentUserId && item.Provider == providerId, cancellationToken);
        if (record is null || !IsProviderConnected(providerInfo, record))
        {
            return NotFound(new { message = "Сначала подключите интеграцию." });
        }

        if (providerInfo.Id != SpotifyProviderId)
        {
            return BadRequest(new { message = "Для этой интеграции ещё нет настоящего обновления активности." });
        }

        SetIntegrationActivity(
            record,
            ClampText(request.Kind, 32),
            ClampText(request.Title, 160),
            ClampText(request.Subtitle, 160),
            ClampText(request.Details, 2000));
        record.UpdatedAt = DateTimeOffset.UtcNow;

        await _context.SaveChangesAsync(cancellationToken);
        await BroadcastActivityUpdatedAsync(currentUserId, cancellationToken);

        return Ok(BuildProviderPayload(providerInfo, record));
    }

    private async Task UpsertSpotifyIntegrationAsync(int userId, SpotifyTokenResponse token, SpotifyProfile profile, CancellationToken cancellationToken)
    {
        var now = DateTimeOffset.UtcNow;
        var record = await _context.UserIntegrations
            .FirstOrDefaultAsync(item => item.UserId == userId && item.Provider == SpotifyProviderId, cancellationToken);

        if (record is null)
        {
            record = new UserIntegrationRecord
            {
                UserId = userId,
                Provider = SpotifyProviderId,
                ConnectedAt = now,
                DisplayInProfile = true,
                UseAsStatus = true,
                ActivityKind = "music"
            };
            _context.UserIntegrations.Add(record);
        }

        record.DisplayName = ClampText(profile.DisplayName, 120);
        record.ExternalUserId = ClampText(profile.Id, 512);
        record.AccessTokenEncrypted = _cryptoService.Encrypt(token.AccessToken);
        record.RefreshTokenEncrypted = _cryptoService.Encrypt(token.RefreshToken);
        record.TokenExpiresAt = now.AddSeconds(Math.Max(60, token.ExpiresIn));
        record.ActivityKind = "music";
        record.UpdatedAt = now;

        await _context.SaveChangesAsync(cancellationToken);
    }

    private async Task<SpotifyTokenResponse> ExchangeSpotifyCodeAsync(string code, SpotifyOptions spotifyOptions, CancellationToken cancellationToken)
    {
        var client = _httpClientFactory.CreateClient();
        client.BaseAddress = SpotifyAccountsApi;

        using var request = new HttpRequestMessage(HttpMethod.Post, "api/token");
        request.Headers.Authorization = BuildSpotifyBasicAuthHeader(spotifyOptions);
        request.Content = new FormUrlEncodedContent(new Dictionary<string, string>
        {
            ["grant_type"] = "authorization_code",
            ["code"] = code,
            ["redirect_uri"] = spotifyOptions.RedirectUri
        });

        using var response = await client.SendAsync(request, cancellationToken);
        response.EnsureSuccessStatusCode();
        await using var stream = await response.Content.ReadAsStreamAsync(cancellationToken);
        using var document = await JsonDocument.ParseAsync(stream, cancellationToken: cancellationToken);
        return ParseSpotifyTokenResponse(document.RootElement);
    }

    private async Task<string?> GetUsableSpotifyAccessTokenAsync(UserIntegrationRecord record, CancellationToken cancellationToken)
    {
        if (record.TokenExpiresAt.HasValue && record.TokenExpiresAt.Value > DateTimeOffset.UtcNow.AddSeconds(60))
        {
            return SafeDecrypt(record.AccessTokenEncrypted);
        }

        var refreshToken = SafeDecrypt(record.RefreshTokenEncrypted);
        if (string.IsNullOrWhiteSpace(refreshToken))
        {
            return null;
        }

        var spotifyOptions = GetSpotifyOptions();
        if (!spotifyOptions.IsConfigured)
        {
            return null;
        }

        var client = _httpClientFactory.CreateClient();
        client.BaseAddress = SpotifyAccountsApi;

        using var request = new HttpRequestMessage(HttpMethod.Post, "api/token");
        request.Headers.Authorization = BuildSpotifyBasicAuthHeader(spotifyOptions);
        request.Content = new FormUrlEncodedContent(new Dictionary<string, string>
        {
            ["grant_type"] = "refresh_token",
            ["refresh_token"] = refreshToken
        });

        using var response = await client.SendAsync(request, cancellationToken);
        if (!response.IsSuccessStatusCode)
        {
            return null;
        }

        await using var stream = await response.Content.ReadAsStreamAsync(cancellationToken);
        using var document = await JsonDocument.ParseAsync(stream, cancellationToken: cancellationToken);
        var token = ParseSpotifyTokenResponse(document.RootElement, refreshToken);

        record.AccessTokenEncrypted = _cryptoService.Encrypt(token.AccessToken);
        record.RefreshTokenEncrypted = _cryptoService.Encrypt(token.RefreshToken);
        record.TokenExpiresAt = DateTimeOffset.UtcNow.AddSeconds(Math.Max(60, token.ExpiresIn));
        record.UpdatedAt = DateTimeOffset.UtcNow;
        await _context.SaveChangesAsync(cancellationToken);

        return token.AccessToken;
    }

    private async Task<SpotifyProfile> FetchSpotifyProfileAsync(string accessToken, CancellationToken cancellationToken)
    {
        var client = _httpClientFactory.CreateClient();
        client.BaseAddress = SpotifyWebApi;

        using var request = new HttpRequestMessage(HttpMethod.Get, "v1/me");
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", accessToken);
        using var response = await client.SendAsync(request, cancellationToken);
        if (!response.IsSuccessStatusCode)
        {
            return new SpotifyProfile("Spotify", string.Empty);
        }

        await using var stream = await response.Content.ReadAsStreamAsync(cancellationToken);
        using var document = await JsonDocument.ParseAsync(stream, cancellationToken: cancellationToken);
        var root = document.RootElement;
        var displayName = GetString(root, "display_name");
        var id = GetString(root, "id");
        return new SpotifyProfile(string.IsNullOrWhiteSpace(displayName) ? "Spotify" : displayName, id);
    }

    private bool ApplySpotifyCurrentlyPlaying(UserIntegrationRecord record, JsonElement root)
    {
        if (root.TryGetProperty("is_playing", out var isPlayingElement) &&
            isPlayingElement.ValueKind == JsonValueKind.False)
        {
            return SetIntegrationActivity(record, "music", string.Empty, string.Empty, string.Empty);
        }

        if (!root.TryGetProperty("item", out var item) || item.ValueKind is JsonValueKind.Null or JsonValueKind.Undefined)
        {
            return SetIntegrationActivity(record, "music", string.Empty, string.Empty, string.Empty);
        }

        var type = GetString(root, "currently_playing_type");
        var itemName = GetString(item, "name");
        if (string.IsNullOrWhiteSpace(itemName))
        {
            return SetIntegrationActivity(record, "music", string.Empty, string.Empty, string.Empty);
        }

        var details = string.Empty;
        if (item.TryGetProperty("external_urls", out var urls) && urls.ValueKind == JsonValueKind.Object)
        {
            details = GetString(urls, "spotify");
        }

        if (string.Equals(type, "episode", StringComparison.OrdinalIgnoreCase))
        {
            var showName = item.TryGetProperty("show", out var show) ? GetString(show, "name") : string.Empty;
            return SetIntegrationActivity(record, "music", string.IsNullOrWhiteSpace(showName) ? "Подкаст" : showName, itemName, details);
        }

        var artists = item.TryGetProperty("artists", out var artistsElement) && artistsElement.ValueKind == JsonValueKind.Array
            ? string.Join(", ", artistsElement.EnumerateArray().Select(artist => GetString(artist, "name")).Where(name => !string.IsNullOrWhiteSpace(name)))
            : string.Empty;

        return SetIntegrationActivity(record, "music", string.IsNullOrWhiteSpace(artists) ? "Spotify" : artists, itemName, details);
    }

    private static bool SetIntegrationActivity(UserIntegrationRecord record, string? kind, string? title, string? subtitle, string? details)
    {
        var nextKind = ClampText(kind, 32);
        var nextTitle = ClampText(title, 160);
        var nextSubtitle = ClampText(subtitle, 160);
        var nextDetails = ClampText(details, 2000);
        var changed =
            !string.Equals(record.ActivityKind, nextKind, StringComparison.Ordinal) ||
            !string.Equals(record.ActivityTitle, nextTitle, StringComparison.Ordinal) ||
            !string.Equals(record.ActivitySubtitle, nextSubtitle, StringComparison.Ordinal) ||
            !string.Equals(record.ActivityDetails, nextDetails, StringComparison.Ordinal);

        record.ActivityKind = nextKind;
        record.ActivityTitle = nextTitle;
        record.ActivitySubtitle = nextSubtitle;
        record.ActivityDetails = nextDetails;
        record.ActivityUpdatedAt = string.IsNullOrWhiteSpace(nextTitle) ? null : DateTimeOffset.UtcNow;
        return changed;
    }

    private async Task BroadcastActivityUpdatedAsync(int userId, CancellationToken cancellationToken)
    {
        var friendIds = await _context.Friendships
            .AsNoTracking()
            .Where(item => item.UserLowId == userId || item.UserHighId == userId)
            .Select(item => item.UserLowId == userId ? item.UserHighId : item.UserLowId)
            .Distinct()
            .ToListAsync(cancellationToken);

        var activity = await _context.UserIntegrations
            .AsNoTracking()
            .Where(item => item.UserId == userId)
            .ToListAsync(cancellationToken);

        await _chatHubContext.Clients.Users(friendIds.Append(userId).Distinct().Select(item => item.ToString()))
            .SendAsync("UserActivityUpdated", new
            {
                userId,
                activity = BuildActivityPayload(ResolveActiveActivity(activity))
            }, cancellationToken);
    }

    private object BuildIntegrationsPayload(IReadOnlyCollection<UserIntegrationRecord> records)
    {
        var recordByProvider = records.ToDictionary(item => item.Provider, StringComparer.OrdinalIgnoreCase);
        return new
        {
            providers = Providers.Select(provider =>
            {
                recordByProvider.TryGetValue(provider.Id, out var record);
                return BuildProviderPayload(provider, record);
            }),
            activity = BuildActivityPayload(ResolveActiveActivity(records))
        };
    }

    private static UserIntegrationRecord? ResolveActiveActivity(IEnumerable<UserIntegrationRecord> records) =>
        records
            .Where(item => ProviderById.TryGetValue(item.Provider, out var provider) &&
                IsProviderConnected(provider, item) &&
                item.DisplayInProfile &&
                item.UseAsStatus &&
                !string.IsNullOrWhiteSpace(item.ActivityTitle))
            .OrderByDescending(item => item.ActivityUpdatedAt ?? item.UpdatedAt)
            .FirstOrDefault();

    private static object BuildProviderPayload(IntegrationProviderInfo provider, UserIntegrationRecord? record) => new
    {
        id = provider.Id,
        name = provider.Name,
        activityKind = provider.DefaultActivityKind,
        oauthEnabled = provider.OAuthEnabled,
        connected = IsProviderConnected(provider, record),
        requiresReconnect = record is not null && provider.OAuthEnabled && !IsProviderConnected(provider, record),
        displayName = record?.DisplayName ?? string.Empty,
        displayInProfile = record?.DisplayInProfile ?? true,
        useAsStatus = record?.UseAsStatus ?? (provider.DefaultActivityKind is "music" or "game"),
        activity = IsProviderConnected(provider, record) ? BuildActivityPayload(record) : null
    };

    private static object? BuildActivityPayload(UserIntegrationRecord? record)
    {
        if (record is null || string.IsNullOrWhiteSpace(record.ActivityTitle))
        {
            return null;
        }

        return new
        {
            provider = record.Provider,
            kind = record.ActivityKind,
            title = record.ActivityTitle,
            subtitle = record.ActivitySubtitle,
            details = record.ActivityDetails,
            updatedAt = record.ActivityUpdatedAt
        };
    }

    private static bool IsProviderConnected(IntegrationProviderInfo provider, UserIntegrationRecord? record) =>
        record is not null &&
        provider.OAuthEnabled &&
        provider.Id == SpotifyProviderId &&
        !string.IsNullOrWhiteSpace(record.RefreshTokenEncrypted);

    private SpotifyOptions GetSpotifyOptions()
    {
        var clientId = (_configuration["Spotify:ClientId"] ?? _configuration["SPOTIFY_CLIENT_ID"] ?? string.Empty).Trim();
        var clientSecret = (_configuration["Spotify:ClientSecret"] ?? _configuration["SPOTIFY_CLIENT_SECRET"] ?? string.Empty).Trim();
        var redirectUri = (_configuration["Spotify:RedirectUri"] ?? _configuration["SPOTIFY_REDIRECT_URI"] ?? string.Empty).Trim();
        if (string.IsNullOrWhiteSpace(redirectUri))
        {
            redirectUri = $"{Request.Scheme}://{Request.Host}{Request.PathBase}/api/integrations/spotify/callback";
        }

        return new SpotifyOptions(clientId, clientSecret, redirectUri);
    }

    private static AuthenticationHeaderValue BuildSpotifyBasicAuthHeader(SpotifyOptions options)
    {
        var raw = $"{options.ClientId}:{options.ClientSecret}";
        return new AuthenticationHeaderValue("Basic", Convert.ToBase64String(System.Text.Encoding.UTF8.GetBytes(raw)));
    }

    private string SafeDecrypt(string? encrypted)
    {
        try
        {
            return _cryptoService.Decrypt(encrypted ?? string.Empty);
        }
        catch
        {
            return string.Empty;
        }
    }

    private bool TryGetCurrentUserId(out int currentUserId)
    {
        currentUserId = 0;
        return AuthenticatedUserAccessor.TryGetAuthenticatedUser(User, out var currentUser)
            && int.TryParse(currentUser.UserId, out currentUserId);
    }

    private static bool TryNormalizeProvider(string? provider, out string providerId)
    {
        providerId = (provider ?? string.Empty).Trim().ToLowerInvariant();
        return ProviderIds.Contains(providerId);
    }

    private static SpotifyTokenResponse ParseSpotifyTokenResponse(JsonElement root, string fallbackRefreshToken = "")
    {
        var accessToken = GetString(root, "access_token");
        var refreshToken = GetString(root, "refresh_token");
        var expiresIn = root.TryGetProperty("expires_in", out var expiresInElement) && expiresInElement.TryGetInt32(out var value)
            ? value
            : 3600;

        return new SpotifyTokenResponse(accessToken, string.IsNullOrWhiteSpace(refreshToken) ? fallbackRefreshToken : refreshToken, expiresIn);
    }

    private static string GetString(JsonElement element, string propertyName)
    {
        if (!element.TryGetProperty(propertyName, out var property) || property.ValueKind is JsonValueKind.Null or JsonValueKind.Undefined)
        {
            return string.Empty;
        }

        return property.ValueKind == JsonValueKind.String ? property.GetString() ?? string.Empty : property.ToString();
    }

    private static string ClampText(string? value, int maxLength)
    {
        var normalized = (value ?? string.Empty).Trim();
        return normalized.Length <= maxLength ? normalized : normalized[..maxLength];
    }

    private static string CreateSecureState()
    {
        var bytes = RandomNumberGenerator.GetBytes(32);
        return Convert.ToBase64String(bytes).Replace("+", "-", StringComparison.Ordinal).Replace("/", "_", StringComparison.Ordinal).TrimEnd('=');
    }

    private static void PurgeExpiredOAuthStates()
    {
        var now = DateTimeOffset.UtcNow;
        foreach (var pair in OAuthStates)
        {
            if (pair.Value.ExpiresAt <= now)
            {
                OAuthStates.TryRemove(pair.Key, out _);
            }
        }
    }

    private static string BuildQueryString(IReadOnlyDictionary<string, string> values) =>
        string.Join("&", values.Select(pair => $"{Uri.EscapeDataString(pair.Key)}={Uri.EscapeDataString(pair.Value)}"));

    private static string BuildCallbackHtml(string title, string message)
    {
        var safeTitle = WebUtility.HtmlEncode(title);
        var safeMessage = WebUtility.HtmlEncode(message);
        return $$"""
            <!doctype html>
            <html lang="ru">
            <head>
              <meta charset="utf-8">
              <meta name="viewport" content="width=device-width,initial-scale=1">
              <title>{{safeTitle}}</title>
              <style>
                body { margin: 0; min-height: 100vh; display: grid; place-items: center; background: #1e1f26; color: #f4f5fb; font: 16px/1.45 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
                main { width: min(420px, calc(100vw - 32px)); padding: 28px; border-radius: 12px; background: #292a33; border: 1px solid rgba(255,255,255,.1); box-shadow: 0 18px 60px rgba(0,0,0,.35); }
                h1 { margin: 0 0 10px; font-size: 24px; }
                p { margin: 0; color: #b8bfce; }
              </style>
            </head>
            <body><main><h1>{{safeTitle}}</h1><p>{{safeMessage}}</p></main></body>
            </html>
            """;
    }

    private sealed record IntegrationProviderInfo(string Id, string Name, string DefaultActivityKind, bool OAuthEnabled);
    private sealed record OAuthStateRecord(int UserId, DateTimeOffset ExpiresAt);
    private sealed record SpotifyOptions(string ClientId, string ClientSecret, string RedirectUri)
    {
        public bool IsConfigured => !string.IsNullOrWhiteSpace(ClientId) && !string.IsNullOrWhiteSpace(ClientSecret);
    }
    private sealed record SpotifyTokenResponse(string AccessToken, string RefreshToken, int ExpiresIn);
    private sealed record SpotifyProfile(string DisplayName, string Id);
}
