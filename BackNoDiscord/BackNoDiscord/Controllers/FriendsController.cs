using BackNoDiscord.Security;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace BackNoDiscord.Controllers;

[ApiController]
[Route("api/friends")]
[Authorize(AuthenticationSchemes = JwtBearerDefaults.AuthenticationScheme)]
public class FriendsController : ControllerBase
{
    private readonly AppDbContext _context;

    public FriendsController(AppDbContext context)
    {
        _context = context;
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
                    directChannelId = BuildDirectChannelId(currentUserId, friend.id)
                };
            });

        return Ok(result);
    }

    [HttpGet("search")]
    public async Task<IActionResult> SearchFriends([FromQuery] string? q)
    {
        if (!AuthenticatedUserAccessor.TryGetAuthenticatedUser(User, out var currentUser) ||
            !int.TryParse(currentUser.UserId, out var currentUserId))
        {
            return Unauthorized();
        }

        var query = q?.Trim();
        if (string.IsNullOrWhiteSpace(query) || query.Length < 2)
        {
            return Ok(Array.Empty<object>());
        }

        var normalizedQuery = query.ToLowerInvariant();
        var existingFriendIds = await _context.Friendships
            .AsNoTracking()
            .Where(item => item.UserLowId == currentUserId || item.UserHighId == currentUserId)
            .Select(item => item.UserLowId == currentUserId ? item.UserHighId : item.UserLowId)
            .Distinct()
            .ToListAsync();

        var result = await _context.Users
            .AsNoTracking()
            .Where(item => item.id != currentUserId && !existingFriendIds.Contains(item.id))
            .Where(item =>
                item.email.ToLower().Contains(normalizedQuery) ||
                item.first_name.ToLower().Contains(normalizedQuery) ||
                item.last_name.ToLower().Contains(normalizedQuery) ||
                (item.first_name + " " + item.last_name).ToLower().Contains(normalizedQuery))
            .OrderBy(item => item.first_name)
            .ThenBy(item => item.last_name)
            .Take(12)
            .Select(item => new
            {
                id = item.id,
                first_name = item.first_name,
                last_name = item.last_name,
                email = item.email,
                directChannelId = BuildDirectChannelId(currentUserId, item.id)
            })
            .ToListAsync();

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

        return Ok(new
        {
            id = friend.id,
            first_name = friend.first_name,
            last_name = friend.last_name,
            email = friend.email,
            directChannelId = BuildDirectChannelId(currentUserId, friend.id)
        });
    }

    private static (int LowId, int HighId) NormalizePair(int first, int second)
    {
        return first <= second ? (first, second) : (second, first);
    }

    private static string BuildDirectChannelId(int firstUserId, int secondUserId)
    {
        var (lowId, highId) = NormalizePair(firstUserId, secondUserId);
        return $"dm:{lowId}:{highId}";
    }
}

public class AddFriendRequest
{
    public string Email { get; set; } = string.Empty;
    public int? UserId { get; set; }
}
