using System.Security.Claims;
using BackNoDiscord;
using BackNoDiscord.Controllers;
using BackNoDiscord.Infrastructure;
using BackNoDiscord.Services;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.FileProviders;

namespace BackNoDiscord.Tests.Controllers;

public sealed class MediaRenderControllerTests : IDisposable
{
    private readonly string _storageRoot = Path.Combine(Path.GetTempPath(), $"nodiscord-media-render-tests-{Guid.NewGuid():N}");

    public MediaRenderControllerTests()
    {
        Directory.CreateDirectory(Path.Combine(_storageRoot, "chat-files"));
        Directory.CreateDirectory(Path.Combine(_storageRoot, "server-icons"));
    }

    [Fact]
    public async Task Render_ReturnsNotFoundForCorruptKnownImageInsteadOfThrowing()
    {
        var filePath = Path.Combine(_storageRoot, "chat-files", "chat-42-broken.png");
        await File.WriteAllBytesAsync(filePath, [
            0x89, 0x50, 0x4E, 0x47,
            0x0D, 0x0A, 0x1A, 0x0A,
            0x00, 0x00, 0x00, 0x0D,
            0x49, 0x48, 0x44, 0x52
        ]);
        var controller = BuildController();

        var result = await controller.Render("/chat-files/chat-42-broken.png", 128, 128, "contain", "false", CancellationToken.None);

        Assert.IsType<NotFoundResult>(result);
    }

    [Fact]
    public async Task Render_ReturnsDefaultIconForMissingServerIcon()
    {
        var webRootPath = Path.Combine(_storageRoot, "wwwroot");
        var defaultIconPath = Path.Combine(webRootPath, "image", "image.png");
        Directory.CreateDirectory(Path.GetDirectoryName(defaultIconPath)!);
        await File.WriteAllBytesAsync(defaultIconPath, OnePixelPng);
        var controller = BuildController(webRootPath);

        var result = await controller.Render("/server-icons/missing-server-icon.png", 60, 60, "cover", "false", CancellationToken.None);

        var fileResult = Assert.IsType<FileContentResult>(result);
        Assert.Equal("image/png", fileResult.ContentType);
        Assert.NotEmpty(fileResult.FileContents);
    }

    [Fact]
    public async Task Render_ReturnsGeneratedFallbackForMissingOwnedChatImage()
    {
        var webRootPath = Path.Combine(_storageRoot, "wwwroot");
        var defaultIconPath = Path.Combine(webRootPath, "image", "image.png");
        Directory.CreateDirectory(Path.GetDirectoryName(defaultIconPath)!);
        await File.WriteAllBytesAsync(defaultIconPath, OnePixelPng);
        var controller = BuildController(webRootPath);

        var result = await controller.Render("/chat-files/chat-42-missing.png", 160, 120, "contain", "false", CancellationToken.None);

        var fileResult = Assert.IsType<FileContentResult>(result);
        Assert.Equal("image/png", fileResult.ContentType);
        Assert.Equal("public,max-age=300", controller.Response.Headers.CacheControl.ToString());
        Assert.NotEmpty(fileResult.FileContents);
    }

    [Fact]
    public async Task Render_ReturnsGeneratedFallbackForMissingOwnedHeicChatImage()
    {
        var webRootPath = Path.Combine(_storageRoot, "wwwroot");
        var defaultIconPath = Path.Combine(webRootPath, "image", "image.png");
        Directory.CreateDirectory(Path.GetDirectoryName(defaultIconPath)!);
        await File.WriteAllBytesAsync(defaultIconPath, OnePixelPng);
        var controller = BuildController(webRootPath);

        var result = await controller.Render("/chat-files/chat-42-missing.heic", 160, 120, "contain", "false", CancellationToken.None);

        var fileResult = Assert.IsType<FileContentResult>(result);
        Assert.Equal("image/png", fileResult.ContentType);
        Assert.Equal("public,max-age=300", controller.Response.Headers.CacheControl.ToString());
        Assert.NotEmpty(fileResult.FileContents);
    }

    [Fact]
    public async Task Render_UsesAppBaseWwwrootFallbackWhenEnvironmentWebRootIsUnavailable()
    {
        var appBaseFallbackPath = Path.Combine(AppContext.BaseDirectory, "wwwroot", "image", "image.png");
        var hadExistingFallback = File.Exists(appBaseFallbackPath);
        byte[]? existingFallback = hadExistingFallback ? await File.ReadAllBytesAsync(appBaseFallbackPath) : null;
        Directory.CreateDirectory(Path.GetDirectoryName(appBaseFallbackPath)!);
        await File.WriteAllBytesAsync(appBaseFallbackPath, OnePixelPng);

        try
        {
            var missingContentRoot = Path.Combine(_storageRoot, "missing-content-root");
            var controller = BuildController(webRootPath: "", contentRootPath: missingContentRoot);

            var result = await controller.Render("/avatars/missing-avatar.png", 68, 68, "cover", "false", CancellationToken.None);

            var fileResult = Assert.IsType<FileContentResult>(result);
            Assert.Equal("image/png", fileResult.ContentType);
            Assert.NotEmpty(fileResult.FileContents);
        }
        finally
        {
            if (hadExistingFallback && existingFallback is not null)
            {
                await File.WriteAllBytesAsync(appBaseFallbackPath, existingFallback);
            }
            else if (!hadExistingFallback && File.Exists(appBaseFallbackPath))
            {
                File.Delete(appBaseFallbackPath);
            }
        }
    }

    [Fact]
    public async Task Render_ReturnsGeneratedFallbackWhenFallbackFileUnavailable()
    {
        var controller = BuildController();

        var result = await controller.Render("/server-icons/missing-server-icon.png", 60, 60, "cover", "false", CancellationToken.None);

        var fileResult = Assert.IsType<FileContentResult>(result);
        Assert.Equal("image/png", fileResult.ContentType);
        Assert.Equal("public,max-age=300", controller.Response.Headers.CacheControl.ToString());
        Assert.NotEmpty(fileResult.FileContents);
    }

    [Theory]
    [InlineData("/avatars/../secret.png")]
    [InlineData("/chat-files/chat-42-safe.png/../../secret.png")]
    [InlineData("/server-icons/%2e%2e/secret.png")]
    public async Task Render_RejectsTraversalLikeMediaPaths(string source)
    {
        var controller = BuildController();

        var result = await controller.Render(source, 128, 128, "cover", "false", CancellationToken.None);

        Assert.IsType<BadRequestResult>(result);
        Assert.Equal("no-store,max-age=0", controller.Response.Headers.CacheControl.ToString());
        Assert.Equal("nosniff", controller.Response.Headers.XContentTypeOptions.ToString());
    }

    public void Dispose()
    {
        if (Directory.Exists(_storageRoot))
        {
            Directory.Delete(_storageRoot, recursive: true);
        }
    }

    private MediaRenderController BuildController(string webRootPath = "", string? contentRootPath = null)
    {
        var configuration = new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["Storage:Root"] = _storageRoot
            })
            .Build();
        var dbContext = CreateContext();
        var controller = new MediaRenderController(
            new UploadStoragePaths(configuration, new TestWebHostEnvironment()),
            new ChatFileAccessService(dbContext, new ServerStateService(dbContext)),
            new TestWebHostEnvironment
            {
                WebRootPath = webRootPath,
                ContentRootPath = contentRootPath ?? Directory.GetCurrentDirectory()
            })
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

    private static AppDbContext CreateContext()
    {
        var options = new DbContextOptionsBuilder<AppDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString("N"))
            .Options;

        return new AppDbContext(options);
    }

    private static readonly byte[] OnePixelPng =
    [
        0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A,
        0x00, 0x00, 0x00, 0x0D, 0x49, 0x48, 0x44, 0x52,
        0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
        0x08, 0x06, 0x00, 0x00, 0x00, 0x1F, 0x15, 0xC4,
        0x89, 0x00, 0x00, 0x00, 0x0D, 0x49, 0x44, 0x41,
        0x54, 0x78, 0x9C, 0x63, 0xF8, 0xCF, 0xC0, 0xF0,
        0x1F, 0x00, 0x05, 0x00, 0x01, 0xFF, 0x89, 0x99,
        0x3D, 0x1D, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45,
        0x4E, 0x44, 0xAE, 0x42, 0x60, 0x82
    ];

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
