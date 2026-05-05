using BackNoDiscord;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;

var connectionString = Environment.GetEnvironmentVariable("LOAD_TEST_CONNECTION_STRING")
    ?? Environment.GetEnvironmentVariable("ConnectionStrings__DefaultConnection");
var password = Environment.GetEnvironmentVariable("LOAD_TEST_PASSWORD") ?? string.Empty;
var emailPrefix = Environment.GetEnvironmentVariable("LOAD_TEST_EMAIL_PREFIX") ?? "tendload";
var emailDomain = Environment.GetEnvironmentVariable("LOAD_TEST_EMAIL_DOMAIN") ?? "gmail.com";
var startIndex = ReadPositiveInt("LOAD_TEST_START_INDEX", 1);
var userCount = ReadPositiveInt("LOAD_TEST_USER_COUNT", 100);
var resetPassword = string.Equals(Environment.GetEnvironmentVariable("LOAD_TEST_RESET_PASSWORD"), "true", StringComparison.OrdinalIgnoreCase);

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
}

await dbContext.SaveChangesAsync();

Console.WriteLine(System.Text.Json.JsonSerializer.Serialize(new
{
    emailPrefix,
    emailDomain,
    startIndex,
    userCount,
    created,
    updated,
    unchanged,
    resetPassword,
}, new System.Text.Json.JsonSerializerOptions { WriteIndented = true }));

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
