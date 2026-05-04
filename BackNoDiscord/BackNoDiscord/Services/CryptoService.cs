using System.Security.Cryptography;
using System.Text;

namespace BackNoDiscord.Services
{
    public class CryptoService
    {
        private const string VersionPrefix = "v2:";
        private const string Base64KeyPrefix = "base64:";
        private readonly byte[] _key;

        public CryptoService(IConfiguration configuration)
        {
            var keyString = configuration["Crypto:Key"]?.Trim();

            if (string.IsNullOrWhiteSpace(keyString))
            {
                throw new InvalidOperationException("Crypto:Key is not configured. Set it via .env, environment variables, or appsettings.");
            }

            _key = ResolveKey(keyString);
        }

        private static byte[] ResolveKey(string keyString)
        {
            if (keyString.StartsWith(Base64KeyPrefix, StringComparison.OrdinalIgnoreCase))
            {
                var encodedKey = keyString[Base64KeyPrefix.Length..].Trim();
                byte[] rawKey;
                try
                {
                    rawKey = Convert.FromBase64String(encodedKey);
                }
                catch (FormatException exception)
                {
                    throw new InvalidOperationException("Crypto:Key base64 value is invalid.", exception);
                }

                if (rawKey.Length != 32)
                {
                    throw new InvalidOperationException("Crypto:Key base64 value must decode to exactly 32 bytes.");
                }

                return rawKey;
            }

            if (keyString.Length < 32)
            {
                throw new InvalidOperationException("Crypto:Key must be at least 32 characters long.");
            }

            using var sha = SHA256.Create();
            return sha.ComputeHash(Encoding.UTF8.GetBytes(keyString));
        }

        public string Encrypt(string plainText)
        {
            if (string.IsNullOrWhiteSpace(plainText))
                return string.Empty;

            var plainBytes = Encoding.UTF8.GetBytes(plainText);
            var nonce = RandomNumberGenerator.GetBytes(12);
            var tag = new byte[16];
            var cipherBytes = new byte[plainBytes.Length];

            using var aes = new AesGcm(_key, 16);
            aes.Encrypt(nonce, plainBytes, cipherBytes, tag);

            var result = new byte[nonce.Length + tag.Length + cipherBytes.Length];
            Buffer.BlockCopy(nonce, 0, result, 0, nonce.Length);
            Buffer.BlockCopy(tag, 0, result, nonce.Length, tag.Length);
            Buffer.BlockCopy(cipherBytes, 0, result, nonce.Length + tag.Length, cipherBytes.Length);

            return $"{VersionPrefix}{Convert.ToBase64String(result)}";
        }

        public string Decrypt(string cipherText)
        {
            if (string.IsNullOrWhiteSpace(cipherText))
                return string.Empty;

            return cipherText.StartsWith(VersionPrefix, StringComparison.Ordinal)
                ? DecryptV2(cipherText[VersionPrefix.Length..])
                : DecryptLegacy(cipherText);
        }

        private string DecryptV2(string cipherText)
        {
            var fullCipher = Convert.FromBase64String(cipherText);
            var nonce = fullCipher[..12];
            var tag = fullCipher[12..28];
            var cipher = fullCipher[28..];
            var plainBytes = new byte[cipher.Length];

            using var aes = new AesGcm(_key, 16);
            aes.Decrypt(nonce, cipher, tag, plainBytes);
            return Encoding.UTF8.GetString(plainBytes);
        }

        private string DecryptLegacy(string cipherText)
        {
            var fullCipher = Convert.FromBase64String(cipherText);

            using var aes = Aes.Create();
            aes.Key = _key;

            var iv = new byte[16];
            var cipher = new byte[fullCipher.Length - 16];

            Buffer.BlockCopy(fullCipher, 0, iv, 0, 16);
            Buffer.BlockCopy(fullCipher, 16, cipher, 0, cipher.Length);

            aes.IV = iv;

            using var decryptor = aes.CreateDecryptor(aes.Key, aes.IV);
            var decryptedBytes = decryptor.TransformFinalBlock(cipher, 0, cipher.Length);

            return Encoding.UTF8.GetString(decryptedBytes);
        }
    }
}
