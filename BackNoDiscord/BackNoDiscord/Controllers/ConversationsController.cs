using BackNoDiscord.Security;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;

namespace BackNoDiscord.Controllers;

[ApiController]
[Route("api/conversations")]
[Authorize(AuthenticationSchemes = JwtBearerDefaults.AuthenticationScheme)]
public sealed class ConversationsController : ControllerBase
{
    private const int MaxConversationTitleLength = 120;
    private const int MaxConversationMembers = 24;
    private const int MaxMuteMinutes = 7 * 24 * 60;

    private readonly AppDbContext _context;
    private readonly IHubContext<ChatHub> _chatHubContext;
    private readonly UserPresenceService _userPresenceService;

    public ConversationsController(
        AppDbContext context,
        IHubContext<ChatHub> chatHubContext,
        UserPresenceService userPresenceService)
    {
        _context = context;
        _chatHubContext = chatHubContext;
        _userPresenceService = userPresenceService;
    }

    [HttpGet]
    public async Task<IActionResult> GetConversations(CancellationToken cancellationToken)
    {
        if (!TryGetCurrentUserId(out var currentUserId))
        {
            return Unauthorized();
        }

        var memberships = await _context.GroupConversationMembers
            .AsNoTracking()
            .Where(item => item.UserId == currentUserId && !item.IsBanned)
            .ToListAsync(cancellationToken);

        var conversationIds = memberships
            .Select(item => item.ConversationId)
            .Distinct()
            .ToArray();

        if (conversationIds.Length == 0)
        {
            return Ok(Array.Empty<object>());
        }

        var conversations = await _context.GroupConversations
            .AsNoTracking()
            .Where(item => conversationIds.Contains(item.Id))
            .OrderByDescending(item => item.UpdatedAt)
            .ToListAsync(cancellationToken);

        var members = await _context.GroupConversationMembers
            .AsNoTracking()
            .Where(item => conversationIds.Contains(item.ConversationId))
            .ToListAsync(cancellationToken);

        var users = await LoadUsersAsync(members.Select(item => item.UserId), cancellationToken);

        var payload = conversations
            .Select(conversation => BuildConversationPayload(
                conversation,
                members.Where(item => item.ConversationId == conversation.Id).ToList(),
                users,
                currentUserId))
            .ToList();

        return Ok(payload);
    }

    [HttpPost]
    public async Task<IActionResult> CreateConversation([FromBody] CreateConversationRequest? request, CancellationToken cancellationToken)
    {
        if (!TryGetCurrentUserId(out var currentUserId))
        {
            return Unauthorized();
        }

        var title = NormalizeTitle(request?.Title);
        if (string.IsNullOrWhiteSpace(title))
        {
            return BadRequest(new { message = "Название беседы обязательно." });
        }

        var requestedMemberIds = (request?.MemberUserIds ?? Array.Empty<int>())
            .Where(item => item > 0 && item != currentUserId)
            .Distinct()
            .Take(MaxConversationMembers - 1)
            .ToArray();

        if (requestedMemberIds.Length == 0)
        {
            return BadRequest(new { message = "Выберите хотя бы одного друга для беседы." });
        }

        var allowedFriendIds = await GetFriendIdsAsync(currentUserId, cancellationToken);
        var invalidIds = requestedMemberIds.Where(item => !allowedFriendIds.Contains(item)).ToArray();
        if (invalidIds.Length > 0)
        {
            return BadRequest(new { message = "В беседу можно добавлять только друзей." });
        }

        var now = DateTimeOffset.UtcNow;
        var conversation = new GroupConversationRecord
        {
            OwnerUserId = currentUserId,
            Title = title,
            CreatedAt = now,
            UpdatedAt = now
        };

        _context.GroupConversations.Add(conversation);
        await _context.SaveChangesAsync(cancellationToken);

        var members = new List<GroupConversationMemberRecord>
        {
            new()
            {
                ConversationId = conversation.Id,
                UserId = currentUserId,
                Role = "owner",
                JoinedAt = now,
                AddedByUserId = currentUserId,
                IsBanned = false
            }
        };

        members.AddRange(requestedMemberIds.Select(memberUserId => new GroupConversationMemberRecord
        {
            ConversationId = conversation.Id,
            UserId = memberUserId,
            Role = "member",
            JoinedAt = now,
            AddedByUserId = currentUserId,
            IsBanned = false
        }));

        _context.GroupConversationMembers.AddRange(members);
        await _context.SaveChangesAsync(cancellationToken);

        var users = await LoadUsersAsync(members.Select(item => item.UserId), cancellationToken);
        await BroadcastConversationsUpdatedAsync(members.Select(item => item.UserId), cancellationToken);

        return Ok(BuildConversationPayload(conversation, members, users, currentUserId));
    }

    [HttpPost("{conversationId:int}/members")]
    public async Task<IActionResult> AddMember([FromRoute] int conversationId, [FromBody] AddConversationMemberRequest? request, CancellationToken cancellationToken)
    {
        if (!TryGetCurrentUserId(out var currentUserId))
        {
            return Unauthorized();
        }

        var conversation = await _context.GroupConversations.FirstOrDefaultAsync(item => item.Id == conversationId, cancellationToken);
        if (conversation is null)
        {
            return NotFound(new { message = "Беседа не найдена." });
        }

        if (conversation.OwnerUserId != currentUserId)
        {
            return Forbid();
        }

        var userId = request?.UserId ?? 0;
        if (userId <= 0 || userId == currentUserId)
        {
            return BadRequest(new { message = "Укажите корректного пользователя." });
        }

        var allowedFriendIds = await GetFriendIdsAsync(currentUserId, cancellationToken);
        if (!allowedFriendIds.Contains(userId))
        {
            return BadRequest(new { message = "Добавлять можно только друзей создателя беседы." });
        }

        var existingMember = await _context.GroupConversationMembers
            .FirstOrDefaultAsync(item => item.ConversationId == conversationId && item.UserId == userId, cancellationToken);

        if (existingMember is not null)
        {
            if (existingMember.IsBanned)
            {
                return Conflict(new { message = "Этот участник уже заблокирован в беседе." });
            }

            return Ok(new { status = "already_member" });
        }

        _context.GroupConversationMembers.Add(new GroupConversationMemberRecord
        {
            ConversationId = conversationId,
            UserId = userId,
            Role = "member",
            JoinedAt = DateTimeOffset.UtcNow,
            AddedByUserId = currentUserId,
            IsBanned = false
        });
        conversation.UpdatedAt = DateTimeOffset.UtcNow;
        await _context.SaveChangesAsync(cancellationToken);

        var recipientIds = await GetConversationRecipientIdsAsync(conversationId, includeBanned: false, cancellationToken);
        await BroadcastConversationsUpdatedAsync(recipientIds.Append(userId), cancellationToken);

        return Ok(new { status = "member_added" });
    }

    [HttpPost("{conversationId:int}/members/{userId:int}/mute")]
    public async Task<IActionResult> MuteMember([FromRoute] int conversationId, [FromRoute] int userId, [FromBody] MuteConversationMemberRequest? request, CancellationToken cancellationToken)
    {
        if (!TryGetCurrentUserId(out var currentUserId))
        {
            return Unauthorized();
        }

        var conversation = await _context.GroupConversations.FirstOrDefaultAsync(item => item.Id == conversationId, cancellationToken);
        if (conversation is null)
        {
            return NotFound(new { message = "Беседа не найдена." });
        }

        if (conversation.OwnerUserId != currentUserId)
        {
            return Forbid();
        }

        if (userId <= 0 || userId == currentUserId)
        {
            return BadRequest(new { message = "Нельзя замутить создателя беседы." });
        }

        var member = await _context.GroupConversationMembers
            .FirstOrDefaultAsync(item => item.ConversationId == conversationId && item.UserId == userId && !item.IsBanned, cancellationToken);
        if (member is null)
        {
            return NotFound(new { message = "Участник беседы не найден." });
        }

        var muteMinutes = Math.Max(1, Math.Min(MaxMuteMinutes, request?.Minutes ?? 15));
        member.MutedUntil = DateTimeOffset.UtcNow.AddMinutes(muteMinutes);
        conversation.UpdatedAt = DateTimeOffset.UtcNow;
        await _context.SaveChangesAsync(cancellationToken);

        var recipientIds = await GetConversationRecipientIdsAsync(conversationId, includeBanned: false, cancellationToken);
        await BroadcastConversationsUpdatedAsync(recipientIds, cancellationToken);

        return Ok(new { status = "member_muted", mutedUntil = member.MutedUntil });
    }

    [HttpPost("{conversationId:int}/members/{userId:int}/ban")]
    public async Task<IActionResult> BanMember([FromRoute] int conversationId, [FromRoute] int userId, CancellationToken cancellationToken)
    {
        if (!TryGetCurrentUserId(out var currentUserId))
        {
            return Unauthorized();
        }

        var conversation = await _context.GroupConversations.FirstOrDefaultAsync(item => item.Id == conversationId, cancellationToken);
        if (conversation is null)
        {
            return NotFound(new { message = "Беседа не найдена." });
        }

        if (conversation.OwnerUserId != currentUserId)
        {
            return Forbid();
        }

        if (userId <= 0 || userId == currentUserId)
        {
            return BadRequest(new { message = "Нельзя заблокировать создателя беседы." });
        }

        var member = await _context.GroupConversationMembers
            .FirstOrDefaultAsync(item => item.ConversationId == conversationId && item.UserId == userId, cancellationToken);
        if (member is null)
        {
            return NotFound(new { message = "Участник беседы не найден." });
        }

        member.IsBanned = true;
        member.BannedAt = DateTimeOffset.UtcNow;
        member.BannedByUserId = currentUserId;
        member.MutedUntil = null;
        conversation.UpdatedAt = DateTimeOffset.UtcNow;
        await _context.SaveChangesAsync(cancellationToken);

        var activeRecipientIds = await GetConversationRecipientIdsAsync(conversationId, includeBanned: false, cancellationToken);
        await BroadcastConversationsUpdatedAsync(activeRecipientIds.Append(userId), cancellationToken);

        return Ok(new { status = "member_banned" });
    }

    [HttpPost("{conversationId:int}/call/ring")]
    public async Task<IActionResult> RingCall([FromRoute] int conversationId, CancellationToken cancellationToken)
    {
        if (!AuthenticatedUserAccessor.TryGetAuthenticatedUser(User, out var currentUser) ||
            !int.TryParse(currentUser.UserId, out var currentUserId))
        {
            return Unauthorized();
        }

        var conversation = await _context.GroupConversations.FirstOrDefaultAsync(item => item.Id == conversationId, cancellationToken);
        if (conversation is null)
        {
            return NotFound(new { message = "Беседа не найдена." });
        }

        var callerMembership = await _context.GroupConversationMembers
            .AsNoTracking()
            .FirstOrDefaultAsync(item => item.ConversationId == conversationId && item.UserId == currentUserId && !item.IsBanned, cancellationToken);
        if (callerMembership is null)
        {
            return Forbid();
        }

        var voiceChannelId = ConversationChannels.BuildVoiceChannelName(conversationId);
        conversation.ActiveCallChannel = voiceChannelId;
        conversation.ActiveCallStartedAt = DateTimeOffset.UtcNow;
        conversation.UpdatedAt = DateTimeOffset.UtcNow;
        await _context.SaveChangesAsync(cancellationToken);

        var recipientIds = await GetConversationRecipientIdsAsync(conversationId, includeBanned: false, cancellationToken);
        var recipientsWithoutCaller = recipientIds.Where(item => item != currentUserId).Distinct().ToArray();
        if (recipientsWithoutCaller.Length > 0)
        {
            await _chatHubContext.Clients.Users(recipientsWithoutCaller.Select(item => item.ToString())).SendAsync("ConversationCallRing", new
            {
                conversationId,
                targetId = ConversationChannels.BuildChatChannelId(conversationId),
                title = conversation.Title,
                chatChannelId = ConversationChannels.BuildChatChannelId(conversationId),
                voiceChannelId,
                fromUserId = currentUser.UserId,
                fromName = currentUser.DisplayName,
                fromAvatar = UploadPolicies.SanitizeRelativeAssetUrl(currentUser.AvatarUrl, "/avatars/"),
                startedAt = conversation.ActiveCallStartedAt
            }, cancellationToken);
        }

        await BroadcastConversationsUpdatedAsync(recipientIds, cancellationToken);

        return Ok(new
        {
            conversationId,
            chatChannelId = ConversationChannels.BuildChatChannelId(conversationId),
            voiceChannelId,
            title = conversation.Title
        });
    }

    private bool TryGetCurrentUserId(out int currentUserId)
    {
        currentUserId = 0;
        return AuthenticatedUserAccessor.TryGetAuthenticatedUser(User, out var currentUser) &&
               int.TryParse(currentUser.UserId, out currentUserId) &&
               currentUserId > 0;
    }

    private async Task<HashSet<int>> GetFriendIdsAsync(int currentUserId, CancellationToken cancellationToken)
    {
        var friendIds = await _context.Friendships
            .AsNoTracking()
            .Where(item => item.UserLowId == currentUserId || item.UserHighId == currentUserId)
            .Select(item => item.UserLowId == currentUserId ? item.UserHighId : item.UserLowId)
            .Distinct()
            .ToListAsync(cancellationToken);

        return friendIds.ToHashSet();
    }

    private async Task<List<int>> GetConversationRecipientIdsAsync(int conversationId, bool includeBanned, CancellationToken cancellationToken)
    {
        var query = _context.GroupConversationMembers
            .AsNoTracking()
            .Where(item => item.ConversationId == conversationId);

        if (!includeBanned)
        {
            query = query.Where(item => !item.IsBanned);
        }

        return await query
            .Select(item => item.UserId)
            .Distinct()
            .ToListAsync(cancellationToken);
    }

    private async Task<Dictionary<int, User>> LoadUsersAsync(IEnumerable<int> userIds, CancellationToken cancellationToken)
    {
        var normalizedUserIds = userIds
            .Where(item => item > 0)
            .Distinct()
            .ToArray();

        if (normalizedUserIds.Length == 0)
        {
            return [];
        }

        return await _context.Users
            .AsNoTracking()
            .Where(item => normalizedUserIds.Contains(item.id))
            .ToDictionaryAsync(item => item.id, cancellationToken);
    }

    private async Task BroadcastConversationsUpdatedAsync(IEnumerable<int> userIds, CancellationToken cancellationToken)
    {
        var recipients = userIds
            .Where(item => item > 0)
            .Distinct()
            .Select(item => item.ToString())
            .ToArray();

        if (recipients.Length == 0)
        {
            return;
        }

        await _chatHubContext.Clients.Users(recipients).SendAsync("ConversationsUpdated", cancellationToken);
    }

    private object BuildConversationPayload(
        GroupConversationRecord conversation,
        IReadOnlyCollection<GroupConversationMemberRecord> members,
        IReadOnlyDictionary<int, User> users,
        int currentUserId)
    {
        var activeMembers = members
            .Where(item => !item.IsBanned)
            .OrderBy(item => item.Role == "owner" ? 0 : 1)
            .ThenBy(item => item.JoinedAt)
            .Select(item =>
            {
                users.TryGetValue(item.UserId, out var user);
                var isOnline = _userPresenceService.IsOnline(item.UserId.ToString());

                return new
                {
                    id = item.UserId,
                    first_name = user?.first_name ?? string.Empty,
                    last_name = user?.last_name ?? string.Empty,
                    nickname = user?.nickname ?? string.Empty,
                    email = user?.email ?? string.Empty,
                    avatar_url = user?.avatar_url ?? string.Empty,
                    last_seen_at = user?.last_seen_at,
                    is_online = isOnline,
                    presence = isOnline ? "online" : "offline",
                    directChannelId = DirectMessageChannels.BuildChannelId(currentUserId, item.UserId),
                    role = item.Role,
                    mute_until = item.MutedUntil,
                    is_muted = item.MutedUntil.HasValue && item.MutedUntil > DateTimeOffset.UtcNow,
                    joined_at = item.JoinedAt
                };
            })
            .ToList();

        return new
        {
            id = conversation.Id,
            kind = "conversation",
            title = conversation.Title,
            ownerUserId = conversation.OwnerUserId.ToString(),
            directChannelId = ConversationChannels.BuildChatChannelId(conversation.Id),
            voiceChannelId = ConversationChannels.BuildVoiceChannelName(conversation.Id),
            canManage = conversation.OwnerUserId == currentUserId,
            memberCount = activeMembers.Count,
            members = activeMembers,
            createdAt = conversation.CreatedAt,
            updatedAt = conversation.UpdatedAt,
            activeCallChannel = conversation.ActiveCallChannel,
            activeCallStartedAt = conversation.ActiveCallStartedAt
        };
    }

    private static string NormalizeTitle(string? title)
    {
        return UploadPolicies.TrimToLength(title, MaxConversationTitleLength).Trim();
    }

    public sealed class CreateConversationRequest
    {
        public string? Title { get; set; }
        public List<int>? MemberUserIds { get; set; }
    }

    public sealed class AddConversationMemberRequest
    {
        public int UserId { get; set; }
    }

    public sealed class MuteConversationMemberRequest
    {
        public int Minutes { get; set; } = 15;
    }
}
