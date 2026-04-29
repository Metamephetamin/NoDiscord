using System.Text.Json;

namespace BackNoDiscord.Services;

public sealed class TextTranslationResult
{
    public required string Text { get; init; }
    public required string SourceLanguage { get; init; }
    public required string TargetLanguage { get; init; }
    public required string Provider { get; init; }
}

public interface ITextTranslationService
{
    Task<TextTranslationResult> TranslateAsync(string text, string targetLanguage, CancellationToken cancellationToken = default);
}

public sealed class TextTranslationService : ITextTranslationService
{
    private const int MaxTextLength = 4000;

    private static readonly IReadOnlyDictionary<string, string> SupportedLanguages = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase)
    {
        ["ru"] = "ru",
        ["en"] = "en",
        ["es"] = "es",
        ["de"] = "de",
        ["fr"] = "fr",
        ["it"] = "it",
        ["pt"] = "pt",
        ["tr"] = "tr",
        ["uk"] = "uk",
        ["ja"] = "ja",
        ["ko"] = "ko",
        ["zh"] = "zh-CN",
        ["zh-cn"] = "zh-CN",
        ["ar"] = "ar",
    };

    private readonly IHttpClientFactory _httpClientFactory;
    private readonly IConfiguration _configuration;
    private readonly ILogger<TextTranslationService> _logger;

    public TextTranslationService(
        IHttpClientFactory httpClientFactory,
        IConfiguration configuration,
        ILogger<TextTranslationService> logger)
    {
        _httpClientFactory = httpClientFactory;
        _configuration = configuration;
        _logger = logger;
    }

    public async Task<TextTranslationResult> TranslateAsync(string text, string targetLanguage, CancellationToken cancellationToken = default)
    {
        var normalizedText = NormalizeText(text);
        if (string.IsNullOrWhiteSpace(normalizedText))
        {
            return new TextTranslationResult
            {
                Text = string.Empty,
                SourceLanguage = "auto",
                TargetLanguage = NormalizeLanguage(targetLanguage),
                Provider = "empty",
            };
        }

        if (normalizedText.Length > MaxTextLength)
        {
            throw new InvalidOperationException("Текст для перевода слишком длинный.");
        }

        var normalizedTargetLanguage = NormalizeLanguage(targetLanguage);
        var detectedSourceLanguage = DetectLanguage(normalizedText);
        if (string.Equals(detectedSourceLanguage, normalizedTargetLanguage, StringComparison.OrdinalIgnoreCase))
        {
            return new TextTranslationResult
            {
                Text = normalizedText,
                SourceLanguage = detectedSourceLanguage,
                TargetLanguage = normalizedTargetLanguage,
                Provider = "same-language",
            };
        }

        return await TranslateWithMyMemoryAsync(normalizedText, detectedSourceLanguage, normalizedTargetLanguage, cancellationToken);
    }

    private async Task<TextTranslationResult> TranslateWithMyMemoryAsync(
        string text,
        string sourceLanguage,
        string targetLanguage,
        CancellationToken cancellationToken)
    {
        var client = _httpClientFactory.CreateClient();
        client.Timeout = TimeSpan.FromSeconds(GetTimeoutSeconds());

        var endpoint = _configuration["Translation:MyMemoryEndpoint"];
        if (string.IsNullOrWhiteSpace(endpoint))
        {
            endpoint = "https://api.mymemory.translated.net/get";
        }

        var email = _configuration["Translation:MyMemoryEmail"];
        var uriBuilder = new UriBuilder(endpoint);
        var query = $"q={Uri.EscapeDataString(text)}&langpair={Uri.EscapeDataString($"{sourceLanguage}|{targetLanguage}")}";
        if (!string.IsNullOrWhiteSpace(email))
        {
            query += $"&de={Uri.EscapeDataString(email)}";
        }

        uriBuilder.Query = query;

        using var response = await client.GetAsync(uriBuilder.Uri, cancellationToken);
        var responseBody = await response.Content.ReadAsStringAsync(cancellationToken);
        if (!response.IsSuccessStatusCode)
        {
            _logger.LogWarning("Translation provider failed with status {StatusCode}: {Body}", response.StatusCode, responseBody);
            throw new InvalidOperationException("Сервис перевода сейчас недоступен.");
        }

        using var document = JsonDocument.Parse(responseBody);
        var translatedText = document.RootElement
            .GetProperty("responseData")
            .GetProperty("translatedText")
            .GetString();

        translatedText = NormalizeText(translatedText);
        if (string.IsNullOrWhiteSpace(translatedText))
        {
            throw new InvalidOperationException("Сервис перевода вернул пустой текст.");
        }

        return new TextTranslationResult
        {
            Text = translatedText,
            SourceLanguage = sourceLanguage,
            TargetLanguage = targetLanguage,
            Provider = "mymemory",
        };
    }

    private int GetTimeoutSeconds()
    {
        if (int.TryParse(_configuration["Translation:TimeoutSeconds"], out var timeoutSeconds))
        {
            return Math.Clamp(timeoutSeconds, 2, 20);
        }

        return 8;
    }

    private static string NormalizeText(string? text) =>
        string.Concat(text ?? string.Empty).Replace("\r\n", "\n").Replace("\r", "\n").Trim();

    private static string NormalizeLanguage(string? language)
    {
        var normalizedLanguage = string.Concat(language ?? string.Empty).Trim().ToLowerInvariant();
        if (SupportedLanguages.TryGetValue(normalizedLanguage, out var supportedLanguage))
        {
            return supportedLanguage;
        }

        return "en";
    }

    private static string DetectLanguage(string text)
    {
        var normalizedText = string.Concat(text ?? string.Empty);
        if (string.IsNullOrWhiteSpace(normalizedText))
        {
            return "auto";
        }

        if (normalizedText.Any(c => c is >= '\u3040' and <= '\u30ff'))
        {
            return "ja";
        }

        if (normalizedText.Any(c => c is >= '\uac00' and <= '\ud7af'))
        {
            return "ko";
        }

        if (normalizedText.Any(c => c is >= '\u4e00' and <= '\u9fff'))
        {
            return "zh-CN";
        }

        if (normalizedText.Any(c => c is >= '\u0600' and <= '\u06ff'))
        {
            return "ar";
        }

        if (normalizedText.Any(c => c is 'і' or 'ї' or 'є' or 'ґ' or 'І' or 'Ї' or 'Є' or 'Ґ'))
        {
            return "uk";
        }

        if (normalizedText.Any(c => c is >= 'А' and <= 'я' or 'Ё' or 'ё'))
        {
            return "ru";
        }

        if (normalizedText.Any(c => "ñáéíóú¿¡".Contains(char.ToLowerInvariant(c))))
        {
            return "es";
        }

        if (normalizedText.Any(c => "äöüß".Contains(char.ToLowerInvariant(c))))
        {
            return "de";
        }

        if (normalizedText.Any(c => "çœêèàùâîôûëïüÿ".Contains(char.ToLowerInvariant(c))))
        {
            return "fr";
        }

        if (normalizedText.Any(c => "ãõ".Contains(char.ToLowerInvariant(c))))
        {
            return "pt";
        }

        if (normalizedText.Any(c => "ğışİöçü".Contains(c)))
        {
            return "tr";
        }

        return "en";
    }
}
