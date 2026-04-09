using BackNoDiscord.Services;
using Microsoft.EntityFrameworkCore;

namespace BackNoDiscord.Tests.Services;

public class FriendRequestServiceTests
{
    [Fact]
    public async Task CreateOrAcceptRequestAsync_CreatesPendingRequest()
    {
        await using var context = CreateContext();
        SeedUsers(context);
        var service = new FriendRequestService(context);

        var result = await service.CreateOrAcceptRequestAsync(1, 2);

        Assert.Equal(FriendRequestActionStatuses.RequestSent, result.Status);
        Assert.NotNull(result.Request);
        Assert.Equal(FriendRequestStatuses.Pending, result.Request!.Status);
        Assert.Equal(1, await context.FriendRequests.CountAsync());
        Assert.Empty(await context.Friendships.ToListAsync());
    }

    [Fact]
    public async Task CreateOrAcceptRequestAsync_DoesNotDuplicateOutgoingPendingRequest()
    {
        await using var context = CreateContext();
        SeedUsers(context);
        var service = new FriendRequestService(context);

        await service.CreateOrAcceptRequestAsync(1, 2);
        var result = await service.CreateOrAcceptRequestAsync(1, 2);

        Assert.Equal(FriendRequestActionStatuses.AlreadyRequested, result.Status);
        Assert.Equal(1, await context.FriendRequests.CountAsync());
    }

    [Fact]
    public async Task CreateOrAcceptRequestAsync_AutoAcceptsReciprocalRequest()
    {
        await using var context = CreateContext();
        SeedUsers(context);
        var service = new FriendRequestService(context);

        await service.CreateOrAcceptRequestAsync(2, 1);
        var result = await service.CreateOrAcceptRequestAsync(1, 2);

        Assert.Equal(FriendRequestActionStatuses.AutoAccepted, result.Status);
        Assert.Single(await context.Friendships.ToListAsync());
        Assert.All(await context.FriendRequests.ToListAsync(), item => Assert.Equal(FriendRequestStatuses.Accepted, item.Status));
    }

    [Fact]
    public async Task AcceptRequestAsync_CreatesFriendship()
    {
        await using var context = CreateContext();
        SeedUsers(context);
        var service = new FriendRequestService(context);
        var created = await service.CreateOrAcceptRequestAsync(2, 1);

        var result = await service.AcceptRequestAsync(created.Request!.Id, 1);

        Assert.NotNull(result);
        Assert.Equal(FriendRequestActionStatuses.Accepted, result!.Status);
        Assert.Single(await context.Friendships.ToListAsync());
    }

    [Fact]
    public async Task DeclineRequestAsync_DoesNotCreateFriendship()
    {
        await using var context = CreateContext();
        SeedUsers(context);
        var service = new FriendRequestService(context);
        var created = await service.CreateOrAcceptRequestAsync(2, 1);

        var result = await service.DeclineRequestAsync(created.Request!.Id, 1);

        Assert.NotNull(result);
        Assert.Equal(FriendRequestActionStatuses.Declined, result!.Status);
        Assert.Empty(await context.Friendships.ToListAsync());
        Assert.Equal(FriendRequestStatuses.Declined, (await context.FriendRequests.SingleAsync()).Status);
    }

    [Fact]
    public async Task GetPendingRelatedUserIdsAsync_ReturnsOutgoingAndIncomingPairs()
    {
        await using var context = CreateContext();
        SeedUsers(context);
        var service = new FriendRequestService(context);

        await service.CreateOrAcceptRequestAsync(1, 2);
        await service.CreateOrAcceptRequestAsync(3, 1);
        await service.CreateOrAcceptRequestAsync(4, 5);

        var related = await service.GetPendingRelatedUserIdsAsync(1);

        Assert.Equal(2, related.Count);
        Assert.Contains(2, related);
        Assert.Contains(3, related);
        Assert.DoesNotContain(4, related);
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
            new User { id = 1, first_name = "Alpha", last_name = "One", email = "alpha@example.com", password_hash = "hash" },
            new User { id = 2, first_name = "Beta", last_name = "Two", email = "beta@example.com", password_hash = "hash" },
            new User { id = 3, first_name = "Gamma", last_name = "Three", email = "gamma@example.com", password_hash = "hash" },
            new User { id = 4, first_name = "Delta", last_name = "Four", email = "delta@example.com", password_hash = "hash" },
            new User { id = 5, first_name = "Epsilon", last_name = "Five", email = "epsilon@example.com", password_hash = "hash" });
        context.SaveChanges();
    }
}
