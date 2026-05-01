using BackNoDiscord.Services;
using Microsoft.AspNetCore.Http;
using System.Text;

namespace BackNoDiscord.Tests.Services;

public class StreamedChatFileUploadReaderTests : IDisposable
{
    private readonly string _tempDirectory = Path.Combine(Path.GetTempPath(), $"nodiscord-upload-tests-{Guid.NewGuid():N}");

    public StreamedChatFileUploadReaderTests()
    {
        Directory.CreateDirectory(_tempDirectory);
    }

    [Fact]
    public async Task UploadAsync_StreamsMultipartFileToStorage()
    {
        var fileBytes = Encoding.UTF8.GetBytes("hello from streaming upload");
        var request = BuildMultipartRequest("upload.txt", "text/plain", fileBytes);

        var result = await StreamedChatFileUploadReader.UploadAsync(
            request,
            _tempDirectory,
            userId: "42",
            limits: new StreamedChatFileUploadLimits(
                MaxFileSizeBytes: 1024,
                MaxUserStorageBytes: 1024,
                MinFreeDiskBytes: 0),
            storageMetrics: new TestStorageMetrics(),
            CancellationToken.None);

        Assert.Equal("upload.txt", result.DisplayFileName);
        Assert.Equal(fileBytes.Length, result.Size);
        Assert.Equal("text/plain", result.ContentType);
        Assert.StartsWith("/chat-files/chat-42-", result.FileUrl, StringComparison.Ordinal);
        Assert.EndsWith(".txt", result.FileUrl, StringComparison.Ordinal);

        var storedFileName = Path.GetFileName(result.FileUrl);
        var storedPath = Path.Combine(_tempDirectory, storedFileName);
        Assert.True(File.Exists(storedPath));
        Assert.Equal(fileBytes, await File.ReadAllBytesAsync(storedPath));
    }

    [Fact]
    public async Task UploadAsync_StoresBufferedFormFileToStorage()
    {
        var fileBytes = Encoding.UTF8.GetBytes("hello from buffered upload");
        var file = BuildFormFile("upload.txt", "text/plain", fileBytes);

        var result = await StreamedChatFileUploadReader.UploadAsync(
            file,
            _tempDirectory,
            userId: "42",
            limits: new StreamedChatFileUploadLimits(
                MaxFileSizeBytes: 1024,
                MaxUserStorageBytes: 1024,
                MinFreeDiskBytes: 0),
            storageMetrics: new TestStorageMetrics(),
            CancellationToken.None);

        Assert.Equal("upload.txt", result.DisplayFileName);
        Assert.Equal(fileBytes.Length, result.Size);
        Assert.Equal("text/plain", result.ContentType);

        var storedFileName = Path.GetFileName(result.FileUrl);
        var storedPath = Path.Combine(_tempDirectory, storedFileName);
        Assert.True(File.Exists(storedPath));
        Assert.Equal(fileBytes, await File.ReadAllBytesAsync(storedPath));
    }

    [Fact]
    public async Task UploadAsync_RejectsOversizedFileAndDeletesTemporaryFile()
    {
        var request = BuildMultipartRequest("large.txt", "text/plain", Encoding.UTF8.GetBytes("too large"));

        var exception = await Assert.ThrowsAsync<StreamedChatFileUploadException>(() =>
            StreamedChatFileUploadReader.UploadAsync(
                request,
                _tempDirectory,
                userId: "42",
                limits: new StreamedChatFileUploadLimits(
                    MaxFileSizeBytes: 4,
                    MaxUserStorageBytes: 1024,
                    MinFreeDiskBytes: 0),
                storageMetrics: new TestStorageMetrics(),
                CancellationToken.None));

        Assert.Equal("File size limit exceeded.", exception.Message);
        Assert.Empty(Directory.EnumerateFiles(_tempDirectory));
    }

    [Fact]
    public async Task UploadAsync_RejectsFileWhenUserQuotaWouldBeExceeded()
    {
        var request = BuildMultipartRequest("quota.txt", "text/plain", Encoding.UTF8.GetBytes("quota"));

        var exception = await Assert.ThrowsAsync<StreamedChatFileUploadException>(() =>
            StreamedChatFileUploadReader.UploadAsync(
                request,
                _tempDirectory,
                userId: "42",
                limits: new StreamedChatFileUploadLimits(
                    MaxFileSizeBytes: 1024,
                    MaxUserStorageBytes: 9,
                    MinFreeDiskBytes: 0),
                storageMetrics: new TestStorageMetrics(userStoredBytes: 5),
                CancellationToken.None));

        Assert.Equal("User storage quota exceeded.", exception.Message);
        Assert.Empty(Directory.EnumerateFiles(_tempDirectory));
    }

    [Fact]
    public async Task UploadAsync_DoesNotRejectFileBeforeWriteWhenConfiguredDiskReserveWouldBeExceeded()
    {
        var fileBytes = Encoding.UTF8.GetBytes("space");
        var request = BuildMultipartRequest("space.txt", "text/plain", fileBytes);

        var result = await StreamedChatFileUploadReader.UploadAsync(
            request,
            _tempDirectory,
            userId: "42",
            limits: new StreamedChatFileUploadLimits(
                MaxFileSizeBytes: 1024,
                MaxUserStorageBytes: 1024,
                MinFreeDiskBytes: 10),
            storageMetrics: new TestStorageMetrics(availableBytes: 12),
            CancellationToken.None);

        Assert.Equal(fileBytes.Length, result.Size);
    }

    [Fact]
    public async Task UploadAsync_AllowsSmallFileWhenConfiguredReserveIsLargerThanSmallDisk()
    {
        var fileBytes = Encoding.UTF8.GetBytes("small file");
        var request = BuildMultipartRequest("small.txt", "text/plain", fileBytes);

        var result = await StreamedChatFileUploadReader.UploadAsync(
            request,
            _tempDirectory,
            userId: "42",
            limits: new StreamedChatFileUploadLimits(
                MaxFileSizeBytes: 1024,
                MaxUserStorageBytes: 1024,
                MinFreeDiskBytes: 1024L * 1024 * 1024),
            storageMetrics: new TestStorageMetrics(availableBytes: 512L * 1024 * 1024),
            CancellationToken.None);

        Assert.Equal(fileBytes.Length, result.Size);
    }

    [Fact]
    public async Task UploadAsync_AllowsSmallFileWhenDiskHasOnlyTensOfMegabytesFree()
    {
        var fileBytes = Encoding.UTF8.GetBytes("small file");
        var request = BuildMultipartRequest("small.txt", "text/plain", fileBytes);

        var result = await StreamedChatFileUploadReader.UploadAsync(
            request,
            _tempDirectory,
            userId: "42",
            limits: new StreamedChatFileUploadLimits(
                MaxFileSizeBytes: 1024,
                MaxUserStorageBytes: 1024,
                MinFreeDiskBytes: 1024L * 1024 * 1024),
            storageMetrics: new TestStorageMetrics(availableBytes: 32L * 1024 * 1024),
            CancellationToken.None);

        Assert.Equal(fileBytes.Length, result.Size);
    }

    [Fact]
    public async Task UploadAsync_WrapsStorageMetricFailuresAsUploadException()
    {
        var request = BuildMultipartRequest("upload.txt", "text/plain", Encoding.UTF8.GetBytes("hello"));

        var exception = await Assert.ThrowsAsync<StreamedChatFileUploadException>(() =>
            StreamedChatFileUploadReader.UploadAsync(
                request,
                _tempDirectory,
                userId: "42",
                limits: new StreamedChatFileUploadLimits(
                    MaxFileSizeBytes: 1024,
                    MaxUserStorageBytes: 1024,
                    MinFreeDiskBytes: 0),
                storageMetrics: new ThrowingStorageMetrics(),
                CancellationToken.None));

        Assert.Equal("Chat file storage is temporarily unavailable.", exception.Message);
        Assert.True(exception.IsStorageFailure);
        Assert.IsType<IOException>(exception.InnerException);
        Assert.Empty(Directory.EnumerateFiles(_tempDirectory));
    }

    public void Dispose()
    {
        if (Directory.Exists(_tempDirectory))
        {
            Directory.Delete(_tempDirectory, recursive: true);
        }
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

    private static IFormFile BuildFormFile(string fileName, string contentType, byte[] fileBytes)
    {
        return new FormFile(new MemoryStream(fileBytes), 0, fileBytes.Length, "file", fileName)
        {
            Headers = new HeaderDictionary(),
            ContentType = contentType
        };
    }

    private static void WriteAscii(Stream stream, string value)
    {
        var bytes = Encoding.ASCII.GetBytes(value);
        stream.Write(bytes);
    }

    private sealed class TestStorageMetrics : IChatFileUploadStorageMetrics
    {
        private readonly long _userStoredBytes;
        private readonly long _availableBytes;

        public TestStorageMetrics(long userStoredBytes = 0, long availableBytes = long.MaxValue)
        {
            _userStoredBytes = userStoredBytes;
            _availableBytes = availableBytes;
        }

        public long GetUserStoredBytes(string uploadsDirectory, string userId)
        {
            return _userStoredBytes;
        }

        public long GetAvailableBytes(string uploadsDirectory)
        {
            return _availableBytes;
        }
    }

    private sealed class ThrowingStorageMetrics : IChatFileUploadStorageMetrics
    {
        public long GetUserStoredBytes(string uploadsDirectory, string userId)
        {
            throw new IOException("Storage metrics failed.");
        }

        public long GetAvailableBytes(string uploadsDirectory)
        {
            throw new IOException("Storage metrics failed.");
        }
    }
}
