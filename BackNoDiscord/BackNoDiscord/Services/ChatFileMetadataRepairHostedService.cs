namespace BackNoDiscord.Services;

public sealed class ChatFileMetadataRepairHostedService : BackgroundService
{
    private readonly IServiceScopeFactory _scopeFactory;
    private readonly IConfiguration _configuration;
    private readonly ILogger<ChatFileMetadataRepairHostedService> _logger;

    public ChatFileMetadataRepairHostedService(
        IServiceScopeFactory scopeFactory,
        IConfiguration configuration,
        ILogger<ChatFileMetadataRepairHostedService> logger)
    {
        _scopeFactory = scopeFactory;
        _configuration = configuration;
        _logger = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        if (!_configuration.GetValue<bool>("ChatFiles:RepairLegacyMetadataOnStartup"))
        {
            return;
        }

        var batchSize = Math.Clamp(_configuration.GetValue("ChatFiles:RepairLegacyMetadataBatchSize", 200), 1, 500);
        var maxBatches = Math.Clamp(_configuration.GetValue("ChatFiles:RepairLegacyMetadataMaxBatches", 20), 1, 200);
        var totalRepaired = 0;

        for (var batch = 0; batch < maxBatches && !stoppingToken.IsCancellationRequested; batch += 1)
        {
            using var scope = _scopeFactory.CreateScope();
            var repairService = scope.ServiceProvider.GetRequiredService<ChatFileMetadataRepairService>();
            var repaired = await repairService.RepairAsync(batchSize, stoppingToken);
            totalRepaired += repaired;
            if (repaired == 0)
            {
                break;
            }
        }

        if (totalRepaired > 0)
        {
            _logger.LogInformation("Repaired legacy chat file metadata for {RepairedCount} messages.", totalRepaired);
        }
    }
}
