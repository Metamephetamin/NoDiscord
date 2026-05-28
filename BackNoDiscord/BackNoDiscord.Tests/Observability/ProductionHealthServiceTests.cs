using BackNoDiscord;
using BackNoDiscord.Observability;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;

namespace BackNoDiscord.Tests.Observability;

public sealed class ProductionHealthServiceTests
{
    [Fact]
    public async Task CheckReadinessAsync_ReportsReadyWhenDatabaseAndCriticalConfigAreAvailable()
    {
        await using var context = CreateContext();
        var configuration = new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["Jwt:Key"] = new string('a', 32),
                ["ConnectionStrings:DefaultConnection"] = "Host=localhost;Database=test",
                ["Storage:Root"] = Directory.CreateTempSubdirectory("health-storage-").FullName
            })
            .Build();
        var service = new ProductionHealthService(context, configuration, new FakeSystemdTimerStatus("enabled"));

        var result = await service.CheckReadinessAsync(CancellationToken.None);

        Assert.True(result.Ready);
        Assert.Equal("ok", result.Checks["database"]);
        Assert.Equal("ok", result.Checks["jwt"]);
        Assert.Equal("disabled", result.Checks["redis"]);
        Assert.Equal("ok", result.Checks["storage"]);
        Assert.Equal("ok", result.Checks["configuration"]);
        Assert.Equal("ok", result.Checks["backupTimer"]);
    }

    [Fact]
    public async Task CheckReadinessAsync_ReportsNotReadyWhenCriticalConfigIsMissing()
    {
        await using var context = CreateContext();
        var configuration = new ConfigurationBuilder().Build();
        var service = new ProductionHealthService(context, configuration, new FakeSystemdTimerStatus("disabled"));

        var result = await service.CheckReadinessAsync(CancellationToken.None);

        Assert.False(result.Ready);
        Assert.Equal("missing", result.Checks["jwt"]);
        Assert.Equal("missing", result.Checks["connectionString"]);
        Assert.True(result.Checks.ContainsKey("database"));
        Assert.True(result.Checks.ContainsKey("redis"));
        Assert.True(result.Checks.ContainsKey("storage"));
        Assert.True(result.Checks.ContainsKey("configuration"));
        Assert.True(result.Checks.ContainsKey("backupTimer"));
    }

    private static AppDbContext CreateContext()
    {
        var options = new DbContextOptionsBuilder<AppDbContext>()
            .UseInMemoryDatabase($"health-{Guid.NewGuid():N}")
            .Options;

        return new AppDbContext(options);
    }

    private sealed class FakeSystemdTimerStatus : ISystemdTimerStatus
    {
        private readonly string _status;

        public FakeSystemdTimerStatus(string status)
        {
            _status = status;
        }

        public Task<string> GetTimerStatusAsync(string timerName, CancellationToken cancellationToken) =>
            Task.FromResult(_status);
    }
}
