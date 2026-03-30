using System.Security.Cryptography;
using System.Text;
using System.Text.RegularExpressions;

namespace BackNoDiscord.Security;

public static partial class AuthInputPolicies
{
    private const int MaxNameLength = 60;
    private static readonly HashSet<string> SupportedEmailDomains = new(StringComparer.OrdinalIgnoreCase)
    {
        "gmail.com",
        "yandex.ru",
        "list.ru",
        "mail.ru"
    };

    [GeneratedRegex(@"^\+7\d{10}$", RegexOptions.Compiled)]
    private static partial Regex NormalizedRussianPhoneRegex();

    [GeneratedRegex(@"^[\p{L}\p{M}\s'-]+$", RegexOptions.Compiled)]
    private static partial Regex PersonNameRegex();

    public static bool TryNormalizeEmail(string? value, out string normalizedEmail, out string error)
    {
        normalizedEmail = string.Empty;
        error = string.Empty;

        var candidate = (value ?? string.Empty).Trim().ToLowerInvariant();
        if (string.IsNullOrWhiteSpace(candidate))
        {
            error = "Email обязателен.";
            return false;
        }

        var separatorIndex = candidate.LastIndexOf('@');
        if (separatorIndex <= 0 || separatorIndex == candidate.Length - 1)
        {
            error = "Введите корректный email.";
            return false;
        }

        var domain = candidate[(separatorIndex + 1)..];
        if (!SupportedEmailDomains.Contains(domain))
        {
            error = "Разрешены только gmail.com, yandex.ru, list.ru и mail.ru.";
            return false;
        }

        try
        {
            var mailAddress = new System.Net.Mail.MailAddress(candidate);
            normalizedEmail = mailAddress.Address.ToLowerInvariant();
            return true;
        }
        catch
        {
            error = "Введите корректный email.";
            return false;
        }
    }

    public static bool TryNormalizeRussianPhone(string? value, out string normalizedPhone, out string error)
    {
        normalizedPhone = string.Empty;
        error = string.Empty;

        var digits = new string((value ?? string.Empty).Where(char.IsDigit).ToArray());
        if (string.IsNullOrWhiteSpace(digits))
        {
            error = "Номер телефона обязателен.";
            return false;
        }

        if (digits.Length == 11 && digits[0] == '8')
        {
            digits = $"7{digits[1..]}";
        }

        if (digits.Length == 11 && digits[0] == '7')
        {
            normalizedPhone = $"+{digits}";
        }

        if (!NormalizedRussianPhoneRegex().IsMatch(normalizedPhone))
        {
            normalizedPhone = string.Empty;
            error = "Разрешены только российские номера в формате +7XXXXXXXXXX.";
            return false;
        }

        return true;
    }

    public static bool TryNormalizeProfileName(string? value, string fieldName, out string normalizedName, out string error)
    {
        normalizedName = CollapseWhitespace((value ?? string.Empty).Trim());
        error = string.Empty;

        if (string.IsNullOrWhiteSpace(normalizedName))
        {
            error = $"{fieldName} не должно быть пустым.";
            return false;
        }

        if (normalizedName.Length > MaxNameLength)
        {
            error = $"{fieldName} должно быть не длиннее {MaxNameLength} символов.";
            return false;
        }

        if (!PersonNameRegex().IsMatch(normalizedName))
        {
            error = $"{fieldName} может содержать только буквы, пробел, дефис и апостроф.";
            return false;
        }

        return true;
    }

    public static string HashSecret(string value)
    {
        return Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes((value ?? string.Empty).Trim())));
    }

    private static string CollapseWhitespace(string value)
    {
        return string.Join(" ", value.Split(' ', StringSplitOptions.RemoveEmptyEntries));
    }
}
