using BackNoDiscord.Security;
using BackNoDiscord.Services;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace BackNoDiscord.Controllers;

[ApiController]
[Route("api/server-memberships")]
[Authorize(AuthenticationSchemes = JwtBearerDefaults.AuthenticationScheme)]
public class ServerMembershipsController : ControllerBase
{
    private readonly ServerStateService _serverState;

    public ServerMembershipsController(ServerStateService serverState)
    {
        _serverState = serverState;
    }

    [HttpGet]
    public IActionResult GetMyServers()
    {
        if (!AuthenticatedUserAccessor.TryGetAuthenticatedUser(User, out var currentUser))
        {
            return Unauthorized();
        }

        var snapshots = _serverState.GetSnapshotsForUser(currentUser.UserId);
        return Ok(snapshots);
    }
}
