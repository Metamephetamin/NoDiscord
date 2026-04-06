using Microsoft.EntityFrameworkCore;
using System.Security.Cryptography;
using System.Text.Json;
using BackNoDiscord.Security;

namespace BackNoDiscord.Services;

public class ServerInviteService
{
    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        WriteIndented = false
    };

    private readonly AppDbContext _context;

    public ServerInviteService(AppDbContext context)
    {
        _context = context;
    }

    public ServerInviteCreateResult CreateInvite(string ownerUserId, ServerSnapshot snapshot)
    {
        if (string.IsNullOrWhiteSpace(ownerUserId))
        {
            throw new InvalidOperationException("Owner user id is required.");
        }

        var normalizedSnapshot = NormalizeSnapshot(snapshot, ownerUserId);
        var invite = new ServerInviteRecordEntity
        {
            Code = GenerateUniqueCode(),
            OwnerUserId = ownerUserId,
            CreatedAt = DateTimeOffset.UtcNow,
            ExpiresAt = DateTimeOffset.UtcNow.AddDays(7),
            SnapshotJson = SerializeSnapshot(normalizedSnapshot),
            RedeemedUserIdsJson = "[]"
        };

        _context.ServerInvites.Add(invite);
        _context.SaveChanges();

        return new ServerInviteCreateResult
        {
            InviteCode = invite.Code,
            ExpiresAt = invite.ExpiresAt
        };
    }

    public ServerInviteRedeemResult RedeemInvite(string inviteCode, string userId, string name, string avatar)
    {
        if (string.IsNullOrWhiteSpace(inviteCode))
        {
            throw new InvalidOperationException("Invite code is required.");
        }

        if (string.IsNullOrWhiteSpace(userId))
        {
            throw new InvalidOperationException("User id is required.");
        }

        var normalizedCode = inviteCode.Trim().ToUpperInvariant();
        var invite = _context.ServerInvites.FirstOrDefault(item => item.Code == normalizedCode);

        if (invite is null)
        {
            throw new KeyNotFoundException("Invite not found.");
        }

        if (invite.ExpiresAt <= DateTimeOffset.UtcNow)
        {
            throw new InvalidOperationException("Invite has expired.");
        }

        var redeemedUserIds = DeserializeRedeemedUserIds(invite.RedeemedUserIdsJson);
        if (redeemedUserIds.Contains(userId, StringComparer.Ordinal))
        {
            throw new InvalidOperationException("Invite has already been used by this user.");
        }

        var snapshot = NormalizeSnapshot(CloneSnapshot(DeserializeSnapshot(invite.SnapshotJson)), invite.OwnerUserId);
        snapshot.Members ??= new List<ServerMemberSnapshot>();

        if (!snapshot.Members.Any(member => string.Equals(member.UserId, userId, StringComparison.Ordinal)))
        {
            snapshot.Members.Add(new ServerMemberSnapshot
            {
                UserId = userId,
                Name = string.IsNullOrWhiteSpace(name) ? "User" : name.Trim(),
                Avatar = avatar ?? string.Empty,
                RoleId = "member"
            });
        }

        redeemedUserIds.Add(userId);
        invite.RedeemedUserIdsJson = SerializeRedeemedUserIds(redeemedUserIds);
        _context.SaveChanges();

        return new ServerInviteRedeemResult
        {
            InviteCode = invite.Code,
            Snapshot = snapshot
        };
    }

    public ServerInvitePreviewResult GetInvitePreview(string inviteCode, string? currentUserId = null)
    {
        if (string.IsNullOrWhiteSpace(inviteCode))
        {
            throw new InvalidOperationException("Invite code is required.");
        }

        var normalizedCode = inviteCode.Trim().ToUpperInvariant();
        var invite = _context.ServerInvites.FirstOrDefault(item => item.Code == normalizedCode);

        if (invite is null)
        {
            throw new KeyNotFoundException("Invite not found.");
        }

        var snapshot = NormalizeSnapshot(CloneSnapshot(DeserializeSnapshot(invite.SnapshotJson)), invite.OwnerUserId);
        var normalizedCurrentUserId = string.IsNullOrWhiteSpace(currentUserId) ? string.Empty : currentUserId.Trim();
        var redeemedUserIds = DeserializeRedeemedUserIds(invite.RedeemedUserIdsJson);
        var isCurrentUserMember =
            !string.IsNullOrWhiteSpace(normalizedCurrentUserId) &&
            (snapshot.Members.Any(member => string.Equals(member.UserId, normalizedCurrentUserId, StringComparison.Ordinal)) ||
             redeemedUserIds.Contains(normalizedCurrentUserId, StringComparer.Ordinal));

        return new ServerInvitePreviewResult
        {
            InviteCode = invite.Code,
            ExpiresAt = invite.ExpiresAt,
            IsExpired = invite.ExpiresAt <= DateTimeOffset.UtcNow,
            CurrentUserAlreadyMember = isCurrentUserMember,
            ServerId = snapshot.Id,
            ServerName = snapshot.Name,
            ServerIcon = snapshot.Icon ?? string.Empty,
            MemberCount = snapshot.Members?.Count ?? 0,
            TextChannelCount = snapshot.TextChannels?.Count ?? 0,
            VoiceChannelCount = snapshot.VoiceChannels?.Count ?? 0,
        };
    }

    private string GenerateUniqueCode()
    {
        const string alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

        while (true)
        {
            var code = new string(Enumerable.Range(0, 8)
                .Select(_ => alphabet[RandomNumberGenerator.GetInt32(alphabet.Length)])
                .ToArray());

            if (!_context.ServerInvites.Any(item => item.Code == code))
            {
                return code;
            }
        }
    }

    private static ServerSnapshot NormalizeSnapshot(ServerSnapshot snapshot, string ownerUserId)
    {
        var normalized = CloneSnapshot(snapshot);
        normalized.Id = ServerChannelAuthorization.NormalizeSharedServerId(
            string.IsNullOrWhiteSpace(normalized.Id) ? "server" : normalized.Id.Trim(),
            string.IsNullOrWhiteSpace(normalized.OwnerId) ? ownerUserId : normalized.OwnerId.Trim());
        normalized.Name = string.IsNullOrWhiteSpace(normalized.Name) ? "Server" : normalized.Name.Trim();
        normalized.Icon ??= string.Empty;
        normalized.IsShared = true;
        normalized.OwnerId = string.IsNullOrWhiteSpace(normalized.OwnerId) ? ownerUserId : normalized.OwnerId.Trim();
        normalized.Roles ??= new List<ServerRoleSnapshot>();
        normalized.Members ??= new List<ServerMemberSnapshot>();
        normalized.TextChannels ??= new List<ChannelSnapshot>();
        normalized.VoiceChannels ??= new List<ChannelSnapshot>();

        if (!normalized.Members.Any(member => string.Equals(member.UserId, normalized.OwnerId, StringComparison.Ordinal)))
        {
            normalized.Members.Add(new ServerMemberSnapshot
            {
                UserId = normalized.OwnerId,
                Name = "Owner",
                Avatar = string.Empty,
                RoleId = "owner"
            });
        }

        return normalized;
    }

    private static ServerSnapshot CloneSnapshot(ServerSnapshot snapshot)
    {
        return DeserializeSnapshot(SerializeSnapshot(snapshot));
    }

    private static ServerSnapshot DeserializeSnapshot(string? rawValue)
    {
        if (string.IsNullOrWhiteSpace(rawValue))
        {
            return new ServerSnapshot();
        }

        return JsonSerializer.Deserialize<ServerSnapshot>(rawValue, JsonOptions) ?? new ServerSnapshot();
    }

    private static string SerializeSnapshot(ServerSnapshot snapshot)
    {
        return JsonSerializer.Serialize(snapshot, JsonOptions);
    }

    private static List<string> DeserializeRedeemedUserIds(string? rawValue)
    {
        if (string.IsNullOrWhiteSpace(rawValue))
        {
            return new List<string>();
        }

        return JsonSerializer.Deserialize<List<string>>(rawValue, JsonOptions) ?? new List<string>();
    }

    private static string SerializeRedeemedUserIds(List<string> redeemedUserIds)
    {
        return JsonSerializer.Serialize(redeemedUserIds, JsonOptions);
    }
}

public class ServerInviteCreateResult
{
    public string InviteCode { get; set; } = string.Empty;
    public DateTimeOffset ExpiresAt { get; set; }
}

public class ServerInviteRedeemResult
{
    public string InviteCode { get; set; } = string.Empty;
    public ServerSnapshot Snapshot { get; set; } = new();
}

public class ServerInvitePreviewResult
{
    public string InviteCode { get; set; } = string.Empty;
    public DateTimeOffset ExpiresAt { get; set; }
    public bool IsExpired { get; set; }
    public bool CurrentUserAlreadyMember { get; set; }
    public string ServerId { get; set; } = string.Empty;
    public string ServerName { get; set; } = string.Empty;
    public string ServerIcon { get; set; } = string.Empty;
    public int MemberCount { get; set; }
    public int TextChannelCount { get; set; }
    public int VoiceChannelCount { get; set; }
}

public class ServerSnapshot
{
    public string Id { get; set; } = "server";
    public string Name { get; set; } = "Server";
    public string Icon { get; set; } = string.Empty;
    public bool IsShared { get; set; }
    public string OwnerId { get; set; } = string.Empty;
    public List<ServerRoleSnapshot> Roles { get; set; } = new();
    public List<ServerMemberSnapshot> Members { get; set; } = new();
    public List<ChannelSnapshot> TextChannels { get; set; } = new();
    public List<ChannelSnapshot> VoiceChannels { get; set; } = new();
}

public class ServerRoleSnapshot
{
    public string Id { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    public string Color { get; set; } = string.Empty;
    public int Priority { get; set; }
    public List<string> Permissions { get; set; } = new();
}

public class ServerMemberSnapshot
{
    public string UserId { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    public string Avatar { get; set; } = string.Empty;
    public string RoleId { get; set; } = "member";
}

public class ChannelSnapshot
{
    public string Id { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
}
