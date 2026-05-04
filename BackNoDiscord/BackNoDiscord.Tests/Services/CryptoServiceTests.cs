using BackNoDiscord.Services;
using Microsoft.Extensions.Configuration;
using System.Security.Cryptography;
using System.Text;

namespace BackNoDiscord.Tests.Services;

public class CryptoServiceTests
{
    [Fact]
    public void EncryptAndDecrypt_RoundTripsV2Payload()
    {
        var service = CreateService();

        var cipherText = service.Encrypt("secret message");
        var decrypted = service.Decrypt(cipherText);

        Assert.StartsWith("v2:", cipherText);
        Assert.Equal("secret message", decrypted);
    }

    [Fact]
    public void Decrypt_SupportsLegacyCipherPayload()
    {
        const string secret = "legacy secret message";
        var service = CreateService();
        var legacyCipher = EncryptLegacy(secret, "0123456789abcdef0123456789abcdef");

        var decrypted = service.Decrypt(legacyCipher);

        Assert.Equal(secret, decrypted);
    }

    [Fact]
    public void Decrypt_UsesRawBytesWhenKeyHasBase64Prefix()
    {
        var rawKey = RandomNumberGenerator.GetBytes(32);
        var configuration = new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["Crypto:Key"] = $"base64:{Convert.ToBase64String(rawKey)}"
            })
            .Build();
        var service = new CryptoService(configuration);
        var cipherText = EncryptV2WithRawKey("raw key secret", rawKey);

        var decrypted = service.Decrypt(cipherText);

        Assert.Equal("raw key secret", decrypted);
    }

    [Fact]
    public void Encrypt_UsesActiveKeyIdWhenKeyRingIsConfigured()
    {
        var activeKey = RandomNumberGenerator.GetBytes(32);
        var legacyKey = RandomNumberGenerator.GetBytes(32);
        var service = CreateService(new Dictionary<string, string?>
        {
            ["Crypto:Key"] = $"base64:{Convert.ToBase64String(legacyKey)}",
            ["Crypto:ActiveKeyId"] = "2026-05",
            ["Crypto:Keys:2026-05"] = $"base64:{Convert.ToBase64String(activeKey)}",
            ["Crypto:Keys:2026-01"] = $"base64:{Convert.ToBase64String(legacyKey)}"
        });

        var cipherText = service.Encrypt("rotated secret");
        var decrypted = service.Decrypt(cipherText);

        Assert.StartsWith("v3:2026-05:", cipherText);
        Assert.Equal("rotated secret", decrypted);
    }

    [Fact]
    public void Decrypt_SupportsV2PayloadWithLegacyKeyWhenKeyRingIsConfigured()
    {
        var legacyKey = RandomNumberGenerator.GetBytes(32);
        var activeKey = RandomNumberGenerator.GetBytes(32);
        var service = CreateService(new Dictionary<string, string?>
        {
            ["Crypto:Key"] = $"base64:{Convert.ToBase64String(legacyKey)}",
            ["Crypto:ActiveKeyId"] = "2026-05",
            ["Crypto:Keys:2026-05"] = $"base64:{Convert.ToBase64String(activeKey)}",
            ["Crypto:Keys:2026-01"] = $"base64:{Convert.ToBase64String(legacyKey)}"
        });
        var cipherText = EncryptV2WithRawKey("legacy v2 secret", legacyKey);

        var decrypted = service.Decrypt(cipherText);

        Assert.Equal("legacy v2 secret", decrypted);
    }

    [Fact]
    public void Decrypt_SupportsV3PayloadAfterActiveKeyRotates()
    {
        var oldActiveKey = RandomNumberGenerator.GetBytes(32);
        var nextActiveKey = RandomNumberGenerator.GetBytes(32);
        var originalService = CreateService(new Dictionary<string, string?>
        {
            ["Crypto:Key"] = $"base64:{Convert.ToBase64String(oldActiveKey)}",
            ["Crypto:ActiveKeyId"] = "2026-05",
            ["Crypto:Keys:2026-05"] = $"base64:{Convert.ToBase64String(oldActiveKey)}",
            ["Crypto:Keys:2026-06"] = $"base64:{Convert.ToBase64String(nextActiveKey)}"
        });
        var rotatedService = CreateService(new Dictionary<string, string?>
        {
            ["Crypto:Key"] = $"base64:{Convert.ToBase64String(oldActiveKey)}",
            ["Crypto:ActiveKeyId"] = "2026-06",
            ["Crypto:Keys:2026-05"] = $"base64:{Convert.ToBase64String(oldActiveKey)}",
            ["Crypto:Keys:2026-06"] = $"base64:{Convert.ToBase64String(nextActiveKey)}"
        });
        var cipherText = originalService.Encrypt("v3 survives rotation");

        var decrypted = rotatedService.Decrypt(cipherText);

        Assert.StartsWith("v3:2026-05:", cipherText);
        Assert.Equal("v3 survives rotation", decrypted);
    }

    private static CryptoService CreateService()
    {
        return CreateService(new Dictionary<string, string?>
        {
            ["Crypto:Key"] = "0123456789abcdef0123456789abcdef"
        });
    }

    private static CryptoService CreateService(Dictionary<string, string?> values)
    {
        var configuration = new ConfigurationBuilder()
            .AddInMemoryCollection(values)
            .Build();

        return new CryptoService(configuration);
    }

    private static string EncryptLegacy(string plainText, string keyString)
    {
        using var sha = SHA256.Create();
        var key = sha.ComputeHash(Encoding.UTF8.GetBytes(keyString));

        using var aes = Aes.Create();
        aes.Key = key;
        aes.GenerateIV();

        using var encryptor = aes.CreateEncryptor(aes.Key, aes.IV);
        var plainBytes = Encoding.UTF8.GetBytes(plainText);
        var encryptedBytes = encryptor.TransformFinalBlock(plainBytes, 0, plainBytes.Length);

        var result = new byte[aes.IV.Length + encryptedBytes.Length];
        Buffer.BlockCopy(aes.IV, 0, result, 0, aes.IV.Length);
        Buffer.BlockCopy(encryptedBytes, 0, result, aes.IV.Length, encryptedBytes.Length);

        return Convert.ToBase64String(result);
    }

    private static string EncryptV2WithRawKey(string plainText, byte[] key)
    {
        var plainBytes = Encoding.UTF8.GetBytes(plainText);
        var nonce = RandomNumberGenerator.GetBytes(12);
        var tag = new byte[16];
        var cipherBytes = new byte[plainBytes.Length];

        using var aes = new AesGcm(key, 16);
        aes.Encrypt(nonce, plainBytes, cipherBytes, tag);

        var result = new byte[nonce.Length + tag.Length + cipherBytes.Length];
        Buffer.BlockCopy(nonce, 0, result, 0, nonce.Length);
        Buffer.BlockCopy(tag, 0, result, nonce.Length, tag.Length);
        Buffer.BlockCopy(cipherBytes, 0, result, nonce.Length + tag.Length, cipherBytes.Length);

        return $"v2:{Convert.ToBase64String(result)}";
    }
}
