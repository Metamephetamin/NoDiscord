using BackNoDiscord.Services;
using Microsoft.EntityFrameworkCore;

namespace BackNoDiscord.Tests.Services;

public sealed class UserStorageQuotaServiceTests
{
    [Fact]
    public async Task GetUserUsageAsync_IgnoresDeletedUploads()
    {
        await using var context = CreateContext();
        context.ChatFileUploads.AddRange(
            new ChatFileUploadRecord { FileName = "a.bin", OwnerUserId = "42", Size = 100, ContentType = "application/octet-stream", DisplayFileName = "a.bin", CreatedAt = DateTimeOffset.UtcNow },
            new ChatFileUploadRecord { FileName = "b.bin", OwnerUserId = "42", Size = 50, ContentType = "application/octet-stream", DisplayFileName = "b.bin", CreatedAt = DateTimeOffset.UtcNow, DeletedAt = DateTimeOffset.UtcNow },
            new ChatFileUploadRecord { FileName = "c.bin", OwnerUserId = "99", Size = 500, ContentType = "application/octet-stream", DisplayFileName = "c.bin", CreatedAt = DateTimeOffset.UtcNow });
        await context.SaveChangesAsync();
        var service = new UserStorageQuotaService(context);

        Assert.Equal(100, await service.GetUserUsageAsync("42", CancellationToken.None));
    }

    [Fact]
    public async Task EnsureUserQuotaAsync_RejectsReservationAboveLimit()
    {
        await using var context = CreateContext();
        context.ChatFileUploads.Add(new ChatFileUploadRecord { FileName = "a.bin", OwnerUserId = "42", Size = 100, ContentType = "application/octet-stream", DisplayFileName = "a.bin", CreatedAt = DateTimeOffset.UtcNow });
        await context.SaveChangesAsync();
        var service = new UserStorageQuotaService(context);

        await Assert.ThrowsAsync<InvalidOperationException>(() =>
            service.EnsureUserQuotaAsync("42", additionalBytes: 25, maxUserStorageBytes: 120, CancellationToken.None));
    }

    private static AppDbContext CreateContext()
    {
        var options = new DbContextOptionsBuilder<AppDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString("N"))
            .Options;

        return new AppDbContext(options);
    }
}
