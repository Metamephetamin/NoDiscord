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
                ["ConnectionStrings:DefaultConnection"] = "Host=localhost;Database=test"
            })
            .Build();
        var service = new ProductionHealthService(context, configuration);

        var result = await service.CheckReadinessAsync(CancellationToken.None);

        Assert.True(result.Ready);
        Assert.Equal("ok", result.Checks["database"]);
        Assert.Equal("ok", result.Checks["jwt"]);
    }

    [Fact]
    public async Task CheckReadinessAsync_ReportsNotReadyWhenCriticalConfigIsMissing()
    {
        await using var context = CreateContext();
        var configuration = new ConfigurationBuilder().Build();
        var service = new ProductionHealthService(context, configuration);

        var result = await service.CheckReadinessAsync(CancellationToken.None);

        Assert.False(result.Ready);
        Assert.Equal("missing", result.Checks["jwt"]);
        Assert.Equal("missing", result.Checks["connectionString"]);
    }

    private static AppDbContext CreateContext()
    {
        var options = new DbContextOptionsBuilder<AppDbContext>()
            .UseInMemoryDatabase($"health-{Guid.NewGuid():N}")
            .Options;

        return new AppDbContext(options);
    }
}
