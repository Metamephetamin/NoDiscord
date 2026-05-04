using System.Security.Cryptography;
using System.Text;

namespace BackNoDiscord.Services
{
    public class CryptoService
    {
        private const string Version2Prefix = "v2:";
        private const string Version3Prefix = "v3:";
        private const string Base64KeyPrefix = "base64:";
        private readonly byte[] _legacyKey;
        private readonly byte[] _activeKey;
        private readonly string _activeKeyId;
        private readonly IReadOnlyDictionary<string, byte[]> _keys;

        public CryptoService(IConfiguration configuration)
        {
            var keyString = configuration["Crypto:Key"]?.Trim();
            var activeKeyId = configuration["Crypto:ActiveKeyId"]?.Trim() ?? string.Empty;
            var configuredKeys = configuration
                .GetSection("Crypto:Keys")
                .GetChildren()
                .Where(section => !string.IsNullOrWhiteSpace(section.Key) && !string.IsNullOrWhiteSpace(section.Value))
                .ToDictionary(
                    section => section.Key.Trim(),
                    section => ResolveKey(section.Value!.Trim()),
                    StringComparer.Ordinal);

            if (string.IsNullOrWhiteSpace(keyString) && configuredKeys.Count == 0)
            {
                throw new InvalidOperationException("Crypto:Key or Crypto:Keys is not configured. Set it via .env, environment variables, or appsettings.");
            }

            if (configuredKeys.Count > 0)
            {
                if (string.IsNullOrWhiteSpace(activeKeyId))
                {
                    throw new InvalidOperationException("Crypto:ActiveKeyId is required when Crypto:Keys is configured.");
                }

                if (!configuredKeys.TryGetValue(activeKeyId, out var activeKey))
                {
                    throw new InvalidOperationException("Crypto:ActiveKeyId must match one configured Crypto:Keys entry.");
                }

                _keys = configuredKeys;
                _activeKeyId = activeKeyId;
                _activeKey = activeKey;
                _legacyKey = string.IsNullOrWhiteSpace(keyString) ? activeKey : ResolveKey(keyString);
                return;
            }

            _legacyKey = ResolveKey(keyString!);
            _activeKey = _legacyKey;
            _activeKeyId = string.Empty;
            _keys = new Dictionary<string, byte[]>(StringComparer.Ordinal);
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

            using var aes = new AesGcm(_activeKey, 16);
            aes.Encrypt(nonce, plainBytes, cipherBytes, tag);

            var result = new byte[nonce.Length + tag.Length + cipherBytes.Length];
            Buffer.BlockCopy(nonce, 0, result, 0, nonce.Length);
            Buffer.BlockCopy(tag, 0, result, nonce.Length, tag.Length);
            Buffer.BlockCopy(cipherBytes, 0, result, nonce.Length + tag.Length, cipherBytes.Length);

            var payload = Convert.ToBase64String(result);
            return string.IsNullOrWhiteSpace(_activeKeyId)
                ? $"{Version2Prefix}{payload}"
                : $"{Version3Prefix}{_activeKeyId}:{payload}";
        }

        public string Decrypt(string cipherText)
        {
            if (string.IsNullOrWhiteSpace(cipherText))
                return string.Empty;

            if (cipherText.StartsWith(Version3Prefix, StringComparison.Ordinal))
            {
                return DecryptV3(cipherText[Version3Prefix.Length..]);
            }

            return cipherText.StartsWith(Version2Prefix, StringComparison.Ordinal)
                ? DecryptAesGcm(cipherText[Version2Prefix.Length..], _legacyKey)
                : DecryptLegacy(cipherText);
        }

        private string DecryptV3(string cipherText)
        {
            var separatorIndex = cipherText.IndexOf(':', StringComparison.Ordinal);
            if (separatorIndex <= 0 || separatorIndex == cipherText.Length - 1)
            {
                throw new InvalidOperationException("Crypto v3 payload is malformed.");
            }

            var keyId = cipherText[..separatorIndex];
            if (!_keys.TryGetValue(keyId, out var key))
            {
                throw new InvalidOperationException("Crypto v3 key id is not configured.");
            }

            return DecryptAesGcm(cipherText[(separatorIndex + 1)..], key);
        }

        private static string DecryptAesGcm(string cipherText, byte[] key)
        {
            var fullCipher = Convert.FromBase64String(cipherText);
            var nonce = fullCipher[..12];
            var tag = fullCipher[12..28];
            var cipher = fullCipher[28..];
            var plainBytes = new byte[cipher.Length];

            using var aes = new AesGcm(key, 16);
            aes.Decrypt(nonce, cipher, tag, plainBytes);
            return Encoding.UTF8.GetString(plainBytes);
        }

        private string DecryptLegacy(string cipherText)
        {
            var fullCipher = Convert.FromBase64String(cipherText);

            using var aes = Aes.Create();
            aes.Key = _legacyKey;

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
