using BackNoDiscord.Security;
using BackNoDiscord.Services;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;
using System.Text.Json;

namespace BackNoDiscord.Controllers;

[ApiController]
[Route("api/friends")]
[Authorize(AuthenticationSchemes = JwtBearerDefaults.AuthenticationScheme)]
public class FriendsController : ControllerBase
{
    private readonly AppDbContext _context;
    private readonly IHubContext<ChatHub> _chatHubContext;
    private readonly FriendRequestService _friendRequestService;
    private readonly UserPresenceService _userPresenceService;
    private readonly CryptoService _crypto;
    private const string MessagePayloadPrefix = "__CHAT_PAYLOAD__:";

    public FriendsController(
        AppDbContext context,
        IHubContext<ChatHub> chatHubContext,
        FriendRequestService friendRequestService,
        UserPresenceService userPresenceService,
        CryptoService crypto)
    {
        _context = context;
        _chatHubContext = chatHubContext;
        _friendRequestService = friendRequestService;
        _userPresenceService = userPresenceService;
        _crypto = crypto;
    }

    [HttpGet]
    public async Task<IActionResult> GetFriends()
    {
        if (!TryGetCurrentUserId(out var currentUserId))
        {
            return Unauthorized();
        }

        var friendships = await _context.Friendships
            .AsNoTracking()
            .Where(item => item.UserLowId == currentUserId || item.UserHighId == currentUserId)
            .OrderByDescending(item => item.CreatedAt)
            .ToListAsync();

        var friendIds = friendships
            .Select(item => item.UserLowId == currentUserId ? item.UserHighId : item.UserLowId)
            .Distinct()
            .ToList();

        var users = await _context.Users
            .AsNoTracking()
            .Where(item => friendIds.Contains(item.id))
            .ToDictionaryAsync(item => item.id);
        var activityByUserId = await LoadActiveActivitiesAsync(friendIds);
        var unreadCountsByFriendId = await BuildDirectUnreadCountsAsync(currentUserId, friendIds);

        var result = friendships
            .Select(item => item.UserLowId == currentUserId ? item.UserHighId : item.UserLowId)
            .Distinct()
            .Where(friendId => users.ContainsKey(friendId))
            .Select(friendId => BuildFriendPayload(
                users[friendId],
                currentUserId,
                activityByUserId,
                unreadCountsByFriendId.TryGetValue(friendId, out var unreadCount) ? unreadCount : 0));

        return Ok(result);
    }

    [HttpGet("search")]
    public async Task<IActionResult> SearchFriends([FromQuery] string? q, [FromQuery] string? mode)
    {
        if (!TryGetCurrentUserId(out var currentUserId))
        {
            return Unauthorized();
        }

        var parsedSearch = ParseFriendSearch(q, mode);
        if (string.IsNullOrWhiteSpace(parsedSearch.Query))
        {
            return Ok(Array.Empty<object>());
        }

        var normalizedQuery = parsedSearch.Query;
        var condensedQuery = CondenseSearchValue(normalizedQuery);
        var queryTokens = TokenizeSearchValue(normalizedQuery);
        var reversedQuery = queryTokens.Count > 1 ? string.Join(" ", queryTokens.AsEnumerable().Reverse()) : string.Empty;
        var existingFriendIds = await _context.Friendships
            .AsNoTracking()
            .Where(item => item.UserLowId == currentUserId || item.UserHighId == currentUserId)
            .Select(item => item.UserLowId == currentUserId ? item.UserHighId : item.UserLowId)
            .Distinct()
            .ToListAsync();
        var pendingFriendIds = (await _friendRequestService.GetPendingRelatedUserIdsAsync(currentUserId)).ToList();

        var usersQuery = _context.Users
            .AsNoTracking()
            .Where(item => item.id != currentUserId && !existingFriendIds.Contains(item.id) && !pendingFriendIds.Contains(item.id))
            .Select(item => new
            {
                id = item.id,
                first_name = item.first_name,
                last_name = item.last_name,
                nickname = item.nickname,
                email = item.email,
                avatar_url = item.avatar_url ?? string.Empty,
                last_seen_at = item.last_seen_at,
                directChannelId = BuildDirectChannelId(currentUserId, item.id)
            });

        var candidates = parsedSearch.Mode == FriendSearchMode.Email
            ? await usersQuery
                .Where(item => (item.email ?? string.Empty).ToLower().Contains(normalizedQuery))
                .ToListAsync()
            : await usersQuery
                .Where(item =>
                    item.nickname.ToLower().Contains(normalizedQuery) ||
                    item.first_name.ToLower().Contains(normalizedQuery) ||
                    item.last_name.ToLower().Contains(normalizedQuery) ||
                    (item.nickname + " " + item.first_name).ToLower().Contains(normalizedQuery) ||
                    (item.first_name + " " + item.last_name).ToLower().Contains(normalizedQuery) ||
                    (item.last_name + " " + item.first_name).ToLower().Contains(normalizedQuery) ||
                    (item.first_name + item.last_name).ToLower().Contains(condensedQuery) ||
                    (!string.IsNullOrWhiteSpace(reversedQuery) && (item.last_name + " " + item.first_name).ToLower().Contains(reversedQuery)))
                .ToListAsync();

        var result = candidates
            .OrderBy(item => parsedSearch.Mode == FriendSearchMode.Email
                ? GetEmailSearchRank(item.email, normalizedQuery)
                : GetNameSearchRank(item.first_name, item.last_name, normalizedQuery, condensedQuery, queryTokens))
            .ThenBy(item => item.first_name, StringComparer.OrdinalIgnoreCase)
            .ThenBy(item => item.last_name, StringComparer.OrdinalIgnoreCase)
            .Take(20)
            .ToList();

        return Ok(result.Select(item => new
        {
            item.id,
            item.first_name,
            item.last_name,
            item.nickname,
            item.email,
            item.avatar_url,
            item.last_seen_at,
            is_online = _userPresenceService.IsOnline(item.id.ToString()),
            presence = _userPresenceService.IsOnline(item.id.ToString()) ? "online" : "offline",
            item.directChannelId
        }));
    }

    [HttpPost("add")]
    public async Task<IActionResult> AddFriend([FromBody] AddFriendRequest request)
    {
        if (!TryGetCurrentUserId(out var currentUserId))
        {
            return Unauthorized();
        }

        var email = request?.Email?.Trim().ToLowerInvariant();
        if (string.IsNullOrWhiteSpace(email) && request?.UserId is null)
        {
            return BadRequest(new { message = "Нужно выбрать пользователя для добавления." });
        }

        var friend = request?.UserId is int userId
            ? await _context.Users.AsNoTracking().FirstOrDefaultAsync(item => item.id == userId)
            : await _context.Users.AsNoTracking().FirstOrDefaultAsync(item => (item.email ?? string.Empty).ToLower() == email);

        if (friend is null)
        {
            return NotFound(new { message = "Пользователь не найден." });
        }

        if (friend.id == currentUserId)
        {
            return BadRequest(new { message = "Нельзя добавить самого себя." });
        }

        var result = await _friendRequestService.CreateOrAcceptRequestAsync(currentUserId, friend.id);

        if (result.Status == FriendRequestActionStatuses.AlreadyFriends)
        {
            return Ok(new
            {
                status = FriendRequestActionStatuses.AlreadyFriends,
                friend = BuildFriendPayload(friend, currentUserId)
            });
        }

        if (result.Status == FriendRequestActionStatuses.AlreadyRequested)
        {
            return Ok(new
            {
                status = FriendRequestActionStatuses.AlreadyRequested,
                userId = friend.id
            });
        }

        await BroadcastFriendRequestsUpdatedAsync(currentUserId, friend.id);

        if (result.Status == FriendRequestActionStatuses.AutoAccepted)
        {
            await BroadcastFriendListUpdatedAsync(currentUserId, friend.id);
            return Ok(new
            {
                status = FriendRequestActionStatuses.AutoAccepted,
                friend = BuildFriendPayload(friend, currentUserId)
            });
        }

        return Ok(new
        {
            status = FriendRequestActionStatuses.RequestSent,
            requestId = result.Request?.Id,
            userId = friend.id
        });
    }

    [HttpGet("requests")]
    public async Task<IActionResult> GetIncomingFriendRequests()
    {
        if (!TryGetCurrentUserId(out var currentUserId))
        {
            return Unauthorized();
        }

        var requests = await _friendRequestService.GetIncomingPendingRequestsAsync(currentUserId);
        var senderIds = requests.Select(item => item.SenderUserId).Distinct().ToList();
        var senders = await _context.Users
            .AsNoTracking()
            .Where(item => senderIds.Contains(item.id))
            .ToDictionaryAsync(item => item.id);

        var result = requests
            .Where(item => senders.ContainsKey(item.SenderUserId))
            .Select(item => BuildFriendRequestPayload(item, senders[item.SenderUserId]))
            .ToList();

        return Ok(result);
    }

    [HttpPost("requests/{requestId:int}/accept")]
    public async Task<IActionResult> AcceptFriendRequest([FromRoute] int requestId)
    {
        if (!TryGetCurrentUserId(out var currentUserId))
        {
            return Unauthorized();
        }

        var result = await _friendRequestService.AcceptRequestAsync(requestId, currentUserId);
        if (result is null)
        {
            return NotFound(new { message = "Заявка не найдена." });
        }

        var sender = await _context.Users
            .AsNoTracking()
            .FirstOrDefaultAsync(item => item.id == result.Request.SenderUserId);

        if (sender is null)
        {
            return NotFound(new { message = "Пользователь не найден." });
        }

        await BroadcastFriendRequestsUpdatedAsync(result.Request.SenderUserId, result.Request.ReceiverUserId);
        await BroadcastFriendListUpdatedAsync(result.Request.SenderUserId, result.Request.ReceiverUserId);

        return Ok(new
        {
            status = FriendRequestActionStatuses.Accepted,
            friend = BuildFriendPayload(sender, currentUserId)
        });
    }

    [HttpPost("requests/{requestId:int}/decline")]
    public async Task<IActionResult> DeclineFriendRequest([FromRoute] int requestId)
    {
        if (!TryGetCurrentUserId(out var currentUserId))
        {
            return Unauthorized();
        }

        var result = await _friendRequestService.DeclineRequestAsync(requestId, currentUserId);
        if (result is null)
        {
            return NotFound(new { message = "Заявка не найдена." });
        }

        await BroadcastFriendRequestsUpdatedAsync(result.Request.SenderUserId, result.Request.ReceiverUserId);

        return Ok(new
        {
            status = FriendRequestActionStatuses.Declined,
            requestId = result.Request.Id
        });
    }

    private bool TryGetCurrentUserId(out int currentUserId)
    {
        currentUserId = 0;
        return AuthenticatedUserAccessor.TryGetAuthenticatedUser(User, out var currentUser) &&
               int.TryParse(currentUser.UserId, out currentUserId);
    }

    private static string BuildDirectChannelId(int firstUserId, int secondUserId)
    {
        return DirectMessageChannels.BuildChannelId(firstUserId, secondUserId);
    }

    private async Task<Dictionary<int, UserIntegrationRecord>> LoadActiveActivitiesAsync(IEnumerable<int> userIds)
    {
        var normalizedUserIds = userIds.Distinct().ToList();
        if (normalizedUserIds.Count == 0)
        {
            return [];
        }

        var records = await _context.UserIntegrations
            .AsNoTracking()
            .Where(item =>
                normalizedUserIds.Contains(item.UserId) &&
                item.DisplayInProfile &&
                item.UseAsStatus &&
                item.ActivityTitle != string.Empty)
            .ToListAsync();

        return records
            .GroupBy(item => item.UserId)
            .ToDictionary(
                group => group.Key,
                group => group
                    .OrderByDescending(item => item.ActivityUpdatedAt ?? item.UpdatedAt)
                    .First());
    }

    private async Task<Dictionary<int, int>> BuildDirectUnreadCountsAsync(int currentUserId, IReadOnlyCollection<int> friendIds)
    {
        if (friendIds.Count == 0)
        {
            return new Dictionary<int, int>();
        }

        var channelFriendLookup = new Dictionary<string, int>(StringComparer.OrdinalIgnoreCase);
        foreach (var friendId in friendIds)
        {
            var channelId = BuildDirectChannelId(currentUserId, friendId);
            foreach (var equivalentChannelId in DirectMessageChannels.GetEquivalentChannelIds(channelId))
            {
                channelFriendLookup[equivalentChannelId] = friendId;
            }
        }

        if (channelFriendLookup.Count == 0)
        {
            return new Dictionary<int, int>();
        }

        var channelIds = channelFriendLookup.Keys.ToArray();
        var unreadMessages = await _context.Messages
            .AsNoTracking()
            .Where(message => channelIds.Contains(message.ChannelId) && !message.IsDeleted && message.ReadAt == null)
            .Select(message => new
            {
                message.ChannelId,
                message.Content,
                message.EncryptedContent
            })
            .ToListAsync();

        var counts = new Dictionary<int, int>();
        var currentUserKey = currentUserId.ToString();
        foreach (var message in unreadMessages)
        {
            if (!channelFriendLookup.TryGetValue(message.ChannelId, out var friendId))
            {
                continue;
            }

            var payload = DeserializePayload(GetRawPayload(message.Content, message.EncryptedContent));
            if (string.Equals(payload.AuthorUserId, currentUserKey, StringComparison.Ordinal))
            {
                continue;
            }

            counts[friendId] = counts.TryGetValue(friendId, out var count)
                ? Math.Min(999, count + 1)
                : 1;
        }

        return counts;
    }

    private string GetRawPayload(string? content, string? encryptedContent)
    {
        if (string.IsNullOrWhiteSpace(encryptedContent))
        {
            return content ?? string.Empty;
        }

        try
        {
            return _crypto.Decrypt(encryptedContent);
        }
        catch
        {
            return content ?? string.Empty;
        }
    }

    private static ChatMessagePayload DeserializePayload(string raw)
    {
        if (string.IsNullOrWhiteSpace(raw))
        {
            return new ChatMessagePayload();
        }

        if (!raw.StartsWith(MessagePayloadPrefix, StringComparison.Ordinal))
        {
            return new ChatMessagePayload { Message = raw };
        }

        try
        {
            return JsonSerializer.Deserialize<ChatMessagePayload>(raw[MessagePayloadPrefix.Length..]) ?? new ChatMessagePayload();
        }
        catch
        {
            return new ChatMessagePayload { Message = raw };
        }
    }

    private object BuildFriendPayload(
        User friend,
        int currentUserId,
        IReadOnlyDictionary<int, UserIntegrationRecord>? activityByUserId = null,
        int unreadCount = 0)
    {
        var isOnline = _userPresenceService.IsOnline(friend.id.ToString());
        UserIntegrationRecord? activity = null;
        activityByUserId?.TryGetValue(friend.id, out activity);
        return new
        {
            id = friend.id,
            first_name = friend.first_name,
            last_name = friend.last_name,
            nickname = friend.nickname,
            email = friend.email,
            avatar_url = friend.avatar_url ?? string.Empty,
            is_online = isOnline,
            presence = isOnline ? "online" : "offline",
            last_seen_at = friend.last_seen_at,
            activity = BuildActivityPayload(activity),
            directChannelId = BuildDirectChannelId(currentUserId, friend.id),
            unreadCount = Math.Clamp(unreadCount, 0, 999)
        };
    }

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

    private object BuildFriendRequestPayload(FriendRequestRecord request, User sender)
    {
        var isOnline = _userPresenceService.IsOnline(sender.id.ToString());
        return new
        {
            id = request.Id,
            status = request.Status,
            created_at = request.CreatedAt,
            sender = new
            {
                id = sender.id,
                first_name = sender.first_name,
                last_name = sender.last_name,
                nickname = sender.nickname,
                email = sender.email,
                avatar_url = sender.avatar_url ?? string.Empty,
                is_online = isOnline,
                presence = isOnline ? "online" : "offline",
                last_seen_at = sender.last_seen_at
            }
        };
    }

    private static int GetNameSearchRank(string? firstName, string? lastName, string query, string condensedQuery, IReadOnlyList<string> queryTokens)
    {
        var first = NormalizeSearchValue(firstName);
        var last = NormalizeSearchValue(lastName);
        var full = $"{first} {last}".Trim();
        var reverse = $"{last} {first}".Trim();
        var condensedFull = CondenseSearchValue(full);

        if (full == query || reverse == query)
        {
            return 0;
        }

        if ((!string.IsNullOrWhiteSpace(first) && first.StartsWith(query, StringComparison.Ordinal)) ||
            (!string.IsNullOrWhiteSpace(last) && last.StartsWith(query, StringComparison.Ordinal)))
        {
            return 1;
        }

        if (!string.IsNullOrWhiteSpace(condensedQuery) && condensedFull == condensedQuery)
        {
            return 2;
        }

        if (queryTokens.Count > 1 && queryTokens.All(token =>
                first.Contains(token, StringComparison.Ordinal) ||
                last.Contains(token, StringComparison.Ordinal) ||
                full.Contains(token, StringComparison.Ordinal) ||
                reverse.Contains(token, StringComparison.Ordinal)))
        {
            return 3;
        }

        if (full.Contains(query, StringComparison.Ordinal) ||
            reverse.Contains(query, StringComparison.Ordinal) ||
            first.Contains(query, StringComparison.Ordinal) ||
            last.Contains(query, StringComparison.Ordinal))
        {
            return 4;
        }

        if (!string.IsNullOrWhiteSpace(condensedQuery) && condensedFull.Contains(condensedQuery, StringComparison.Ordinal))
        {
            return 5;
        }

        return 6;
    }

    private static int GetEmailSearchRank(string? email, string query)
    {
        var mail = NormalizeSearchValue(email);
        if (mail == query)
        {
            return 0;
        }

        if (mail.StartsWith(query, StringComparison.Ordinal))
        {
            return 1;
        }

        var localPart = mail.Split('@', 2, StringSplitOptions.TrimEntries)[0];
        if (!string.IsNullOrWhiteSpace(localPart) && localPart.StartsWith(query, StringComparison.Ordinal))
        {
            return 2;
        }

        if (!string.IsNullOrWhiteSpace(localPart) && localPart.Contains(query, StringComparison.Ordinal))
        {
            return 3;
        }

        if (mail.Contains(query, StringComparison.Ordinal))
        {
            return 4;
        }

        return 5;
    }

    private static string NormalizeSearchValue(string? value)
    {
        return (value ?? string.Empty).Trim().ToLowerInvariant();
    }

    private static string CondenseSearchValue(string? value)
    {
        return string.Concat(NormalizeSearchValue(value).Where(character => !char.IsWhiteSpace(character)));
    }

    private static IReadOnlyList<string> TokenizeSearchValue(string? value)
    {
        return NormalizeSearchValue(value)
            .Split(' ', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
            .Distinct(StringComparer.Ordinal)
            .ToArray();
    }

    private static ParsedFriendSearch ParseFriendSearch(string? query, string? mode)
    {
        var rawQuery = (query ?? string.Empty).Trim();
        var effectiveMode = string.Equals(mode, "email", StringComparison.OrdinalIgnoreCase) || rawQuery.StartsWith("@", StringComparison.Ordinal)
            ? FriendSearchMode.Email
            : FriendSearchMode.Name;

        var normalizedQuery = effectiveMode == FriendSearchMode.Email
            ? rawQuery.TrimStart('@').Trim().ToLowerInvariant()
            : rawQuery.ToLowerInvariant();

        return new ParsedFriendSearch(effectiveMode, normalizedQuery);
    }

    private async Task BroadcastFriendListUpdatedAsync(int firstUserId, int secondUserId)
    {
        var payload = new
        {
            firstUserId,
            secondUserId,
            directChannelId = BuildDirectChannelId(firstUserId, secondUserId)
        };

        await _chatHubContext.Clients.Users(firstUserId.ToString(), secondUserId.ToString())
            .SendAsync("FriendListUpdated", payload);
    }

    private async Task BroadcastFriendRequestsUpdatedAsync(int firstUserId, int secondUserId)
    {
        var payload = new
        {
            firstUserId,
            secondUserId
        };

        await _chatHubContext.Clients.Users(firstUserId.ToString(), secondUserId.ToString())
            .SendAsync("FriendRequestsUpdated", payload);
    }
}

internal enum FriendSearchMode
{
    Name = 0,
    Email = 1
}

internal readonly record struct ParsedFriendSearch(FriendSearchMode Mode, string Query);

public class AddFriendRequest
{
    public string Email { get; set; } = string.Empty;
    public int? UserId { get; set; }
}
