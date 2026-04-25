using System.Globalization;
using System.Security.Cryptography;
using System.Text;

namespace BackNoDiscord.Security;

public static class TotpService
{
    private const int SecretBytesLength = 20;
    private const int CodeDigits = 6;
    private const int TimeStepSeconds = 30;
    private const string Base32Alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

    public static string GenerateSecret()
    {
        return EncodeBase32(RandomNumberGenerator.GetBytes(SecretBytesLength));
    }

    public static string BuildOtpAuthUri(string issuer, string accountName, string secret)
    {
        var safeIssuer = string.IsNullOrWhiteSpace(issuer) ? "MAX" : issuer.Trim();
        var safeAccount = string.IsNullOrWhiteSpace(accountName) ? "account" : accountName.Trim();
        var label = Uri.EscapeDataString($"{safeIssuer}:{safeAccount}");
        return $"otpauth://totp/{label}?secret={Uri.EscapeDataString(secret)}&issuer={Uri.EscapeDataString(safeIssuer)}&algorithm=SHA1&digits={CodeDigits}&period={TimeStepSeconds}";
    }

    public static bool VerifyCode(string? secret, string? code, DateTimeOffset now)
    {
        var normalizedCode = new string((code ?? string.Empty).Where(char.IsDigit).ToArray());
        if (string.IsNullOrWhiteSpace(secret) || normalizedCode.Length != CodeDigits)
        {
            return false;
        }

        byte[] secretBytes;
        try
        {
            secretBytes = DecodeBase32(secret);
        }
        catch
        {
            return false;
        }

        var currentStep = now.ToUnixTimeSeconds() / TimeStepSeconds;
        for (var offset = -1; offset <= 1; offset += 1)
        {
            var expectedCode = GenerateCode(secretBytes, currentStep + offset);
            if (CryptographicOperations.FixedTimeEquals(
                Encoding.ASCII.GetBytes(expectedCode),
                Encoding.ASCII.GetBytes(normalizedCode)))
            {
                return true;
            }
        }

        return false;
    }

    private static string GenerateCode(byte[] secretBytes, long counter)
    {
        var counterBytes = BitConverter.GetBytes(counter);
        if (BitConverter.IsLittleEndian)
        {
            Array.Reverse(counterBytes);
        }

        using var hmac = new HMACSHA1(secretBytes);
        var hash = hmac.ComputeHash(counterBytes);
        var offset = hash[^1] & 0x0f;
        var binaryCode =
            ((hash[offset] & 0x7f) << 24) |
            ((hash[offset + 1] & 0xff) << 16) |
            ((hash[offset + 2] & 0xff) << 8) |
            (hash[offset + 3] & 0xff);
        var otp = binaryCode % (int)Math.Pow(10, CodeDigits);
        return otp.ToString(new string('0', CodeDigits), CultureInfo.InvariantCulture);
    }

    private static string EncodeBase32(byte[] bytes)
    {
        if (bytes.Length == 0)
        {
            return string.Empty;
        }

        var output = new StringBuilder((bytes.Length * 8 + 4) / 5);
        var buffer = (int)bytes[0];
        var next = 1;
        var bitsLeft = 8;

        while (bitsLeft > 0 || next < bytes.Length)
        {
            if (bitsLeft < 5)
            {
                if (next < bytes.Length)
                {
                    buffer <<= 8;
                    buffer |= bytes[next++] & 0xff;
                    bitsLeft += 8;
                }
                else
                {
                    buffer <<= 5 - bitsLeft;
                    bitsLeft = 5;
                }
            }

            var index = 0x1f & (buffer >> (bitsLeft - 5));
            bitsLeft -= 5;
            output.Append(Base32Alphabet[index]);
        }

        return output.ToString();
    }

    private static byte[] DecodeBase32(string value)
    {
        var normalized = value.Trim().Replace(" ", string.Empty, StringComparison.Ordinal).TrimEnd('=').ToUpperInvariant();
        if (normalized.Length == 0)
        {
            return [];
        }

        var output = new List<byte>(normalized.Length * 5 / 8);
        var buffer = 0;
        var bitsLeft = 0;

        foreach (var character in normalized)
        {
            var index = Base32Alphabet.IndexOf(character);
            if (index < 0)
            {
                throw new FormatException("Invalid base32 character.");
            }

            buffer = (buffer << 5) | index;
            bitsLeft += 5;

            if (bitsLeft >= 8)
            {
                output.Add((byte)((buffer >> (bitsLeft - 8)) & 0xff));
                bitsLeft -= 8;
            }
        }

        return output.ToArray();
    }
}
