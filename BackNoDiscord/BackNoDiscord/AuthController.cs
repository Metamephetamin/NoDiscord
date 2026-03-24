//using Microsoft.AspNetCore.Authentication.JwtBearer;
//using Microsoft.AspNetCore.Authorization;
//using Microsoft.AspNetCore.Identity;
//using Microsoft.AspNetCore.Mvc;
//using Microsoft.EntityFrameworkCore;
//using Microsoft.IdentityModel.Tokens;
//using System.IdentityModel.Tokens.Jwt;
//using System.Security.Claims;
//using System.Text;

//namespace BackNoDiscord
//{
//    [ApiController]
//    [Route("api/[controller]")]
//    public class AuthController : ControllerBase
//    {
//        private readonly AppDbContext _context;
//        private readonly IConfiguration _config;
//        private readonly PasswordHasher<User> _passwordHasher;

//        public AuthController(AppDbContext context, IConfiguration config)
//        {
//            _context = context;
//            _config = config;
//            _passwordHasher = new PasswordHasher<User>();
//        }

//        [HttpPost("register")]
//        public async Task<IActionResult> Register([FromBody] RegisterDto dto)
//        {
//            if (await _context.Users.AnyAsync(u => u.email == dto.email))
//                return BadRequest(new { message = "Email already exists" });

//            var user = new User
//            {
//                first_name = dto.first_name,
//                last_name = dto.last_name,
//                email = dto.email
//            };

//            user.password_hash = _passwordHasher.HashPassword(user, dto.password);

//            _context.Users.Add(user);
//            await _context.SaveChangesAsync();

//            var token = GenerateJwtToken(user);

//            return Ok(new
//            {
//                user.id,
//                user.first_name,
//                user.last_name,
//                user.email,
//                token
//            });
//        }

//        [HttpPost("login")]
//        public async Task<IActionResult> Login([FromBody] LoginDto dto)
//        {
//            var user = await _context.Users.FirstOrDefaultAsync(u => u.email == dto.email);
//            if (user == null)
//                return BadRequest(new { message = "Invalid email or password" });

//            var result = _passwordHasher.VerifyHashedPassword(user, user.password_hash, dto.password);
//            if (result == PasswordVerificationResult.Failed)
//                return BadRequest(new { message = "Invalid email or password" });

//            var token = GenerateJwtToken(user);

//            return Ok(new
//            {
//                user.id,
//                user.first_name,
//                user.last_name,
//                user.email,
//                token
//            });
//        }

//        //=======Autologin=======

//        [HttpGet("me")]
//        [Authorize(AuthenticationSchemes = JwtBearerDefaults.AuthenticationScheme)]
//        public async Task<IActionResult> Me()
//        {
//            Console.WriteLine("=== Me endpoint called ===");
//            Console.WriteLine("User.Identity.IsAuthenticated: " + User.Identity?.IsAuthenticated);

//            foreach (var claim in User.Claims)
//            {
//                Console.WriteLine($"Claim type: {claim.Type}, value: {claim.Value}");
//            }

//            var userIdClaim = User.FindFirstValue(ClaimTypes.NameIdentifier);
//            if (string.IsNullOrEmpty(userIdClaim))
//                return Unauthorized();

//            if (!int.TryParse(userIdClaim, out var userId))
//                return Unauthorized();

//            var user = await _context.Users.FirstOrDefaultAsync(u => u.id == userId);
//            if (user == null) return Unauthorized();

//            return Ok(new
//            {
//                id = user.id,
//                first_name = user.first_name,
//                last_name = user.last_name,
//                email = user.email
//            });
//        }


//        private string GenerateJwtToken(User user)
//        {
//            var jwtSettings = _config.GetSection("Jwt");
//            var key = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(jwtSettings["Key"]));
//            var creds = new SigningCredentials(key, SecurityAlgorithms.HmacSha256);

//            var claims = new[]
//            {
//                new Claim(JwtRegisteredClaimNames.Sub, user.id.ToString()),
//                new Claim(JwtRegisteredClaimNames.Email, user.email),
//                new Claim("first_name", user.first_name),
//                new Claim("last_name", user.last_name)
//            };

//            var token = new JwtSecurityToken(
//                issuer: jwtSettings["Issuer"],
//                audience: jwtSettings["Audience"],
//                claims: claims,
//                expires: DateTime.UtcNow.AddHours(999),
//                signingCredentials: creds
//            );

//            return new JwtSecurityTokenHandler().WriteToken(token);
//        }
//    }

//    public class User
//    {
//        public int id { get; set; }
//        public string first_name { get; set; }
//        public string last_name { get; set; }
//        public string email { get; set; }
//        public string password_hash { get; set; }
//    }

//    public class RegisterDto
//    {
//        [System.ComponentModel.DataAnnotations.Required]
//        public string first_name { get; set; }

//        [System.ComponentModel.DataAnnotations.Required]
//        public string last_name { get; set; }

//        [System.ComponentModel.DataAnnotations.Required]
//        [System.ComponentModel.DataAnnotations.EmailAddress]
//        public string email { get; set; }

//        [System.ComponentModel.DataAnnotations.Required]
//        public string password { get; set; }
//    }

//    public class LoginDto
//    {
//        [System.ComponentModel.DataAnnotations.Required]
//        [System.ComponentModel.DataAnnotations.EmailAddress]
//        public string email { get; set; }

//        [System.ComponentModel.DataAnnotations.Required]
//        public string password { get; set; }
//    }
//}


using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;
using System.ComponentModel.DataAnnotations;
using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
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
    public async Task<IActionResult> Register([FromBody] RegisterDto dto)
    {
        if (!ModelState.IsValid)
            return ValidationProblem(ModelState);

        var normalizedEmail = dto.email.Trim().ToLowerInvariant();

        if (await _context.Users.AnyAsync(u => u.email == normalizedEmail))
            return BadRequest(new { message = "Email already exists" });

        var user = new User
        {
            first_name = dto.first_name.Trim(),
            last_name = dto.last_name.Trim(),
            email = normalizedEmail
        };

        user.password_hash = _passwordHasher.HashPassword(user, dto.password);

        _context.Users.Add(user);
        await _context.SaveChangesAsync();

        var token = GenerateJwtToken(user);

        return Ok(new
        {
            user.id,
            user.first_name,
            user.last_name,
            user.email,
            token
        });
    }

    [HttpPost("login")]
    public async Task<IActionResult> Login([FromBody] LoginDto dto)
    {
        if (!ModelState.IsValid)
            return ValidationProblem(ModelState);

        var normalizedEmail = dto.email.Trim().ToLowerInvariant();
        var user = await _context.Users.FirstOrDefaultAsync(u => u.email == normalizedEmail);

        if (user == null)
            return BadRequest(new { message = "Invalid email or password" });

        var result = _passwordHasher.VerifyHashedPassword(user, user.password_hash, dto.password);
        if (result == PasswordVerificationResult.Failed)
            return BadRequest(new { message = "Invalid email or password" });

        var token = GenerateJwtToken(user);

        return Ok(new
        {
            user.id,
            user.first_name,
            user.last_name,
            user.email,
            token
        });
    }

    [HttpGet("me")]
    [Authorize(AuthenticationSchemes = JwtBearerDefaults.AuthenticationScheme)]
    public async Task<IActionResult> Me()
    {
        var userIdClaim = User.FindFirstValue(ClaimTypes.NameIdentifier)
                         ?? User.FindFirstValue(JwtRegisteredClaimNames.Sub);

        if (string.IsNullOrWhiteSpace(userIdClaim) || !int.TryParse(userIdClaim, out var userId))
            return Unauthorized();

        var user = await _context.Users.FirstOrDefaultAsync(u => u.id == userId);
        if (user == null)
            return Unauthorized();

        return Ok(new
        {
            id = user.id,
            first_name = user.first_name,
            last_name = user.last_name,
            email = user.email
        });
    }

    private string GenerateJwtToken(User user)
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
            expires: DateTime.UtcNow.AddHours(12),
            signingCredentials: creds
        );

        return new JwtSecurityTokenHandler().WriteToken(token);
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
