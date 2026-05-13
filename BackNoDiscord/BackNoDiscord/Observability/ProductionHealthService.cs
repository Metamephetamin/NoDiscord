using Microsoft.EntityFrameworkCore;

namespace BackNoDiscord.Observability;

public sealed record ProductionReadinessResult(bool Ready, IReadOnlyDictionary<string, string> Checks);

public sealed class ProductionHealthService
{
    private readonly AppDbContext _context;
    private readonly IConfiguration _configuration;

    public ProductionHealthService(AppDbContext context, IConfiguration configuration)
    {
        _context = context;
        _configuration = configuration;
    }

    public async Task<ProductionReadinessResult> CheckReadinessAsync(CancellationToken cancellationToken)
    {
        var checks = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);

        checks["connectionString"] = string.IsNullOrWhiteSpace(_configuration.GetConnectionString("DefaultConnection"))
            ? "missing"
            : "ok";

        var jwtKey = _configuration["Jwt:Key"];
        checks["jwt"] = string.IsNullOrWhiteSpace(jwtKey) || jwtKey.Length < 32 ? "missing" : "ok";

        try
        {
            checks["database"] = await _context.Database.CanConnectAsync(cancellationToken) ? "ok" : "unavailable";
        }
        catch
        {
            checks["database"] = "unavailable";
        }

        var ready = checks.Values.All(value => value == "ok");
        return new ProductionReadinessResult(ready, checks);
    }
}
