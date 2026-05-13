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
using Microsoft.Extensions.Logging.Abstractions;

namespace BackNoDiscord.Tests.Controllers;

public sealed class ChatFilesControllerTests : IDisposable
{
    private readonly string _storageRoot = Path.Combine(Path.GetTempPath(), $"nodiscord-chat-files-tests-{Guid.NewGuid():N}");

    public ChatFilesControllerTests()
    {
        Directory.CreateDirectory(Path.Combine(_storageRoot, "chat-files"));
    }

    [Theory]
    [InlineData("chat-42-page.html")]
    [InlineData("chat-42-script.js")]
    [InlineData("chat-42-vector.svg")]
    [InlineData("chat-42-installer.exe")]
    [InlineData("chat-42-package.apk")]
    public async Task Download_ForcesAttachmentForActiveFileTypes(string fileName)
    {
        await File.WriteAllTextAsync(Path.Combine(_storageRoot, "chat-files", fileName), "content");
        var controller = BuildController();

        var result = await controller.Download(fileName, CancellationToken.None);

        var fileResult = Assert.IsType<PhysicalFileResult>(result);
        Assert.Equal(fileName, fileResult.FileDownloadName);
        Assert.Equal("private,max-age=604800", controller.Response.Headers.CacheControl.ToString());
        Assert.Equal("nosniff", controller.Response.Headers.XContentTypeOptions.ToString());
    }

    [Fact]
    public async Task Download_KeepsImagePreviewInline()
    {
        const string fileName = "chat-42-preview.png";
        await File.WriteAllBytesAsync(Path.Combine(_storageRoot, "chat-files", fileName), [0x89, 0x50, 0x4E, 0x47]);
        var controller = BuildController();

        var result = await controller.Download(fileName, CancellationToken.None);

        var fileResult = Assert.IsType<PhysicalFileResult>(result);
        Assert.Equal(string.Empty, fileResult.FileDownloadName);
    }

    public void Dispose()
    {
        if (Directory.Exists(_storageRoot))
        {
            Directory.Delete(_storageRoot, recursive: true);
        }
    }

    private ChatFilesController BuildController()
    {
        var configuration = new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["Storage:Root"] = _storageRoot
            })
            .Build();
        var dbContext = CreateContext();
        var controller = new ChatFilesController(
            new UploadStoragePaths(configuration, new TestWebHostEnvironment()),
            configuration,
            new TestStorageMetrics(),
            new ChatFileAccessService(dbContext, new ServerStateService(dbContext)),
            new UserStorageQuotaService(dbContext),
            NullLogger<ChatFilesController>.Instance)
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

    private sealed class TestStorageMetrics : IChatFileUploadStorageMetrics
    {
        public long GetUserStoredBytes(string uploadsDirectory, string userId) => 0;

        public long GetAvailableBytes(string uploadsDirectory) => 1024L * 1024 * 1024;
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
