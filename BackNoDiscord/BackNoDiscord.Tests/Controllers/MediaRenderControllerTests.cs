using System.Security.Claims;
using BackNoDiscord.Controllers;
using BackNoDiscord.Infrastructure;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.FileProviders;

namespace BackNoDiscord.Tests.Controllers;

public sealed class MediaRenderControllerTests : IDisposable
{
    private readonly string _storageRoot = Path.Combine(Path.GetTempPath(), $"nodiscord-media-render-tests-{Guid.NewGuid():N}");

    public MediaRenderControllerTests()
    {
        Directory.CreateDirectory(Path.Combine(_storageRoot, "chat-files"));
    }

    [Fact]
    public async Task Render_ReturnsNotFoundForCorruptKnownImageInsteadOfThrowing()
    {
        var filePath = Path.Combine(_storageRoot, "chat-files", "broken.png");
        await File.WriteAllBytesAsync(filePath, [
            0x89, 0x50, 0x4E, 0x47,
            0x0D, 0x0A, 0x1A, 0x0A,
            0x00, 0x00, 0x00, 0x0D,
            0x49, 0x48, 0x44, 0x52
        ]);
        var controller = BuildController();

        var result = await controller.Render("/chat-files/broken.png", 128, 128, "contain", "false", CancellationToken.None);

        Assert.IsType<NotFoundResult>(result);
    }

    public void Dispose()
    {
        if (Directory.Exists(_storageRoot))
        {
            Directory.Delete(_storageRoot, recursive: true);
        }
    }

    private MediaRenderController BuildController()
    {
        var configuration = new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["Storage:Root"] = _storageRoot
            })
            .Build();
        var controller = new MediaRenderController(new UploadStoragePaths(configuration, new TestWebHostEnvironment()))
        {
            ControllerContext = new ControllerContext
            {
                HttpContext = new DefaultHttpContext
                {
                    User = new ClaimsPrincipal(new ClaimsIdentity([new Claim(ClaimTypes.NameIdentifier, "42")], "test"))
                }
            }
        };

        return controller;
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
