using BackNoDiscord.Services;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging.Abstractions;

namespace BackNoDiscord.Tests.Services;

public sealed class DistributedJobLockTests
{
    [Fact]
    public async Task TryAcquireAsync_ReturnsHandleWhenLockIsAvailable()
    {
        await using var context = CreateContext();
        var lockService = new DistributedJobLock(context, NullLogger<DistributedJobLock>.Instance);

        await using var handle = await lockService.TryAcquireAsync("available-lock", TimeSpan.FromSeconds(30), CancellationToken.None);

        Assert.NotNull(handle);
    }

    [Fact]
    public async Task TryAcquireAsync_ReturnsNullWhenSameLockIsAlreadyHeld()
    {
        await using var context = CreateContext();
        var lockService = new DistributedJobLock(context, NullLogger<DistributedJobLock>.Instance);

        await using var firstHandle = await lockService.TryAcquireAsync("busy-lock", TimeSpan.FromSeconds(30), CancellationToken.None);
        await using var secondHandle = await lockService.TryAcquireAsync("busy-lock", TimeSpan.FromSeconds(30), CancellationToken.None);

        Assert.NotNull(firstHandle);
        Assert.Null(secondHandle);
    }

    [Fact]
    public async Task DisposeAsync_ReleasesLock()
    {
        await using var context = CreateContext();
        var lockService = new DistributedJobLock(context, NullLogger<DistributedJobLock>.Instance);

        var firstHandle = await lockService.TryAcquireAsync("released-lock", TimeSpan.FromSeconds(30), CancellationToken.None);
        Assert.NotNull(firstHandle);
        await firstHandle.DisposeAsync();

        await using var secondHandle = await lockService.TryAcquireAsync("released-lock", TimeSpan.FromSeconds(30), CancellationToken.None);

        Assert.NotNull(secondHandle);
    }

    [Fact]
    public async Task TryAcquireAsync_CancelledRequestDoesNotThrow()
    {
        await using var context = CreateContext();
        var lockService = new DistributedJobLock(context, NullLogger<DistributedJobLock>.Instance);
        using var cancellation = new CancellationTokenSource();
        await cancellation.CancelAsync();

        var handle = await lockService.TryAcquireAsync("cancelled-lock", TimeSpan.FromMilliseconds(1), cancellation.Token);

        Assert.Null(handle);
    }

    private static AppDbContext CreateContext()
    {
        var options = new DbContextOptionsBuilder<AppDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString("N"))
            .Options;

        return new AppDbContext(options);
    }
}
