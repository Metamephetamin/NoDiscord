using BackNoDiscord.Security;
using System.Security.Claims;

namespace BackNoDiscord.Tests.Security;

public class AuthenticatedUserAccessorTests
{
    [Fact]
    public void TryGetAuthenticatedUser_ReturnsExpectedClaims()
    {
        var principal = new ClaimsPrincipal(new ClaimsIdentity(
            new[]
            {
                new Claim(ClaimTypes.NameIdentifier, "42"),
                new Claim(ClaimTypes.Email, "user@example.com"),
                new Claim("first_name", "Ivan"),
                new Claim("last_name", "Petrov")
            },
            authenticationType: "TestAuth"));

        var success = AuthenticatedUserAccessor.TryGetAuthenticatedUser(principal, out var user);

        Assert.True(success);
        Assert.Equal("42", user.UserId);
        Assert.Equal("user@example.com", user.Email);
        Assert.Equal("Ivan Petrov", user.DisplayName);
    }
}
