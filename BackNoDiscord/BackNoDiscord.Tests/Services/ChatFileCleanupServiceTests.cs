using BackNoDiscord.Services;
using Microsoft.AspNetCore.Hosting;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.FileProviders;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging.Abstractions;

namespace BackNoDiscord.Tests.Services;

public sealed class ChatFileCleanupServiceTests
{
    [Fact]
    public async Task CleanupAsync_RemovesOldTempFilesAndMarksOldUnboundUploadsDeleted()
    {
        await using var context = CreateContext();
        var directory = Directory.CreateTempSubdirectory("chat-cleanup-test-").FullName;
        var tempPath = Path.Combine(directory, "upload-old.tmp");
        var orphanPath = Path.Combine(directory, "chat-42-orphan.bin");
        await File.WriteAllTextAsync(tempPath, "tmp");
        await File.WriteAllTextAsync(orphanPath, "orphan");
        File.SetLastWriteTimeUtc(tempPath, DateTime.UtcNow.AddHours(-2));
        context.ChatFileUploads.Add(new ChatFileUploadRecord
        {
            FileName = Path.GetFileName(orphanPath),
            OwnerUserId = "42",
            DisplayFileName = "orphan.bin",
            ContentType = "application/octet-stream",
            Size = 6,
            CreatedAt = DateTimeOffset.UtcNow.AddHours(-2)
        });
        await context.SaveChangesAsync();
        var service = new ChatFileCleanupService(context);

        var result = await service.CleanupAsync(directory, TimeSpan.FromHours(1), CancellationToken.None);

        Assert.Equal(1, result.TempFilesDeleted);
        Assert.Equal(1, result.OrphanUploadsDeleted);
        Assert.False(File.Exists(tempPath));
        Assert.False(File.Exists(orphanPath));
        Assert.NotNull((await context.ChatFileUploads.SingleAsync()).DeletedAt);
        Directory.Delete(directory, recursive: true);
    }

    [Fact]
    public async Task HostedCleanup_DoesNotResolveCleanupServiceWhenLockIsUnavailable()
    {
        var services = new ServiceCollection();
        services.AddSingleton<IDistributedJobLock>(new DenyingDistributedJobLock());
        await using var provider = services.BuildServiceProvider();
        var configuration = new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["Storage:Root"] = Path.GetTempPath()
            })
            .Build();
        var hostedService = new ChatFileCleanupHostedService(
            provider.GetRequiredService<IServiceScopeFactory>(),
            new BackNoDiscord.Infrastructure.UploadStoragePaths(configuration, new FakeHostEnvironment()),
            configuration,
            NullLogger<ChatFileCleanupHostedService>.Instance);

        await hostedService.RunCleanupOnceAsync(CancellationToken.None);
    }

    private static AppDbContext CreateContext()
    {
        var options = new DbContextOptionsBuilder<AppDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString("N"))
            .Options;

        return new AppDbContext(options);
    }

    private sealed class DenyingDistributedJobLock : IDistributedJobLock
    {
        public Task<IAsyncDisposable?> TryAcquireAsync(string key, TimeSpan ttl, CancellationToken cancellationToken) =>
            Task.FromResult<IAsyncDisposable?>(null);
    }

    private sealed class FakeHostEnvironment : IWebHostEnvironment
    {
        public string EnvironmentName { get; set; } = Environments.Development;
        public string ApplicationName { get; set; } = "Tests";
        public string ContentRootPath { get; set; } = Directory.GetCurrentDirectory();
        public IFileProvider ContentRootFileProvider { get; set; } = new NullFileProvider();
        public string WebRootPath { get; set; } = Directory.GetCurrentDirectory();
        public IFileProvider WebRootFileProvider { get; set; } = new NullFileProvider();
    }
}
