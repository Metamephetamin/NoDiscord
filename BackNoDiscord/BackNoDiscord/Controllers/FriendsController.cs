using BackNoDiscord.Infrastructure;
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
    private readonly UserBlockService _userBlockService;
    private readonly UserPresenceService _userPresenceService;
    private readonly CryptoService _crypto;
    private readonly AbuseAutoBanService _abuseAutoBan;
    private readonly UserLocationPrivacyService _locationPrivacy;
    private const string MessagePayloadPrefix = "__CHAT_PAYLOAD__:";
    private const int FriendSearchCandidateLimit = 200;

    public FriendsController(
        AppDbContext context,
        IHubContext<ChatHub> chatHubContext,
        FriendRequestService friendRequestService,
        UserBlockService userBlockService,
        UserPresenceService userPresenceService,
        CryptoService crypto,
        AbuseAutoBanService abuseAutoBan,
        UserLocationPrivacyService locationPrivacy)
    {
        _context = context;
        _chatHubContext = chatHubContext;
        _friendRequestService = friendRequestService;
        _userBlockService = userBlockService;
        _userPresenceService = userPresenceService;
        _crypto = crypto;
        _abuseAutoBan = abuseAutoBan;
        _locationPrivacy = locationPrivacy;
    }

    [HttpGet]
    public async Task<IActionResult> GetFriends(CancellationToken cancellationToken)
    {
        if (!TryGetCurrentUserId(out var currentUserId))
        {
            return Unauthorized();
        }

        var friendships = await _context.Friendships
            .AsNoTracking()
            .Where(item => item.UserLowId == currentUserId || item.UserHighId == currentUserId)
            .OrderByDescending(item => item.CreatedAt)
            .ToListAsync(cancellationToken);

        var friendIds = friendships
            .Select(item => item.UserLowId == currentUserId ? item.UserHighId : item.UserLowId)
            .Distinct()
            .ToList();

        var users = await _context.Users
            .AsNoTracking()
            .Where(item => friendIds.Contains(item.id))
            .ToDictionaryAsync(item => item.id, cancellationToken);
        var activityByUserId = await LoadActiveActivitiesAsync(friendIds, cancellationToken);
        var unreadCountsByFriendId = await BuildDirectUnreadCountsAsync(currentUserId, friendIds, cancellationToken);
        var lastMessageAtByFriendId = await BuildDirectLastMessageTimestampsAsync(currentUserId, friendIds, cancellationToken);
        var mutualFriendCountsByFriendId = await BuildMutualFriendCountsAsync(currentUserId, friendIds, cancellationToken);
        var blockStateByUserId = await LoadBlockStatesAsync(currentUserId, friendIds, cancellationToken);
        var friendshipCreatedAtByFriendId = friendships
            .GroupBy(item => item.UserLowId == currentUserId ? item.UserHighId : item.UserLowId)
            .ToDictionary(group => group.Key, group => group.Max(item => item.CreatedAt));

        var result = friendships
            .Select(item => item.UserLowId == currentUserId ? item.UserHighId : item.UserLowId)
            .Distinct()
            .Where(friendId => users.ContainsKey(friendId))
            .Select(friendId => BuildFriendPayload(
                users[friendId],
                currentUserId,
                activityByUserId,
                unreadCountsByFriendId.TryGetValue(friendId, out var unreadCount) ? unreadCount : 0,
                lastMessageAtByFriendId.TryGetValue(friendId, out var lastMessageAt) ? lastMessageAt : null,
                mutualFriendCountsByFriendId.TryGetValue(friendId, out var mutualFriendCount) ? mutualFriendCount : 0,
                friendshipCreatedAtByFriendId.TryGetValue(friendId, out var friendshipCreatedAt) ? friendshipCreatedAt : null,
                blockStateByUserId.TryGetValue(friendId, out var blockState) ? blockState : null));

        return Ok(result);
    }

    [HttpGet("search")]
    public async Task<IActionResult> SearchFriends([FromQuery] string? q, [FromQuery] string? mode, CancellationToken cancellationToken)
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
        var existingFriendIds = (await _context.Friendships
            .AsNoTracking()
            .Where(item => item.UserLowId == currentUserId || item.UserHighId == currentUserId)
            .Select(item => item.UserLowId == currentUserId ? item.UserHighId : item.UserLowId)
            .Distinct()
            .ToListAsync(cancellationToken))
            .ToHashSet();
        var pendingRequestsByUserId = (await _context.FriendRequests
            .AsNoTracking()
            .Where(item =>
                item.Status == FriendRequestStatuses.Pending &&
                (item.UserLowId == currentUserId || item.UserHighId == currentUserId))
            .ToListAsync(cancellationToken))
            .GroupBy(item => item.UserLowId == currentUserId ? item.UserHighId : item.UserLowId)
            .ToDictionary(group => group.Key, group => group.OrderByDescending(item => item.CreatedAt).First());

        var usersQuery = _context.Users
            .AsNoTracking()
            .Where(item => item.id != currentUserId)
            .Select(item => new
            {
                id = item.id,
                first_name = item.first_name,
                last_name = item.last_name,
                nickname = item.nickname,
                email = item.email,
                avatar_url = item.avatar_url ?? string.Empty,
                avatar_frame_json = item.avatar_frame_json,
                profile_background_url = item.profile_background_url,
                profile_background_frame_json = item.profile_background_frame_json,
                profile_customization_json = item.profile_customization_json,
                last_seen_at = item.last_seen_at,
                directChannelId = BuildDirectChannelId(currentUserId, item.id)
            });

        var candidates = parsedSearch.Mode == FriendSearchMode.Email
            ? await usersQuery
                .Where(item => (item.email ?? string.Empty).ToLower().Contains(normalizedQuery))
                .OrderBy(item => item.email)
                .ThenBy(item => item.id)
                .Take(FriendSearchCandidateLimit)
                .ToListAsync(cancellationToken)
            : await usersQuery
                .Where(item =>
                    item.nickname.ToLower().Contains(normalizedQuery) ||
                    item.first_name.ToLower().Contains(normalizedQuery) ||
                    item.last_name.ToLower().Contains(normalizedQuery) ||
                    (item.email ?? string.Empty).ToLower().Contains(normalizedQuery) ||
                    (item.nickname + " " + item.first_name).ToLower().Contains(normalizedQuery) ||
                    (item.first_name + " " + item.last_name).ToLower().Contains(normalizedQuery) ||
                    (item.last_name + " " + item.first_name).ToLower().Contains(normalizedQuery) ||
                    (item.first_name + item.last_name).ToLower().Contains(condensedQuery) ||
                    (!string.IsNullOrWhiteSpace(reversedQuery) && (item.last_name + " " + item.first_name).ToLower().Contains(reversedQuery)))
                .OrderBy(item => item.first_name)
                .ThenBy(item => item.last_name)
                .ThenBy(item => item.id)
                .Take(FriendSearchCandidateLimit)
                .ToListAsync(cancellationToken);

        var result = candidates
            .OrderBy(item => parsedSearch.Mode == FriendSearchMode.Email
                ? GetEmailSearchRank(item.email, normalizedQuery)
                : GetNameSearchRank(item.first_name, item.last_name, normalizedQuery, condensedQuery, queryTokens))
            .ThenBy(item => item.first_name, StringComparer.OrdinalIgnoreCase)
            .ThenBy(item => item.last_name, StringComparer.OrdinalIgnoreCase)
            .Take(20)
            .ToList();
        var blockStateByUserId = await LoadBlockStatesAsync(currentUserId, result.Select(item => item.id), cancellationToken);

        return Ok(result.Select(item => new
        {
            item.id,
            item.first_name,
            item.last_name,
            item.nickname,
            item.email,
            item.avatar_url,
            avatar_frame = MediaFrameSerializer.Parse(item.avatar_frame_json, allowNull: true),
            profile_background_url = item.profile_background_url ?? string.Empty,
            profile_background_frame = MediaFrameSerializer.Parse(item.profile_background_frame_json, allowNull: true),
            profile_customization = ParseProfileCustomization(item.profile_customization_json),
            item.last_seen_at,
            is_online = _userPresenceService.IsOnline(item.id.ToString()),
            presence = _userPresenceService.IsOnline(item.id.ToString()) ? "online" : "offline",
            item.directChannelId,
            isBlocked = blockStateByUserId.TryGetValue(item.id, out var blockState) && blockState.CurrentUserBlockedTarget,
            blockedYou = blockStateByUserId.TryGetValue(item.id, out blockState) && blockState.TargetBlockedCurrentUser,
            friendshipStatus = existingFriendIds.Contains(item.id)
                ? "friend"
                : pendingRequestsByUserId.TryGetValue(item.id, out var pendingRequest)
                    ? pendingRequest.SenderUserId == currentUserId ? "pending_outgoing" : "pending_incoming"
                    : "none",
            friendRequestId = pendingRequestsByUserId.TryGetValue(item.id, out var request) ? request.Id : 0
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

        var blockState = await _userBlockService.GetBlockStateAsync(currentUserId, friend.id, HttpContext.RequestAborted);
        if (blockState.CurrentUserBlockedTarget)
        {
            return BadRequest(new { message = UserBlockService.YouBlockedTargetMessage });
        }

        if (blockState.TargetBlockedCurrentUser)
        {
            return BadRequest(new { message = UserBlockService.BlockedByTargetMessage });
        }

        var result = await _friendRequestService.CreateOrAcceptRequestAsync(currentUserId, friend.id);
        if (result.Status == FriendRequestActionStatuses.RequestSent)
        {
            var autoBan = await _abuseAutoBan.RecordOutgoingFriendRequestAsync(
                currentUserId,
                DateTimeOffset.UtcNow,
                HttpContext.RequestAborted);
            if (autoBan.IsBanned)
            {
                return StatusCode(StatusCodes.Status403Forbidden, new
                {
                    code = "account_banned",
                    message = "Аккаунт заблокирован за массовую рассылку заявок."
                });
            }
        }

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
    public async Task<IActionResult> GetFriendRequests(CancellationToken cancellationToken)
    {
        if (!TryGetCurrentUserId(out var currentUserId))
        {
            return Unauthorized();
        }

        var incomingRequests = await _friendRequestService.GetIncomingPendingRequestsAsync(currentUserId, cancellationToken);
        var outgoingRequests = await _friendRequestService.GetOutgoingPendingRequestsAsync(currentUserId, cancellationToken);
        var relatedUserIds = incomingRequests
            .Select(item => item.SenderUserId)
            .Concat(outgoingRequests.Select(item => item.ReceiverUserId))
            .Distinct()
            .ToList();
        var relatedUsers = await _context.Users
            .AsNoTracking()
            .Where(item => relatedUserIds.Contains(item.id))
            .ToDictionaryAsync(item => item.id, cancellationToken);

        var result = new
        {
            incoming = incomingRequests
                .Where(item => relatedUsers.ContainsKey(item.SenderUserId))
                .Select(item => BuildFriendRequestPayload(item, relatedUsers[item.SenderUserId], "incoming"))
                .ToList(),
            outgoing = outgoingRequests
                .Where(item => relatedUsers.ContainsKey(item.ReceiverUserId))
                .Select(item => BuildFriendRequestPayload(item, relatedUsers[item.ReceiverUserId], "outgoing"))
                .ToList()
        };

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

    [HttpDelete("{targetUserId:int}")]
    public async Task<IActionResult> RemoveFriend([FromRoute] int targetUserId, CancellationToken cancellationToken)
    {
        if (!TryGetCurrentUserId(out var currentUserId))
        {
            return Unauthorized();
        }

        if (targetUserId <= 0 || targetUserId == currentUserId)
        {
            return BadRequest(new { message = "Нельзя удалить этого пользователя из друзей." });
        }

        var lowId = Math.Min(currentUserId, targetUserId);
        var highId = Math.Max(currentUserId, targetUserId);
        var friendship = await _context.Friendships
            .FirstOrDefaultAsync(item => item.UserLowId == lowId && item.UserHighId == highId, cancellationToken);

        if (friendship is null)
        {
            return Ok(new
            {
                status = "not_friends",
                targetUserId,
                directChannelId = BuildDirectChannelId(currentUserId, targetUserId)
            });
        }

        _context.Friendships.Remove(friendship);
        await _context.SaveChangesAsync(cancellationToken);
        await BroadcastFriendListUpdatedAsync(currentUserId, targetUserId);

        return Ok(new
        {
            status = "removed",
            targetUserId,
            directChannelId = BuildDirectChannelId(currentUserId, targetUserId)
        });
    }

    [HttpGet("blocks")]
    public async Task<IActionResult> GetBlocks(CancellationToken cancellationToken)
    {
        if (!TryGetCurrentUserId(out var currentUserId))
        {
            return Unauthorized();
        }

        var blocks = await _context.UserBlocks
            .AsNoTracking()
            .Where(item => item.BlockerUserId == currentUserId || item.BlockedUserId == currentUserId)
            .Select(item => new { item.BlockerUserId, item.BlockedUserId })
            .ToListAsync(cancellationToken);

        return Ok(new
        {
            blockedIds = blocks
                .Where(item => item.BlockerUserId == currentUserId)
                .Select(item => item.BlockedUserId)
                .Distinct()
                .ToList(),
            blockedByIds = blocks
                .Where(item => item.BlockedUserId == currentUserId)
                .Select(item => item.BlockerUserId)
                .Distinct()
                .ToList()
        });
    }

    [HttpPost("{targetUserId:int}/block")]
    public async Task<IActionResult> BlockUser([FromRoute] int targetUserId, CancellationToken cancellationToken)
    {
        if (!TryGetCurrentUserId(out var currentUserId))
        {
            return Unauthorized();
        }

        if (targetUserId <= 0 || targetUserId == currentUserId)
        {
            return BadRequest(new { message = "Нельзя заблокировать этого пользователя." });
        }

        var targetExists = await _context.Users
            .AsNoTracking()
            .AnyAsync(item => item.id == targetUserId, cancellationToken);
        if (!targetExists)
        {
            return NotFound(new { message = "Пользователь не найден." });
        }

        var blockState = await _userBlockService.BlockAsync(currentUserId, targetUserId, cancellationToken);
        await BroadcastFriendListUpdatedAsync(currentUserId, targetUserId);

        return Ok(new
        {
            targetUserId,
            isBlocked = blockState.CurrentUserBlockedTarget,
            blockedYou = blockState.TargetBlockedCurrentUser
        });
    }

    [HttpDelete("{targetUserId:int}/block")]
    public async Task<IActionResult> UnblockUser([FromRoute] int targetUserId, CancellationToken cancellationToken)
    {
        if (!TryGetCurrentUserId(out var currentUserId))
        {
            return Unauthorized();
        }

        if (targetUserId <= 0 || targetUserId == currentUserId)
        {
            return BadRequest(new { message = "Нельзя разблокировать этого пользователя." });
        }

        var blockState = await _userBlockService.UnblockAsync(currentUserId, targetUserId, cancellationToken);
        await BroadcastFriendListUpdatedAsync(currentUserId, targetUserId);

        return Ok(new
        {
            targetUserId,
            isBlocked = blockState.CurrentUserBlockedTarget,
            blockedYou = blockState.TargetBlockedCurrentUser
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

    private async Task<Dictionary<int, UserIntegrationRecord>> LoadActiveActivitiesAsync(IEnumerable<int> userIds, CancellationToken cancellationToken)
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
            .ToListAsync(cancellationToken);

        return records
            .GroupBy(item => item.UserId)
            .ToDictionary(
                group => group.Key,
                group => group
                    .OrderByDescending(item => item.ActivityUpdatedAt ?? item.UpdatedAt)
                    .First());
    }

    private async Task<Dictionary<int, int>> BuildDirectUnreadCountsAsync(int currentUserId, IReadOnlyCollection<int> friendIds, CancellationToken cancellationToken)
    {
        if (friendIds.Count == 0)
        {
            return new Dictionary<int, int>();
        }

        var channelFriendLookup = BuildDirectChannelFriendLookup(currentUserId, friendIds);
        if (channelFriendLookup.Count == 0)
        {
            return new Dictionary<int, int>();
        }

        var channelIds = channelFriendLookup.Keys.ToArray();
        var unreadMessages = await _context.Messages
            .AsNoTracking()
            .Where(message =>
                channelIds.Contains(message.ChannelId) &&
                !message.IsDeleted &&
                message.ReadAt == null &&
                (message.AuthorUserId == null || message.AuthorUserId != currentUserId.ToString()))
            .Select(message => new
            {
                message.ChannelId,
                message.AuthorUserId,
                message.Content,
                message.EncryptedContent
            })
            .ToListAsync(cancellationToken);

        var counts = new Dictionary<int, int>();
        var currentUserKey = currentUserId.ToString();
        foreach (var message in unreadMessages)
        {
            if (!channelFriendLookup.TryGetValue(message.ChannelId, out var friendId))
            {
                continue;
            }

            if (string.IsNullOrWhiteSpace(message.AuthorUserId))
            {
                var payload = DeserializePayload(GetRawPayload(message.Content, message.EncryptedContent));
                if (string.Equals(payload.AuthorUserId, currentUserKey, StringComparison.Ordinal))
                {
                    continue;
                }
            }

            counts[friendId] = counts.TryGetValue(friendId, out var count)
                ? Math.Min(999, count + 1)
                : 1;
        }

        return counts;
    }

    private async Task<Dictionary<int, DateTime>> BuildDirectLastMessageTimestampsAsync(int currentUserId, IReadOnlyCollection<int> friendIds, CancellationToken cancellationToken)
    {
        if (friendIds.Count == 0)
        {
            return new Dictionary<int, DateTime>();
        }

        var channelFriendLookup = BuildDirectChannelFriendLookup(currentUserId, friendIds);
        if (channelFriendLookup.Count == 0)
        {
            return new Dictionary<int, DateTime>();
        }

        var channelIds = channelFriendLookup.Keys.ToArray();
        var latestByChannel = await _context.Messages
            .AsNoTracking()
            .Where(message => channelIds.Contains(message.ChannelId) && !message.IsDeleted)
            .GroupBy(message => message.ChannelId)
            .Select(group => new
            {
                ChannelId = group.Key,
                Timestamp = group.Max(message => message.Timestamp)
            })
            .ToListAsync(cancellationToken);

        var latestByFriend = new Dictionary<int, DateTime>();
        foreach (var item in latestByChannel)
        {
            if (!channelFriendLookup.TryGetValue(item.ChannelId, out var friendId))
            {
                continue;
            }

            if (!latestByFriend.TryGetValue(friendId, out var previousTimestamp) || item.Timestamp > previousTimestamp)
            {
                latestByFriend[friendId] = item.Timestamp;
            }
        }

        return latestByFriend;
    }

    private async Task<Dictionary<int, int>> BuildMutualFriendCountsAsync(int currentUserId, IReadOnlyCollection<int> friendIds, CancellationToken cancellationToken)
    {
        var targetFriendIds = friendIds
            .Where(item => item > 0 && item != currentUserId)
            .Distinct()
            .ToArray();
        if (targetFriendIds.Length == 0)
        {
            return new Dictionary<int, int>();
        }

        var targetFriendIdSet = targetFriendIds.ToHashSet();
        var friendLinks = await _context.Friendships
            .AsNoTracking()
            .Where(item => targetFriendIds.Contains(item.UserLowId) || targetFriendIds.Contains(item.UserHighId))
            .Select(item => new { item.UserLowId, item.UserHighId })
            .ToListAsync(cancellationToken);

        var mutualFriendIdsByTarget = targetFriendIds.ToDictionary(
            targetId => targetId,
            _ => new HashSet<int>());

        foreach (var link in friendLinks)
        {
            if (targetFriendIdSet.Contains(link.UserLowId))
            {
                AddMutualFriend(link.UserLowId, link.UserHighId);
            }

            if (targetFriendIdSet.Contains(link.UserHighId))
            {
                AddMutualFriend(link.UserHighId, link.UserLowId);
            }
        }

        return mutualFriendIdsByTarget.ToDictionary(item => item.Key, item => item.Value.Count);

        void AddMutualFriend(int targetId, int candidateFriendId)
        {
            if (candidateFriendId == currentUserId || candidateFriendId == targetId || !targetFriendIdSet.Contains(candidateFriendId))
            {
                return;
            }

            mutualFriendIdsByTarget[targetId].Add(candidateFriendId);
        }
    }

    private static Dictionary<string, int> BuildDirectChannelFriendLookup(int currentUserId, IReadOnlyCollection<int> friendIds)
    {
        var channelFriendLookup = new Dictionary<string, int>(StringComparer.OrdinalIgnoreCase);
        foreach (var friendId in friendIds)
        {
            var channelId = BuildDirectChannelId(currentUserId, friendId);
            foreach (var equivalentChannelId in DirectMessageChannels.GetEquivalentChannelIds(channelId))
            {
                channelFriendLookup[equivalentChannelId] = friendId;
            }
        }

        return channelFriendLookup;
    }

    private async Task<Dictionary<int, UserBlockState>> LoadBlockStatesAsync(int currentUserId, IEnumerable<int> userIds, CancellationToken cancellationToken)
    {
        var normalizedUserIds = userIds
            .Where(item => item > 0 && item != currentUserId)
            .Distinct()
            .ToList();

        if (normalizedUserIds.Count == 0)
        {
            return new Dictionary<int, UserBlockState>();
        }

        var blocks = await _context.UserBlocks
            .AsNoTracking()
            .Where(item =>
                (item.BlockerUserId == currentUserId && normalizedUserIds.Contains(item.BlockedUserId)) ||
                (item.BlockedUserId == currentUserId && normalizedUserIds.Contains(item.BlockerUserId)))
            .Select(item => new { item.BlockerUserId, item.BlockedUserId })
            .ToListAsync(cancellationToken);

        return normalizedUserIds.ToDictionary(
            userId => userId,
            userId => new UserBlockState(
                blocks.Any(item => item.BlockerUserId == currentUserId && item.BlockedUserId == userId),
                blocks.Any(item => item.BlockedUserId == currentUserId && item.BlockerUserId == userId)));
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

    private static object? ParseProfileCustomization(string? rawValue)
    {
        if (string.IsNullOrWhiteSpace(rawValue))
        {
            return null;
        }

        try
        {
            return JsonSerializer.Deserialize<JsonElement>(rawValue);
        }
        catch
        {
            return null;
        }
    }

    private object BuildFriendPayload(
        User friend,
        int currentUserId,
        IReadOnlyDictionary<int, UserIntegrationRecord>? activityByUserId = null,
        int unreadCount = 0,
        DateTime? lastDirectMessageAt = null,
        int mutualFriendsCount = 0,
        DateTimeOffset? friendshipCreatedAt = null,
        UserBlockState? blockState = null)
    {
        var isOnline = _userPresenceService.IsOnline(friend.id.ToString());
        UserIntegrationRecord? activity = null;
        activityByUserId?.TryGetValue(friend.id, out activity);
        var canShowLocation = _locationPrivacy.IsLocationVisible(friend, DateTimeOffset.UtcNow);
        return new
        {
            id = friend.id,
            first_name = friend.first_name,
            last_name = friend.last_name,
            nickname = friend.nickname,
            email = friend.email,
            avatar_url = friend.avatar_url ?? string.Empty,
            avatar_frame = MediaFrameSerializer.Parse(friend.avatar_frame_json, allowNull: true),
            profile_background_url = friend.profile_background_url ?? string.Empty,
            profile_background_frame = MediaFrameSerializer.Parse(friend.profile_background_frame_json, allowNull: true),
            profile_customization = ParseProfileCustomization(friend.profile_customization_json),
            is_online = isOnline,
            presence = isOnline ? "online" : "offline",
            last_seen_at = friend.last_seen_at,
            latitude = canShowLocation ? friend.last_location_latitude : null,
            longitude = canShowLocation ? friend.last_location_longitude : null,
            locationLabel = canShowLocation ? "Последняя локация" : null,
            locationUpdatedAt = canShowLocation ? friend.last_location_updated_at : null,
            activity = isOnline ? BuildActivityPayload(activity) : null,
            directChannelId = BuildDirectChannelId(currentUserId, friend.id),
            unreadCount = Math.Clamp(unreadCount, 0, 999),
            lastDirectMessageAt,
            mutualFriendsCount = Math.Max(0, mutualFriendsCount),
            friendshipCreatedAt,
            isBlocked = blockState?.CurrentUserBlockedTarget ?? false,
            blockedYou = blockState?.TargetBlockedCurrentUser ?? false
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

    private object BuildFriendRequestPayload(FriendRequestRecord request, User relatedUser, string direction)
    {
        var isOutgoing = string.Equals(direction, "outgoing", StringComparison.OrdinalIgnoreCase);
        var isOnline = _userPresenceService.IsOnline(relatedUser.id.ToString());
        var userPayload = new
        {
            id = relatedUser.id,
            first_name = relatedUser.first_name,
            last_name = relatedUser.last_name,
            nickname = relatedUser.nickname,
            email = relatedUser.email,
            avatar_url = relatedUser.avatar_url ?? string.Empty,
            avatar_frame = MediaFrameSerializer.Parse(relatedUser.avatar_frame_json, allowNull: true),
            profile_background_url = relatedUser.profile_background_url ?? string.Empty,
            profile_background_frame = MediaFrameSerializer.Parse(relatedUser.profile_background_frame_json, allowNull: true),
            profile_customization = ParseProfileCustomization(relatedUser.profile_customization_json),
            is_online = isOnline,
            presence = isOnline ? "online" : "offline",
            last_seen_at = relatedUser.last_seen_at
        };

        return new
        {
            id = request.Id,
            status = request.Status,
            direction = isOutgoing ? "outgoing" : "incoming",
            created_at = request.CreatedAt,
            sender = isOutgoing ? null : userPayload,
            receiver = isOutgoing ? userPayload : null
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
