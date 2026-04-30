using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;

namespace BackNoDiscord.Services;

public sealed class SpeechPunctuationResult
{
    public required string Text { get; init; }
    public required string Provider { get; init; }
    public bool UsedModel { get; init; }
}

public interface ISpeechPunctuationService
{
    Task<SpeechPunctuationResult> PunctuateAsync(string text, CancellationToken cancellationToken = default);
}

internal sealed class OllamaGenerateResponse
{
    public string? Response { get; set; }
    public bool Done { get; set; }
}

public sealed class SpeechPunctuationService : ISpeechPunctuationService, IDisposable
{
    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNameCaseInsensitive = true,
    };

    private static readonly Regex QuestionStartRegex = new(
        "^(?:а\\s+)?(кто|что|где|куда|откуда|когда|почему|зачем|как|какой|какая|какое|какие|чей|чья|чьё|чьи|сколько|разве|неужели|можно ли|нужно ли|стоит ли|ли)\\b",
        RegexOptions.IgnoreCase | RegexOptions.Compiled);
    private static readonly Regex LeadingQuestionParticleCommaRegex = new(
        "^(а),\\s+(кто|что|где|куда|откуда|когда|почему|зачем|как|какой|какая|какое|какие|чей|чья|чьё|чьи|сколько)\\b",
        RegexOptions.IgnoreCase | RegexOptions.Compiled);
    private static readonly Regex QuestionEndRegex = new("\\bли\\b|(?:,\\s*)?(правда|верно)\\s*$", RegexOptions.IgnoreCase | RegexOptions.Compiled);
    private static readonly Regex QuestionTailRegex = new("(кто|что|где|куда|откуда|когда|почему|зачем|как|чего)\\s*$", RegexOptions.IgnoreCase | RegexOptions.Compiled);
    private static readonly Regex ComparativePairRegex = new("\\bкак\\b.+\\bтак и\\b", RegexOptions.IgnoreCase | RegexOptions.Compiled);
    private static readonly Regex ExclamationStartRegex = new(
        "^(привет|здравствуйте|спасибо|пожалуйста|срочно|осторожно|внимание|ура|класс|супер|отлично)\\b",
        RegexOptions.IgnoreCase | RegexOptions.Compiled);
    private static readonly Regex IntroductoryPhrasesRegex = new(
        "(^|[.!?]\\s+)(ну|в общем|в итоге|по итогу|короче|слушай|смотри|кстати|например)\\s+",
        RegexOptions.IgnoreCase | RegexOptions.Compiled);
    private static readonly Regex GerundSuffixRegex = new(
        "(в|вши|вшись|я|ясь|учи|ючи|аясь|яясь|ившись|ыв|ывши|ывшись)$",
        RegexOptions.IgnoreCase | RegexOptions.Compiled);
    private static readonly Regex ClauseStartRegex = new(
        "^(я|мы|ты|вы|он|она|оно|они|это|тот|та|те|кто|все|всё|мне|нам|ему|ей|им|меня|тебя|его|её|их|[а-яё-]+(?:л|ла|ло|ли|ет|ют|ут|ит|ат|ят|ем|им|ешь|ишь|ете|ите|ался|алась|алось|ались|ется|ются|утся|ится|ятся))$",
        RegexOptions.IgnoreCase | RegexOptions.Compiled);
    private static readonly Regex FiniteVerbRegex = new(
        "^[а-яё-]+(?:л|ла|ло|ли|ет|ют|ут|ит|ат|ят|ем|им|ешь|ишь|ете|ите|ался|алась|алось|ались|ется|ются|утся|ится|ятся|будет|будут|был|была|было|были|можно|нужно|стоит|получится|выйдет)$",
        RegexOptions.IgnoreCase | RegexOptions.Compiled);
    private static readonly Regex InlineParentheticalPhraseRegex = new(
        "\\s+(к счастью|к сожалению|честно говоря|если честно|по правде говоря|между прочим|как ни странно|как правило|судя по всему|в итоге|по итогу|по сути|безусловно|разумеется|наверное|возможно|кажется|пожалуй|кстати|например|вообще-то|по моему мнению)\\s+",
        RegexOptions.IgnoreCase | RegexOptions.Compiled);
    private static readonly Regex SentenceOpeningParentheticalRegex = new(
        "(^|[.!?]\\s+)(ну|в общем|в итоге|по итогу|короче|слушай|смотри|кстати|например|честно говоря|если честно|по правде говоря|к счастью|к сожалению|как ни странно|как правило|безусловно|разумеется|наверное|возможно|кажется|пожалуй|вообще-то)\\s+",
        RegexOptions.IgnoreCase | RegexOptions.Compiled);
    private static readonly Regex SentenceOpeningInterjectionRegex = new(
        "(^|[.!?…]\\s+)(блин|бля|блядь|блинчик|капец|жесть|господи|чёрт|черт|ё-моё|ё мое|ёмаё|елки-палки|ёлки-палки|мда|ух|эх)\\s+",
        RegexOptions.IgnoreCase | RegexOptions.Compiled);
    private static readonly Regex InlineInterjectionRegex = new(
        "\\s+(блин|бля|блядь|капец|жесть|господи|чёрт|черт|ё-моё|ё мое|ёмаё|елки-палки|ёлки-палки|мда)\\s+",
        RegexOptions.IgnoreCase | RegexOptions.Compiled);

    private static readonly IReadOnlyList<(Regex Regex, string Replacement)> SpokenPunctuationRules =
    [
        (new Regex("\\s+(знак восклицания|восклицание)\\s+", RegexOptions.IgnoreCase | RegexOptions.Compiled), "! "),
        (new Regex("\\s+восклицательный знак\\s+", RegexOptions.IgnoreCase | RegexOptions.Compiled), "! "),
        (new Regex("\\s+знак вопроса\\s+", RegexOptions.IgnoreCase | RegexOptions.Compiled), "? "),
        (new Regex("\\s+вопросительный знак\\s+", RegexOptions.IgnoreCase | RegexOptions.Compiled), "? "),
        (new Regex("\\s+точка с запятой\\s+", RegexOptions.IgnoreCase | RegexOptions.Compiled), "; "),
        (new Regex("\\s+двоеточие\\s+", RegexOptions.IgnoreCase | RegexOptions.Compiled), ": "),
        (new Regex("\\s+многоточие\\s+", RegexOptions.IgnoreCase | RegexOptions.Compiled), "… "),
        (new Regex("\\s+(открой скобку|открыть скобку)\\s+", RegexOptions.IgnoreCase | RegexOptions.Compiled), " ("),
        (new Regex("\\s+(закрой скобку|закрыть скобку)\\s+", RegexOptions.IgnoreCase | RegexOptions.Compiled), ") "),
        (new Regex("\\s+(тире|длинное тире)\\s+", RegexOptions.IgnoreCase | RegexOptions.Compiled), " - "),
        (new Regex("\\s+дефис\\s+", RegexOptions.IgnoreCase | RegexOptions.Compiled), "-"),
        (new Regex("\\s+запятая\\s+", RegexOptions.IgnoreCase | RegexOptions.Compiled), ", "),
        (new Regex("\\s+точка\\s+", RegexOptions.IgnoreCase | RegexOptions.Compiled), ". "),
        (new Regex("\\s+(новая строка|перенос строки|новый абзац|абзац)\\s+", RegexOptions.IgnoreCase | RegexOptions.Compiled), ". "),
    ];

    private static readonly IReadOnlyList<Regex> CommaBeforeRules =
    [
        new Regex("\\s+(а|но|однако|зато|хотя|причем|причём|притом|то есть)\\s+", RegexOptions.IgnoreCase | RegexOptions.Compiled),
        new Regex("\\s+(если|когда|пока|хотя|чтобы|будто|словно|как будто|так как|потому что|из-за того что|для того чтобы|перед тем как|после того как|несмотря на то что|так что|раз уж|едва|как только)\\s+", RegexOptions.IgnoreCase | RegexOptions.Compiled),
        new Regex("\\s+(что|чем|где|куда|откуда|почему|зачем|который|которая|которое|которые|которого|которой|которым|которыми)\\s+", RegexOptions.IgnoreCase | RegexOptions.Compiled),
        new Regex("\\s+(например|конечно|кстати|наверное|возможно|может быть|кажется|по-моему|по сути|во-первых|во-вторых|в-третьих|с одной стороны|с другой стороны|как правило|скорее всего|безусловно|разумеется)\\s+", RegexOptions.IgnoreCase | RegexOptions.Compiled),
    ];

    private static readonly IReadOnlyList<(Regex Regex, string Replacement)> ComplexPhraseReplacements =
    [
        (new Regex("\\b(я думаю|я считаю|мне кажется|по-моему)\\s+что\\b", RegexOptions.IgnoreCase | RegexOptions.Compiled), "$1, что"),
        (new Regex("\\b(дело в том)\\s+что\\b", RegexOptions.IgnoreCase | RegexOptions.Compiled), "$1, что"),
        (new Regex("\\b(да|нет)\\s+(конечно|наверное|пожалуй|думаю)\\b", RegexOptions.IgnoreCase | RegexOptions.Compiled), "$1, $2"),
        (new Regex("\\b(пожалуйста)\\s+(если|когда|передай|напиши|посмотри|скажи)\\b", RegexOptions.IgnoreCase | RegexOptions.Compiled), "$1, $2"),
        (new Regex("\\b(не знаю)\\s+(похоже)\\b", RegexOptions.IgnoreCase | RegexOptions.Compiled), "$1, $2"),
        (new Regex("\\b(не только)\\s+(.+?)\\s+(но и)\\b", RegexOptions.IgnoreCase | RegexOptions.Compiled), "$1 $2, $3"),
        (new Regex("\\b(как)\\s+(.+?)\\s+(так и)\\b", RegexOptions.IgnoreCase | RegexOptions.Compiled), "$1 $2, $3"),
        (new Regex("\\b(не столько)\\s+(.+?)\\s+(сколько)\\b", RegexOptions.IgnoreCase | RegexOptions.Compiled), "$1 $2, $3"),
        (new Regex("\\b(привет|здравствуйте|добрый день|добрый вечер)\\s+([а-яёa-z-]+)", RegexOptions.IgnoreCase | RegexOptions.Compiled), "$1, $2"),
    ];

    private static readonly string[] IntroductoryWords =
    [
        "конечно",
        "наверное",
        "возможно",
        "кажется",
        "кстати",
        "например",
        "во-первых",
        "во-вторых",
        "по-моему",
        "в итоге",
        "по итогу",
        "по сути",
        "как правило",
        "безусловно",
        "разумеется",
        "вообще-то",
        "скорее всего",
        "к счастью",
        "к сожалению",
        "похоже",
    ];
    private static readonly string[] LeadingSubordinatePhrases =
    [
        "если",
        "когда",
        "хотя",
        "пока",
        "раз",
        "поскольку",
        "как только",
        "едва",
        "перед тем как",
        "после того как",
        "несмотря на то что",
    ];
    private static readonly HashSet<string> ClauseLeadTokens = new(StringComparer.OrdinalIgnoreCase)
    {
        "я", "мы", "ты", "вы", "он", "она", "оно", "они", "это", "то",
        "все", "всё", "мне", "нам", "ему", "ей", "им", "значит", "тогда", "потом",
    };
    private static readonly HashSet<string> CompoundClauseConjunctions = new(StringComparer.OrdinalIgnoreCase)
    {
        "и", "или", "либо", "да",
    };
    private static readonly HashSet<string> AddressLeadStopWords = new(StringComparer.OrdinalIgnoreCase)
    {
        "я", "мы", "ты", "вы", "он", "она", "оно", "они", "это", "кто", "что", "где", "когда", "зачем",
        "почему", "как", "если", "когда", "пока", "хотя", "чтобы", "будто", "словно", "так", "просто",
        "ладно", "давай", "сегодня", "завтра", "вчера", "сейчас", "потом", "вообще", "кстати", "например",
        "ну", "блин", "капец", "жесть", "господи", "чёрт", "черт", "привет", "здравствуйте", "добрый", "доброе",
    };
    private static readonly HashSet<string> AddressFollowerTokens = new(StringComparer.OrdinalIgnoreCase)
    {
        "ты", "вы", "посмотри", "смотри", "слушай", "скажи", "напиши", "ответь", "подскажи", "подойди",
        "глянь", "зацени", "пожалуйста", "помоги", "давай", "иди", "проверь", "кинь", "пришли", "можешь",
        "можете", "где", "как", "что", "чего", "когда", "зачем", "почему", "нужно", "надо", "будешь",
        "будете", "помнишь", "знаешь",
    };

    private readonly ILogger<SpeechPunctuationService> _logger;
    private readonly IConfiguration _configuration;
    private readonly IHttpClientFactory _httpClientFactory;
    private readonly SemaphoreSlim _ollamaRequestLock;

    public SpeechPunctuationService(
        ILogger<SpeechPunctuationService> logger,
        IConfiguration configuration,
        IHttpClientFactory httpClientFactory)
    {
        _logger = logger;
        _configuration = configuration;
        _httpClientFactory = httpClientFactory;

        var ollamaMaxConcurrency = GetOllamaMaxConcurrency();
        _ollamaRequestLock = new SemaphoreSlim(ollamaMaxConcurrency, ollamaMaxConcurrency);
    }

    public void Dispose()
    {
        _ollamaRequestLock.Dispose();
    }

    public async Task<SpeechPunctuationResult> PunctuateAsync(string text, CancellationToken cancellationToken = default)
    {
        var normalizedInput = NormalizeInput(text);
        if (string.IsNullOrWhiteSpace(normalizedInput))
        {
            return new SpeechPunctuationResult
            {
                Text = string.Empty,
                Provider = "empty",
                UsedModel = false,
            };
        }

        var modelResult = await TryPunctuateWithOllamaAsync(normalizedInput, cancellationToken);
        if (modelResult is not null)
        {
            return modelResult;
        }

        return new SpeechPunctuationResult
        {
            Text = normalizedInput,
            Provider = "ollama-unavailable",
            UsedModel = false,
        };
    }

    public static string ApplyConservativeSpeechPunctuation(string text)
    {
        var normalizedText = ApplySpokenPunctuation(text);
        if (string.IsNullOrWhiteSpace(normalizedText))
        {
            return string.Empty;
        }

        normalizedText = NormalizeSpacing(normalizedText);
        return CapitalizeSentences(normalizedText);
    }

    public static string ApplyHeuristicPunctuation(string text)
    {
        var normalizedText = ApplySpokenPunctuation(text);
        if (string.IsNullOrWhiteSpace(normalizedText))
        {
            return string.Empty;
        }

        return ApplyRuleBasedPolish(normalizedText, inferTerminalPunctuation: true);
    }

    private static string ApplyRuleBasedPolish(string text, bool inferTerminalPunctuation)
    {
        var normalizedText = NormalizeInput(text);
        if (string.IsNullOrWhiteSpace(normalizedText))
        {
            return string.Empty;
        }

        foreach (var regex in CommaBeforeRules)
        {
            normalizedText = regex.Replace(normalizedText, ", $1 ");
        }

        normalizedText = SentenceOpeningParentheticalRegex.Replace(normalizedText, static match =>
        {
            var prefix = match.Groups[1].Value;
            var phrase = match.Groups[2].Value;
            return $"{prefix}{phrase}, ";
        });

        normalizedText = SentenceOpeningInterjectionRegex.Replace(normalizedText, static match =>
        {
            var prefix = match.Groups[1].Value;
            var phrase = match.Groups[2].Value;
            return $"{prefix}{phrase}, ";
        });

        normalizedText = IntroductoryPhrasesRegex.Replace(normalizedText, static match =>
        {
            var prefix = match.Groups[1].Value;
            var phrase = match.Groups[2].Value;
            return $"{prefix}{phrase}, ";
        });

        foreach (var (regex, replacement) in ComplexPhraseReplacements)
        {
            normalizedText = regex.Replace(normalizedText, replacement);
        }

        normalizedText = InsertSentenceOpeningAddressComma(normalizedText);
        normalizedText = InsertInlineInterjectionCommas(normalizedText);
        normalizedText = InsertInlineParentheticalPhraseCommas(normalizedText);
        normalizedText = InsertIntroductoryWordCommas(normalizedText);
        normalizedText = InsertConditionalPairComma(normalizedText);
        normalizedText = InsertLeadingSubordinateClauseComma(normalizedText);
        normalizedText = InsertCompoundClauseCommas(normalizedText);
        normalizedText = InsertInitialGerundComma(normalizedText);
        normalizedText = LeadingQuestionParticleCommaRegex.Replace(normalizedText, "$1 $2");
        normalizedText = Regex.Replace(normalizedText, ",\\s+или\\s+нет$", " или нет", RegexOptions.IgnoreCase);
        normalizedText = NormalizeSpacing(normalizedText);
        normalizedText = CapitalizeSentences(normalizedText);

        if (Regex.IsMatch(normalizedText, "[.!?…]$"))
        {
            return normalizedText;
        }

        if (!inferTerminalPunctuation)
        {
            return normalizedText;
        }

        if (ShouldEndWithQuestionMark(normalizedText))
        {
            return $"{normalizedText}?";
        }

        if (ExclamationStartRegex.IsMatch(normalizedText))
        {
            return $"{normalizedText}!";
        }

        return $"{normalizedText}.";
    }

    private static string PolishModelPunctuation(string text, bool inferTerminalPunctuation)
    {
        var normalizedText = NormalizeInput(text);
        if (string.IsNullOrWhiteSpace(normalizedText))
        {
            return string.Empty;
        }

        normalizedText = NormalizeSpacing(normalizedText);
        normalizedText = CapitalizeSentences(normalizedText);

        if (Regex.IsMatch(normalizedText, "[.!?\\u2026]$") || !inferTerminalPunctuation)
        {
            return normalizedText;
        }

        if (ShouldEndWithQuestionMark(normalizedText))
        {
            return $"{normalizedText}?";
        }

        if (ExclamationStartRegex.IsMatch(normalizedText))
        {
            return $"{normalizedText}!";
        }

        return $"{normalizedText}.";
    }

    private async Task<SpeechPunctuationResult?> TryPunctuateWithOllamaAsync(string normalizedText, CancellationToken cancellationToken)
    {
        if (!IsOllamaEnabled())
        {
            return null;
        }

        var model = GetOllamaModel();
        if (string.IsNullOrWhiteSpace(model))
        {
            return null;
        }

        var queueWait = TimeSpan.FromMilliseconds(GetOllamaQueueWaitMilliseconds());
        if (!await _ollamaRequestLock.WaitAsync(queueWait, cancellationToken))
        {
            return null;
        }

        try
        {
            using var timeoutCts = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
            timeoutCts.CancelAfter(TimeSpan.FromSeconds(GetOllamaTimeoutSeconds()));

            var client = _httpClientFactory.CreateClient();
            client.Timeout = Timeout.InfiniteTimeSpan;

            var payload = new
            {
                model,
                prompt = CreateOllamaPrompt(normalizedText),
                stream = false,
                options = new
                {
                    temperature = 0,
                    top_p = 0.2,
                    num_predict = Math.Min(2048, Math.Max(128, normalizedText.Length + 64)),
                },
            };

            using var content = new StringContent(JsonSerializer.Serialize(payload), Encoding.UTF8, "application/json");
            using var response = await client.PostAsync(GetOllamaGenerateEndpoint(), content, timeoutCts.Token);
            var responseBody = await response.Content.ReadAsStringAsync(timeoutCts.Token);
            if (!response.IsSuccessStatusCode)
            {
                _logger.LogDebug("Ollama punctuation failed with status {StatusCode}: {Body}", response.StatusCode, responseBody);
                return null;
            }

            var ollamaResponse = JsonSerializer.Deserialize<OllamaGenerateResponse>(responseBody, JsonOptions);
            var candidate = NormalizeModelOutput(ollamaResponse?.Response);
            if (string.IsNullOrWhiteSpace(candidate))
            {
                return null;
            }

            if (!LooksLikePunctuationOnlyChange(normalizedText, candidate))
            {
                _logger.LogWarning("Ollama punctuation changed text content, using fallback.");
                return null;
            }

            return new SpeechPunctuationResult
            {
                Text = candidate,
                Provider = $"ollama:{model}",
                UsedModel = true,
            };
        }
        catch (Exception exception) when (exception is HttpRequestException or JsonException || exception is OperationCanceledException && !cancellationToken.IsCancellationRequested)
        {
            _logger.LogDebug(exception, "Ollama punctuation is unavailable, using fallback.");
            return null;
        }
        finally
        {
            _ollamaRequestLock.Release();
        }
    }

    private static string CreateOllamaPrompt(string text) =>
        $"""
        Ты редактор пунктуации русского текста.
        Восстанови пропущенные знаки препинания: запятые, точки, вопросительные и восклицательные знаки, двоеточия, тире, кавычки, если они нужны.
        Обязательно проверь запятые внутри предложения, а не только знак в конце.
        Разрешено менять только пунктуацию, пробелы и заглавные буквы в начале предложений.
        Запрещено менять слова, порядок слов, сленг, мат, эмодзи, ссылки, упоминания и смысл.
        Верни только один исправленный вариант текста без объяснений.

        Пример:
        вход: ну да конечно я понял что ты хотел
        выход: Ну, да, конечно, я понял, что ты хотел.

        Текст:
        {text}
        """;

    private static string NormalizeModelOutput(string? text)
    {
        var normalizedText = NormalizeInput(text);
        if (string.IsNullOrWhiteSpace(normalizedText))
        {
            return string.Empty;
        }

        normalizedText = Regex.Replace(normalizedText, "^```(?:text|txt|ru|russian)?\\s*", string.Empty, RegexOptions.IgnoreCase).Trim();
        normalizedText = Regex.Replace(normalizedText, "\\s*```$", string.Empty, RegexOptions.IgnoreCase).Trim();
        if (normalizedText.Length >= 2
            && ((normalizedText[0] == '"' && normalizedText[^1] == '"')
                || (normalizedText[0] == '«' && normalizedText[^1] == '»')
                || (normalizedText[0] == '\'' && normalizedText[^1] == '\'')))
        {
            normalizedText = normalizedText[1..^1].Trim();
        }

        return normalizedText;
    }

    private static bool LooksLikePunctuationOnlyChange(string originalText, string candidateText)
    {
        static string NormalizeIdentity(string value)
        {
            var lowered = NormalizeInput(value).ToLowerInvariant();
            return Regex.Replace(lowered, "[^\\p{L}\\p{Nd}]+", string.Empty);
        }

        return string.Equals(NormalizeIdentity(originalText), NormalizeIdentity(candidateText), StringComparison.Ordinal);
    }

    private bool IsOllamaEnabled()
    {
        var rawValue = _configuration["SpeechPunctuation:EnableOllama"];
        return string.IsNullOrWhiteSpace(rawValue) || !rawValue.Equals("false", StringComparison.OrdinalIgnoreCase);
    }

    private string GetOllamaModel()
    {
        var configuredModel = _configuration["SpeechPunctuation:OllamaModel"];
        return string.IsNullOrWhiteSpace(configuredModel) ? "qwen2.5:3b" : configuredModel.Trim();
    }

    private string GetOllamaGenerateEndpoint()
    {
        var configuredEndpoint = _configuration["SpeechPunctuation:OllamaGenerateEndpoint"];
        return string.IsNullOrWhiteSpace(configuredEndpoint)
            ? "http://localhost:11434/api/generate"
            : configuredEndpoint.Trim();
    }

    private int GetOllamaTimeoutSeconds()
    {
        if (int.TryParse(_configuration["SpeechPunctuation:OllamaTimeoutSeconds"], out var timeoutSeconds))
        {
            return Math.Clamp(timeoutSeconds, 1, 60);
        }

        return 60;
    }

    private int GetOllamaQueueWaitMilliseconds()
    {
        if (int.TryParse(_configuration["SpeechPunctuation:OllamaQueueWaitMilliseconds"], out var waitMilliseconds))
        {
            return Math.Clamp(waitMilliseconds, 0, 60000);
        }

        return 60000;
    }

    private int GetOllamaMaxConcurrency()
    {
        if (int.TryParse(_configuration["SpeechPunctuation:OllamaMaxConcurrency"], out var maxConcurrency))
        {
            return Math.Clamp(maxConcurrency, 1, 4);
        }

        return 1;
    }

    private static string NormalizeInput(string? text)
    {
        return string.Concat(text ?? string.Empty).Replace("\r", " ").Replace("\n", " ").Trim();
    }

    private static string ApplySpokenPunctuation(string text)
    {
        var normalizedText = $" {NormalizeInput(text)} ";
        foreach (var (regex, replacement) in SpokenPunctuationRules)
        {
            normalizedText = regex.Replace(normalizedText, replacement);
        }

        return normalizedText.Trim();
    }

    private static string InsertIntroductoryWordCommas(string text)
    {
        var normalizedText = text;
        foreach (var word in IntroductoryWords)
        {
            var pattern = $"(^|[,.!?]\\s+|\\s+)({Regex.Escape(word)})(\\s+)";
            normalizedText = Regex.Replace(
                normalizedText,
                pattern,
                static match =>
                {
                    var prefix = match.Groups[1].Value;
                    var foundWord = match.Groups[2].Value;
                    if (prefix.EndsWith(",", StringComparison.Ordinal))
                    {
                        return $"{prefix}{foundWord}{match.Groups[3].Value}";
                    }

                    return $"{prefix}{foundWord}, ";
                },
                RegexOptions.IgnoreCase);
        }

        return normalizedText;
    }

    private static string InsertInlineParentheticalPhraseCommas(string text)
    {
        return InlineParentheticalPhraseRegex.Replace(text, static match =>
        {
            var phrase = match.Groups[1].Value.Trim();
            return $", {phrase}, ";
        });
    }

    private static string InsertInlineInterjectionCommas(string text)
    {
        return InlineInterjectionRegex.Replace(text, static match =>
        {
            var phrase = match.Groups[1].Value.Trim();
            return $", {phrase}, ";
        });
    }

    private static string InsertSentenceOpeningAddressComma(string text)
    {
        return Regex.Replace(
            text,
            @"(^|[.!?…]\s+)([А-ЯЁа-яёA-Za-z][А-ЯЁа-яёA-Za-z0-9_-]{1,31})\s+([А-ЯЁа-яёA-Za-z-]+)",
            static match =>
            {
                var prefix = match.Groups[1].Value;
                var candidate = TrimWordToken(match.Groups[2].Value);
                var follower = TrimWordToken(match.Groups[3].Value);
                if (string.IsNullOrWhiteSpace(candidate)
                    || string.IsNullOrWhiteSpace(follower)
                    || AddressLeadStopWords.Contains(candidate)
                    || !AddressFollowerTokens.Contains(follower)
                    || LooksLikeFiniteVerb(candidate)
                    || candidate.Contains(',', StringComparison.Ordinal))
                {
                    return match.Value;
                }

                return $"{prefix}{candidate}, {follower}";
            },
            RegexOptions.IgnoreCase);
    }

    private static string InsertConditionalPairComma(string text)
    {
        return Regex.Replace(
            text,
            "\\b(если\\b.*?)(\\s+)то\\b",
            static match =>
            {
                var prefix = match.Groups[1].Value.TrimEnd();
                if (prefix.EndsWith(",", StringComparison.Ordinal))
                {
                    return $"{prefix} то";
                }

                return $"{prefix}, то";
            },
            RegexOptions.IgnoreCase | RegexOptions.Singleline);
    }

    private static string InsertLeadingSubordinateClauseComma(string text)
    {
        var words = text.Split(' ', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
        if (words.Length < 5)
        {
            return text;
        }

        foreach (var phrase in LeadingSubordinatePhrases.OrderByDescending(static item => item.Length))
        {
            var phraseWords = phrase.Split(' ', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
            if (!StartsWithWords(words, phraseWords))
            {
                continue;
            }

            if (phrase.Equals("если", StringComparison.OrdinalIgnoreCase)
                && words.Length > phraseWords.Length
                && TrimWordToken(words[phraseWords.Length]).Equals("честно", StringComparison.OrdinalIgnoreCase))
            {
                continue;
            }

            for (var index = phraseWords.Length + 2; index < words.Length; index += 1)
            {
                var current = TrimWordToken(words[index]);
                if (string.IsNullOrWhiteSpace(current))
                {
                    continue;
                }

                if (current.Equals("то", StringComparison.OrdinalIgnoreCase))
                {
                    if (!EndsWithComma(words[index - 1]))
                    {
                        words[index - 1] = $"{words[index - 1]},";
                    }

                    return string.Join(" ", words);
                }

                if (!ClauseLeadTokens.Contains(current))
                {
                    continue;
                }

                if (!EndsWithComma(words[index - 1]))
                {
                    words[index - 1] = $"{words[index - 1]},";
                }

                return string.Join(" ", words);
            }
        }

        return text;
    }

    private static string InsertCompoundClauseCommas(string text)
    {
        var words = text.Split(' ', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
        if (words.Length < 4)
        {
            return text;
        }

        for (var index = 1; index < words.Length - 1; index += 1)
        {
            var conjunction = TrimWordToken(words[index]);
            if (!CompoundClauseConjunctions.Contains(conjunction))
            {
                continue;
            }

            var previousToken = TrimWordToken(words[index - 1]);
            var nextToken = TrimWordToken(words[index + 1]);
            var nextNextToken = index + 2 < words.Length ? TrimWordToken(words[index + 2]) : string.Empty;
            var nextStartsClause = ClauseLeadTokens.Contains(nextToken)
                || LooksLikeFiniteVerb(nextToken)
                || (!string.IsNullOrWhiteSpace(nextToken) && !LooksLikeFiniteVerb(nextToken) && LooksLikeFiniteVerb(nextNextToken));
            var previousClauseHasFiniteVerb = HasFiniteVerbBefore(words, index);

            if ((!LooksLikeFiniteVerb(previousToken) && !previousClauseHasFiniteVerb) || !nextStartsClause || EndsWithComma(words[index - 1]))
            {
                continue;
            }

            words[index - 1] = $"{words[index - 1]},";
        }

        return string.Join(" ", words);
    }

    private static string InsertInitialGerundComma(string text)
    {
        return Regex.Replace(
            text,
            @"(^|[.!?…]\s+)([А-ЯЁа-яё-]+(?:\s+[А-ЯЁа-яё-]+){0,5})\s+([А-ЯЁа-яё-]+)",
            static match =>
            {
                var prefix = match.Groups[1].Value;
                var phrase = match.Groups[2].Value;
                var nextWord = match.Groups[3].Value;
                var words = phrase.Split(' ', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
                if (words.Length == 0 || !GerundSuffixRegex.IsMatch(words[0]) || !ClauseStartRegex.IsMatch(nextWord) || phrase.Contains(',', StringComparison.Ordinal))
                {
                    return match.Value;
                }

                return $"{prefix}{phrase}, {nextWord}";
            });
    }

    private static string NormalizeSpacing(string text)
    {
        return Regex.Replace(
            Regex.Replace(
                Regex.Replace(
                    Regex.Replace(
                        Regex.Replace(text, "\\s+([,.!?;:…])", "$1"),
                        "([,.!?;:…])(?=[^\\s,.!?;:…])",
                        "$1 "),
                    "\\s+,",
                    ","),
                ",\\s*,+",
                ", "),
            "\\s{2,}",
            " ").Trim();
    }

    private static string CapitalizeSentences(string text)
    {
        var segments = Regex.Split(text, "([.!?…]\\s+)");
        var builder = new StringBuilder(text.Length + 8);
        foreach (var segment in segments)
        {
            if (string.IsNullOrWhiteSpace(segment))
            {
                builder.Append(segment);
                continue;
            }

            if (Regex.IsMatch(segment, "^[.!?…]\\s*$"))
            {
                builder.Append(segment);
                continue;
            }

            builder.Append(char.ToUpperInvariant(segment[0]));
            if (segment.Length > 1)
            {
                builder.Append(segment[1..]);
            }
        }

        return builder.ToString().Trim();
    }

    private static bool ShouldEndWithQuestionMark(string text)
    {
        if (ComparativePairRegex.IsMatch(text))
        {
            return false;
        }

        return QuestionStartRegex.IsMatch(text)
            || QuestionEndRegex.IsMatch(text)
            || QuestionTailRegex.IsMatch(text);
    }

    private static bool StartsWithWords(IReadOnlyList<string> sourceWords, IReadOnlyList<string> prefixWords)
    {
        if (sourceWords.Count < prefixWords.Count)
        {
            return false;
        }

        for (var index = 0; index < prefixWords.Count; index += 1)
        {
            if (!TrimWordToken(sourceWords[index]).Equals(prefixWords[index], StringComparison.OrdinalIgnoreCase))
            {
                return false;
            }
        }

        return true;
    }

    private static bool HasFiniteVerbBefore(IReadOnlyList<string> words, int index)
    {
        var startIndex = Math.Max(0, index - 4);
        for (var cursor = index - 1; cursor >= startIndex; cursor -= 1)
        {
            if (LooksLikeFiniteVerb(words[cursor]))
            {
                return true;
            }

            if (EndsWithComma(words[cursor]))
            {
                break;
            }
        }

        return false;
    }

    private static bool LooksLikeFiniteVerb(string token)
    {
        var normalizedToken = TrimWordToken(token);
        return !string.IsNullOrWhiteSpace(normalizedToken)
            && (FiniteVerbRegex.IsMatch(normalizedToken)
                || normalizedToken.EndsWith("лся", StringComparison.OrdinalIgnoreCase)
                || normalizedToken.EndsWith("лась", StringComparison.OrdinalIgnoreCase)
                || normalizedToken.EndsWith("лось", StringComparison.OrdinalIgnoreCase)
                || normalizedToken.EndsWith("лись", StringComparison.OrdinalIgnoreCase));
    }

    private static bool EndsWithComma(string token)
    {
        return token.EndsWith(",", StringComparison.Ordinal);
    }

    private static string TrimWordToken(string token)
    {
        return string.Concat(token ?? string.Empty).Trim().Trim(',', '.', '!', '?', ':', ';', '…', '"', '\'');
    }
}
