using BackNoDiscord.Infrastructure;
using Microsoft.AspNetCore.Hosting;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.FileProviders;

namespace BackNoDiscord.Tests.Infrastructure;

public sealed class UploadStoragePathsTests
{
    [Fact]
    public void ResolveDirectory_UsesPersistentSiblingStorageByDefaultInProduction()
    {
        var configuration = new ConfigurationBuilder().Build();
        var environment = new TestWebHostEnvironment
        {
            EnvironmentName = "Production",
            WebRootPath = Path.Combine(AppContext.BaseDirectory, "wwwroot")
        };
        var paths = new UploadStoragePaths(configuration, environment);

        var directory = paths.ResolveDirectory("chat-files");

        var expected = Path.GetFullPath(Path.Combine(AppContext.BaseDirectory, "..", "storage", "chat-files"));
        Assert.Equal(expected, directory);
    }

    [Fact]
    public void ResolveDirectory_PrefersConfiguredStorageRoot()
    {
        var storageRoot = Path.Combine(Path.GetTempPath(), $"nodiscord-storage-{Guid.NewGuid():N}");
        var configuration = new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["Storage:Root"] = storageRoot
            })
            .Build();
        var paths = new UploadStoragePaths(configuration, new TestWebHostEnvironment());

        var directory = paths.ResolveDirectory("chat-files");

        Assert.Equal(Path.Combine(storageRoot, "chat-files"), directory);
    }

    private sealed class TestWebHostEnvironment : IWebHostEnvironment
    {
        public string EnvironmentName { get; set; } = "Development";
        public string ApplicationName { get; set; } = "BackNoDiscord.Tests";
        public string WebRootPath { get; set; } = string.Empty;
        public IFileProvider WebRootFileProvider { get; set; } = new NullFileProvider();
        public string ContentRootPath { get; set; } = Directory.GetCurrentDirectory();
        public IFileProvider ContentRootFileProvider { get; set; } = new NullFileProvider();
    }
}
