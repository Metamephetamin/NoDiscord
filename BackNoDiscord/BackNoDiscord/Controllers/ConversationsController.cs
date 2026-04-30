using BackNoDiscord.Security;
using BackNoDiscord.Services;
using BackNoDiscord.Infrastructure;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;
using System.Text.Json;

namespace BackNoDiscord.Controllers;

[ApiController]
[Route("api/conversations")]
[Authorize(AuthenticationSchemes = JwtBearerDefaults.AuthenticationScheme)]
public sealed class ConversationsController : ControllerBase
{
    private const int MaxConversationTitleLength = 120;
    private const int MaxConversationMembers = 24;
    private const int MaxMuteMinutes = 7 * 24 * 60;
    private const long MaxConversationAvatarSizeBytes = 50L * 1024L * 1024L;
    private const string MessagePayloadPrefix = "__CHAT_PAYLOAD__:";
    private const string ConversationSystemMemberAdded = "conversation_member_added";
    private const string ConversationSystemTitleUpdated = "conversation_title_updated";
    private const string ConversationSystemAvatarUpdated = "conversation_avatar_updated";
    private const string ConversationPermissionEditInfo = "edit_info";
    private const string ConversationPermissionAddMembers = "add_members";
    private const string ConversationPermissionRemoveMembers = "remove_members";
    private const string ConversationPermissionManageRoles = "manage_roles";

    private static readonly IReadOnlyDictionary<string, string[]> ConversationRolePermissions = new Dictionary<string, string[]>(StringComparer.OrdinalIgnoreCase)
    {
        ["owner"] = [ConversationPermissionEditInfo, ConversationPermissionAddMembers, ConversationPermissionRemoveMembers, ConversationPermissionManageRoles],
        ["admin"] = [ConversationPermissionEditInfo, ConversationPermissionAddMembers, ConversationPermissionRemoveMembers, ConversationPermissionManageRoles],
        ["moderator"] = [ConversationPermissionAddMembers, ConversationPermissionRemoveMembers],
        ["inviter"] = [ConversationPermissionAddMembers],
        ["member"] = []
    };

    private static readonly IReadOnlyDictionary<string, int> ConversationRolePriority = new Dictionary<string, int>(StringComparer.OrdinalIgnoreCase)
    {
        ["owner"] = 4,
        ["admin"] = 3,
        ["moderator"] = 2,
        ["inviter"] = 1,
        ["member"] = 0
    };

    private readonly AppDbContext _context;
    private readonly CryptoService _crypto;
    private readonly IHubContext<ChatHub> _chatHubContext;
    private readonly UserPresenceService _userPresenceService;
    private readonly UploadStoragePaths _uploadStoragePaths;

    public ConversationsController(
        AppDbContext context,
        CryptoService crypto,
        IHubContext<ChatHub> chatHubContext,
        UserPresenceService userPresenceService,
        UploadStoragePaths uploadStoragePaths)
    {
        _context = context;
        _crypto = crypto;
        _chatHubContext = chatHubContext;
        _userPresenceService = userPresenceService;
        _uploadStoragePaths = uploadStoragePaths;
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

        var conversationChannelIds = conversationIds
            .Select(ConversationChannels.BuildChatChannelId)
            .ToArray();
        var latestMessageIds = await _context.Messages
            .AsNoTracking()
            .Where(message => conversationChannelIds.Contains(message.ChannelId) && !message.IsDeleted)
            .GroupBy(message => message.ChannelId)
            .Select(group => group.Max(message => message.Id))
            .ToListAsync(cancellationToken);
        var latestMessagesByChannelId = latestMessageIds.Count == 0
            ? new Dictionary<string, Message>(StringComparer.Ordinal)
            : await _context.Messages
                .AsNoTracking()
                .Where(message => latestMessageIds.Contains(message.Id))
                .ToDictionaryAsync(message => message.ChannelId, StringComparer.Ordinal, cancellationToken);
        var unreadCountsByConversationId = await BuildConversationUnreadCountsAsync(
            currentUserId,
            memberships,
            conversationIds,
            cancellationToken);

        var users = await LoadUsersAsync(members.Select(item => item.UserId), cancellationToken);
        var membersByConversationId = members
            .GroupBy(item => item.ConversationId)
            .ToDictionary(item => item.Key, item => item.ToList());

        var payload = conversations
            .Select(conversation =>
            {
                IReadOnlyCollection<GroupConversationMemberRecord> conversationMembers =
                    membersByConversationId.TryGetValue(conversation.Id, out var groupedMembers)
                        ? groupedMembers
                        : Array.Empty<GroupConversationMemberRecord>();

                return BuildConversationPayload(
                    conversation,
                    conversationMembers,
                    users,
                    currentUserId,
                    latestMessagesByChannelId.TryGetValue(ConversationChannels.BuildChatChannelId(conversation.Id), out var latestMessage)
                        ? latestMessage
                        : null,
                    unreadCountsByConversationId.TryGetValue(conversation.Id, out var unreadCount)
                        ? unreadCount
                        : 0);
            })
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

        var avatarUrl = UploadPolicies.SanitizeRelativeAssetUrl(request?.AvatarUrl, "/avatars/");

        var requestedMemberIds = (request?.MemberUserIds?.AsEnumerable() ?? Array.Empty<int>())
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
            AvatarUrl = avatarUrl,
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
                LastReadAt = now,
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
            LastReadAt = now,
            AddedByUserId = currentUserId,
            IsBanned = false
        }));

        _context.GroupConversationMembers.AddRange(members);
        await _context.SaveChangesAsync(cancellationToken);

        var users = await LoadUsersAsync(members.Select(item => item.UserId), cancellationToken);
        await BroadcastConversationsUpdatedAsync(members.Select(item => item.UserId), cancellationToken);

        return Ok(BuildConversationPayload(conversation, members, users, currentUserId));
    }

    [HttpPost("upload-avatar")]
    [RequestSizeLimit(MaxConversationAvatarSizeBytes)]
    public async Task<IActionResult> UploadConversationAvatar([FromForm] UploadConversationAvatarRequest request, CancellationToken cancellationToken)
    {
        if (!AuthenticatedUserAccessor.TryGetAuthenticatedUser(User, out var currentUser))
        {
            return Unauthorized();
        }

        var avatar = request.Avatar;
        if (avatar == null || avatar.Length == 0)
        {
            return BadRequest(new { message = "Avatar file is required" });
        }

        if (avatar.Length > MaxConversationAvatarSizeBytes)
        {
            return BadRequest(new { message = "Avatar size must be less than or equal to 50 MB" });
        }

        if (!UploadPolicies.TryValidateAvatar(avatar, out var extension, out _, out var error))
        {
            return BadRequest(new { message = error });
        }

        var uploadsDirectory = _uploadStoragePaths.ResolveDirectory("avatars");
        Directory.CreateDirectory(uploadsDirectory);

        var fileName = $"conversation-{UploadPolicies.SanitizeIdentifier(currentUser.UserId)}-{Guid.NewGuid():N}{extension}";
        var filePath = Path.Combine(uploadsDirectory, fileName);

        await using (var stream = new FileStream(filePath, FileMode.CreateNew, FileAccess.Write, FileShare.None, 81920, FileOptions.SequentialScan))
        {
            await avatar.CopyToAsync(stream, cancellationToken);
        }

        var avatarUrl = $"/avatars/{fileName}";
        return Ok(new
        {
            avatarUrl,
            avatar_url = avatarUrl
        });
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

        var actorMember = await _context.GroupConversationMembers
            .AsNoTracking()
            .FirstOrDefaultAsync(item => item.ConversationId == conversationId && item.UserId == currentUserId && !item.IsBanned, cancellationToken);
        if (actorMember is null)
        {
            return Forbid();
        }

        var actorRole = NormalizeConversationRole(actorMember.Role);
        if (!HasConversationPermission(actorRole, ConversationPermissionAddMembers))
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

        var now = DateTimeOffset.UtcNow;
        _context.GroupConversationMembers.Add(new GroupConversationMemberRecord
        {
            ConversationId = conversationId,
            UserId = userId,
            Role = "member",
            JoinedAt = now,
            LastReadAt = now,
            AddedByUserId = currentUserId,
            IsBanned = false
        });
        conversation.UpdatedAt = now;

        var eventUsers = await LoadUsersAsync([currentUserId, userId], cancellationToken);
        eventUsers.TryGetValue(currentUserId, out var actorUser);
        eventUsers.TryGetValue(userId, out var targetUser);
        var systemMessage = AddConversationSystemMessage(
            conversationId,
            new ChatSystemEventPayload
            {
                Type = ConversationSystemMemberAdded,
                ActorUserId = currentUserId.ToString(),
                ActorDisplayName = GetUserDisplayName(actorUser, currentUserId),
                TargetUserId = userId.ToString(),
                TargetDisplayName = GetUserDisplayName(targetUser, userId)
            },
            now);

        await _context.SaveChangesAsync(cancellationToken);

        var recipientIds = await GetConversationRecipientIdsAsync(conversationId, includeBanned: false, cancellationToken);
        await BroadcastConversationSystemMessageAsync(systemMessage, cancellationToken);
        await BroadcastConversationsUpdatedAsync(recipientIds.Append(userId), cancellationToken);

        return Ok(new { status = "member_added" });
    }

    [HttpPatch("{conversationId:int}")]
    public async Task<IActionResult> UpdateConversation([FromRoute] int conversationId, [FromBody] UpdateConversationRequest? request, CancellationToken cancellationToken)
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

        var actorMember = await _context.GroupConversationMembers
            .AsNoTracking()
            .FirstOrDefaultAsync(item => item.ConversationId == conversationId && item.UserId == currentUserId && !item.IsBanned, cancellationToken);
        if (actorMember is null)
        {
            return Forbid();
        }

        var actorRole = NormalizeConversationRole(actorMember.Role);
        if (!HasConversationPermission(actorRole, ConversationPermissionEditInfo))
        {
            return Forbid();
        }

        var previousTitle = conversation.Title;
        var previousAvatarUrl = conversation.AvatarUrl ?? string.Empty;
        var now = DateTimeOffset.UtcNow;
        var systemMessages = new List<(Message Entity, ChatMessagePayload Payload)>();
        var actorUsers = await LoadUsersAsync([currentUserId], cancellationToken);
        actorUsers.TryGetValue(currentUserId, out var actorUser);
        var actorDisplayName = GetUserDisplayName(actorUser, currentUserId);

        if (request?.Title is not null)
        {
            var title = NormalizeTitle(request.Title);
            if (string.IsNullOrWhiteSpace(title))
            {
                return BadRequest(new { message = "Название беседы обязательно." });
            }

            conversation.Title = title;
            if (!string.Equals(previousTitle, title, StringComparison.Ordinal))
            {
                systemMessages.Add(AddConversationSystemMessage(
                    conversationId,
                    new ChatSystemEventPayload
                    {
                        Type = ConversationSystemTitleUpdated,
                        ActorUserId = currentUserId.ToString(),
                        ActorDisplayName = actorDisplayName,
                        ConversationTitle = title
                    },
                    now));
            }
        }

        if (request?.AvatarUrl is not null)
        {
            var normalizedAvatarUrl = UploadPolicies.SanitizeRelativeAssetUrl(request.AvatarUrl, "/avatars/");
            conversation.AvatarUrl = string.IsNullOrWhiteSpace(normalizedAvatarUrl) ? null : normalizedAvatarUrl;
            var nextAvatarUrl = conversation.AvatarUrl ?? string.Empty;
            if (!string.Equals(previousAvatarUrl, nextAvatarUrl, StringComparison.Ordinal))
            {
                systemMessages.Add(AddConversationSystemMessage(
                    conversationId,
                    new ChatSystemEventPayload
                    {
                        Type = ConversationSystemAvatarUpdated,
                        ActorUserId = currentUserId.ToString(),
                        ActorDisplayName = actorDisplayName,
                        AvatarUrl = nextAvatarUrl
                    },
                    now.AddMilliseconds(systemMessages.Count)));
            }
        }

        conversation.UpdatedAt = now;
        await _context.SaveChangesAsync(cancellationToken);

        var members = await _context.GroupConversationMembers
            .AsNoTracking()
            .Where(item => item.ConversationId == conversationId)
            .ToListAsync(cancellationToken);
        var users = await LoadUsersAsync(members.Select(item => item.UserId), cancellationToken);
        foreach (var systemMessage in systemMessages)
        {
            await BroadcastConversationSystemMessageAsync(systemMessage, cancellationToken);
        }
        await BroadcastConversationsUpdatedAsync(members.Where(item => !item.IsBanned).Select(item => item.UserId), cancellationToken);

        return Ok(BuildConversationPayload(conversation, members, users, currentUserId));
    }

    [HttpPatch("{conversationId:int}/members/{userId:int}/role")]
    public async Task<IActionResult> UpdateMemberRole([FromRoute] int conversationId, [FromRoute] int userId, [FromBody] UpdateConversationMemberRoleRequest? request, CancellationToken cancellationToken)
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

        var actorMember = await _context.GroupConversationMembers
            .FirstOrDefaultAsync(item => item.ConversationId == conversationId && item.UserId == currentUserId && !item.IsBanned, cancellationToken);
        if (actorMember is null)
        {
            return Forbid();
        }

        var targetMember = await _context.GroupConversationMembers
            .FirstOrDefaultAsync(item => item.ConversationId == conversationId && item.UserId == userId && !item.IsBanned, cancellationToken);
        if (targetMember is null)
        {
            return NotFound(new { message = "Участник беседы не найден." });
        }

        if (targetMember.UserId == currentUserId)
        {
            return BadRequest(new { message = "Нельзя менять свою собственную роль." });
        }

        var actorRole = NormalizeConversationRole(actorMember.Role);
        var targetRole = NormalizeConversationRole(targetMember.Role);
        var nextRole = NormalizeConversationRole(request?.Role);

        if (!HasConversationPermission(actorRole, ConversationPermissionManageRoles) ||
            nextRole == "owner" ||
            !CanManageConversationTarget(actorRole, targetRole) ||
            !CanAssignConversationRole(actorRole, nextRole))
        {
            return Forbid();
        }

        targetMember.Role = nextRole;
        conversation.UpdatedAt = DateTimeOffset.UtcNow;
        await _context.SaveChangesAsync(cancellationToken);

        var members = await _context.GroupConversationMembers
            .AsNoTracking()
            .Where(item => item.ConversationId == conversationId)
            .ToListAsync(cancellationToken);
        var users = await LoadUsersAsync(members.Select(item => item.UserId), cancellationToken);
        await BroadcastConversationsUpdatedAsync(members.Where(item => !item.IsBanned).Select(item => item.UserId), cancellationToken);

        return Ok(BuildConversationPayload(conversation, members, users, currentUserId));
    }

    [HttpDelete("{conversationId:int}/members/{userId:int}")]
    public async Task<IActionResult> RemoveMember([FromRoute] int conversationId, [FromRoute] int userId, CancellationToken cancellationToken)
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

        var actorMember = await _context.GroupConversationMembers
            .FirstOrDefaultAsync(item => item.ConversationId == conversationId && item.UserId == currentUserId && !item.IsBanned, cancellationToken);
        if (actorMember is null)
        {
            return Forbid();
        }

        var targetMember = await _context.GroupConversationMembers
            .FirstOrDefaultAsync(item => item.ConversationId == conversationId && item.UserId == userId && !item.IsBanned, cancellationToken);
        if (targetMember is null)
        {
            return NotFound(new { message = "Участник беседы не найден." });
        }

        if (targetMember.UserId == currentUserId)
        {
            return BadRequest(new { message = "Для выхода используйте отдельную кнопку." });
        }

        var actorRole = NormalizeConversationRole(actorMember.Role);
        var targetRole = NormalizeConversationRole(targetMember.Role);
        if (!HasConversationPermission(actorRole, ConversationPermissionRemoveMembers) ||
            !CanManageConversationTarget(actorRole, targetRole))
        {
            return Forbid();
        }

        _context.GroupConversationMembers.Remove(targetMember);
        conversation.UpdatedAt = DateTimeOffset.UtcNow;
        await _context.SaveChangesAsync(cancellationToken);

        var recipientIds = await GetConversationRecipientIdsAsync(conversationId, includeBanned: false, cancellationToken);
        await BroadcastConversationsUpdatedAsync(recipientIds.Append(userId), cancellationToken);

        return Ok(new { status = "member_removed" });
    }

    [HttpPost("{conversationId:int}/leave")]
    public async Task<IActionResult> LeaveConversation([FromRoute] int conversationId, CancellationToken cancellationToken)
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

        var currentMember = await _context.GroupConversationMembers
            .FirstOrDefaultAsync(item => item.ConversationId == conversationId && item.UserId == currentUserId && !item.IsBanned, cancellationToken);
        if (currentMember is null)
        {
            return Forbid();
        }

        var recipientIds = await GetConversationRecipientIdsAsync(conversationId, includeBanned: false, cancellationToken);
        var remainingMembers = await _context.GroupConversationMembers
            .Where(item => item.ConversationId == conversationId && item.UserId != currentUserId && !item.IsBanned)
            .ToListAsync(cancellationToken);

        if (NormalizeConversationRole(currentMember.Role) == "owner" && remainingMembers.Count > 0)
        {
            var nextOwner = remainingMembers
                .OrderByDescending(item => GetConversationRolePriority(item.Role))
                .ThenBy(item => item.JoinedAt)
                .First();
            nextOwner.Role = "owner";
            conversation.OwnerUserId = nextOwner.UserId;
        }

        _context.GroupConversationMembers.Remove(currentMember);

        if (remainingMembers.Count == 0)
        {
            _context.GroupConversations.Remove(conversation);
            await _context.SaveChangesAsync(cancellationToken);
            await BroadcastConversationsUpdatedAsync(recipientIds, cancellationToken);
            return Ok(new { status = "conversation_deleted" });
        }

        conversation.UpdatedAt = DateTimeOffset.UtcNow;
        await _context.SaveChangesAsync(cancellationToken);
        await BroadcastConversationsUpdatedAsync(recipientIds, cancellationToken);

        return Ok(new { status = "conversation_left" });
    }

    [HttpDelete("{conversationId:int}")]
    public async Task<IActionResult> DeleteConversation([FromRoute] int conversationId, CancellationToken cancellationToken)
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

        var recipientIds = await GetConversationRecipientIdsAsync(conversationId, includeBanned: true, cancellationToken);
        var members = await _context.GroupConversationMembers
            .Where(item => item.ConversationId == conversationId)
            .ToListAsync(cancellationToken);

        _context.GroupConversationMembers.RemoveRange(members);
        _context.GroupConversations.Remove(conversation);
        await _context.SaveChangesAsync(cancellationToken);
        await BroadcastConversationsUpdatedAsync(recipientIds, cancellationToken);

        return Ok(new { status = "conversation_deleted" });
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
            var callerAvatarUrl = await _context.Users
                .AsNoTracking()
                .Where(item => item.id == currentUserId)
                .Select(item => item.avatar_url)
                .FirstOrDefaultAsync(cancellationToken);

            await _chatHubContext.Clients.Users(recipientsWithoutCaller.Select(item => item.ToString())).SendAsync("ConversationCallRing", new
            {
                conversationId,
                targetId = ConversationChannels.BuildChatChannelId(conversationId),
                title = conversation.Title,
                chatChannelId = ConversationChannels.BuildChatChannelId(conversationId),
                voiceChannelId,
                fromUserId = currentUser.UserId,
                fromName = currentUser.DisplayName,
                fromAvatar = UploadPolicies.SanitizeRelativeAssetUrl(callerAvatarUrl, "/avatars/"),
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

    private async Task<Dictionary<int, ConversationUserProjection>> LoadUsersAsync(IEnumerable<int> userIds, CancellationToken cancellationToken)
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
            .Select(item => new ConversationUserProjection
            {
                Id = item.id,
                FirstName = item.first_name,
                LastName = item.last_name,
                Nickname = item.nickname,
                Email = item.email,
                AvatarUrl = item.avatar_url,
                LastSeenAt = item.last_seen_at,
                ProfileCustomizationJson = item.profile_customization_json
            })
            .ToDictionaryAsync(item => item.Id, cancellationToken);
    }

    private (Message Entity, ChatMessagePayload Payload) AddConversationSystemMessage(
        int conversationId,
        ChatSystemEventPayload systemEvent,
        DateTimeOffset timestamp)
    {
        var normalizedEvent = systemEvent ?? new ChatSystemEventPayload();
        normalizedEvent.ActorDisplayName = UploadPolicies.TrimToLength(normalizedEvent.ActorDisplayName, 160).Trim();
        normalizedEvent.TargetDisplayName = UploadPolicies.TrimToLength(normalizedEvent.TargetDisplayName, 160).Trim();
        normalizedEvent.ConversationTitle = UploadPolicies.TrimToLength(normalizedEvent.ConversationTitle, MaxConversationTitleLength).Trim();
        normalizedEvent.AvatarUrl = UploadPolicies.SanitizeRelativeAssetUrl(normalizedEvent.AvatarUrl, "/avatars/");

        var payload = new ChatMessagePayload
        {
            AuthorUserId = normalizedEvent.ActorUserId,
            Message = string.Empty,
            SystemEvent = normalizedEvent
        };

        var message = new Message
        {
            ChannelId = ConversationChannels.BuildChatChannelId(conversationId),
            Username = string.IsNullOrWhiteSpace(normalizedEvent.ActorDisplayName) ? "System" : normalizedEvent.ActorDisplayName,
            Content = null,
            EncryptedContent = _crypto.Encrypt(SerializePayload(payload)),
            PhotoUrl = null,
            Timestamp = timestamp.UtcDateTime,
            IsDeleted = false
        };

        _context.Messages.Add(message);
        return (message, payload);
    }

    private async Task BroadcastConversationSystemMessageAsync(
        (Message Entity, ChatMessagePayload Payload) systemMessage,
        CancellationToken cancellationToken)
    {
        await _chatHubContext.Clients
            .Group(systemMessage.Entity.ChannelId)
            .SendAsync("ReceiveMessage", ToMessageDto(systemMessage.Entity, systemMessage.Payload), cancellationToken);
    }

    private static MessageDto ToMessageDto(Message message, ChatMessagePayload payload)
    {
        return new MessageDto
        {
            Id = message.Id,
            ChannelId = message.ChannelId,
            AuthorUserId = payload.AuthorUserId,
            Username = message.Username,
            Message = payload.Message,
            SystemEvent = payload.SystemEvent,
            PhotoUrl = message.PhotoUrl,
            Attachments = [],
            Mentions = [],
            Timestamp = message.Timestamp,
            IsRead = message.ReadAt.HasValue,
            ReadAt = message.ReadAt,
            ReadByUserId = message.ReadByUserId,
            Reactions = []
        };
    }

    private static string SerializePayload(ChatMessagePayload payload)
    {
        return $"{MessagePayloadPrefix}{JsonSerializer.Serialize(payload)}";
    }

    private object? BuildConversationLastMessagePayload(Message? message)
    {
        if (message is null)
        {
            return null;
        }

        var payload = DeserializePayload(GetRawPayload(message));
        return new
        {
            id = message.Id,
            channelId = message.ChannelId,
            authorUserId = payload.AuthorUserId,
            username = message.Username,
            preview = BuildConversationMessagePreview(payload),
            timestamp = message.Timestamp
        };
    }

    private string GetRawPayload(Message message)
    {
        return GetRawPayload(message.Content, message.EncryptedContent);
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
            var payload = JsonSerializer.Deserialize<ChatMessagePayload>(raw[MessagePayloadPrefix.Length..]) ?? new ChatMessagePayload();
            NormalizeLegacyPayload(payload);
            return payload;
        }
        catch
        {
            return new ChatMessagePayload { Message = raw };
        }
    }

    private static void NormalizeLegacyPayload(ChatMessagePayload payload)
    {
        payload.Attachments ??= [];
        if (payload.Attachments.Count == 0 && (!string.IsNullOrWhiteSpace(payload.AttachmentUrl) || payload.VoiceMessage is not null))
        {
            payload.Attachments.Add(new ChatAttachmentPayload
            {
                AttachmentEncryption = payload.AttachmentEncryption,
                AttachmentUrl = payload.AttachmentUrl,
                AttachmentName = payload.AttachmentName,
                AttachmentSize = payload.AttachmentSize,
                AttachmentContentType = payload.AttachmentContentType,
                AttachmentSpoiler = payload.AttachmentSpoiler,
                AttachmentAsFile = payload.AttachmentAsFile,
                VoiceMessage = payload.VoiceMessage
            });
        }
    }

    private static string BuildConversationMessagePreview(ChatMessagePayload payload)
    {
        var message = UploadPolicies.TrimToLength(payload.Message, 180).Trim();
        if (!string.IsNullOrWhiteSpace(message))
        {
            return message;
        }

        if (payload.SystemEvent is not null)
        {
            return payload.SystemEvent.Type switch
            {
                ConversationSystemMemberAdded => "Новый участник в беседе",
                ConversationSystemTitleUpdated => "Название беседы изменено",
                ConversationSystemAvatarUpdated => "Аватар беседы обновлён",
                _ => "Системное сообщение"
            };
        }

        var attachments = payload.Attachments ?? [];
        var firstAttachment = attachments.FirstOrDefault();
        if (firstAttachment?.VoiceMessage is not null || payload.VoiceMessage is not null)
        {
            return "Голосовое сообщение";
        }

        if (attachments.Count > 1)
        {
            return $"{attachments.Count} вложений";
        }

        var contentType = firstAttachment?.AttachmentContentType ?? payload.AttachmentContentType ?? string.Empty;
        if (contentType.StartsWith("image/", StringComparison.OrdinalIgnoreCase))
        {
            return "Изображение";
        }

        if (contentType.StartsWith("video/", StringComparison.OrdinalIgnoreCase))
        {
            return "Видео";
        }

        var attachmentName = UploadPolicies.TrimToLength(firstAttachment?.AttachmentName ?? payload.AttachmentName, 180).Trim();
        return string.IsNullOrWhiteSpace(attachmentName) ? "Сообщение без текста" : attachmentName;
    }

    private async Task<Dictionary<int, int>> BuildConversationUnreadCountsAsync(
        int currentUserId,
        IReadOnlyCollection<GroupConversationMemberRecord> currentUserMemberships,
        IReadOnlyCollection<int> conversationIds,
        CancellationToken cancellationToken)
    {
        var readCutoffsByChannelId = currentUserMemberships
            .Where(item => conversationIds.Contains(item.ConversationId) && !item.IsBanned)
            .Select(item => new
            {
                item.ConversationId,
                ChannelId = ConversationChannels.BuildChatChannelId(item.ConversationId),
                Cutoff = item.LastReadAt ?? item.JoinedAt
            })
            .Where(item => !string.IsNullOrWhiteSpace(item.ChannelId))
            .ToDictionary(item => item.ChannelId, item => (item.ConversationId, item.Cutoff), StringComparer.Ordinal);

        if (readCutoffsByChannelId.Count == 0)
        {
            return new Dictionary<int, int>();
        }

        var minCutoffUtc = readCutoffsByChannelId.Values.Min(item => item.Cutoff).UtcDateTime;
        var channelIds = readCutoffsByChannelId.Keys.ToArray();
        var candidates = await _context.Messages
            .AsNoTracking()
            .Where(message => channelIds.Contains(message.ChannelId)
                && !message.IsDeleted
                && message.Timestamp > minCutoffUtc)
            .Select(message => new
            {
                message.ChannelId,
                message.Content,
                message.EncryptedContent,
                message.Timestamp
            })
            .ToListAsync(cancellationToken);

        var counts = new Dictionary<int, int>();
        var currentUserKey = currentUserId.ToString();
        foreach (var message in candidates)
        {
            if (!readCutoffsByChannelId.TryGetValue(message.ChannelId, out var state))
            {
                continue;
            }

            var messageTimestamp = DateTime.SpecifyKind(message.Timestamp, DateTimeKind.Utc);
            if (messageTimestamp <= state.Cutoff.UtcDateTime)
            {
                continue;
            }

            var payload = DeserializePayload(GetRawPayload(message.Content, message.EncryptedContent));
            if (string.Equals(payload.AuthorUserId, currentUserKey, StringComparison.Ordinal))
            {
                continue;
            }

            counts[state.ConversationId] = counts.TryGetValue(state.ConversationId, out var count)
                ? Math.Min(999, count + 1)
                : 1;
        }

        return counts;
    }

    private static string GetUserDisplayName(ConversationUserProjection? user, int fallbackUserId)
    {
        if (user is null)
        {
            return $"User {fallbackUserId}";
        }

        var nickname = UploadPolicies.TrimToLength(user.Nickname, 160).Trim();
        if (!string.IsNullOrWhiteSpace(nickname))
        {
            return nickname;
        }

        var fullName = $"{user.FirstName} {user.LastName}".Trim();
        return string.IsNullOrWhiteSpace(fullName) ? (user.Email ?? $"User {fallbackUserId}") : fullName;
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
        IReadOnlyDictionary<int, ConversationUserProjection> users,
        int currentUserId,
        Message? latestMessage = null,
        int unreadCount = 0)
    {
        var currentMember = members.FirstOrDefault(item => item.UserId == currentUserId && !item.IsBanned);
        var currentRole = NormalizeConversationRole(currentMember?.Role);
        var permissions = GetConversationPermissions(currentRole);
        var now = DateTimeOffset.UtcNow;

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
                    first_name = user?.FirstName ?? string.Empty,
                    last_name = user?.LastName ?? string.Empty,
                    nickname = user?.Nickname ?? string.Empty,
                    email = user?.Email ?? string.Empty,
                    avatar_url = user?.AvatarUrl ?? string.Empty,
                    profile_customization = ParseProfileCustomization(user?.ProfileCustomizationJson),
                    last_seen_at = user?.LastSeenAt,
                    is_online = isOnline,
                    presence = isOnline ? "online" : "offline",
                    directChannelId = DirectMessageChannels.BuildChannelId(currentUserId, item.UserId),
                    role = item.Role,
                    mute_until = item.MutedUntil,
                    is_muted = item.MutedUntil.HasValue && item.MutedUntil > now,
                    joined_at = item.JoinedAt
                };
            })
            .ToList();

        return new
        {
            id = conversation.Id,
            kind = "conversation",
            title = conversation.Title,
            avatar_url = conversation.AvatarUrl ?? string.Empty,
            ownerUserId = conversation.OwnerUserId.ToString(),
            directChannelId = ConversationChannels.BuildChatChannelId(conversation.Id),
            voiceChannelId = ConversationChannels.BuildVoiceChannelName(conversation.Id),
            currentUserRole = currentRole,
            permissions,
            canManage = permissions.Length > 0,
            canEditInfo = HasConversationPermission(currentRole, ConversationPermissionEditInfo),
            canAddMembers = HasConversationPermission(currentRole, ConversationPermissionAddMembers),
            canRemoveMembers = HasConversationPermission(currentRole, ConversationPermissionRemoveMembers),
            canManageRoles = HasConversationPermission(currentRole, ConversationPermissionManageRoles),
            canLeave = currentMember is not null,
            canDeleteConversation = conversation.OwnerUserId == currentUserId,
            isMuted = currentMember?.MutedUntil.HasValue == true && currentMember.MutedUntil > now,
            muteUntil = currentMember?.MutedUntil,
            memberCount = activeMembers.Count,
            members = activeMembers,
            lastMessage = BuildConversationLastMessagePayload(latestMessage),
            unreadCount = Math.Clamp(unreadCount, 0, 999),
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

    private static string NormalizeConversationRole(string? role)
    {
        var normalizedRole = string.IsNullOrWhiteSpace(role) ? "member" : role.Trim().ToLowerInvariant();
        return ConversationRolePermissions.ContainsKey(normalizedRole) ? normalizedRole : "member";
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

    private static string[] GetConversationPermissions(string? role)
    {
        var normalizedRole = NormalizeConversationRole(role);
        return ConversationRolePermissions.TryGetValue(normalizedRole, out var permissions)
            ? permissions
            : [];
    }

    private static bool HasConversationPermission(string? role, string permission)
    {
        return GetConversationPermissions(role).Contains(permission, StringComparer.OrdinalIgnoreCase);
    }

    private static int GetConversationRolePriority(string? role)
    {
        var normalizedRole = NormalizeConversationRole(role);
        return ConversationRolePriority.TryGetValue(normalizedRole, out var priority) ? priority : 0;
    }

    private static bool CanManageConversationTarget(string? actorRole, string? targetRole)
    {
        return GetConversationRolePriority(actorRole) > GetConversationRolePriority(targetRole);
    }

    private static bool CanAssignConversationRole(string? actorRole, string? nextRole)
    {
        return GetConversationRolePriority(actorRole) > GetConversationRolePriority(nextRole);
    }

    public sealed class CreateConversationRequest
    {
        public string? Title { get; set; }
        public string? AvatarUrl { get; set; }
        public List<int>? MemberUserIds { get; set; }
    }

    private sealed class ConversationUserProjection
    {
        public int Id { get; set; }
        public string FirstName { get; set; } = string.Empty;
        public string LastName { get; set; } = string.Empty;
        public string Nickname { get; set; } = string.Empty;
        public string? Email { get; set; }
        public string? AvatarUrl { get; set; }
        public string? ProfileCustomizationJson { get; set; }
        public DateTimeOffset? LastSeenAt { get; set; }
    }

    public sealed class UpdateConversationRequest
    {
        public string? Title { get; set; }
        public string? AvatarUrl { get; set; }
    }

    public sealed class UploadConversationAvatarRequest
    {
        public IFormFile? Avatar { get; set; }
    }

    public sealed class AddConversationMemberRequest
    {
        public int UserId { get; set; }
    }

    public sealed class UpdateConversationMemberRoleRequest
    {
        public string? Role { get; set; }
    }

    public sealed class MuteConversationMemberRequest
    {
        public int Minutes { get; set; } = 15;
    }
}
