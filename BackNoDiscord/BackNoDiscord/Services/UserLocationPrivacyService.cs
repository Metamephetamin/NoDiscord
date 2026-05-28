using Microsoft.EntityFrameworkCore;

namespace BackNoDiscord.Services;

public sealed class UserLocationPrivacyService
{
    private const int DefaultRetentionHours = 24;
    private const int MinRetentionHours = 1;
    private const int MaxRetentionHours = 168;
    private const string FriendsVisibility = "friends";

    private readonly AppDbContext _context;
    private readonly IConfiguration _configuration;

    public UserLocationPrivacyService(AppDbContext context, IConfiguration configuration)
    {
        _context = context;
        _configuration = configuration;
    }

    public async Task<bool> CanPublishLocationAsync(int userId, CancellationToken cancellationToken)
    {
        var locationPreference = await _context.Users
            .AsNoTracking()
            .Where(user => user.id == userId)
            .Select(user => new
            {
                user.location_sharing_enabled,
                user.location_visibility
            })
            .SingleOrDefaultAsync(cancellationToken);

        return locationPreference is not null
            && locationPreference.location_sharing_enabled
            && string.Equals(locationPreference.location_visibility, FriendsVisibility, StringComparison.OrdinalIgnoreCase);
    }

    public Task<DateTimeOffset> GetLocationExpiryAsync(DateTimeOffset now, CancellationToken cancellationToken)
    {
        var retentionHours = Math.Clamp(
            _configuration.GetValue("Location:RetentionHours", DefaultRetentionHours),
            MinRetentionHours,
            MaxRetentionHours);

        return Task.FromResult(now.AddHours(retentionHours));
    }

    public async Task ClearLocationAsync(int userId, CancellationToken cancellationToken)
    {
        var user = await _context.Users.SingleOrDefaultAsync(item => item.id == userId, cancellationToken);
        if (user is null)
        {
            return;
        }

        user.last_location_latitude = null;
        user.last_location_longitude = null;
        user.last_location_updated_at = null;
        user.last_location_expires_at = null;

        await _context.SaveChangesAsync(cancellationToken);
    }

    public bool IsLocationVisible(User user, DateTimeOffset now)
    {
        if (!user.location_sharing_enabled ||
            !string.Equals(user.location_visibility, FriendsVisibility, StringComparison.OrdinalIgnoreCase) ||
            user.last_location_latitude is null ||
            user.last_location_longitude is null ||
            user.last_location_updated_at is null)
        {
            return false;
        }

        return user.last_location_expires_at is null || user.last_location_expires_at > now;
    }
}
