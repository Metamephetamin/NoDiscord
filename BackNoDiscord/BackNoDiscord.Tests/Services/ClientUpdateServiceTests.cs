using BackNoDiscord.Services;
using Microsoft.Extensions.Configuration;

namespace BackNoDiscord.Tests.Services;

public class ClientUpdateServiceTests
{
    [Fact]
    public void GetDescriptor_ReportsOptionalUpdateWhenClientIsBehindLatest()
    {
        var service = CreateService(new Dictionary<string, string?>
        {
            ["ClientUpdates:LatestVersion"] = "1.3.0",
            ["ClientUpdates:MinimumVersion"] = "1.2.0",
            ["ClientUpdates:Windows:X64:DownloadUrl"] = "https://example.com/Tend-1.3.0.exe",
            ["ClientUpdates:Windows:X64:Sha256"] = new string('a', 64)
        });

        var descriptor = service.GetDescriptor("1.2.5", "win32", "x64");

        Assert.Equal("windows", descriptor.Platform);
        Assert.Equal("x64", descriptor.Arch);
        Assert.True(descriptor.UpdateAvailable);
        Assert.False(descriptor.Required);
        Assert.True(descriptor.IsCompatible);
        Assert.True(descriptor.DownloadAvailable);
        Assert.Equal("https://example.com/Tend-1.3.0.exe", descriptor.DownloadUrl);
        Assert.Equal(new string('a', 64), descriptor.Sha256);
    }

    [Fact]
    public void GetDescriptor_DoesNotReportDownloadAvailableWithoutValidChecksum()
    {
        var service = CreateService(new Dictionary<string, string?>
        {
            ["ClientUpdates:LatestVersion"] = "1.3.0",
            ["ClientUpdates:MinimumVersion"] = "1.2.0",
            ["ClientUpdates:Windows:X64:DownloadUrl"] = "https://example.com/Tend-1.3.0.exe"
        });

        var descriptor = service.GetDescriptor("1.2.5", "win32", "x64");

        Assert.True(descriptor.UpdateAvailable);
        Assert.False(descriptor.DownloadAvailable);
        Assert.Equal(string.Empty, descriptor.Sha256);
    }

    [Fact]
    public void GetDescriptor_ReportsRequiredWhenClientIsBelowMinimum()
    {
        var service = CreateService(new Dictionary<string, string?>
        {
            ["ClientUpdates:LatestVersion"] = "2.0.0",
            ["ClientUpdates:MinimumVersion"] = "1.5.0"
        });

        var descriptor = service.GetDescriptor("1.4.9", "windows", "x64");

        Assert.True(descriptor.UpdateAvailable);
        Assert.True(descriptor.Required);
        Assert.False(descriptor.IsCompatible);
    }

    [Theory]
    [InlineData("1.2.0", "1.2", 0)]
    [InlineData("1.2.1", "1.2.0", 1)]
    [InlineData("1.2.0", "1.2.5", -1)]
    [InlineData("1.2.0-beta.1", "1.2.0", 0)]
    public void CompareVersions_HandlesSegmentedVersions(string left, string right, int expectedSign)
    {
        var comparison = ClientUpdateService.CompareVersions(left, right);

        Assert.Equal(expectedSign, Math.Sign(comparison));
    }

    private static ClientUpdateService CreateService(Dictionary<string, string?> values)
    {
        var configuration = new ConfigurationBuilder()
            .AddInMemoryCollection(values)
            .Build();

        return new ClientUpdateService(configuration);
    }
}
