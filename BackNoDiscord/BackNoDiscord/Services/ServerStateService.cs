using Microsoft.EntityFrameworkCore;
using System.Text.Json;
using BackNoDiscord.Security;

namespace BackNoDiscord.Services;

public class ServerStateService
{
    private const int MaxChannelNameLength = 50;
    private const int VoiceChannelStatusMaxWords = 12;
    private const int VoiceChannelStatusMaxLength = 80;

    private static readonly HashSet<string> AllowedRolePermissions = new(StringComparer.Ordinal)
    {
        "manage_server",
        "manage_channels",
        "manage_roles",
        "manage_messages",
        "manage_nicknames",
        "view_audit_log",
        "invite_members",
        "mute_members",
        "deafen_members",
        "move_members"
    };

    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        WriteIndented = false
    };

    private readonly AppDbContext _context;

    public ServerStateService(AppDbContext context)
    {
        _context = context;
    }

    public ServerSnapshot UpsertSnapshot(ServerSnapshot snapshot, string fallbackOwnerUserId)
    {
        var normalized = NormalizeSnapshot(snapshot, fallbackOwnerUserId);
        var existing = FindSnapshotRecordByServerId(normalized.Id);

        if (existing is not null)
        {
            var existingSnapshot = DeserializeSnapshot(existing.SnapshotJson);
            normalized = MergeSnapshots(existingSnapshot, normalized, fallbackOwnerUserId);
            existing.OwnerUserId = normalized.OwnerId;
            existing.SnapshotJson = SerializeSnapshot(normalized);
            existing.UpdatedAt = DateTimeOffset.UtcNow;
        }
        else
        {
            normalized = RebindNewSnapshotAuthority(normalized, fallbackOwnerUserId);
            _context.SharedServerSnapshots.Add(new SharedServerSnapshotRecord
            {
                ServerId = normalized.Id,
                OwnerUserId = normalized.OwnerId,
                SnapshotJson = SerializeSnapshot(normalized),
                CreatedAt = DateTimeOffset.UtcNow,
                UpdatedAt = DateTimeOffset.UtcNow
            });
        }

        _context.SaveChanges();
        return CloneSnapshot(normalized);
    }

    public ServerSnapshot? GetSnapshot(string serverId)
    {
        if (string.IsNullOrWhiteSpace(serverId))
        {
            return null;
        }

        var record = FindSnapshotRecordByServerId(serverId.Trim(), asNoTracking: true);

        return record is null
            ? null
            : CloneSnapshot(NormalizeSnapshot(DeserializeSnapshot(record.SnapshotJson), record.OwnerUserId));
    }

    public IReadOnlyList<ServerSnapshot> GetSnapshotsForUser(string userId)
    {
        if (string.IsNullOrWhiteSpace(userId))
        {
            return Array.Empty<ServerSnapshot>();
        }

        var normalizedUserId = userId.Trim();
        return _context.SharedServerSnapshots
            .AsNoTracking()
            .AsEnumerable()
            .Select((record) => NormalizeSnapshot(DeserializeSnapshot(record.SnapshotJson), record.OwnerUserId))
            .Where((snapshot) =>
                string.Equals(snapshot.OwnerId, normalizedUserId, StringComparison.Ordinal) ||
                snapshot.Members.Any((member) => string.Equals(member.UserId, normalizedUserId, StringComparison.Ordinal)))
            .OrderByDescending((snapshot) => snapshot.IsShared)
            .ThenBy((snapshot) => snapshot.Name, StringComparer.OrdinalIgnoreCase)
            .Select(CloneSnapshot)
            .ToList();
    }

    public ServerSnapshot AddMember(string serverId, string userId, string name, string avatar)
    {
        var record = FindSnapshotRecordByServerId(serverId);
        if (record is null)
        {
            throw new KeyNotFoundException("Server snapshot not found.");
        }

        var snapshot = DeserializeSnapshot(record.SnapshotJson);
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

        var normalized = NormalizeSnapshot(snapshot, snapshot.OwnerId);
        record.OwnerUserId = normalized.OwnerId;
        record.SnapshotJson = SerializeSnapshot(normalized);
        record.UpdatedAt = DateTimeOffset.UtcNow;
        _context.SaveChanges();

        return CloneSnapshot(normalized);
    }

    public bool DeleteSnapshot(string serverId)
    {
        if (string.IsNullOrWhiteSpace(serverId))
        {
            return false;
        }

        var record = FindSnapshotRecordByServerId(serverId.Trim());
        if (record is null)
        {
            return false;
        }

        _context.SharedServerSnapshots.Remove(record);
        _context.SaveChanges();
        return true;
    }

    public bool ClearVoiceChannelStatus(string scopedVoiceChannelName)
    {
        if (!TryParseScopedVoiceChannelName(scopedVoiceChannelName, out var serverId, out var channelId))
        {
            return false;
        }

        var record = FindSnapshotRecordByServerId(serverId);
        if (record is null)
        {
            return false;
        }

        var snapshot = NormalizeSnapshot(DeserializeSnapshot(record.SnapshotJson), record.OwnerUserId);
        var channel = snapshot.VoiceChannels.FirstOrDefault(item =>
            string.Equals(item.Id, channelId, StringComparison.Ordinal));
        if (channel is null || string.IsNullOrWhiteSpace(channel.Status))
        {
            return false;
        }

        channel.Status = string.Empty;
        SaveMutableSnapshot(record, snapshot);
        return true;
    }

    public ServerSnapshot SaveRole(string serverId, ServerRoleSnapshot role, bool create)
    {
        var (record, snapshot) = GetMutableSnapshot(serverId);
        snapshot.Roles ??= new List<ServerRoleSnapshot>();

        var normalizedRole = NormalizeRole(role);
        if (string.IsNullOrWhiteSpace(normalizedRole.Id))
        {
            throw new ArgumentException("Role id is required.", nameof(role));
        }

        var existingIndex = snapshot.Roles.FindIndex(item =>
            string.Equals(item.Id, normalizedRole.Id, StringComparison.Ordinal));
        if (create)
        {
            if (existingIndex >= 0)
            {
                throw new InvalidOperationException("Role already exists.");
            }

            snapshot.Roles.Add(normalizedRole);
        }
        else
        {
            if (existingIndex < 0)
            {
                throw new KeyNotFoundException("Role not found.");
            }

            normalizedRole.Priority = snapshot.Roles[existingIndex].Priority;
            snapshot.Roles[existingIndex] = normalizedRole;
        }

        return SaveMutableSnapshot(record, snapshot);
    }

    public ServerSnapshot DeleteRole(string serverId, string roleId)
    {
        var (record, snapshot) = GetMutableSnapshot(serverId);
        var normalizedRoleId = roleId.Trim();
        var removed = snapshot.Roles.RemoveAll(role =>
            string.Equals(role.Id, normalizedRoleId, StringComparison.Ordinal));
        if (removed <= 0)
        {
            throw new KeyNotFoundException("Role not found.");
        }

        foreach (var member in snapshot.Members.Where(member =>
                     string.Equals(member.RoleId, normalizedRoleId, StringComparison.Ordinal)))
        {
            member.RoleId = "member";
        }

        return SaveMutableSnapshot(record, snapshot);
    }

    public ServerSnapshot UpdateMemberRole(string serverId, string memberUserId, string roleId)
    {
        var (record, snapshot) = GetMutableSnapshot(serverId);
        var normalizedMemberUserId = memberUserId.Trim();
        var normalizedRoleId = roleId.Trim();
        if (!snapshot.Roles.Any(role => string.Equals(role.Id, normalizedRoleId, StringComparison.Ordinal)))
        {
            throw new KeyNotFoundException("Role not found.");
        }

        var member = snapshot.Members.FirstOrDefault(item =>
            string.Equals(item.UserId, normalizedMemberUserId, StringComparison.Ordinal));
        if (member is null)
        {
            throw new KeyNotFoundException("Member not found.");
        }

        member.RoleId = normalizedRoleId;
        return SaveMutableSnapshot(record, snapshot);
    }

    private (SharedServerSnapshotRecord Record, ServerSnapshot Snapshot) GetMutableSnapshot(string serverId)
    {
        if (string.IsNullOrWhiteSpace(serverId))
        {
            throw new KeyNotFoundException("Server snapshot not found.");
        }

        var record = FindSnapshotRecordByServerId(serverId.Trim());
        if (record is null)
        {
            throw new KeyNotFoundException("Server snapshot not found.");
        }

        return (record, NormalizeSnapshot(DeserializeSnapshot(record.SnapshotJson), record.OwnerUserId));
    }

    private ServerSnapshot SaveMutableSnapshot(SharedServerSnapshotRecord record, ServerSnapshot snapshot)
    {
        var normalized = NormalizeSnapshot(snapshot, record.OwnerUserId);
        record.OwnerUserId = normalized.OwnerId;
        record.SnapshotJson = SerializeSnapshot(normalized);
        record.UpdatedAt = DateTimeOffset.UtcNow;
        _context.SaveChanges();

        return CloneSnapshot(normalized);
    }

    private SharedServerSnapshotRecord? FindSnapshotRecordByServerId(string serverId, bool asNoTracking = false)
    {
        var query = asNoTracking
            ? _context.SharedServerSnapshots.AsNoTracking()
            : _context.SharedServerSnapshots;

        var normalizedServerId = serverId.Trim();
        var directRecord = query.FirstOrDefault(item => item.ServerId == normalizedServerId);
        if (directRecord is not null)
        {
            return directRecord;
        }

        return query
            .AsEnumerable()
            .FirstOrDefault(item =>
                string.Equals(
                    ServerChannelAuthorization.NormalizeSharedServerId(item.ServerId, item.OwnerUserId),
                    normalizedServerId,
                    StringComparison.Ordinal));
    }

    private static ServerSnapshot NormalizeSnapshot(ServerSnapshot snapshot, string ownerUserId)
    {
        var normalized = CloneSnapshot(snapshot);
        normalized.Id = ServerChannelAuthorization.NormalizeSharedServerId(
            string.IsNullOrWhiteSpace(normalized.Id) ? "server" : normalized.Id.Trim(),
            string.IsNullOrWhiteSpace(normalized.OwnerId) ? ownerUserId : normalized.OwnerId.Trim());
        normalized.Name = string.IsNullOrWhiteSpace(normalized.Name) ? "Server" : normalized.Name;
        normalized.Description = string.IsNullOrWhiteSpace(normalized.Description)
            ? string.Empty
            : normalized.Description;
        if (normalized.Description.Length > 280)
        {
            normalized.Description = normalized.Description[..280];
        }
        normalized.Icon ??= string.Empty;
        normalized.IsShared = true;
        normalized.OwnerId = string.IsNullOrWhiteSpace(normalized.OwnerId) ? ownerUserId : normalized.OwnerId.Trim();
        normalized.Roles ??= new List<ServerRoleSnapshot>();
        normalized.Members ??= new List<ServerMemberSnapshot>();
        normalized.ChannelCategories ??= new List<ChannelCategorySnapshot>();
        normalized.TextChannels ??= new List<ChannelSnapshot>();
        normalized.VoiceChannels ??= new List<ChannelSnapshot>();

        normalized.Roles = normalized.Roles
            .Where(role => !string.IsNullOrWhiteSpace(role.Id))
            .Select(NormalizeRole)
            .ToList();

        foreach (var member in normalized.Members)
        {
            member.UserId = member.UserId?.Trim() ?? string.Empty;
            member.Name = string.IsNullOrWhiteSpace(member.Name) ? "Member" : member.Name.Trim();
            member.Avatar = member.Avatar?.Trim() ?? string.Empty;
            member.RoleId = string.IsNullOrWhiteSpace(member.RoleId) ? "member" : member.RoleId.Trim();
        }

        for (var index = 0; index < normalized.ChannelCategories.Count; index++)
        {
            var category = normalized.ChannelCategories[index];
            category.Id = category.Id?.Trim() ?? string.Empty;
            category.Name = string.IsNullOrWhiteSpace(category.Name) ? $"Category {index + 1}" : category.Name.Trim();
            category.Order = category.Order < 0 ? index : category.Order;
        }

        for (var index = 0; index < normalized.TextChannels.Count; index++)
        {
            var channel = normalized.TextChannels[index];
            channel.Id = channel.Id?.Trim() ?? string.Empty;
            channel.Name = NormalizeChannelName(channel.Name, "general");
            channel.CategoryId = channel.CategoryId?.Trim() ?? string.Empty;
            channel.Kind = string.IsNullOrWhiteSpace(channel.Kind) ? "text" : channel.Kind.Trim();
            channel.Order = channel.Order < 0 ? index : channel.Order;
        }

        for (var index = 0; index < normalized.VoiceChannels.Count; index++)
        {
            var channel = normalized.VoiceChannels[index];
            channel.Id = channel.Id?.Trim() ?? string.Empty;
            channel.Name = NormalizeChannelName(channel.Name, "Voice");
            channel.CategoryId = channel.CategoryId?.Trim() ?? string.Empty;
            channel.Kind = string.IsNullOrWhiteSpace(channel.Kind) ? "voice" : channel.Kind.Trim();
            channel.Status = NormalizeVoiceChannelStatus(channel.Status);
            channel.Order = channel.Order < 0 ? index : channel.Order;
        }

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

    private static ServerRoleSnapshot NormalizeRole(ServerRoleSnapshot role)
    {
        var normalized = CloneRole(role);
        normalized.Id = normalized.Id?.Trim() ?? string.Empty;
        normalized.Name = string.IsNullOrWhiteSpace(normalized.Name) ? "Role" : normalized.Name.Trim();
        if (normalized.Name.Length > 40)
        {
            normalized.Name = normalized.Name[..40];
        }

        normalized.Color = NormalizeRoleColor(normalized.Color);
        normalized.Priority = Math.Max(0, normalized.Priority);
        normalized.Permissions = (normalized.Permissions ?? new List<string>())
            .Where(permission => !string.IsNullOrWhiteSpace(permission))
            .Select(permission => permission.Trim())
            .Where(permission => AllowedRolePermissions.Contains(permission))
            .Distinct(StringComparer.Ordinal)
            .ToList();

        return normalized;
    }

    private static string NormalizeChannelName(string? value, string fallback)
    {
        var normalized = string.IsNullOrWhiteSpace(value) ? fallback : value.Trim();
        return normalized.Length <= MaxChannelNameLength
            ? normalized
            : normalized[..MaxChannelNameLength];
    }

    private static string NormalizeRoleColor(string? value)
    {
        var color = string.IsNullOrWhiteSpace(value) ? "#7b89a8" : value.Trim();
        if (color.Length == 7 && color[0] == '#' && color.Skip(1).All(Uri.IsHexDigit))
        {
            return color.ToLowerInvariant();
        }

        return "#7b89a8";
    }

    private static ServerSnapshot MergeSnapshots(ServerSnapshot existing, ServerSnapshot incoming, string fallbackOwnerUserId)
    {
        var merged = NormalizeSnapshot(incoming, fallbackOwnerUserId);
        var normalizedExisting = NormalizeSnapshot(existing, fallbackOwnerUserId);

        merged.OwnerId = normalizedExisting.OwnerId;

        merged.Roles = MergeRoles(normalizedExisting.Roles, merged.Roles);
        merged.Members = MergeMembers(normalizedExisting.Members, merged.Members, merged.OwnerId);
        merged.ChannelCategories = CloneCategories(merged.ChannelCategories);
        merged.TextChannels = CloneChannels(merged.TextChannels);
        merged.VoiceChannels = CloneChannels(merged.VoiceChannels);

        return NormalizeSnapshot(merged, merged.OwnerId);
    }

    private static ServerSnapshot RebindNewSnapshotAuthority(ServerSnapshot snapshot, string ownerUserId)
    {
        var normalizedOwnerId = ownerUserId.Trim();
        if (string.IsNullOrWhiteSpace(normalizedOwnerId))
        {
            return snapshot;
        }

        var ownerMember = snapshot.Members?
            .FirstOrDefault(member => string.Equals(member.UserId, normalizedOwnerId, StringComparison.Ordinal));
        snapshot.OwnerId = normalizedOwnerId;
        snapshot.Members = new List<ServerMemberSnapshot>
        {
            new()
            {
                UserId = normalizedOwnerId,
                Name = string.IsNullOrWhiteSpace(ownerMember?.Name) ? "Owner" : ownerMember.Name,
                Avatar = ownerMember?.Avatar ?? string.Empty,
                RoleId = "owner"
            }
        };

        return NormalizeSnapshot(snapshot, normalizedOwnerId);
    }

    private static List<ServerRoleSnapshot> MergeRoles(List<ServerRoleSnapshot>? existing, List<ServerRoleSnapshot>? incoming)
    {
        var result = new Dictionary<string, ServerRoleSnapshot>(StringComparer.Ordinal);

        foreach (var role in existing ?? Enumerable.Empty<ServerRoleSnapshot>())
        {
            if (!string.IsNullOrWhiteSpace(role.Id))
            {
                result[role.Id] = CloneRole(role);
            }
        }

        foreach (var role in incoming ?? Enumerable.Empty<ServerRoleSnapshot>())
        {
            if (!string.IsNullOrWhiteSpace(role.Id))
            {
                result[role.Id] = CloneRole(role);
            }
        }

        return result.Values.ToList();
    }

    private static List<ServerMemberSnapshot> MergeMembers(
        List<ServerMemberSnapshot>? existing,
        List<ServerMemberSnapshot>? incoming,
        string ownerId)
    {
        var result = new Dictionary<string, ServerMemberSnapshot>(StringComparer.Ordinal);

        foreach (var member in existing ?? Enumerable.Empty<ServerMemberSnapshot>())
        {
            if (!string.IsNullOrWhiteSpace(member.UserId))
            {
                result[member.UserId] = CloneMember(member);
            }
        }

        foreach (var member in incoming ?? Enumerable.Empty<ServerMemberSnapshot>())
        {
            if (string.IsNullOrWhiteSpace(member.UserId))
            {
                continue;
            }

            if (result.TryGetValue(member.UserId, out var existingMember))
            {
                result[member.UserId] = new ServerMemberSnapshot
                {
                    UserId = member.UserId,
                    Name = string.IsNullOrWhiteSpace(member.Name) ? existingMember.Name : member.Name,
                    Avatar = string.IsNullOrWhiteSpace(member.Avatar) ? existingMember.Avatar : member.Avatar,
                    RoleId = string.IsNullOrWhiteSpace(member.RoleId) ? existingMember.RoleId : member.RoleId
                };
            }
            else
            {
                result[member.UserId] = CloneMember(member);
            }
        }

        if (!string.IsNullOrWhiteSpace(ownerId))
        {
            if (result.TryGetValue(ownerId, out var ownerMember))
            {
                ownerMember.RoleId = "owner";
                result[ownerId] = ownerMember;
            }
            else
            {
                result[ownerId] = new ServerMemberSnapshot
                {
                    UserId = ownerId,
                    Name = "Owner",
                    Avatar = string.Empty,
                    RoleId = "owner"
                };
            }
        }

        return result.Values.ToList();
    }

    private static List<ChannelSnapshot> CloneChannels(List<ChannelSnapshot>? channels)
    {
        return (channels ?? Enumerable.Empty<ChannelSnapshot>())
            .Where(channel => !string.IsNullOrWhiteSpace(channel.Id))
            .Select(CloneChannel)
            .ToList();
    }

    private static List<ChannelCategorySnapshot> CloneCategories(List<ChannelCategorySnapshot>? categories)
    {
        return (categories ?? Enumerable.Empty<ChannelCategorySnapshot>())
            .Where(category => !string.IsNullOrWhiteSpace(category.Id))
            .Select(CloneCategory)
            .OrderBy(category => category.Order)
            .ThenBy(category => category.Name, StringComparer.OrdinalIgnoreCase)
            .ToList();
    }

    private static ServerRoleSnapshot CloneRole(ServerRoleSnapshot role)
    {
        return new ServerRoleSnapshot
        {
            Id = role.Id,
            Name = role.Name,
            Color = role.Color,
            Priority = role.Priority,
            Permissions = role.Permissions?.ToList() ?? new List<string>()
        };
    }

    private static ServerMemberSnapshot CloneMember(ServerMemberSnapshot member)
    {
        return new ServerMemberSnapshot
        {
            UserId = member.UserId,
            Name = member.Name,
            Avatar = member.Avatar,
            RoleId = member.RoleId
        };
    }

    private static ChannelCategorySnapshot CloneCategory(ChannelCategorySnapshot category)
    {
        return new ChannelCategorySnapshot
        {
            Id = category.Id,
            Name = category.Name,
            Collapsed = category.Collapsed,
            PrivateCategory = category.PrivateCategory,
            Order = category.Order
        };
    }

    private static ChannelSnapshot CloneChannel(ChannelSnapshot channel)
    {
        return new ChannelSnapshot
        {
            Id = channel.Id,
            Name = channel.Name,
            CategoryId = channel.CategoryId,
            Kind = channel.Kind,
            Order = channel.Order,
            SlowMode = channel.SlowMode,
            Topic = channel.Topic,
            TopicPreview = channel.TopicPreview,
            AgeRestricted = channel.AgeRestricted,
            AutoArchiveDuration = channel.AutoArchiveDuration,
            PermissionsSynced = channel.PermissionsSynced,
            PrivateChannel = channel.PrivateChannel,
            AdvancedPermissionsOpen = channel.AdvancedPermissionsOpen,
            PermissionOverrides = channel.PermissionOverrides is null
                ? null
                : new Dictionary<string, bool>(channel.PermissionOverrides, StringComparer.Ordinal),
            BitrateKbps = channel.BitrateKbps,
            UserLimit = channel.UserLimit,
            VideoQuality = channel.VideoQuality,
            Region = channel.Region,
            Status = channel.Status,
            InvitesPaused = channel.InvitesPaused,
            Invites = channel.Invites,
            Webhooks = channel.Webhooks,
            FollowedChannels = channel.FollowedChannels,
            IntegrationInfoOpen = channel.IntegrationInfoOpen
        };
    }

    private static string NormalizeVoiceChannelStatus(string? value)
    {
        var words = (value ?? string.Empty)
            .Split(new[] { ' ', '\t', '\r', '\n' }, StringSplitOptions.RemoveEmptyEntries)
            .Take(VoiceChannelStatusMaxWords);
        var normalized = string.Join(" ", words);
        return normalized.Length <= VoiceChannelStatusMaxLength
            ? normalized
            : normalized[..VoiceChannelStatusMaxLength].Trim();
    }

    private static bool TryParseScopedVoiceChannelName(string? scopedVoiceChannelName, out string serverId, out string channelId)
    {
        serverId = string.Empty;
        channelId = string.Empty;

        var normalized = scopedVoiceChannelName?.Trim() ?? string.Empty;
        var separatorIndex = normalized.IndexOf("::", StringComparison.Ordinal);
        if (separatorIndex <= 0 || separatorIndex + 2 >= normalized.Length)
        {
            return false;
        }

        serverId = normalized[..separatorIndex].Trim();
        channelId = normalized[(separatorIndex + 2)..].Trim();
        return !string.IsNullOrWhiteSpace(serverId) && !string.IsNullOrWhiteSpace(channelId);
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
}
