using BackNoDiscord;
using Microsoft.EntityFrameworkCore;

namespace BackNoDiscord.Tests.Infrastructure;

public sealed class AppDbContextModelTests
{
    [Fact]
    public void UserEmailVerification_DefaultsToFalse()
    {
        using var context = CreateContext();

        var userEntity = context.Model.FindEntityType(typeof(User));
        var property = userEntity?.FindProperty(nameof(User.is_email_verified));

        Assert.NotNull(property);
        Assert.Equal(false, property.GetDefaultValue());
    }

    private static AppDbContext CreateContext()
    {
        var options = new DbContextOptionsBuilder<AppDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString("N"))
            .Options;

        return new AppDbContext(options);
    }
}
