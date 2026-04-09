using Microsoft.EntityFrameworkCore;

namespace BackNoDiscord.Services;

public static class FriendRequestStatuses
{
    public const string Pending = "pending";
    public const string Accepted = "accepted";
    public const string Declined = "declined";
}

public static class FriendRequestActionStatuses
{
    public const string RequestSent = "request_sent";
    public const string AlreadyRequested = "already_requested";
    public const string AlreadyFriends = "already_friends";
    public const string AutoAccepted = "auto_accepted";
    public const string Accepted = "accepted";
    public const string Declined = "declined";
}

public sealed record FriendRequestCreationResult(
    string Status,
    FriendRequestRecord? Request = null,
    bool FriendshipCreated = false);

public sealed record FriendRequestResolutionResult(
    string Status,
    FriendRequestRecord Request,
    bool FriendshipCreated = false);

public class FriendRequestService
{
    private readonly AppDbContext _context;

    public FriendRequestService(AppDbContext context)
    {
        _context = context;
    }

    public Task<List<FriendRequestRecord>> GetIncomingPendingRequestsAsync(int userId, CancellationToken cancellationToken = default)
    {
        return _context.FriendRequests
            .AsNoTracking()
            .Where(item => item.ReceiverUserId == userId && item.Status == FriendRequestStatuses.Pending)
            .OrderByDescending(item => item.CreatedAt)
            .ToListAsync(cancellationToken);
    }

    public async Task<HashSet<int>> GetPendingRelatedUserIdsAsync(int userId, CancellationToken cancellationToken = default)
    {
        var userIds = await _context.FriendRequests
            .AsNoTracking()
            .Where(item =>
                item.Status == FriendRequestStatuses.Pending &&
                (item.UserLowId == userId || item.UserHighId == userId))
            .Select(item => item.UserLowId == userId ? item.UserHighId : item.UserLowId)
            .Distinct()
            .ToListAsync(cancellationToken);

        return userIds.ToHashSet();
    }

    public async Task<FriendRequestCreationResult> CreateOrAcceptRequestAsync(int senderUserId, int receiverUserId, CancellationToken cancellationToken = default)
    {
        var (lowId, highId) = NormalizePair(senderUserId, receiverUserId);

        var alreadyFriends = await _context.Friendships
            .AsNoTracking()
            .AnyAsync(item => item.UserLowId == lowId && item.UserHighId == highId, cancellationToken);

        if (alreadyFriends)
        {
            return new FriendRequestCreationResult(FriendRequestActionStatuses.AlreadyFriends);
        }

        var existingOutgoing = await _context.FriendRequests
            .FirstOrDefaultAsync(item =>
                item.SenderUserId == senderUserId &&
                item.ReceiverUserId == receiverUserId &&
                item.Status == FriendRequestStatuses.Pending,
                cancellationToken);

        if (existingOutgoing is not null)
        {
            return new FriendRequestCreationResult(FriendRequestActionStatuses.AlreadyRequested, existingOutgoing);
        }

        var existingIncoming = await _context.FriendRequests
            .FirstOrDefaultAsync(item =>
                item.SenderUserId == receiverUserId &&
                item.ReceiverUserId == senderUserId &&
                item.Status == FriendRequestStatuses.Pending,
                cancellationToken);

        if (existingIncoming is not null)
        {
            var accepted = await AcceptRequestRecordAsync(existingIncoming, cancellationToken);
            return new FriendRequestCreationResult(
                FriendRequestActionStatuses.AutoAccepted,
                accepted.Request,
                accepted.FriendshipCreated);
        }

        var now = DateTimeOffset.UtcNow;
        var request = new FriendRequestRecord
        {
            SenderUserId = senderUserId,
            ReceiverUserId = receiverUserId,
            UserLowId = lowId,
            UserHighId = highId,
            Status = FriendRequestStatuses.Pending,
            CreatedAt = now,
            RespondedAt = null,
        };

        _context.FriendRequests.Add(request);
        await _context.SaveChangesAsync(cancellationToken);

        return new FriendRequestCreationResult(FriendRequestActionStatuses.RequestSent, request);
    }

    public async Task<FriendRequestResolutionResult?> AcceptRequestAsync(int requestId, int currentUserId, CancellationToken cancellationToken = default)
    {
        var request = await _context.FriendRequests
            .FirstOrDefaultAsync(item =>
                item.Id == requestId &&
                item.ReceiverUserId == currentUserId &&
                item.Status == FriendRequestStatuses.Pending,
                cancellationToken);

        if (request is null)
        {
            return null;
        }

        return await AcceptRequestRecordAsync(request, cancellationToken);
    }

    public async Task<FriendRequestResolutionResult?> DeclineRequestAsync(int requestId, int currentUserId, CancellationToken cancellationToken = default)
    {
        var request = await _context.FriendRequests
            .FirstOrDefaultAsync(item =>
                item.Id == requestId &&
                item.ReceiverUserId == currentUserId &&
                item.Status == FriendRequestStatuses.Pending,
                cancellationToken);

        if (request is null)
        {
            return null;
        }

        var respondedAt = DateTimeOffset.UtcNow;
        request.Status = FriendRequestStatuses.Declined;
        request.RespondedAt = respondedAt;

        await CloseDuplicatePendingPairRequestsAsync(request.UserLowId, request.UserHighId, FriendRequestStatuses.Declined, respondedAt, request.Id, cancellationToken);
        await _context.SaveChangesAsync(cancellationToken);

        return new FriendRequestResolutionResult(FriendRequestActionStatuses.Declined, request);
    }

    private async Task<FriendRequestResolutionResult> AcceptRequestRecordAsync(FriendRequestRecord request, CancellationToken cancellationToken)
    {
        var respondedAt = DateTimeOffset.UtcNow;
        var friendshipCreated = false;

        var friendshipExists = await _context.Friendships
            .AnyAsync(item => item.UserLowId == request.UserLowId && item.UserHighId == request.UserHighId, cancellationToken);

        if (!friendshipExists)
        {
            _context.Friendships.Add(new FriendshipRecord
            {
                UserLowId = request.UserLowId,
                UserHighId = request.UserHighId,
                CreatedAt = respondedAt,
            });
            friendshipCreated = true;
        }

        request.Status = FriendRequestStatuses.Accepted;
        request.RespondedAt = respondedAt;

        await CloseDuplicatePendingPairRequestsAsync(request.UserLowId, request.UserHighId, FriendRequestStatuses.Accepted, respondedAt, request.Id, cancellationToken);
        await _context.SaveChangesAsync(cancellationToken);

        return new FriendRequestResolutionResult(FriendRequestActionStatuses.Accepted, request, friendshipCreated);
    }

    private async Task CloseDuplicatePendingPairRequestsAsync(
        int lowId,
        int highId,
        string nextStatus,
        DateTimeOffset respondedAt,
        int excludeRequestId,
        CancellationToken cancellationToken)
    {
        var duplicates = await _context.FriendRequests
            .Where(item =>
                item.Id != excludeRequestId &&
                item.UserLowId == lowId &&
                item.UserHighId == highId &&
                item.Status == FriendRequestStatuses.Pending)
            .ToListAsync(cancellationToken);

        foreach (var duplicate in duplicates)
        {
            duplicate.Status = nextStatus;
            duplicate.RespondedAt = respondedAt;
        }
    }

    private static (int LowId, int HighId) NormalizePair(int first, int second)
    {
        return first <= second ? (first, second) : (second, first);
    }
}
