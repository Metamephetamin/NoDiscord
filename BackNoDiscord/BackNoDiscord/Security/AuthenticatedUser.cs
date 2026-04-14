using System.Security.Claims;

namespace BackNoDiscord.Security;

public sealed record AuthenticatedUser(
    string UserId,
    string Email,
    string Nickname,
    string FirstName,
    string LastName)
{
    public string DisplayName
    {
        get
        {
            if (!string.IsNullOrWhiteSpace(Nickname))
            {
                return Nickname.Trim();
            }

            var fullName = string.Join(
                " ",
                new[] { FirstName, LastName }
                    .Where(value => !string.IsNullOrWhiteSpace(value))
                    .Select(value => value.Trim()));

            return string.IsNullOrWhiteSpace(fullName) ? Email : fullName;
        }
    }
}

public static class AuthenticatedUserAccessor
{
    public static bool TryGetAuthenticatedUser(ClaimsPrincipal? principal, out AuthenticatedUser user)
    {
        user = new AuthenticatedUser(string.Empty, string.Empty, string.Empty, string.Empty, string.Empty);

        if (principal?.Identity?.IsAuthenticated != true)
        {
            return false;
        }

        var userId = principal.FindFirstValue(ClaimTypes.NameIdentifier)
                     ?? principal.FindFirstValue("sub");
        var email = principal.FindFirstValue(ClaimTypes.Email)
                    ?? principal.FindFirstValue("email");
        var phoneNumber = principal.FindFirstValue("phone_number");

        if (string.IsNullOrWhiteSpace(userId))
        {
            return false;
        }

        user = new AuthenticatedUser(
            userId.Trim(),
            string.IsNullOrWhiteSpace(email) ? phoneNumber?.Trim() ?? string.Empty : email.Trim(),
            principal.FindFirstValue("nickname")?.Trim() ?? string.Empty,
            principal.FindFirstValue("first_name")?.Trim() ?? string.Empty,
            principal.FindFirstValue("last_name")?.Trim() ?? string.Empty);

        return true;
    }
}
