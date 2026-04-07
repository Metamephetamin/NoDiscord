using BackNoDiscord.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace BackNoDiscord.Controllers;

[ApiController]
[Route("api/app")]
public class AppController : ControllerBase
{
    private readonly IClientUpdateService _clientUpdateService;

    public AppController(IClientUpdateService clientUpdateService)
    {
        _clientUpdateService = clientUpdateService;
    }

    [AllowAnonymous]
    [HttpGet("version")]
    public IActionResult GetClientVersionDescriptor([FromQuery] string? clientVersion, [FromQuery] string? platform, [FromQuery] string? arch)
    {
        var descriptor = _clientUpdateService.GetDescriptor(clientVersion, platform, arch);
        return Ok(descriptor);
    }
}
