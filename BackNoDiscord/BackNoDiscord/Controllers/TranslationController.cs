using BackNoDiscord.Services;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace BackNoDiscord.Controllers;

public sealed class TranslateTextRequest
{
    public string? Text { get; set; }
    public string? TargetLanguage { get; set; }
}

[ApiController]
[Route("api/translate")]
[Authorize(AuthenticationSchemes = JwtBearerDefaults.AuthenticationScheme)]
public sealed class TranslationController : ControllerBase
{
    private readonly ITextTranslationService _translationService;
    private readonly ILogger<TranslationController> _logger;

    public TranslationController(ITextTranslationService translationService, ILogger<TranslationController> logger)
    {
        _translationService = translationService;
        _logger = logger;
    }

    [HttpPost]
    public async Task<IActionResult> Translate([FromBody] TranslateTextRequest request, CancellationToken cancellationToken)
    {
        var text = string.Concat(request?.Text ?? string.Empty);
        if (string.IsNullOrWhiteSpace(text))
        {
            return Ok(new { text = string.Empty, sourceLanguage = "auto", targetLanguage = request?.TargetLanguage ?? "en", provider = "empty" });
        }

        if (text.Length > 4000)
        {
            return BadRequest(new { message = "Текст для перевода слишком длинный." });
        }

        try
        {
            var result = await _translationService.TranslateAsync(text, request?.TargetLanguage ?? "en", cancellationToken);
            return Ok(new
            {
                text = result.Text,
                sourceLanguage = result.SourceLanguage,
                targetLanguage = result.TargetLanguage,
                provider = result.Provider,
            });
        }
        catch (Exception exception) when (exception is not OperationCanceledException)
        {
            _logger.LogWarning(exception, "Text translation failed.");
            return StatusCode(StatusCodes.Status502BadGateway, new { message = "Не удалось перевести текст." });
        }
    }
}
