using System.Security.Claims;
using System.Text;
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

    [Fact]
    public async Task Upload_WhenStorageFails_ReturnsGenericUnavailableWithoutDiagnostics()
    {
        var controller = BuildController(new ThrowingStorageMetrics());
        var request = BuildMultipartRequest("upload.txt", "text/plain", Encoding.UTF8.GetBytes("hello"));
        controller.ControllerContext.HttpContext.Request.Method = request.Method;
        controller.ControllerContext.HttpContext.Request.ContentType = request.ContentType;
        controller.ControllerContext.HttpContext.Request.ContentLength = request.ContentLength;
        controller.ControllerContext.HttpContext.Request.Body = request.Body;

        var result = await controller.Upload(CancellationToken.None);

        var unavailable = Assert.IsType<ObjectResult>(result);
        Assert.Equal(StatusCodes.Status503ServiceUnavailable, unavailable.StatusCode);
        Assert.False(controller.Response.Headers.ContainsKey("X-Upload-Storage-Diagnostics"));
        var json = System.Text.Json.JsonSerializer.Serialize(unavailable.Value);
        Assert.Contains("Chat file storage is temporarily unavailable.", json);
        Assert.DoesNotContain("storageDirectory=", json, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("rootError=", json, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain(_storageRoot, json, StringComparison.OrdinalIgnoreCase);
        using var document = System.Text.Json.JsonDocument.Parse(json);
        Assert.False(document.RootElement.TryGetProperty("storage", out _));
    }

    [Fact]
    public async Task Upload_UsesPersonalLimitForPersistedEmail()
    {
        var controller = BuildController(userEmail: "andrey1689123@gmail.com");
        var request = BuildMultipartRequest("upload.txt", "text/plain", Encoding.UTF8.GetBytes("hello"));
        controller.ControllerContext.HttpContext.Request.Method = request.Method;
        controller.ControllerContext.HttpContext.Request.ContentType = request.ContentType;
        controller.ControllerContext.HttpContext.Request.ContentLength = 6L * 1024 * 1024 * 1024;
        controller.ControllerContext.HttpContext.Request.Body = request.Body;

        var result = await controller.Upload(CancellationToken.None);

        Assert.IsType<OkObjectResult>(result);
    }

    [Fact]
    public async Task Upload_KeepsDefaultQuotaForOtherPersistedEmail()
    {
        var controller = BuildController(userEmail: "someone@example.com");
        var request = BuildMultipartRequest("upload.txt", "text/plain", Encoding.UTF8.GetBytes("hello"));
        controller.ControllerContext.HttpContext.Request.Method = request.Method;
        controller.ControllerContext.HttpContext.Request.ContentType = request.ContentType;
        controller.ControllerContext.HttpContext.Request.ContentLength = 6L * 1024 * 1024 * 1024;
        controller.ControllerContext.HttpContext.Request.Body = request.Body;

        var result = await controller.Upload(CancellationToken.None);

        var tooLarge = Assert.IsType<ObjectResult>(result);
        Assert.Equal(StatusCodes.Status413PayloadTooLarge, tooLarge.StatusCode);
        var json = System.Text.Json.JsonSerializer.Serialize(tooLarge.Value);
        Assert.Contains("User storage quota exceeded.", json);
    }

    [Fact]
    public void ChatFileUploadLimitPolicy_AppliesThirtyGigabytesForPersonalEmail()
    {
        var configured = new StreamedChatFileUploadLimits(
            500L * 1024 * 1024,
            5L * 1024 * 1024 * 1024,
            1L * 1024 * 1024 * 1024);

        var limits = ChatFileUploadLimitPolicy.ApplyPersonalLimits("andrey1689123@gmail.com", configured);

        Assert.Equal(30L * 1024 * 1024 * 1024, limits.MaxFileSizeBytes);
        Assert.Equal(30L * 1024 * 1024 * 1024, limits.MaxUserStorageBytes);
        Assert.Equal(configured.MinFreeDiskBytes, limits.MinFreeDiskBytes);
    }

    [Fact]
    public void ChatFileUploadLimitPolicy_KeepsConfiguredLimitsForOtherEmails()
    {
        var configured = new StreamedChatFileUploadLimits(
            500L * 1024 * 1024,
            5L * 1024 * 1024 * 1024,
            1L * 1024 * 1024 * 1024);

        var limits = ChatFileUploadLimitPolicy.ApplyPersonalLimits("someone@example.com", configured);

        Assert.Equal(configured, limits);
    }

    public void Dispose()
    {
        if (Directory.Exists(_storageRoot))
        {
            Directory.Delete(_storageRoot, recursive: true);
        }
    }

    private ChatFilesController BuildController(IChatFileUploadStorageMetrics? storageMetrics = null, string? userEmail = null)
    {
        var configuration = new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["Storage:Root"] = _storageRoot
            })
            .Build();
        var dbContext = CreateContext();
        if (!string.IsNullOrWhiteSpace(userEmail))
        {
            dbContext.Users.Add(new User
            {
                id = 42,
                first_name = "Test",
                last_name = "User",
                nickname = "tester",
                email = userEmail,
                password_hash = "hash",
                is_email_verified = true
            });
            dbContext.SaveChanges();
        }

        var controller = new ChatFilesController(
            new UploadStoragePaths(configuration, new TestWebHostEnvironment()),
            configuration,
            dbContext,
            storageMetrics ?? new TestStorageMetrics(),
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

    private static HttpRequest BuildMultipartRequest(string fileName, string contentType, byte[] fileBytes)
    {
        var boundary = $"----nodiscord-{Guid.NewGuid():N}";
        using var body = new MemoryStream();
        WriteAscii(body, $"--{boundary}\r\n");
        WriteAscii(body, $"Content-Disposition: form-data; name=\"File\"; filename=\"{fileName}\"\r\n");
        WriteAscii(body, $"Content-Type: {contentType}\r\n\r\n");
        body.Write(fileBytes);
        WriteAscii(body, $"\r\n--{boundary}--\r\n");

        var context = new DefaultHttpContext();
        context.Request.Method = HttpMethods.Post;
        context.Request.ContentType = $"multipart/form-data; boundary={boundary}";
        context.Request.ContentLength = body.Length;
        context.Request.Body = new MemoryStream(body.ToArray());
        return context.Request;
    }

    private static void WriteAscii(Stream stream, string value)
    {
        var bytes = Encoding.ASCII.GetBytes(value);
        stream.Write(bytes);
    }

    private sealed class TestStorageMetrics : IChatFileUploadStorageMetrics
    {
        public long GetUserStoredBytes(string uploadsDirectory, string userId) => 0;

        public long GetAvailableBytes(string uploadsDirectory) => 1024L * 1024 * 1024;
    }

    private sealed class ThrowingStorageMetrics : IChatFileUploadStorageMetrics
    {
        public long GetUserStoredBytes(string uploadsDirectory, string userId)
        {
            throw new IOException($"Storage metrics failed for {uploadsDirectory}.");
        }

        public long GetAvailableBytes(string uploadsDirectory)
        {
            throw new IOException($"Storage metrics failed for {uploadsDirectory}.");
        }
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
