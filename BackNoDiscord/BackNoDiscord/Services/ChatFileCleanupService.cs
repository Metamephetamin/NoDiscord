using BackNoDiscord.Infrastructure;
using Microsoft.EntityFrameworkCore;

namespace BackNoDiscord.Services;

public sealed class ChatFileCleanupService
{
    private readonly AppDbContext _context;

    public ChatFileCleanupService(AppDbContext context)
    {
        _context = context;
    }

    public async Task<ChatFileCleanupResult> CleanupAsync(
        string uploadsDirectory,
        TimeSpan orphanAge,
        CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(uploadsDirectory) || !Directory.Exists(uploadsDirectory))
        {
            return new ChatFileCleanupResult(0, 0);
        }

        var cutoffUtc = DateTimeOffset.UtcNow.Subtract(orphanAge);
        var tempDeleted = DeleteOldTempFiles(uploadsDirectory, cutoffUtc.UtcDateTime);

        var orphanRecords = await _context.ChatFileUploads
            .Where(item =>
                item.DeletedAt == null &&
                item.BoundAt == null &&
                item.MessageId == null &&
                item.CreatedAt < cutoffUtc)
            .ToListAsync(cancellationToken);

        var orphanDeleted = 0;
        foreach (var record in orphanRecords)
        {
            var filePath = Path.Combine(uploadsDirectory, Path.GetFileName(record.FileName));
            TryDeleteFile(filePath);
            record.DeletedAt = DateTimeOffset.UtcNow;
            orphanDeleted += 1;
        }

        if (orphanDeleted > 0)
        {
            await _context.SaveChangesAsync(cancellationToken);
        }

        return new ChatFileCleanupResult(tempDeleted, orphanDeleted);
    }

    private static int DeleteOldTempFiles(string uploadsDirectory, DateTime cutoffUtc)
    {
        var deleted = 0;
        foreach (var path in Directory.EnumerateFiles(uploadsDirectory, "upload-*.tmp"))
        {
            try
            {
                if (File.GetLastWriteTimeUtc(path) >= cutoffUtc)
                {
                    continue;
                }

                File.Delete(path);
                deleted += 1;
            }
            catch
            {
                // Best effort cleanup; upload/download paths must not fail because cleanup failed.
            }
        }

        return deleted;
    }

    private static void TryDeleteFile(string filePath)
    {
        try
        {
            if (File.Exists(filePath))
            {
                File.Delete(filePath);
            }
        }
        catch
        {
            // Best effort cleanup.
        }
    }
}

public sealed record ChatFileCleanupResult(int TempFilesDeleted, int OrphanUploadsDeleted);

public sealed class ChatFileCleanupHostedService : BackgroundService
{
    private static readonly TimeSpan DefaultInterval = TimeSpan.FromMinutes(30);
    private static readonly TimeSpan DefaultOrphanAge = TimeSpan.FromHours(2);
    private readonly IServiceScopeFactory _scopeFactory;
    private readonly UploadStoragePaths _uploadStoragePaths;
    private readonly IConfiguration _configuration;
    private readonly ILogger<ChatFileCleanupHostedService> _logger;

    public ChatFileCleanupHostedService(
        IServiceScopeFactory scopeFactory,
        UploadStoragePaths uploadStoragePaths,
        IConfiguration configuration,
        ILogger<ChatFileCleanupHostedService> logger)
    {
        _scopeFactory = scopeFactory;
        _uploadStoragePaths = uploadStoragePaths;
        _configuration = configuration;
        _logger = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        var interval = ResolveMinutes("ChatFiles:CleanupIntervalMinutes", DefaultInterval, minMinutes: 5);

        while (!stoppingToken.IsCancellationRequested)
        {
            await RunCleanupOnceAsync(stoppingToken);

            try
            {
                await Task.Delay(interval, stoppingToken);
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
            {
                break;
            }
        }
    }

    public async Task RunCleanupOnceAsync(CancellationToken stoppingToken)
    {
        try
        {
            using var scope = _scopeFactory.CreateScope();
            var lockService = scope.ServiceProvider.GetRequiredService<IDistributedJobLock>();
            var lockTtl = ResolveMinutes("ChatFiles:CleanupIntervalMinutes", DefaultInterval, minMinutes: 5);
            await using var jobLock = await lockService.TryAcquireAsync("chat-file-cleanup", lockTtl, stoppingToken);
            if (jobLock is null)
            {
                _logger.LogDebug("Chat file cleanup skipped because another instance holds the lock.");
                return;
            }

            var service = scope.ServiceProvider.GetRequiredService<ChatFileCleanupService>();
            var uploadsDirectory = _uploadStoragePaths.ResolveDirectory("chat-files");
            var orphanAge = ResolveMinutes("ChatFiles:CleanupOrphanAgeMinutes", DefaultOrphanAge, minMinutes: 10);
            var result = await service.CleanupAsync(uploadsDirectory, orphanAge, stoppingToken);
            if (result.TempFilesDeleted > 0 || result.OrphanUploadsDeleted > 0)
            {
                _logger.LogInformation(
                    "Chat file cleanup removed {TempFilesDeleted} temp files and {OrphanUploadsDeleted} orphan uploads.",
                    result.TempFilesDeleted,
                    result.OrphanUploadsDeleted);
            }
        }
        catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
        {
        }
        catch (Exception exception)
        {
            _logger.LogWarning(exception, "Chat file cleanup failed.");
        }
    }

    private TimeSpan ResolveMinutes(string key, TimeSpan fallback, int minMinutes)
    {
        if (double.TryParse(_configuration[key], out var configuredMinutes) && configuredMinutes >= minMinutes)
        {
            return TimeSpan.FromMinutes(configuredMinutes);
        }

        return fallback;
    }
}
