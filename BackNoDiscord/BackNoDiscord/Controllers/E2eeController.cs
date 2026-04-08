using BackNoDiscord.Security;
using BackNoDiscord.Services;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using System.Globalization;
using System.Text.Json;

namespace BackNoDiscord.Controllers;

[ApiController]
[Route("api/e2ee")]
[Authorize(AuthenticationSchemes = JwtBearerDefaults.AuthenticationScheme)]
public class E2eeController : ControllerBase
{
    private const string TextScope = "text";
    private const string VoiceScope = "voice";
    private readonly AppDbContext _context;
    private readonly ServerStateService _serverState;
    private readonly CryptoService _crypto;

    public E2eeController(AppDbContext context, ServerStateService serverState, CryptoService crypto)
    {
        _context = context;
        _serverState = serverState;
        _crypto = crypto;
    }

    public class UpsertDeviceKeyRequest
    {
        public string Algorithm { get; set; } = "ECDH-P256";
        public string PublicKeyJwk { get; set; } = "{}";
        public string Fingerprint { get; set; } = string.Empty;
        public string PrivateKeyJwk { get; set; } = string.Empty;
    }

    public class ChannelDirectoryRequest
    {
        public string ChannelId { get; set; } = string.Empty;
        public string Scope { get; set; } = TextScope;
    }

    public class ChannelDailyKeyRequest
    {
        public string ChannelId { get; set; } = string.Empty;
        public string Scope { get; set; } = TextScope;
        public string KeyDate { get; set; } = string.Empty;
    }

    public class UpsertChannelDailyKeyRequest
    {
        public string ChannelId { get; set; } = string.Empty;
        public string Scope { get; set; } = TextScope;
        public string KeyDate { get; set; } = string.Empty;
        public string CreatorFingerprint { get; set; } = string.Empty;
        public string CreatorPublicKeyJwk { get; set; } = "{}";
        public List<ChannelDailyKeyRecipientEnvelopeRequest> Recipients { get; set; } = [];
    }

    public class ChannelDailyKeyRecipientEnvelopeRequest
    {
        public string UserId { get; set; } = string.Empty;
        public string KeyFingerprint { get; set; } = string.Empty;
        public string WrapIv { get; set; } = string.Empty;
        public string WrappedKey { get; set; } = string.Empty;
    }

    [HttpGet("device-key")]
    public async Task<IActionResult> GetDeviceKey()
    {
        if (!AuthenticatedUserAccessor.TryGetAuthenticatedUser(User, out var currentUser) ||
            !int.TryParse(currentUser.UserId, out var currentUserId) ||
            currentUserId <= 0)
        {
            return Unauthorized();
        }

        var existing = await _context.UserE2eeKeys
            .AsNoTracking()
            .FirstOrDefaultAsync(item => item.UserId == currentUserId);

        if (existing is null)
        {
            return Ok(new
            {
                userId = currentUserId.ToString(),
                hasKey = false
            });
        }

        string privateKeyJwk = string.Empty;
        if (!string.IsNullOrWhiteSpace(existing.PrivateKeyJwkEncrypted))
        {
            try
            {
                privateKeyJwk = _crypto.Decrypt(existing.PrivateKeyJwkEncrypted);
            }
            catch
            {
                privateKeyJwk = string.Empty;
            }
        }

        return Ok(new
        {
            userId = currentUserId.ToString(),
            hasKey = true,
            algorithm = existing.Algorithm,
            publicKeyJwk = existing.PublicKeyJwk,
            fingerprint = existing.Fingerprint,
            privateKeyJwk
        });
    }

    [HttpPut("device-key")]
    public async Task<IActionResult> UpsertDeviceKey([FromBody] UpsertDeviceKeyRequest request)
    {
        if (!AuthenticatedUserAccessor.TryGetAuthenticatedUser(User, out var currentUser) ||
            !int.TryParse(currentUser.UserId, out var currentUserId) ||
            currentUserId <= 0)
        {
            return Unauthorized();
        }

        var algorithm = UploadPolicies.TrimToLength(request.Algorithm, 32);
        var fingerprint = UploadPolicies.TrimToLength(request.Fingerprint, 128);
        var publicKeyJwk = request.PublicKeyJwk?.Trim() ?? string.Empty;
        var privateKeyJwk = request.PrivateKeyJwk?.Trim() ?? string.Empty;
        if (string.IsNullOrWhiteSpace(algorithm) || string.IsNullOrWhiteSpace(fingerprint) || string.IsNullOrWhiteSpace(publicKeyJwk))
        {
            return BadRequest(new { message = "algorithm, publicKeyJwk and fingerprint are required." });
        }

        try
        {
            using var document = JsonDocument.Parse(publicKeyJwk);
            if (document.RootElement.ValueKind != JsonValueKind.Object)
            {
                return BadRequest(new { message = "publicKeyJwk must be a valid JWK object." });
            }
        }
        catch (JsonException)
        {
            return BadRequest(new { message = "publicKeyJwk must be valid JSON." });
        }

        if (!string.IsNullOrWhiteSpace(privateKeyJwk))
        {
            try
            {
                using var document = JsonDocument.Parse(privateKeyJwk);
                if (document.RootElement.ValueKind != JsonValueKind.Object)
                {
                    return BadRequest(new { message = "privateKeyJwk must be a valid JWK object." });
                }
            }
            catch (JsonException)
            {
                return BadRequest(new { message = "privateKeyJwk must be valid JSON." });
            }
        }

        var now = DateTimeOffset.UtcNow;
        var existing = await _context.UserE2eeKeys.FirstOrDefaultAsync(item => item.UserId == currentUserId);
        var encryptedPrivateKeyJwk = string.IsNullOrWhiteSpace(privateKeyJwk)
            ? string.Empty
            : _crypto.Encrypt(privateKeyJwk);
        if (existing is null)
        {
            _context.UserE2eeKeys.Add(new UserE2eeKeyRecord
            {
                UserId = currentUserId,
                Algorithm = algorithm,
                PublicKeyJwk = publicKeyJwk,
                Fingerprint = fingerprint,
                PrivateKeyJwkEncrypted = string.IsNullOrWhiteSpace(encryptedPrivateKeyJwk) ? null : encryptedPrivateKeyJwk,
                CreatedAt = now,
                UpdatedAt = now
            });
        }
        else
        {
            existing.Algorithm = algorithm;
            existing.PublicKeyJwk = publicKeyJwk;
            existing.Fingerprint = fingerprint;
            if (!string.IsNullOrWhiteSpace(encryptedPrivateKeyJwk))
            {
                existing.PrivateKeyJwkEncrypted = encryptedPrivateKeyJwk;
            }
            existing.UpdatedAt = now;
        }

        await _context.SaveChangesAsync();
        return Ok(new
        {
            userId = currentUserId.ToString(),
            algorithm,
            fingerprint,
            hasPrivateKey = !string.IsNullOrWhiteSpace(existing?.PrivateKeyJwkEncrypted ?? encryptedPrivateKeyJwk)
        });
    }

    [HttpPost("channel-directory")]
    public async Task<IActionResult> GetChannelDirectory([FromBody] ChannelDirectoryRequest request)
    {
        if (!AuthenticatedUserAccessor.TryGetAuthenticatedUser(User, out var currentUser))
        {
            return Unauthorized();
        }

        var channelId = UploadPolicies.TrimToLength(request.ChannelId, 160);
        var scope = NormalizeScope(request.Scope);
        if (string.IsNullOrWhiteSpace(channelId))
        {
            return BadRequest(new { message = "channelId is required." });
        }

        var participantUserIds = await ResolveChannelParticipantUserIdsAsync(channelId, currentUser, scope);
        if (participantUserIds.Count == 0)
        {
            return Forbid();
        }

        var participantNumericIds = participantUserIds
            .Select(userId => int.TryParse(userId, out var parsedUserId) ? parsedUserId : 0)
            .Where(userId => userId > 0)
            .Distinct()
            .ToArray();

        var keyRecords = participantNumericIds.Length == 0
            ? []
            : await _context.UserE2eeKeys
                .AsNoTracking()
                .Where(item => participantNumericIds.Contains(item.UserId))
                .ToListAsync();

        var keysByUserId = keyRecords.ToDictionary(item => item.UserId.ToString(), item => item, StringComparer.Ordinal);
        var participants = participantUserIds
            .Distinct(StringComparer.Ordinal)
            .Select(userId =>
            {
                if (keysByUserId.TryGetValue(userId, out var keyRecord))
                {
                    return new
                    {
                        userId,
                        hasKey = true,
                        algorithm = keyRecord.Algorithm,
                        fingerprint = keyRecord.Fingerprint,
                        publicKeyJwk = keyRecord.PublicKeyJwk
                    };
                }

                return new
                {
                    userId,
                    hasKey = false,
                    algorithm = string.Empty,
                    fingerprint = string.Empty,
                    publicKeyJwk = string.Empty
                };
            })
            .ToArray();

        return Ok(new { channelId, scope, participants });
    }

    [HttpPost("channel-key")]
    public async Task<IActionResult> GetChannelDailyKey([FromBody] ChannelDailyKeyRequest request)
    {
        if (!AuthenticatedUserAccessor.TryGetAuthenticatedUser(User, out var currentUser) ||
            !int.TryParse(currentUser.UserId, out var currentUserId) ||
            currentUserId <= 0)
        {
            return Unauthorized();
        }

        var channelId = UploadPolicies.TrimToLength(request.ChannelId, 160);
        var scope = NormalizeScope(request.Scope);
        if (string.IsNullOrWhiteSpace(channelId))
        {
            return BadRequest(new { message = "channelId is required." });
        }

        var participantUserIds = await ResolveChannelParticipantUserIdsAsync(channelId, currentUser, scope);
        if (participantUserIds.Count == 0)
        {
            return Forbid();
        }

        var participantNumericIds = participantUserIds
            .Select(userId => int.TryParse(userId, out var parsedUserId) ? parsedUserId : 0)
            .Where(userId => userId > 0)
            .Distinct()
            .ToArray();

        var keyRecords = participantNumericIds.Length == 0
            ? []
            : await _context.UserE2eeKeys
                .AsNoTracking()
                .Where(item => participantNumericIds.Contains(item.UserId))
                .ToListAsync();

        var keysByUserId = keyRecords.ToDictionary(item => item.UserId.ToString(), item => item, StringComparer.Ordinal);
        var participants = participantUserIds
            .Distinct(StringComparer.Ordinal)
            .Select(userId =>
            {
                if (keysByUserId.TryGetValue(userId, out var keyRecord))
                {
                    return new
                    {
                        userId,
                        hasKey = true,
                        algorithm = keyRecord.Algorithm,
                        fingerprint = keyRecord.Fingerprint,
                        publicKeyJwk = keyRecord.PublicKeyJwk
                    };
                }

                return new
                {
                    userId,
                    hasKey = false,
                    algorithm = string.Empty,
                    fingerprint = string.Empty,
                    publicKeyJwk = string.Empty
                };
            })
            .ToArray();

        var keyDate = NormalizeKeyDate(request.KeyDate);
        if (string.IsNullOrWhiteSpace(keyDate))
        {
            keyDate = GetCurrentUtcKeyDate();
        }
        var existingEnvelopes = await _context.ChannelE2eeDailyKeys
            .AsNoTracking()
            .Where(item =>
                item.Scope == scope
                && item.ChannelId == channelId
                && item.KeyDate == keyDate)
            .ToListAsync();

        var currentEnvelope = existingEnvelopes
            .FirstOrDefault(item => item.RecipientUserId == currentUserId);

        return Ok(new
        {
            channelId,
            scope,
            keyDate,
            participants,
            availableRecipientUserIds = existingEnvelopes
                .Select(item => item.RecipientUserId.ToString())
                .Distinct(StringComparer.Ordinal)
                .ToArray(),
            currentEnvelope = currentEnvelope is null
                ? null
                : new
                {
                    creatorUserId = currentEnvelope.CreatorUserId.ToString(),
                    creatorFingerprint = currentEnvelope.CreatorFingerprint,
                    creatorPublicKeyJwk = currentEnvelope.CreatorPublicKeyJwk,
                    wrapIv = currentEnvelope.WrapIv,
                    wrappedKey = currentEnvelope.WrappedKey
                }
        });
    }

    [HttpPut("channel-key")]
    public async Task<IActionResult> UpsertChannelDailyKey([FromBody] UpsertChannelDailyKeyRequest request)
    {
        if (!AuthenticatedUserAccessor.TryGetAuthenticatedUser(User, out var currentUser) ||
            !int.TryParse(currentUser.UserId, out var currentUserId) ||
            currentUserId <= 0)
        {
            return Unauthorized();
        }

        var channelId = UploadPolicies.TrimToLength(request.ChannelId, 160);
        var scope = NormalizeScope(request.Scope);
        var keyDate = NormalizeKeyDate(request.KeyDate);
        var creatorFingerprint = UploadPolicies.TrimToLength(request.CreatorFingerprint, 128);
        var creatorPublicKeyJwk = request.CreatorPublicKeyJwk?.Trim() ?? string.Empty;
        if (string.IsNullOrWhiteSpace(channelId) || string.IsNullOrWhiteSpace(keyDate))
        {
            return BadRequest(new { message = "channelId and keyDate are required." });
        }

        if (string.IsNullOrWhiteSpace(creatorFingerprint) || string.IsNullOrWhiteSpace(creatorPublicKeyJwk))
        {
            return BadRequest(new { message = "creatorFingerprint and creatorPublicKeyJwk are required." });
        }

        try
        {
            using var document = JsonDocument.Parse(creatorPublicKeyJwk);
            if (document.RootElement.ValueKind != JsonValueKind.Object)
            {
                return BadRequest(new { message = "creatorPublicKeyJwk must be a valid JWK object." });
            }
        }
        catch (JsonException)
        {
            return BadRequest(new { message = "creatorPublicKeyJwk must be valid JSON." });
        }

        var participantUserIds = await ResolveChannelParticipantUserIdsAsync(channelId, currentUser, scope);
        if (participantUserIds.Count == 0)
        {
            return Forbid();
        }

        var participantNumericIds = participantUserIds
            .Select(userId => int.TryParse(userId, out var parsedUserId) ? parsedUserId : 0)
            .Where(userId => userId > 0)
            .Distinct()
            .ToArray();

        var keyRecords = participantNumericIds.Length == 0
            ? []
            : await _context.UserE2eeKeys
                .AsNoTracking()
                .Where(item => participantNumericIds.Contains(item.UserId))
                .ToListAsync();

        var keyedParticipantIds = keyRecords
            .Select(item => item.UserId.ToString())
            .ToHashSet(StringComparer.Ordinal);

        var now = DateTimeOffset.UtcNow;
        var normalizedRecipients = (request.Recipients ?? [])
            .Select(item =>
            {
                var userId = UploadPolicies.TrimToLength(item.UserId, 64);
                return new
                {
                    UserId = userId,
                    KeyFingerprint = UploadPolicies.TrimToLength(item.KeyFingerprint, 128),
                    WrapIv = UploadPolicies.TrimToLength(item.WrapIv, 256),
                    WrappedKey = UploadPolicies.TrimToLength(item.WrappedKey, 4096)
                };
            })
            .Where(item =>
                !string.IsNullOrWhiteSpace(item.UserId) &&
                !string.IsNullOrWhiteSpace(item.WrapIv) &&
                !string.IsNullOrWhiteSpace(item.WrappedKey) &&
                participantUserIds.Contains(item.UserId, StringComparer.Ordinal) &&
                keyedParticipantIds.Contains(item.UserId))
            .GroupBy(item => item.UserId, StringComparer.Ordinal)
            .Select(group => group.First())
            .ToList();

        if (normalizedRecipients.Count == 0)
        {
            return BadRequest(new { message = "At least one valid recipient envelope is required." });
        }

        var recipientNumericIds = normalizedRecipients
            .Select(item => int.TryParse(item.UserId, out var parsedUserId) ? parsedUserId : 0)
            .Where(userId => userId > 0)
            .ToArray();

        var existingRows = await _context.ChannelE2eeDailyKeys
            .Where(item =>
                item.Scope == scope
                && item.ChannelId == channelId
                && item.KeyDate == keyDate
                && recipientNumericIds.Contains(item.RecipientUserId))
            .ToListAsync();

        var existingByRecipient = existingRows.ToDictionary(item => item.RecipientUserId);

        foreach (var recipient in normalizedRecipients)
        {
            if (!int.TryParse(recipient.UserId, out var recipientUserId) || recipientUserId <= 0)
            {
                continue;
            }

            if (existingByRecipient.TryGetValue(recipientUserId, out var existingRow))
            {
                existingRow.CreatorUserId = currentUserId;
                existingRow.CreatorFingerprint = creatorFingerprint;
                existingRow.CreatorPublicKeyJwk = creatorPublicKeyJwk;
                existingRow.WrapIv = recipient.WrapIv;
                existingRow.WrappedKey = recipient.WrappedKey;
                existingRow.UpdatedAt = now;
            }
            else
            {
                _context.ChannelE2eeDailyKeys.Add(new ChannelE2eeDailyKeyRecord
                {
                    Scope = scope,
                    ChannelId = channelId,
                    KeyDate = keyDate,
                    RecipientUserId = recipientUserId,
                    CreatorUserId = currentUserId,
                    CreatorFingerprint = creatorFingerprint,
                    CreatorPublicKeyJwk = creatorPublicKeyJwk,
                    WrapIv = recipient.WrapIv,
                    WrappedKey = recipient.WrappedKey,
                    CreatedAt = now,
                    UpdatedAt = now
                });
            }
        }

        await _context.SaveChangesAsync();

        return Ok(new
        {
            channelId,
            scope,
            keyDate,
            recipientCount = normalizedRecipients.Count
        });
    }

    private async Task<List<string>> ResolveChannelParticipantUserIdsAsync(string channelId, AuthenticatedUser currentUser, string scope)
    {
        if (string.Equals(scope, VoiceScope, StringComparison.Ordinal))
        {
            return ResolveVoiceChannelParticipantUserIds(channelId, currentUser);
        }

        if (DirectMessageChannels.TryParse(channelId, out var firstUserId, out var secondUserId, out var isSelfChannel))
        {
            if (!CanAccessDirectChannel(currentUser.UserId, firstUserId, secondUserId))
            {
                return [];
            }

            return isSelfChannel
                ? [firstUserId.ToString()]
                : [firstUserId.ToString(), secondUserId.ToString()];
        }

        if (!ServerChannelAuthorization.TryGetServerIdFromChatChannelId(channelId, out var serverId))
        {
            return [];
        }

        return ResolveSnapshotParticipantUserIds(serverId, currentUser);
    }

    private List<string> ResolveVoiceChannelParticipantUserIds(string channelId, AuthenticatedUser currentUser)
    {
        if (!ServerChannelAuthorization.TryGetServerIdFromVoiceChannelName(channelId, out var serverId))
        {
            return [];
        }

        return ResolveSnapshotParticipantUserIds(serverId, currentUser);
    }

    private List<string> ResolveSnapshotParticipantUserIds(string serverId, AuthenticatedUser currentUser)
    {
        var snapshot = _serverState.GetSnapshot(serverId);
        if (!ServerChannelAuthorization.CanAccessServer(serverId, currentUser, snapshot))
        {
            return [];
        }

        var memberIds = snapshot?.Members?
            .Select(member => member.UserId?.Trim() ?? string.Empty)
            .Where(userId => !string.IsNullOrWhiteSpace(userId))
            .Distinct(StringComparer.Ordinal)
            .ToList() ?? [];

        if (!memberIds.Contains(currentUser.UserId, StringComparer.Ordinal))
        {
            memberIds.Add(currentUser.UserId);
        }

        return memberIds;
    }

    private static string NormalizeScope(string? value)
    {
        var normalized = UploadPolicies.TrimToLength(value, 16).ToLowerInvariant();
        return normalized == VoiceScope ? VoiceScope : TextScope;
    }

    private static string GetCurrentUtcKeyDate()
    {
        return DateTimeOffset.UtcNow.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture);
    }

    private static string NormalizeKeyDate(string? value)
    {
        if (DateOnly.TryParseExact(
                value,
                "yyyy-MM-dd",
                CultureInfo.InvariantCulture,
                DateTimeStyles.None,
                out var parsed))
        {
            return parsed.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture);
        }

        return string.Empty;
    }

    private bool CanAccessDirectChannel(string currentUserId, int firstUserId, int secondUserId)
    {
        if (!int.TryParse(currentUserId, out var actorUserId))
        {
            return false;
        }

        if (actorUserId != firstUserId && actorUserId != secondUserId)
        {
            return false;
        }

        if (firstUserId == secondUserId)
        {
            return actorUserId == firstUserId;
        }

        var lowId = Math.Min(firstUserId, secondUserId);
        var highId = Math.Max(firstUserId, secondUserId);

        return _context.Friendships
            .AsNoTracking()
            .Any(item => item.UserLowId == lowId && item.UserHighId == highId);
    }

}
