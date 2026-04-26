using Microsoft.EntityFrameworkCore;
using System.Text.Json;
using BackNoDiscord.Security;

namespace BackNoDiscord.Services;

public class ServerStateService
{
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

        for (var index = 0; index < normalized.ChannelCategories.Count; index++)
        {
            var category = normalized.ChannelCategories[index];
            category.Id = category.Id?.Trim() ?? string.Empty;
            category.Name = string.IsNullOrWhiteSpace(category.Name) ? $"Category {index + 1}" : category.Name.Trim();
            category.Order = category.Order < 0 ? index : category.Order;
        }

        foreach (var channel in normalized.TextChannels)
        {
            channel.Id = channel.Id?.Trim() ?? string.Empty;
            channel.Name = string.IsNullOrWhiteSpace(channel.Name) ? "general" : channel.Name.Trim();
            channel.CategoryId = channel.CategoryId?.Trim() ?? string.Empty;
            channel.Kind = string.IsNullOrWhiteSpace(channel.Kind) ? "text" : channel.Kind.Trim();
        }

        foreach (var channel in normalized.VoiceChannels)
        {
            channel.Id = channel.Id?.Trim() ?? string.Empty;
            channel.Name = string.IsNullOrWhiteSpace(channel.Name) ? "Voice" : channel.Name.Trim();
            channel.CategoryId = channel.CategoryId?.Trim() ?? string.Empty;
            channel.Kind = string.IsNullOrWhiteSpace(channel.Kind) ? "voice" : channel.Kind.Trim();
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

    private static ServerSnapshot MergeSnapshots(ServerSnapshot existing, ServerSnapshot incoming, string fallbackOwnerUserId)
    {
        var merged = NormalizeSnapshot(incoming, fallbackOwnerUserId);
        var normalizedExisting = NormalizeSnapshot(existing, fallbackOwnerUserId);

        merged.OwnerId = string.IsNullOrWhiteSpace(merged.OwnerId)
            ? normalizedExisting.OwnerId
            : merged.OwnerId;

        merged.Roles = MergeRoles(normalizedExisting.Roles, merged.Roles);
        merged.Members = MergeMembers(normalizedExisting.Members, merged.Members, merged.OwnerId);
        merged.ChannelCategories = MergeCategories(normalizedExisting.ChannelCategories, merged.ChannelCategories);
        merged.TextChannels = MergeChannels(normalizedExisting.TextChannels, merged.TextChannels);
        merged.VoiceChannels = MergeChannels(normalizedExisting.VoiceChannels, merged.VoiceChannels);

        return NormalizeSnapshot(merged, merged.OwnerId);
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

    private static List<ChannelSnapshot> MergeChannels(List<ChannelSnapshot>? existing, List<ChannelSnapshot>? incoming)
    {
        var result = new Dictionary<string, ChannelSnapshot>(StringComparer.Ordinal);

        foreach (var channel in existing ?? Enumerable.Empty<ChannelSnapshot>())
        {
            if (!string.IsNullOrWhiteSpace(channel.Id))
            {
                result[channel.Id] = CloneChannel(channel);
            }
        }

        foreach (var channel in incoming ?? Enumerable.Empty<ChannelSnapshot>())
        {
            if (!string.IsNullOrWhiteSpace(channel.Id))
            {
                result[channel.Id] = CloneChannel(channel);
            }
        }

        return result.Values.ToList();
    }

    private static List<ChannelCategorySnapshot> MergeCategories(
        List<ChannelCategorySnapshot>? existing,
        List<ChannelCategorySnapshot>? incoming)
    {
        var result = new Dictionary<string, ChannelCategorySnapshot>(StringComparer.Ordinal);

        foreach (var category in existing ?? Enumerable.Empty<ChannelCategorySnapshot>())
        {
            if (!string.IsNullOrWhiteSpace(category.Id))
            {
                result[category.Id] = CloneCategory(category);
            }
        }

        foreach (var category in incoming ?? Enumerable.Empty<ChannelCategorySnapshot>())
        {
            if (!string.IsNullOrWhiteSpace(category.Id))
            {
                result[category.Id] = CloneCategory(category);
            }
        }

        return result.Values
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
            InvitesPaused = channel.InvitesPaused,
            Invites = channel.Invites,
            Webhooks = channel.Webhooks,
            FollowedChannels = channel.FollowedChannels,
            IntegrationInfoOpen = channel.IntegrationInfoOpen
        };
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
