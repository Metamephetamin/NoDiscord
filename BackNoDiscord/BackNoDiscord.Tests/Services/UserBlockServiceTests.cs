using BackNoDiscord.Services;
using Microsoft.EntityFrameworkCore;

namespace BackNoDiscord.Tests.Services;

public class UserBlockServiceTests
{
    [Fact]
    public async Task BlockAsync_CreatesDirectionalBlockAndState()
    {
        await using var context = CreateContext();
        SeedUsers(context);
        var service = new UserBlockService(context);

        await service.BlockAsync(1, 2);

        var stateForBlocker = await service.GetBlockStateAsync(1, 2);
        var stateForBlocked = await service.GetBlockStateAsync(2, 1);
        Assert.True(stateForBlocker.CurrentUserBlockedTarget);
        Assert.False(stateForBlocker.TargetBlockedCurrentUser);
        Assert.True(stateForBlocked.TargetBlockedCurrentUser);
        Assert.False(stateForBlocked.CurrentUserBlockedTarget);
        Assert.Single(await context.UserBlocks.ToListAsync());
    }

    [Fact]
    public async Task HasAnyBlockAsync_ReturnsTrueForEitherDirection()
    {
        await using var context = CreateContext();
        SeedUsers(context);
        var service = new UserBlockService(context);

        await service.BlockAsync(2, 1);

        Assert.True(await service.HasAnyBlockAsync(1, 2));
        Assert.True(await service.HasAnyBlockAsync(2, 1));
        Assert.False(await service.HasAnyBlockAsync(1, 3));
    }

    [Fact]
    public async Task GetBlockedMentionTargetIdsAsync_ReturnsTargetsWithAnyBlockDirection()
    {
        await using var context = CreateContext();
        SeedUsers(context);
        var service = new UserBlockService(context);

        await service.BlockAsync(2, 1);
        await service.BlockAsync(1, 3);

        var blockedTargets = await service.GetBlockedMentionTargetIdsAsync(1, [2, 3, 4]);

        Assert.Equal([2, 3], blockedTargets.OrderBy(item => item));
    }

    [Fact]
    public async Task BlockAsync_DoesNotDuplicateExistingBlock()
    {
        await using var context = CreateContext();
        SeedUsers(context);
        var service = new UserBlockService(context);

        await service.BlockAsync(1, 2);
        await service.BlockAsync(1, 2);

        Assert.Single(await context.UserBlocks.ToListAsync());
    }

    private static AppDbContext CreateContext()
    {
        var options = new DbContextOptionsBuilder<AppDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString("N"))
            .Options;

        return new AppDbContext(options);
    }

    private static void SeedUsers(AppDbContext context)
    {
        context.Users.AddRange(
            new User { id = 1, first_name = "Alpha", last_name = "One", nickname = "Alpha One", email = "alpha@example.com", password_hash = "hash" },
            new User { id = 2, first_name = "Beta", last_name = "Two", nickname = "Beta Two", email = "beta@example.com", password_hash = "hash" },
            new User { id = 3, first_name = "Gamma", last_name = "Three", nickname = "Gamma Three", email = "gamma@example.com", password_hash = "hash" },
            new User { id = 4, first_name = "Delta", last_name = "Four", nickname = "Delta Four", email = "delta@example.com", password_hash = "hash" });
        context.SaveChanges();
    }
}
