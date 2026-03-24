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

    private static ServerSnapshot CloneSnapshot(ServerSnapshot snapshot)
    {
        var json = JsonSerializer.Serialize(snapshot, JsonOptions);
        return JsonSerializer.Deserialize<ServerSnapshot>(json, JsonOptions) ?? new ServerSnapshot();
    }
}
