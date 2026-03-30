using BackNoDiscord.Security;

namespace BackNoDiscord.Tests.Security;

public class AuthInputPoliciesTests
{
    [Theory]
    [InlineData("User@gmail.com", "user@gmail.com")]
    [InlineData("name@yandex.ru", "name@yandex.ru")]
    [InlineData("test@list.ru", "test@list.ru")]
    [InlineData("hello@mail.ru", "hello@mail.ru")]
    public void TryNormalizeEmail_AllowsSupportedDomains(string input, string expected)
    {
        var result = AuthInputPolicies.TryNormalizeEmail(input, out var normalized, out var error);

        Assert.True(result);
        Assert.Equal(expected, normalized);
        Assert.Equal(string.Empty, error);
    }

    [Fact]
    public void TryNormalizeEmail_RejectsUnsupportedDomains()
    {
        var result = AuthInputPolicies.TryNormalizeEmail("user@example.com", out var normalized, out var error);

        Assert.False(result);
        Assert.Equal(string.Empty, normalized);
        Assert.Contains("gmail.com", error);
    }

    [Theory]
    [InlineData("+7 (999) 123-45-67", "+79991234567")]
    [InlineData("8 999 123 45 67", "+79991234567")]
    [InlineData("79991234567", "+79991234567")]
    public void TryNormalizeRussianPhone_NormalizesValidRussianNumbers(string input, string expected)
    {
        var result = AuthInputPolicies.TryNormalizeRussianPhone(input, out var normalized, out var error);

        Assert.True(result);
        Assert.Equal(expected, normalized);
        Assert.Equal(string.Empty, error);
    }

    [Fact]
    public void TryNormalizeRussianPhone_RejectsNonRussianNumbers()
    {
        var result = AuthInputPolicies.TryNormalizeRussianPhone("+380991234567", out var normalized, out var error);

        Assert.False(result);
        Assert.Equal(string.Empty, normalized);
        Assert.Contains("+7", error);
    }
}
