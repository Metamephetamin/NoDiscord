using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;
using System.ComponentModel.DataAnnotations;
using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;

namespace BackNoDiscord;

[ApiController]
[Route("api/[controller]")]
public class AuthController : ControllerBase
{
    private readonly AppDbContext _context;
    private readonly IConfiguration _config;
    private readonly PasswordHasher<User> _passwordHasher;

    public AuthController(AppDbContext context, IConfiguration config)
    {
        _context = context;
        _config = config;
        _passwordHasher = new PasswordHasher<User>();
    }

    [HttpPost("register")]
    [EnableRateLimiting("auth")]
    public async Task<IActionResult> Register([FromBody] RegisterDto dto)
    {
        if (!ModelState.IsValid)
        {
            return ValidationProblem(ModelState);
        }

        var normalizedEmail = dto.email.Trim().ToLowerInvariant();

        if (await _context.Users.AnyAsync(u => u.email == normalizedEmail))
        {
            return BadRequest(new { message = "Email already exists" });
        }

        var user = new User
        {
            first_name = dto.first_name.Trim(),
            last_name = dto.last_name.Trim(),
            email = normalizedEmail
        };

        user.password_hash = _passwordHasher.HashPassword(user, dto.password);

        _context.Users.Add(user);
        await _context.SaveChangesAsync();

        await RevokeActiveRefreshTokensAsync(user.id);
        var authSession = await IssueAuthSessionAsync(user);
        return Ok(BuildAuthResponse(user, authSession));
    }

    [HttpPost("login")]
    [EnableRateLimiting("auth")]
    public async Task<IActionResult> Login([FromBody] LoginDto dto)
    {
        if (!ModelState.IsValid)
        {
            return ValidationProblem(ModelState);
        }

        var normalizedEmail = dto.email.Trim().ToLowerInvariant();
        var user = await _context.Users.FirstOrDefaultAsync(u => u.email == normalizedEmail);

        if (user == null)
        {
            return BadRequest(new { message = "Invalid email or password" });
        }

        var result = _passwordHasher.VerifyHashedPassword(user, user.password_hash, dto.password);
        if (result == PasswordVerificationResult.Failed)
        {
            return BadRequest(new { message = "Invalid email or password" });
        }

        if (result == PasswordVerificationResult.SuccessRehashNeeded)
        {
            user.password_hash = _passwordHasher.HashPassword(user, dto.password);
            await _context.SaveChangesAsync();
        }

        await RevokeActiveRefreshTokensAsync(user.id);
        var authSession = await IssueAuthSessionAsync(user);
        return Ok(BuildAuthResponse(user, authSession));
    }

    [HttpPost("refresh")]
    [EnableRateLimiting("auth")]
    public async Task<IActionResult> Refresh([FromBody] RefreshTokenDto dto)
    {
        if (!ModelState.IsValid)
        {
            return ValidationProblem(ModelState);
        }

        var tokenHash = HashToken(dto.refreshToken);
        var storedToken = await _context.RefreshTokens
            .Include(item => item.User)
            .FirstOrDefaultAsync(item => item.TokenHash == tokenHash);

        if (storedToken?.User == null)
        {
            return Unauthorized(new { message = "Refresh token is invalid." });
        }

        if (storedToken.RevokedAt.HasValue || storedToken.ExpiresAt <= DateTimeOffset.UtcNow)
        {
            return Unauthorized(new { message = "Refresh token has expired." });
        }

        storedToken.RevokedAt = DateTimeOffset.UtcNow;
        var authSession = await IssueAuthSessionAsync(storedToken.User);
        storedToken.ReplacedByTokenHash = HashToken(authSession.RefreshToken);
        await _context.SaveChangesAsync();

        return Ok(BuildAuthResponse(storedToken.User, authSession));
    }

    [HttpPost("logout")]
    [EnableRateLimiting("auth")]
    public async Task<IActionResult> Logout([FromBody] RefreshTokenDto dto)
    {
        if (!ModelState.IsValid)
        {
            return ValidationProblem(ModelState);
        }

        var tokenHash = HashToken(dto.refreshToken);
        var storedToken = await _context.RefreshTokens.FirstOrDefaultAsync(item => item.TokenHash == tokenHash);
        if (storedToken is null)
        {
            return Ok(new { revoked = false });
        }

        if (!storedToken.RevokedAt.HasValue)
        {
            storedToken.RevokedAt = DateTimeOffset.UtcNow;
            await _context.SaveChangesAsync();
        }

        return Ok(new { revoked = true });
    }

    [HttpGet("me")]
    [Authorize(AuthenticationSchemes = JwtBearerDefaults.AuthenticationScheme)]
    public async Task<IActionResult> Me()
    {
        var userIdClaim = User.FindFirstValue(ClaimTypes.NameIdentifier)
                         ?? User.FindFirstValue(JwtRegisteredClaimNames.Sub);

        if (string.IsNullOrWhiteSpace(userIdClaim) || !int.TryParse(userIdClaim, out var userId))
        {
            return Unauthorized();
        }

        var user = await _context.Users.AsNoTracking().FirstOrDefaultAsync(u => u.id == userId);
        if (user == null)
        {
            return Unauthorized();
        }

        return Ok(new
        {
            id = user.id,
            first_name = user.first_name,
            last_name = user.last_name,
            email = user.email
        });
    }

    private async Task RevokeActiveRefreshTokensAsync(int userId)
    {
        var activeTokens = await _context.RefreshTokens
            .Where(item => item.UserId == userId && !item.RevokedAt.HasValue && item.ExpiresAt > DateTimeOffset.UtcNow)
            .ToListAsync();

        if (activeTokens.Count == 0)
        {
            return;
        }

        var revokedAt = DateTimeOffset.UtcNow;
        foreach (var token in activeTokens)
        {
            token.RevokedAt = revokedAt;
        }

        await _context.SaveChangesAsync();
    }

    private async Task<AuthSessionResult> IssueAuthSessionAsync(User user)
    {
        var accessTokenExpiresAt = DateTimeOffset.UtcNow.AddMinutes(GetAccessTokenLifetimeMinutes());
        var refreshTokenExpiresAt = DateTimeOffset.UtcNow.AddDays(GetRefreshTokenLifetimeDays());
        var refreshToken = GenerateRefreshToken();

        _context.RefreshTokens.Add(new RefreshTokenRecord
        {
            UserId = user.id,
            TokenHash = HashToken(refreshToken),
            CreatedAt = DateTimeOffset.UtcNow,
            ExpiresAt = refreshTokenExpiresAt
        });

        await _context.SaveChangesAsync();

        return new AuthSessionResult
        {
            AccessToken = GenerateJwtToken(user, accessTokenExpiresAt.UtcDateTime),
            RefreshToken = refreshToken,
            AccessTokenExpiresAt = accessTokenExpiresAt,
            RefreshTokenExpiresAt = refreshTokenExpiresAt
        };
    }

    private object BuildAuthResponse(User user, AuthSessionResult authSession)
    {
        return new
        {
            user.id,
            user.first_name,
            user.last_name,
            user.email,
            token = authSession.AccessToken,
            refreshToken = authSession.RefreshToken,
            accessTokenExpiresAt = authSession.AccessTokenExpiresAt.ToString("O"),
            refreshTokenExpiresAt = authSession.RefreshTokenExpiresAt.ToString("O")
        };
    }

    private string GenerateJwtToken(User user, DateTime expiresAtUtc)
    {
        var jwtSettings = _config.GetSection("Jwt");
        var keyBytes = Encoding.UTF8.GetBytes(jwtSettings["Key"] ?? throw new InvalidOperationException("Jwt:Key is not configured"));
        var key = new SymmetricSecurityKey(keyBytes);
        var creds = new SigningCredentials(key, SecurityAlgorithms.HmacSha256);

        var claims = new List<Claim>
        {
            new(JwtRegisteredClaimNames.Sub, user.id.ToString()),
            new(ClaimTypes.NameIdentifier, user.id.ToString()),
            new(JwtRegisteredClaimNames.Email, user.email),
            new(ClaimTypes.Email, user.email),
            new("first_name", user.first_name),
            new("last_name", user.last_name)
        };

        var token = new JwtSecurityToken(
            issuer: jwtSettings["Issuer"],
            audience: jwtSettings["Audience"],
            claims: claims,
            expires: expiresAtUtc,
            signingCredentials: creds
        );

        return new JwtSecurityTokenHandler().WriteToken(token);
    }

    private int GetAccessTokenLifetimeMinutes()
    {
        return int.TryParse(_config["Jwt:AccessTokenMinutes"], out var configured) && configured > 0
            ? configured
            : 20;
    }

    private int GetRefreshTokenLifetimeDays()
    {
        return int.TryParse(_config["Jwt:RefreshTokenDays"], out var configured) && configured > 0
            ? configured
            : 30;
    }

    private static string GenerateRefreshToken()
    {
        return Convert.ToBase64String(RandomNumberGenerator.GetBytes(64));
    }

    private static string HashToken(string rawToken)
    {
        return Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(rawToken.Trim())));
    }
}

public class RegisterDto
{
    [Required]
    public string first_name { get; set; } = string.Empty;

    [Required]
    public string last_name { get; set; } = string.Empty;

    [Required]
    [EmailAddress]
    public string email { get; set; } = string.Empty;

    [Required]
    [MinLength(6)]
    public string password { get; set; } = string.Empty;
}

public class LoginDto
{
    [Required]
    [EmailAddress]
    public string email { get; set; } = string.Empty;

    [Required]
    public string password { get; set; } = string.Empty;
}

public class RefreshTokenDto
{
    [Required]
    public string refreshToken { get; set; } = string.Empty;
}

public class AuthSessionResult
{
    public string AccessToken { get; set; } = string.Empty;
    public string RefreshToken { get; set; } = string.Empty;
    public DateTimeOffset AccessTokenExpiresAt { get; set; }
    public DateTimeOffset RefreshTokenExpiresAt { get; set; }
}
