using System.Text.Json;

namespace BackNoDiscord.Services;

public class ServerStateService
{
    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        WriteIndented = true
    };

    private readonly string _storagePath;
    private readonly object _syncRoot = new();

    public ServerStateService(IWebHostEnvironment environment)
    {
        var dataDirectory = Path.Combine(environment.ContentRootPath, "App_Data");
        Directory.CreateDirectory(dataDirectory);
        _storagePath = Path.Combine(dataDirectory, "shared-servers.json");
    }

    public ServerSnapshot UpsertSnapshot(ServerSnapshot snapshot, string fallbackOwnerUserId)
    {
        var servers = ReadServers();
        var normalized = NormalizeSnapshot(snapshot, fallbackOwnerUserId);

        if (servers.TryGetValue(normalized.Id, out var existing))
        {
            normalized = MergeSnapshots(existing, normalized, fallbackOwnerUserId);
        }

        servers[normalized.Id] = normalized;
        SaveServers(servers);
        return CloneSnapshot(normalized);
    }

    public ServerSnapshot? GetSnapshot(string serverId)
    {
        if (string.IsNullOrWhiteSpace(serverId))
        {
            return null;
        }

        var servers = ReadServers();
        return servers.TryGetValue(serverId.Trim(), out var snapshot)
            ? CloneSnapshot(snapshot)
            : null;
    }

    public ServerSnapshot AddMember(string serverId, string userId, string name, string avatar)
    {
        var servers = ReadServers();
        if (!servers.TryGetValue(serverId, out var snapshot))
        {
            throw new KeyNotFoundException("Server snapshot not found.");
        }

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

        servers[serverId] = snapshot;
        SaveServers(servers);
        return CloneSnapshot(snapshot);
    }

    private Dictionary<string, ServerSnapshot> ReadServers()
    {
        lock (_syncRoot)
        {
            if (!File.Exists(_storagePath))
            {
                return new Dictionary<string, ServerSnapshot>(StringComparer.Ordinal);
            }

            var json = File.ReadAllText(_storagePath);
            if (string.IsNullOrWhiteSpace(json))
            {
                return new Dictionary<string, ServerSnapshot>(StringComparer.Ordinal);
            }

            return JsonSerializer.Deserialize<Dictionary<string, ServerSnapshot>>(json, JsonOptions)
                ?? new Dictionary<string, ServerSnapshot>(StringComparer.Ordinal);
        }
    }

    private void SaveServers(Dictionary<string, ServerSnapshot> servers)
    {
        lock (_syncRoot)
        {
            var json = JsonSerializer.Serialize(servers, JsonOptions);
            File.WriteAllText(_storagePath, json);
        }
    }

    private static ServerSnapshot NormalizeSnapshot(ServerSnapshot snapshot, string ownerUserId)
    {
        var normalized = CloneSnapshot(snapshot);
        normalized.Id = string.IsNullOrWhiteSpace(normalized.Id) ? "server" : normalized.Id.Trim();
        normalized.Name = string.IsNullOrWhiteSpace(normalized.Name) ? "Server" : normalized.Name.Trim();
        normalized.Icon ??= string.Empty;
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

    private static ServerSnapshot MergeSnapshots(ServerSnapshot existing, ServerSnapshot incoming, string fallbackOwnerUserId)
    {
        var merged = NormalizeSnapshot(incoming, fallbackOwnerUserId);
        var normalizedExisting = NormalizeSnapshot(existing, fallbackOwnerUserId);

        merged.OwnerId = string.IsNullOrWhiteSpace(merged.OwnerId)
            ? normalizedExisting.OwnerId
            : merged.OwnerId;

        merged.Roles = MergeRoles(normalizedExisting.Roles, merged.Roles);
        merged.Members = MergeMembers(normalizedExisting.Members, merged.Members, merged.OwnerId);
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

    private static ChannelSnapshot CloneChannel(ChannelSnapshot channel)
    {
        return new ChannelSnapshot
        {
            Id = channel.Id,
            Name = channel.Name
        };
    }

    private static ServerSnapshot CloneSnapshot(ServerSnapshot snapshot)
    {
        var json = JsonSerializer.Serialize(snapshot, JsonOptions);
        return JsonSerializer.Deserialize<ServerSnapshot>(json, JsonOptions) ?? new ServerSnapshot();
    }
}
