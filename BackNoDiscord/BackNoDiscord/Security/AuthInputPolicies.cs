using System.Globalization;
using System.Security.Cryptography;
using System.Text;
using System.Text.RegularExpressions;

namespace BackNoDiscord.Security;

public static partial class AuthInputPolicies
{
    private const int MaxNameLength = 32;
    private const int MaxNicknameLength = 50;
    private const int MaxEmailLength = 50;
    private enum PersonNameScript
    {
        Unknown = 0,
        Cyrillic = 1,
        Latin = 2,
        Mixed = 3
    }

    private static readonly HashSet<string> SupportedEmailDomains = new(StringComparer.OrdinalIgnoreCase)
    {
        "gmail.com",
        "yandex.ru",
        "list.ru",
        "mail.ru"
    };

    [GeneratedRegex(@"^\+7\d{10}$", RegexOptions.Compiled)]
    private static partial Regex NormalizedRussianPhoneRegex();

    [GeneratedRegex(@"^[\p{L}\p{M}'-]+$", RegexOptions.Compiled)]
    private static partial Regex PersonNameRegex();

    [GeneratedRegex(@"^[\p{L}\p{M}\p{N} ]+$", RegexOptions.Compiled)]
    private static partial Regex NicknameRegex();

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

        if (candidate.Length > MaxEmailLength)
        {
            error = $"Email должен быть не длиннее {MaxEmailLength} символов.";
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
        normalizedName = (value ?? string.Empty).Trim();
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

        if (normalizedName.Any(char.IsWhiteSpace))
        {
            error = $"{fieldName} должно содержать только одно слово.";
            return false;
        }

        if (!PersonNameRegex().IsMatch(normalizedName))
        {
            error = $"{fieldName} может содержать только буквы, пробел, дефис и апостроф.";
            return false;
        }

        return true;
    }

    public static bool TryNormalizeOptionalProfileName(string? value, string fieldName, out string normalizedName, out string error)
    {
        normalizedName = (value ?? string.Empty).Trim();
        error = string.Empty;

        if (string.IsNullOrWhiteSpace(normalizedName))
        {
            normalizedName = string.Empty;
            return true;
        }

        return TryNormalizeProfileName(normalizedName, fieldName, out normalizedName, out error);
    }

    public static bool TryNormalizeNickname(string? value, out string normalizedNickname, out string error)
    {
        normalizedNickname = Regex.Replace(value ?? string.Empty, @"\s+", " ").Trim();
        error = string.Empty;

        if (string.IsNullOrWhiteSpace(normalizedNickname))
        {
            error = "Никнейм не должен быть пустым.";
            return false;
        }

        if (normalizedNickname.Length > MaxNicknameLength)
        {
            error = $"Никнейм должен быть не длиннее {MaxNicknameLength} символов.";
            return false;
        }

        if (!NicknameRegex().IsMatch(normalizedNickname))
        {
            error = "Никнейм может содержать только буквы, цифры и пробелы.";
            return false;
        }

        var nicknameScript = DetectPersonNameScript(normalizedNickname);
        if (nicknameScript == PersonNameScript.Mixed)
        {
            error = "Никнейм должен быть полностью на одном языке: либо на русском, либо на английском.";
            return false;
        }

        return true;
    }

    public static bool TryEnsureMatchingProfileNameScripts(string firstName, string lastName, out string error)
    {
        error = string.Empty;

        var firstScript = DetectPersonNameScript(firstName);
        if (string.IsNullOrWhiteSpace(lastName))
        {
            if (firstScript is PersonNameScript.Unknown or PersonNameScript.Mixed)
            {
                error = "Имя и фамилия должны быть полностью на одном языке: либо на русском, либо на английском.";
                return false;
            }

            return true;
        }

        var lastScript = DetectPersonNameScript(lastName);

        if (firstScript is PersonNameScript.Unknown or PersonNameScript.Mixed ||
            lastScript is PersonNameScript.Unknown or PersonNameScript.Mixed)
        {
            error = "Имя и фамилия должны быть полностью на одном языке: либо на русском, либо на английском.";
            return false;
        }

        if (firstScript != lastScript)
        {
            error = "Имя и фамилия должны быть полностью на одном языке: либо на русском, либо на английском.";
            return false;
        }

        return true;
    }

    public static string HashSecret(string value)
    {
        return Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes((value ?? string.Empty).Trim())));
    }

    private static PersonNameScript DetectPersonNameScript(string? value)
    {
        var hasCyrillic = false;
        var hasLatin = false;

        foreach (var character in value ?? string.Empty)
        {
            if (IsCyrillicLetter(character))
            {
                hasCyrillic = true;
                continue;
            }

            if (IsLatinLetter(character))
            {
                hasLatin = true;
                continue;
            }

            if (character is '\'' or '-' || char.GetUnicodeCategory(character) == UnicodeCategory.NonSpacingMark)
            {
                continue;
            }

            if (char.IsLetter(character))
            {
                return PersonNameScript.Mixed;
            }
        }

        return (hasCyrillic, hasLatin) switch
        {
            (true, true) => PersonNameScript.Mixed,
            (true, false) => PersonNameScript.Cyrillic,
            (false, true) => PersonNameScript.Latin,
            _ => PersonNameScript.Unknown
        };
    }

    private static bool IsCyrillicLetter(char character)
    {
        return character is >= '\u0400' and <= '\u052F'
            or >= '\u1C80' and <= '\u1C8F'
            or >= '\u2DE0' and <= '\u2DFF'
            or >= '\uA640' and <= '\uA69F';
    }

    private static bool IsLatinLetter(char character)
    {
        return character is >= 'A' and <= 'Z'
            or >= 'a' and <= 'z'
            or >= '\u00C0' and <= '\u024F'
            or >= '\u1E00' and <= '\u1EFF';
    }
}
