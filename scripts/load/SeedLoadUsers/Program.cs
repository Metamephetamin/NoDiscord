using BackNoDiscord;
using BackNoDiscord.Services;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;
using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;
using System.Text.Json;

LoadDotEnv();

var connectionString = Environment.GetEnvironmentVariable("LOAD_TEST_CONNECTION_STRING")
    ?? Environment.GetEnvironmentVariable("ConnectionStrings__DefaultConnection")
    ?? Environment.GetEnvironmentVariable("ConnectionStrings:DefaultConnection");
var password = Environment.GetEnvironmentVariable("LOAD_TEST_PASSWORD") ?? string.Empty;
var emailPrefix = Environment.GetEnvironmentVariable("LOAD_TEST_EMAIL_PREFIX") ?? "tendload";
var emailDomain = Environment.GetEnvironmentVariable("LOAD_TEST_EMAIL_DOMAIN") ?? "gmail.com";
var startIndex = ReadPositiveInt("LOAD_TEST_START_INDEX", 1);
var userCount = ReadPositiveInt("LOAD_TEST_USER_COUNT", 100);
var resetPassword = string.Equals(Environment.GetEnvironmentVariable("LOAD_TEST_RESET_PASSWORD"), "true", StringComparison.OrdinalIgnoreCase);
var jwtKey = Environment.GetEnvironmentVariable("Jwt__Key")
    ?? Environment.GetEnvironmentVariable("Jwt:Key")
    ?? string.Empty;
var jwtIssuer = Environment.GetEnvironmentVariable("Jwt__Issuer")
    ?? Environment.GetEnvironmentVariable("Jwt:Issuer");
var jwtAudience = Environment.GetEnvironmentVariable("Jwt__Audience")
    ?? Environment.GetEnvironmentVariable("Jwt:Audience");
var accessTokenMinutes = ReadPositiveInt("Jwt__AccessTokenMinutes", ReadPositiveInt("Jwt:AccessTokenMinutes", 120));
var outputFile = Environment.GetEnvironmentVariable("LOAD_TEST_OUTPUT") ?? "scripts/load/.tokens.json";
var targetServerId = Environment.GetEnvironmentVariable("LOAD_TEST_SERVER_ID")
    ?? TryGetServerIdFromVoiceChannel(Environment.GetEnvironmentVariable("LOAD_TEST_VOICE_CHANNEL"));
var matchedServerSnapshot = false;

if (string.IsNullOrWhiteSpace(connectionString))
{
    throw new InvalidOperationException("Set LOAD_TEST_CONNECTION_STRING or ConnectionStrings__DefaultConnection.");
}

if (password.Trim().Length < 6)
{
    throw new InvalidOperationException("Set LOAD_TEST_PASSWORD to at least 6 characters.");
}

var options = new DbContextOptionsBuilder<AppDbContext>()
    .UseNpgsql(connectionString)
    .Options;
await using var dbContext = new AppDbContext(options);
var passwordHasher = new PasswordHasher<User>();

var created = 0;
var updated = 0;
var unchanged = 0;
var addedToServer = 0;
var users = new List<User>();

for (var offset = 0; offset < userCount; offset += 1)
{
    var index = startIndex + offset;
    var suffix = index.ToString("D3");
    var email = $"{emailPrefix}{suffix}@{emailDomain}".ToLowerInvariant();
    var nickname = BuildNickname(emailPrefix, suffix);

    var user = await dbContext.Users.FirstOrDefaultAsync(item => item.email == email);
    if (user is null)
    {
        user = new User
        {
            first_name = "Load",
            last_name = "Test",
            nickname = nickname,
            email = email,
            is_email_verified = true,
            is_phone_verified = false,
        };
        user.password_hash = passwordHasher.HashPassword(user, password);
        dbContext.Users.Add(user);
        users.Add(user);
        created += 1;
        continue;
    }

    var changed = false;
    if (!user.is_email_verified)
    {
        user.is_email_verified = true;
        changed = true;
    }

    if (string.IsNullOrWhiteSpace(user.nickname))
    {
        user.nickname = nickname;
        changed = true;
    }

    if (resetPassword)
    {
        user.password_hash = passwordHasher.HashPassword(user, password);
        changed = true;
    }

    if (changed)
    {
        updated += 1;
    }
    else
    {
        unchanged += 1;
    }

    users.Add(user);
}

await dbContext.SaveChangesAsync();

if (!string.IsNullOrWhiteSpace(targetServerId))
{
    var serverState = new ServerStateService(dbContext);
    matchedServerSnapshot = serverState.GetSnapshot(targetServerId) is not null;
    foreach (var user in users)
    {
        try
        {
            serverState.AddMember(
                targetServerId,
                user.id.ToString(),
                string.IsNullOrWhiteSpace(user.nickname) ? user.email ?? $"Load {user.id}" : user.nickname,
                user.avatar_url ?? string.Empty);
            addedToServer += 1;
        }
        catch (KeyNotFoundException)
        {
            Console.Error.WriteLine($"[load-seed] server snapshot not found: {targetServerId}");
            break;
        }
    }
}

var tokens = string.IsNullOrWhiteSpace(jwtKey)
    ? new List<string>()
    : users.Select(user => GenerateJwtToken(user, jwtKey, jwtIssuer, jwtAudience, accessTokenMinutes)).ToList();

if (tokens.Count > 0)
{
    Directory.CreateDirectory(Path.GetDirectoryName(outputFile) ?? ".");
    File.WriteAllText(outputFile, $"{JsonSerializer.Serialize(new
    {
        baseUrl = Environment.GetEnvironmentVariable("LOAD_TEST_BASE_URL") ?? string.Empty,
        generatedAt = DateTimeOffset.UtcNow.ToString("O"),
        requestedUsers = users.Count,
        tokenCount = tokens.Count,
        tokens,
        users = users.Select(user => new
        {
            email = user.email ?? string.Empty,
            nickname = user.nickname,
            status = "ok"
        })
    }, new JsonSerializerOptions { WriteIndented = true })}\n");
}

Console.WriteLine(JsonSerializer.Serialize(new
{
    emailPrefix,
    emailDomain,
    startIndex,
    userCount,
    created,
    updated,
    unchanged,
    addedToServer,
    matchedServerSnapshot,
    resetPassword,
    tokenCount = tokens.Count,
    outputFile = tokens.Count > 0 ? outputFile : string.Empty,
}, new JsonSerializerOptions { WriteIndented = true }));

static int ReadPositiveInt(string key, int fallback)
{
    return int.TryParse(Environment.GetEnvironmentVariable(key), out var value) && value > 0
        ? value
        : fallback;
}

static string BuildNickname(string prefix, string suffix)
{
    var normalizedPrefix = new string(prefix.Where(char.IsLetterOrDigit).ToArray());
    if (string.IsNullOrWhiteSpace(normalizedPrefix))
    {
        normalizedPrefix = "tendload";
    }

    return $"{normalizedPrefix}{suffix}"[..Math.Min(50, normalizedPrefix.Length + suffix.Length)];
}

static string? TryGetServerIdFromVoiceChannel(string? voiceChannel)
{
    var normalized = (voiceChannel ?? string.Empty).Trim();
    var separatorIndex = normalized.IndexOf("::", StringComparison.Ordinal);
    return separatorIndex > 0 ? normalized[..separatorIndex] : null;
}

static string GenerateJwtToken(User user, string jwtKey, string? issuer, string? audience, int accessTokenMinutes)
{
    if (jwtKey.Length < 32)
    {
        throw new InvalidOperationException("Jwt:Key must be at least 32 characters to generate load-test tokens.");
    }

    var key = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(jwtKey));
    var credentials = new SigningCredentials(key, SecurityAlgorithms.HmacSha256);
    var claims = new List<Claim>
    {
        new(JwtRegisteredClaimNames.Sub, user.id.ToString()),
        new(ClaimTypes.NameIdentifier, user.id.ToString()),
        new("nickname", user.nickname),
        new("first_name", user.first_name),
        new("last_name", user.last_name)
    };

    if (!string.IsNullOrWhiteSpace(user.email))
    {
        claims.Add(new Claim(JwtRegisteredClaimNames.Email, user.email));
        claims.Add(new Claim(ClaimTypes.Email, user.email));
    }

    var token = new JwtSecurityToken(
        issuer: issuer,
        audience: audience,
        claims: claims,
        expires: DateTime.UtcNow.AddMinutes(accessTokenMinutes),
        signingCredentials: credentials);

    return new JwtSecurityTokenHandler().WriteToken(token);
}

static void LoadDotEnv()
{
    var searchRoots = new[]
        {
            Directory.GetCurrentDirectory(),
            AppContext.BaseDirectory,
        }
        .Where(directory => !string.IsNullOrWhiteSpace(directory))
        .Distinct(StringComparer.OrdinalIgnoreCase);

    var envFile = searchRoots
        .SelectMany(EnumerateDotEnvPaths)
        .FirstOrDefault(File.Exists);
    if (string.IsNullOrWhiteSpace(envFile))
    {
        return;
    }

    foreach (var rawLine in File.ReadAllLines(envFile))
    {
        var line = rawLine.Trim();
        if (string.IsNullOrWhiteSpace(line) || line.StartsWith("#", StringComparison.Ordinal))
        {
            continue;
        }

        var separatorIndex = line.IndexOf('=');
        if (separatorIndex <= 0)
        {
            continue;
        }

        var key = line[..separatorIndex].Trim();
        var value = line[(separatorIndex + 1)..].Trim().Trim('"');
        if (string.IsNullOrWhiteSpace(key) || !string.IsNullOrWhiteSpace(Environment.GetEnvironmentVariable(key)))
        {
            continue;
        }

        Environment.SetEnvironmentVariable(key, value);
    }
}

static IEnumerable<string> EnumerateDotEnvPaths(string startDirectory)
{
    var directory = new DirectoryInfo(startDirectory);
    while (directory is not null)
    {
        yield return Path.Combine(directory.FullName, ".env");
        directory = directory.Parent;
    }
}
