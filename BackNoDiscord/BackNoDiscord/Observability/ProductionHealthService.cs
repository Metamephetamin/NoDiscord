using Microsoft.EntityFrameworkCore;
using StackExchange.Redis;
using System.Diagnostics;

namespace BackNoDiscord.Observability;

public sealed record ProductionReadinessResult(bool Ready, IReadOnlyDictionary<string, string> Checks);

public interface ISystemdTimerStatus
{
    Task<string> GetTimerStatusAsync(string timerName, CancellationToken cancellationToken);
}

public sealed class SystemdTimerStatus : ISystemdTimerStatus
{
    public async Task<string> GetTimerStatusAsync(string timerName, CancellationToken cancellationToken)
    {
        if (!OperatingSystem.IsLinux())
        {
            return "unknown";
        }

        try
        {
            using var process = new Process();
            process.StartInfo = new ProcessStartInfo
            {
                FileName = "systemctl",
                ArgumentList = { "is-enabled", timerName },
                RedirectStandardOutput = true,
                RedirectStandardError = true,
                UseShellExecute = false
            };

            process.Start();
            var output = await process.StandardOutput.ReadToEndAsync(cancellationToken);
            await process.WaitForExitAsync(cancellationToken);
            return process.ExitCode == 0 ? output.Trim() : "disabled";
        }
        catch
        {
            return "unknown";
        }
    }
}

public sealed class ProductionHealthService
{
    private readonly AppDbContext _context;
    private readonly IConfiguration _configuration;
    private readonly ISystemdTimerStatus _systemdTimerStatus;

    public ProductionHealthService(AppDbContext context, IConfiguration configuration, ISystemdTimerStatus systemdTimerStatus)
    {
        _context = context;
        _configuration = configuration;
        _systemdTimerStatus = systemdTimerStatus;
    }

    public async Task<ProductionReadinessResult> CheckReadinessAsync(CancellationToken cancellationToken)
    {
        var checks = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);

        checks["connectionString"] = string.IsNullOrWhiteSpace(_configuration.GetConnectionString("DefaultConnection"))
            ? "missing"
            : "ok";

        var jwtKey = _configuration["Jwt:Key"];
        checks["jwt"] = string.IsNullOrWhiteSpace(jwtKey) || jwtKey.Length < 32 ? "missing" : "ok";
        checks["configuration"] = checks["connectionString"] == "ok" && checks["jwt"] == "ok" ? "ok" : "missing";

        try
        {
            checks["database"] = await _context.Database.CanConnectAsync(cancellationToken) ? "ok" : "unavailable";
        }
        catch
        {
            checks["database"] = "unavailable";
        }

        checks["redis"] = await CheckRedisAsync(cancellationToken);
        checks["storage"] = CheckStorage();
        checks["backupTimer"] = await CheckBackupTimerAsync(cancellationToken);

        var ready = checks.Values.All(IsReadyStatus);
        return new ProductionReadinessResult(ready, checks);
    }

    private async Task<string> CheckRedisAsync(CancellationToken cancellationToken)
    {
        var connectionString = _configuration["Redis:ConnectionString"];
        if (string.IsNullOrWhiteSpace(connectionString))
        {
            return "disabled";
        }

        try
        {
            await using var redis = await ConnectionMultiplexer.ConnectAsync(connectionString);
            await redis.GetDatabase().PingAsync();
            return "ok";
        }
        catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
        {
            return "unavailable";
        }
        catch
        {
            return "unavailable";
        }
    }

    private string CheckStorage()
    {
        var storageRoot = _configuration["Storage:Root"];
        if (string.IsNullOrWhiteSpace(storageRoot))
        {
            storageRoot = _configuration["ND_STORAGE_ROOT"];
        }

        if (string.IsNullOrWhiteSpace(storageRoot))
        {
            return "missing";
        }

        try
        {
            Directory.CreateDirectory(storageRoot);
            var probePath = Path.Combine(storageRoot, $".health-{Guid.NewGuid():N}.tmp");
            File.WriteAllText(probePath, "ok");
            File.Delete(probePath);
            return "ok";
        }
        catch
        {
            return "unavailable";
        }
    }

    private async Task<string> CheckBackupTimerAsync(CancellationToken cancellationToken)
    {
        var status = await _systemdTimerStatus.GetTimerStatusAsync("nodiscord-db-backup.timer", cancellationToken);
        return status switch
        {
            "enabled" => "ok",
            "unknown" => "unknown",
            _ => "unavailable"
        };
    }

    private static bool IsReadyStatus(string status) =>
        status is "ok" or "disabled" or "unknown";
}
