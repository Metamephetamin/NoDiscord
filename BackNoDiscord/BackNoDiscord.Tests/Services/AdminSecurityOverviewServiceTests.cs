using BackNoDiscord.Services;
using Microsoft.EntityFrameworkCore;

namespace BackNoDiscord.Tests.Services;

public sealed class AdminSecurityOverviewServiceTests : IDisposable
{
    private readonly AppDbContext _context = CreateContext();

    [Fact]
    public async Task GetOverviewAsync_PrioritizesUsersWithAbuseSignals()
    {
        var now = DateTimeOffset.UtcNow;
        _context.Users.AddRange(
            BuildUser(1, "quiet@example.com"),
            BuildUser(2, "noisy@example.com"));
        _context.Messages.AddRange(Enumerable.Range(1, 150).Select(index => new Message
        {
            Id = index,
            ChannelId = "server:main::channel:general",
            Username = "noisy",
            AuthorUserId = "2",
            Content = index == 1 ? "__CHAT_PAYLOAD__:{\"message\":\"mass ping\"}" : "spam",
            Timestamp = now.UtcDateTime.AddMinutes(-index)
        }));
        _context.ChatFileUploads.AddRange(Enumerable.Range(1, 25).Select(index => new ChatFileUploadRecord
        {
            FileName = $"file-{index}.png",
            OwnerUserId = "2",
            DisplayFileName = $"file-{index}.png",
            ContentType = "image/png",
            Size = 1024,
            CreatedAt = now.AddMinutes(-index)
        }));
        _context.ChatModerationReports.Add(new ChatModerationReportRecord
        {
            ServerId = "main",
            ChannelId = "server:main::channel:general",
            ReporterUserId = "1",
            TargetUserId = "2",
            Reason = "spam",
            Status = "open",
            CreatedAt = now.AddMinutes(-2)
        });
        _context.UserReports.Add(new UserReportRecord
        {
            ReporterUserId = 1,
            TargetUserId = 2,
            Reason = "profile spam",
            Status = "open",
            CreatedAt = now.AddMinutes(-1)
        });
        await _context.SaveChangesAsync();

        var overview = await new AdminSecurityOverviewService(_context).GetOverviewAsync(CancellationToken.None);

        Assert.Equal(2, overview.TotalUsers);
        Assert.Contains(overview.SuspiciousUsers, user => user.Id == 2 && user.SuspicionScore > 0);
        Assert.Contains(overview.RecentMessages, message => message.AuthorUserId == "2" && message.Preview.Length > 0);
        Assert.Contains(overview.RecentFiles, file => file.OwnerUserId == "2");
        Assert.Contains(overview.RecentReports, report => report.TargetUserId == "2");
        Assert.Contains(overview.RecentUserReports, report => report.ReporterUserId == 1 && report.TargetUserId == 2);
        Assert.Contains(overview.Alerts, alert => alert.Kind == "user_reports");
    }

    public void Dispose()
    {
        _context.Dispose();
    }

    private static User BuildUser(int id, string email)
    {
        return new User
        {
            id = id,
            first_name = "Lanaya",
            last_name = "User",
            nickname = $"User{id}",
            email = email,
            is_email_verified = true,
            password_hash = "hash"
        };
    }

    private static AppDbContext CreateContext()
    {
        var options = new DbContextOptionsBuilder<AppDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString("N"))
            .Options;

        return new AppDbContext(options);
    }
}
