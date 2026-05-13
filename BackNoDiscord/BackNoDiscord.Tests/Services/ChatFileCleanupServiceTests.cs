using BackNoDiscord.Services;
using Microsoft.EntityFrameworkCore;

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

    private static AppDbContext CreateContext()
    {
        var options = new DbContextOptionsBuilder<AppDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString("N"))
            .Options;

        return new AppDbContext(options);
    }
}
