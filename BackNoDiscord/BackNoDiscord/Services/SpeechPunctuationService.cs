using System.Diagnostics;
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

internal sealed class PythonSpeechPunctuationResponse
{
    public string? Text { get; set; }
    public string? Provider { get; set; }
    public bool UsedModel { get; set; }
}

public sealed class SpeechPunctuationService : ISpeechPunctuationService
{
    private static readonly Regex QuestionStartRegex = new(
        "^(кто|что|где|куда|откуда|когда|почему|зачем|как|какой|какая|какое|какие|чей|чья|чьё|чьи|сколько|разве|неужели|можно ли|нужно ли|стоит ли|ли)\\b",
        RegexOptions.IgnoreCase | RegexOptions.Compiled);
    private static readonly Regex QuestionEndRegex = new("\\bли\\b|(?:,\\s*)?(правда|верно)\\s*$", RegexOptions.IgnoreCase | RegexOptions.Compiled);
    private static readonly Regex ExclamationStartRegex = new(
        "^(привет|здравствуйте|спасибо|пожалуйста|срочно|осторожно|внимание|ура|класс|супер|отлично)\\b",
        RegexOptions.IgnoreCase | RegexOptions.Compiled);
    private static readonly Regex IntroductoryPhrasesRegex = new(
        "(^|[.!?]\\s+)(ну|в общем|короче|слушай|смотри|кстати|например)\\s+",
        RegexOptions.IgnoreCase | RegexOptions.Compiled);
    private static readonly Regex GerundSuffixRegex = new(
        "(в|вши|вшись|я|ясь|учи|ючи|аясь|яясь|ившись|ыв|ывши|ывшись)$",
        RegexOptions.IgnoreCase | RegexOptions.Compiled);
    private static readonly Regex ClauseStartRegex = new(
        "^(я|мы|ты|вы|он|она|оно|они|это|тот|та|те|кто|все|всё|мне|нам|ему|ей|им|меня|тебя|его|её|их|[а-яё-]+(?:л|ла|ло|ли|ет|ют|ут|ит|ат|ят|ем|им|ешь|ишь|ете|ите|ался|алась|алось|ались|ется|ются|утся|ится|ятся))$",
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
        new Regex("\\s+(а|но|однако|зато)\\s+", RegexOptions.IgnoreCase | RegexOptions.Compiled),
        new Regex("\\s+(если|когда|хотя|чтобы|будто|словно|так как|потому что|несмотря на то что|так что)\\s+", RegexOptions.IgnoreCase | RegexOptions.Compiled),
        new Regex("\\s+(что|чем|где|куда|откуда|который|которая|которое|которые)\\s+", RegexOptions.IgnoreCase | RegexOptions.Compiled),
        new Regex("\\s+(например|конечно|кстати|наверное|возможно|может быть|кажется|по-моему|по сути|во-первых|во-вторых|с одной стороны|с другой стороны)\\s+", RegexOptions.IgnoreCase | RegexOptions.Compiled),
    ];

    private static readonly IReadOnlyList<(Regex Regex, string Replacement)> ComplexPhraseReplacements =
    [
        (new Regex("\\b(я думаю|я считаю|мне кажется|по-моему)\\s+что\\b", RegexOptions.IgnoreCase | RegexOptions.Compiled), "$1, что"),
        (new Regex("\\b(дело в том)\\s+что\\b", RegexOptions.IgnoreCase | RegexOptions.Compiled), "$1, что"),
        (new Regex("\\b(да|нет)\\s+(конечно|наверное|пожалуй|думаю)\\b", RegexOptions.IgnoreCase | RegexOptions.Compiled), "$1, $2"),
        (new Regex("\\b(пожалуйста)\\s+(если|когда|передай|напиши|посмотри|скажи)\\b", RegexOptions.IgnoreCase | RegexOptions.Compiled), "$1, $2"),
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
        "по сути",
        "как правило",
    ];

    private readonly ILogger<SpeechPunctuationService> _logger;
    private readonly IWebHostEnvironment _environment;
    private readonly IConfiguration _configuration;

    public SpeechPunctuationService(ILogger<SpeechPunctuationService> logger, IWebHostEnvironment environment, IConfiguration configuration)
    {
        _logger = logger;
        _environment = environment;
        _configuration = configuration;
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

        var modelResult = await TryPunctuateWithPythonModelAsync(normalizedInput, cancellationToken);
        if (modelResult is not null)
        {
            return modelResult;
        }

        return new SpeechPunctuationResult
        {
            Text = ApplyHeuristicPunctuation(normalizedInput),
            Provider = "server-heuristic",
            UsedModel = false,
        };
    }

    public static string ApplyHeuristicPunctuation(string text)
    {
        var normalizedText = ApplySpokenPunctuation(text);
        if (string.IsNullOrWhiteSpace(normalizedText))
        {
            return string.Empty;
        }

        foreach (var regex in CommaBeforeRules)
        {
            normalizedText = regex.Replace(normalizedText, ", $1 ");
        }

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

        normalizedText = InsertIntroductoryWordCommas(normalizedText);
        normalizedText = InsertInitialGerundComma(normalizedText);
        normalizedText = NormalizeSpacing(normalizedText);
        normalizedText = CapitalizeSentences(normalizedText);

        if (Regex.IsMatch(normalizedText, "[.!?…]$"))
        {
            return normalizedText;
        }

        if (QuestionStartRegex.IsMatch(normalizedText) || QuestionEndRegex.IsMatch(normalizedText))
        {
            return $"{normalizedText}?";
        }

        if (ExclamationStartRegex.IsMatch(normalizedText))
        {
            return $"{normalizedText}!";
        }

        return $"{normalizedText}.";
    }

    private async Task<SpeechPunctuationResult?> TryPunctuateWithPythonModelAsync(string normalizedText, CancellationToken cancellationToken)
    {
        if (!IsPythonModelEnabled())
        {
            return null;
        }

        var scriptPath = ResolvePythonScriptPath();
        if (string.IsNullOrWhiteSpace(scriptPath) || !File.Exists(scriptPath))
        {
            return null;
        }

        var pythonExecutable = _configuration["SpeechPunctuation:PythonExecutable"];
        if (string.IsNullOrWhiteSpace(pythonExecutable))
        {
            pythonExecutable = "python";
        }

        using var process = new Process
        {
            StartInfo = new ProcessStartInfo
            {
                FileName = pythonExecutable,
                WorkingDirectory = Path.GetDirectoryName(scriptPath) ?? _environment.ContentRootPath,
                RedirectStandardInput = true,
                RedirectStandardOutput = true,
                RedirectStandardError = true,
                UseShellExecute = false,
                CreateNoWindow = true,
                StandardOutputEncoding = Encoding.UTF8,
                StandardErrorEncoding = Encoding.UTF8,
            }
        };

        process.StartInfo.ArgumentList.Add(scriptPath);

        try
        {
            if (!process.Start())
            {
                return null;
            }

            var payload = JsonSerializer.Serialize(new { text = normalizedText });
            await process.StandardInput.WriteAsync(payload);
            await process.StandardInput.FlushAsync();
            process.StandardInput.Close();

            using var timeoutCts = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
            timeoutCts.CancelAfter(TimeSpan.FromSeconds(GetTimeoutSeconds()));

            var stdoutTask = process.StandardOutput.ReadToEndAsync(timeoutCts.Token);
            var stderrTask = process.StandardError.ReadToEndAsync(timeoutCts.Token);
            await process.WaitForExitAsync(timeoutCts.Token);

            var stdout = await stdoutTask;
            var stderr = await stderrTask;
            if (process.ExitCode != 0)
            {
                _logger.LogWarning("Speech punctuation model process exited with code {ExitCode}. stderr: {Error}", process.ExitCode, stderr);
                return null;
            }

            var response = JsonSerializer.Deserialize<PythonSpeechPunctuationResponse>(stdout);
            var punctuatedText = NormalizeInput(response?.Text);
            if (string.IsNullOrWhiteSpace(punctuatedText) || response?.UsedModel != true)
            {
                return null;
            }

            return new SpeechPunctuationResult
            {
                Text = punctuatedText,
                Provider = string.IsNullOrWhiteSpace(response.Provider) ? "python-model" : response.Provider!,
                UsedModel = true,
            };
        }
        catch (Exception exception) when (exception is InvalidOperationException or IOException or OperationCanceledException)
        {
            try
            {
                if (!process.HasExited)
                {
                    process.Kill(entireProcessTree: true);
                }
            }
            catch
            {
                // ignore cleanup failures
            }

            _logger.LogWarning(exception, "Speech punctuation model is unavailable, using heuristic fallback.");
            return null;
        }
    }

    private bool IsPythonModelEnabled()
    {
        var rawValue = _configuration["SpeechPunctuation:EnablePythonModel"];
        return string.IsNullOrWhiteSpace(rawValue) || !rawValue.Equals("false", StringComparison.OrdinalIgnoreCase);
    }

    private int GetTimeoutSeconds()
    {
        if (int.TryParse(_configuration["SpeechPunctuation:TimeoutSeconds"], out var timeoutSeconds))
        {
            return Math.Clamp(timeoutSeconds, 3, 60);
        }

        return 15;
    }

    private string ResolvePythonScriptPath()
    {
        var configuredPath = _configuration["SpeechPunctuation:ScriptPath"];
        if (!string.IsNullOrWhiteSpace(configuredPath))
        {
            return Path.IsPathRooted(configuredPath)
                ? configuredPath
                : Path.GetFullPath(Path.Combine(_environment.ContentRootPath, configuredPath));
        }

        return Path.Combine(_environment.ContentRootPath, "Punctuation", "speech_punctuate.py");
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
}
