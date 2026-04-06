using BackNoDiscord.Services;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace BackNoDiscord.Controllers;

public sealed class SpeechPunctuationRequest
{
    public string? Text { get; set; }
}

[ApiController]
[Route("api/speech")]
[Authorize(AuthenticationSchemes = JwtBearerDefaults.AuthenticationScheme)]
public class SpeechController : ControllerBase
{
    private readonly ISpeechPunctuationService _speechPunctuationService;

    public SpeechController(ISpeechPunctuationService speechPunctuationService)
    {
        _speechPunctuationService = speechPunctuationService;
    }

    [HttpPost("punctuate")]
    public async Task<IActionResult> Punctuate([FromBody] SpeechPunctuationRequest request, CancellationToken cancellationToken)
    {
        var rawText = string.Concat(request?.Text ?? string.Empty);
        if (string.IsNullOrWhiteSpace(rawText))
        {
            return Ok(new { text = string.Empty, provider = "empty", usedModel = false });
        }

        if (rawText.Length > 4000)
        {
            return BadRequest(new { message = "Текст для пунктуации слишком длинный." });
        }

        var result = await _speechPunctuationService.PunctuateAsync(rawText, cancellationToken);
        return Ok(new
        {
            text = result.Text,
            provider = result.Provider,
            usedModel = result.UsedModel,
        });
    }
}
