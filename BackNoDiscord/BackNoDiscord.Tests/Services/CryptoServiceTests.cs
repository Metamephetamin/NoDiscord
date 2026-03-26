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

    private static CryptoService CreateService()
    {
        var configuration = new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["Crypto:Key"] = "0123456789abcdef0123456789abcdef"
            })
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
}
