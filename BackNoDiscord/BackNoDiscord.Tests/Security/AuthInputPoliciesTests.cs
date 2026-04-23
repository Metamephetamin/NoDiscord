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

    [Fact]
    public void TryNormalizeOptionalProfileName_AllowsEmptyValue()
    {
        var result = AuthInputPolicies.TryNormalizeOptionalProfileName("   ", "Фамилия", out var normalized, out var error);

        Assert.True(result);
        Assert.Equal(string.Empty, normalized);
        Assert.Equal(string.Empty, error);
    }

    [Fact]
    public void TryEnsureMatchingProfileNameScripts_AllowsMissingLastName()
    {
        var result = AuthInputPolicies.TryEnsureMatchingProfileNameScripts("Иван", string.Empty, out var error);

        Assert.True(result);
        Assert.Equal(string.Empty, error);
    }
    [Fact]
    public void TryNormalizeNickname_AllowsSingleScriptNickname()
    {
        var result = AuthInputPolicies.TryNormalizeNickname("Тестер 123", out var normalized, out var error);

        Assert.True(result);
        Assert.Equal("Тестер 123", normalized);
        Assert.Equal(string.Empty, error);
    }

    [Fact]
    public void TryNormalizeNickname_RejectsMixedScripts()
    {
        var result = AuthInputPolicies.TryNormalizeNickname("Тester", out var normalized, out var error);

        Assert.False(result);
        Assert.Equal("Тester", normalized);
        Assert.Contains("одном языке", error);
    }

    [Fact]
    public void TryNormalizeNickname_RejectsSymbols()
    {
        var result = AuthInputPolicies.TryNormalizeNickname("nick!!!", out var normalized, out var error);

        Assert.False(result);
        Assert.Equal("nick!!!", normalized);
        Assert.Contains("буквы", error);
    }
}
