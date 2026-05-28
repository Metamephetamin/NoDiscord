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
        await RunRepairOnceAsync(stoppingToken);
    }

    public async Task RunRepairOnceAsync(CancellationToken stoppingToken)
    {
        if (!_configuration.GetValue<bool>("ChatFiles:RepairLegacyMetadataOnStartup"))
        {
            return;
        }

        var batchSize = Math.Clamp(_configuration.GetValue("ChatFiles:RepairLegacyMetadataBatchSize", 200), 1, 500);
        var maxBatches = Math.Clamp(_configuration.GetValue("ChatFiles:RepairLegacyMetadataMaxBatches", 20), 1, 200);
        var totalRepaired = 0;

        using var scope = _scopeFactory.CreateScope();
        var lockService = scope.ServiceProvider.GetRequiredService<IDistributedJobLock>();
        await using var jobLock = await lockService.TryAcquireAsync("chat-file-metadata-repair", TimeSpan.FromMinutes(30), stoppingToken);
        if (jobLock is null)
        {
            _logger.LogDebug("Legacy chat file metadata repair skipped because another instance holds the lock.");
            return;
        }

        var repairService = scope.ServiceProvider.GetRequiredService<ChatFileMetadataRepairService>();
        for (var batch = 0; batch < maxBatches && !stoppingToken.IsCancellationRequested; batch += 1)
        {
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
