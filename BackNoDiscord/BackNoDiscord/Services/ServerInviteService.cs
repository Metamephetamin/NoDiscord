using System.Text.Json;

namespace BackNoDiscord.Services;

public class ServerInviteService
{
    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        WriteIndented = true
    };

    private readonly string _storagePath;
    private readonly object _syncRoot = new();

    public ServerInviteService(IWebHostEnvironment environment)
    {
        var dataDirectory = Path.Combine(environment.ContentRootPath, "App_Data");
        Directory.CreateDirectory(dataDirectory);
        _storagePath = Path.Combine(dataDirectory, "server-invites.json");
    }

    public ServerInviteCreateResult CreateInvite(string ownerUserId, ServerSnapshot snapshot)
    {
        if (string.IsNullOrWhiteSpace(ownerUserId))
        {
            throw new InvalidOperationException("Owner user id is required.");
        }

        var invites = ReadInvites();
        var normalizedSnapshot = NormalizeSnapshot(snapshot, ownerUserId);
        var invite = new ServerInviteRecord
        {
            Code = GenerateUniqueCode(invites),
            OwnerUserId = ownerUserId,
            CreatedAt = DateTimeOffset.UtcNow,
            ExpiresAt = DateTimeOffset.UtcNow.AddDays(7),
            Snapshot = normalizedSnapshot,
        };

        invites.Add(invite);
        SaveInvites(invites);

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

        var invites = ReadInvites();
        var invite = invites.FirstOrDefault(item =>
            string.Equals(item.Code, inviteCode.Trim(), StringComparison.OrdinalIgnoreCase));

        if (invite is null)
        {
            throw new KeyNotFoundException("Invite not found.");
        }

        if (invite.ExpiresAt <= DateTimeOffset.UtcNow)
        {
            throw new InvalidOperationException("Invite has expired.");
        }

        if (invite.RedeemedUserIds.Contains(userId, StringComparer.Ordinal))
        {
            throw new InvalidOperationException("Invite has already been used by this user.");
        }

        var snapshot = CloneSnapshot(invite.Snapshot);
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

        invite.RedeemedUserIds.Add(userId);
        SaveInvites(invites);

        return new ServerInviteRedeemResult
        {
            InviteCode = invite.Code,
            Snapshot = snapshot
        };
    }

    private List<ServerInviteRecord> ReadInvites()
    {
        lock (_syncRoot)
        {
            if (!File.Exists(_storagePath))
            {
                return new List<ServerInviteRecord>();
            }

            var json = File.ReadAllText(_storagePath);
            if (string.IsNullOrWhiteSpace(json))
            {
                return new List<ServerInviteRecord>();
            }

            return JsonSerializer.Deserialize<List<ServerInviteRecord>>(json, JsonOptions) ?? new List<ServerInviteRecord>();
        }
    }

    private void SaveInvites(List<ServerInviteRecord> invites)
    {
        lock (_syncRoot)
        {
            var json = JsonSerializer.Serialize(invites, JsonOptions);
            File.WriteAllText(_storagePath, json);
        }
    }

    private static string GenerateUniqueCode(List<ServerInviteRecord> invites)
    {
        const string alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
        var random = new Random();

        while (true)
        {
            var code = new string(Enumerable.Range(0, 8)
                .Select(_ => alphabet[random.Next(alphabet.Length)])
                .ToArray());

            if (!invites.Any(item => string.Equals(item.Code, code, StringComparison.OrdinalIgnoreCase)))
            {
                return code;
            }
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

public class ServerInviteRecord
{
    public string Code { get; set; } = string.Empty;
    public string OwnerUserId { get; set; } = string.Empty;
    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset ExpiresAt { get; set; }
    public ServerSnapshot Snapshot { get; set; } = new();
    public List<string> RedeemedUserIds { get; set; } = new();
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

public class ServerSnapshot
{
    public string Id { get; set; } = "server";
    public string Name { get; set; } = "Server";
    public string Icon { get; set; } = string.Empty;
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
