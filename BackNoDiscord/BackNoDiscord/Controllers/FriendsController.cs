using BackNoDiscord.Security;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.AspNetCore.SignalR;

namespace BackNoDiscord.Controllers;

[ApiController]
[Route("api/friends")]
[Authorize(AuthenticationSchemes = JwtBearerDefaults.AuthenticationScheme)]
public class FriendsController : ControllerBase
{
    private readonly AppDbContext _context;
    private readonly IHubContext<ChatHub> _chatHubContext;

    public FriendsController(AppDbContext context, IHubContext<ChatHub> chatHubContext)
    {
        _context = context;
        _chatHubContext = chatHubContext;
    }

    [HttpGet]
    public async Task<IActionResult> GetFriends()
    {
        if (!AuthenticatedUserAccessor.TryGetAuthenticatedUser(User, out var currentUser) ||
            !int.TryParse(currentUser.UserId, out var currentUserId))
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

        var result = friendships
            .Select(item => item.UserLowId == currentUserId ? item.UserHighId : item.UserLowId)
            .Distinct()
            .Where(friendId => users.ContainsKey(friendId))
            .Select(friendId =>
            {
                var friend = users[friendId];
                return new
                {
                    id = friend.id,
                    first_name = friend.first_name,
                    last_name = friend.last_name,
                    email = friend.email,
                    avatar_url = friend.avatar_url ?? string.Empty,
                    directChannelId = BuildDirectChannelId(currentUserId, friend.id)
                };
            });

        return Ok(result);
    }

    [HttpGet("search")]
    public async Task<IActionResult> SearchFriends([FromQuery] string? q, [FromQuery] string? mode)
    {
        if (!AuthenticatedUserAccessor.TryGetAuthenticatedUser(User, out var currentUser) ||
            !int.TryParse(currentUser.UserId, out var currentUserId))
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

        var usersQuery = _context.Users
            .AsNoTracking()
            .Where(item => item.id != currentUserId && !existingFriendIds.Contains(item.id))
            .Select(item => new
            {
                id = item.id,
                first_name = item.first_name,
                last_name = item.last_name,
                email = item.email,
                avatar_url = item.avatar_url ?? string.Empty,
                directChannelId = BuildDirectChannelId(currentUserId, item.id)
            });

        var candidates = parsedSearch.Mode == FriendSearchMode.Email
            ? await usersQuery
                .Where(item => (item.email ?? string.Empty).ToLower().Contains(normalizedQuery))
                .ToListAsync()
            : await usersQuery
                .Where(item =>
                    item.first_name.ToLower().Contains(normalizedQuery) ||
                    item.last_name.ToLower().Contains(normalizedQuery) ||
                    (item.first_name + " " + item.last_name).ToLower().Contains(normalizedQuery) ||
                    (item.last_name + " " + item.first_name).ToLower().Contains(normalizedQuery) ||
                    ((item.first_name + item.last_name).ToLower()).Contains(condensedQuery) ||
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

        return Ok(result);
    }

    [HttpPost("add")]
    public async Task<IActionResult> AddFriend([FromBody] AddFriendRequest request)
    {
        if (!AuthenticatedUserAccessor.TryGetAuthenticatedUser(User, out var currentUser) ||
            !int.TryParse(currentUser.UserId, out var currentUserId))
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
            : await _context.Users.AsNoTracking().FirstOrDefaultAsync(item => item.email == email);

        if (friend is null)
        {
            return NotFound(new { message = "Пользователь не найден." });
        }

        if (friend.id == currentUserId)
        {
            return BadRequest(new { message = "Нельзя добавить самого себя." });
        }

        var (lowId, highId) = NormalizePair(currentUserId, friend.id);
        var existing = await _context.Friendships.AsNoTracking().AnyAsync(item => item.UserLowId == lowId && item.UserHighId == highId);
        if (!existing)
        {
            _context.Friendships.Add(new FriendshipRecord
            {
                UserLowId = lowId,
                UserHighId = highId,
                CreatedAt = DateTimeOffset.UtcNow
            });

            await _context.SaveChangesAsync();
        }

        await BroadcastFriendListUpdatedAsync(currentUserId, friend.id);

        return Ok(new
        {
            id = friend.id,
            first_name = friend.first_name,
            last_name = friend.last_name,
            email = friend.email,
            avatar_url = friend.avatar_url ?? string.Empty,
            directChannelId = BuildDirectChannelId(currentUserId, friend.id)
        });
    }

    private static (int LowId, int HighId) NormalizePair(int first, int second)
    {
        return first <= second ? (first, second) : (second, first);
    }

    private static string BuildDirectChannelId(int firstUserId, int secondUserId)
    {
        return DirectMessageChannels.BuildChannelId(firstUserId, secondUserId);
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

        if (queryTokens.Count > 1 && queryTokens.All((token) =>
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
        var directChannelId = BuildDirectChannelId(firstUserId, secondUserId);
        var payload = new
        {
            firstUserId,
            secondUserId,
            directChannelId
        };

        await _chatHubContext.Clients.Users(firstUserId.ToString(), secondUserId.ToString())
            .SendAsync("FriendListUpdated", payload);
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
