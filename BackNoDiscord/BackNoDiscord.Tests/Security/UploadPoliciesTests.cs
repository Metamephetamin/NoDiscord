using BackNoDiscord.Security;
using Microsoft.AspNetCore.Http;
using System.Buffers.Binary;

namespace BackNoDiscord.Tests.Security;

public class UploadPoliciesTests
{
    [Fact]
    public void TryValidateAvatar_AcceptsAllowedImage()
    {
        var bytes = new byte[] { 0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00 };
        using var stream = new MemoryStream(bytes);
        stream.Position = 0;
        IFormFile file = new FormFile(stream, 0, bytes.Length, "avatar", "avatar.png")
        {
            Headers = new HeaderDictionary(),
            ContentType = "image/png"
        };

        var success = UploadPolicies.TryValidateAvatar(file, out var extension, out var contentType, out var error);

        Assert.True(success);
        Assert.Equal(".png", extension);
        Assert.Equal("image/png", contentType);
        Assert.Equal(string.Empty, error);
    }

    [Fact]
    public void TryValidateAvatar_AcceptsAnimatedGifWithinDurationLimit()
    {
        var bytes = new byte[]
        {
            0x47, 0x49, 0x46, 0x38, 0x39, 0x61,
            0x01, 0x00, 0x01, 0x00, 0x80, 0x00, 0x00,
            0x00, 0x00, 0x00, 0xFF, 0xFF, 0xFF,
            0x21, 0xF9, 0x04, 0x00, 0x0A, 0x00, 0x00, 0x00,
            0x2C, 0x00, 0x00, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00,
            0x02, 0x02, 0x44, 0x01, 0x00,
            0x3B
        };

        using var stream = new MemoryStream(bytes);
        IFormFile file = new FormFile(stream, 0, bytes.Length, "avatar", "avatar.gif")
        {
            Headers = new HeaderDictionary(),
            ContentType = "image/gif"
        };

        var success = UploadPolicies.TryValidateAvatar(file, out var extension, out var contentType, out var error);

        Assert.True(success);
        Assert.Equal(".gif", extension);
        Assert.Equal("image/gif", contentType);
        Assert.Equal(string.Empty, error);
    }

    [Fact]
    public void TryValidateAvatar_AcceptsAnimatedMp4WhenMovieHeaderNeedsFallbackScan()
    {
        var bytes = BuildMp4WithScannableMovieHeader(durationSeconds: 3);
        using var stream = new MemoryStream(bytes);
        IFormFile file = new FormFile(stream, 0, bytes.Length, "avatar", "avatar.mp4")
        {
            Headers = new HeaderDictionary(),
            ContentType = "video/mp4"
        };

        var success = UploadPolicies.TryValidateAvatar(file, out var extension, out var contentType, out var error);

        Assert.True(success);
        Assert.Equal(".mp4", extension);
        Assert.Equal("video/mp4", contentType);
        Assert.Equal(string.Empty, error);
    }

    [Fact]
    public void TryValidateChatFile_AllowsHtmlAttachment()
    {
        using var stream = new MemoryStream([1, 2, 3]);
        IFormFile file = new FormFile(stream, 0, stream.Length, "file", "script.html")
        {
            Headers = new HeaderDictionary(),
            ContentType = "text/html"
        };

        var success = UploadPolicies.TryValidateChatFile(file, out var extension, out var contentType, out var error);

        Assert.True(success);
        Assert.Equal(".html", extension);
        Assert.Equal("text/html", contentType);
        Assert.Equal(string.Empty, error);
    }

    [Theory]
    [InlineData("report.docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document")]
    [InlineData("table.xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")]
    [InlineData("slides.pptx", "application/vnd.openxmlformats-officedocument.presentationml.presentation")]
    public void TryValidateChatFile_AllowsOfficeDocuments(string fileName, string expectedContentType)
    {
        using var stream = new MemoryStream(new byte[] { 0x50, 0x4B, 0x03, 0x04, 0x14, 0x00 });
        IFormFile file = new FormFile(stream, 0, stream.Length, "file", fileName)
        {
            Headers = new HeaderDictionary(),
            ContentType = expectedContentType
        };

        var success = UploadPolicies.TryValidateChatFile(file, out var extension, out var contentType, out var error);

        Assert.True(success);
        Assert.Equal(Path.GetExtension(fileName), extension);
        Assert.Equal(expectedContentType, contentType);
        Assert.Equal(string.Empty, error);
    }

    [Theory]
    [InlineData("notes.csv", "name,value\none,1\n")]
    [InlineData("data.json", "{\"ok\":true}")]
    [InlineData("readme.log", "plain log line\n")]
    [InlineData("export.sql", "select 1;\n")]
    public void TryValidateChatFile_AllowsPlainDocumentExtensions(string fileName, string content)
    {
        using var stream = new MemoryStream(System.Text.Encoding.UTF8.GetBytes(content));
        IFormFile file = new FormFile(stream, 0, stream.Length, "file", fileName)
        {
            Headers = new HeaderDictionary(),
            ContentType = "text/plain"
        };

        var success = UploadPolicies.TryValidateChatFile(file, out var extension, out _, out var error);

        Assert.True(success);
        Assert.Equal(Path.GetExtension(fileName), extension);
        Assert.Equal(string.Empty, error);
    }

    [Theory]
    [InlineData("start.bat")]
    [InlineData("deploy.cmd")]
    [InlineData("script.ps1")]
    [InlineData("tool.msi")]
    [InlineData("payload.js")]
    public void TryValidateChatFile_AllowsInstallerAndScriptExtensions(string fileName)
    {
        using var stream = new MemoryStream([1, 2, 3]);
        IFormFile file = new FormFile(stream, 0, stream.Length, "file", fileName)
        {
            Headers = new HeaderDictionary(),
            ContentType = "application/octet-stream"
        };

        var success = UploadPolicies.TryValidateChatFile(file, out var extension, out _, out var error);

        Assert.True(success);
        Assert.Equal(Path.GetExtension(fileName), extension);
        Assert.Equal(string.Empty, error);
    }

    [Fact]
    public void TryValidateChatFile_AllowsZipArchive()
    {
        using var stream = new MemoryStream(new byte[] { 0x50, 0x4B, 0x03, 0x04 });
        IFormFile file = new FormFile(stream, 0, stream.Length, "file", "archive.zip")
        {
            Headers = new HeaderDictionary(),
            ContentType = "application/zip"
        };

        var success = UploadPolicies.TryValidateChatFile(file, out var extension, out var contentType, out var error);

        Assert.True(success);
        Assert.Equal(".zip", extension);
        Assert.StartsWith("application/", contentType, StringComparison.OrdinalIgnoreCase);
        Assert.True(string.IsNullOrWhiteSpace(error));
    }

    [Fact]
    public void TryValidateChatFile_AllowsExecutableFiles()
    {
        using var stream = new MemoryStream(new byte[] { 0x4D, 0x5A, 0x90, 0x00 });
        IFormFile file = new FormFile(stream, 0, stream.Length, "file", "installer.exe")
        {
            Headers = new HeaderDictionary(),
            ContentType = "application/vnd.microsoft.portable-executable"
        };

        var success = UploadPolicies.TryValidateChatFile(file, out var extension, out var contentType, out var error);

        Assert.True(success);
        Assert.Equal(".exe", extension);
        Assert.Equal("application/vnd.microsoft.portable-executable", contentType);
        Assert.Equal(string.Empty, error);
    }

    [Fact]
    public void TryValidateChatFile_RejectsDangerousSignatureMismatch()
    {
        using var stream = new MemoryStream(new byte[] { 0x4D, 0x5A, 0x90, 0x00 });
        IFormFile file = new FormFile(stream, 0, stream.Length, "file", "invoice.pdf")
        {
            Headers = new HeaderDictionary(),
            ContentType = "application/pdf"
        };

        var success = UploadPolicies.TryValidateChatFile(file, out _, out _, out var error);

        Assert.False(success);
        Assert.Equal("File content does not match the selected file type.", error);
    }

    [Fact]
    public void TryValidateChatFile_AllowsExecutableSignatureInGenericFile()
    {
        using var stream = new MemoryStream(new byte[] { 0x4D, 0x5A, 0x90, 0x00 });
        IFormFile file = new FormFile(stream, 0, stream.Length, "file", "payload.dat")
        {
            Headers = new HeaderDictionary(),
            ContentType = "application/octet-stream"
        };

        var success = UploadPolicies.TryValidateChatFile(file, out var extension, out _, out var error);

        Assert.True(success);
        Assert.Equal(".dat", extension);
        Assert.Equal(string.Empty, error);
    }

    [Fact]
    public void TryValidateChatFile_RejectsZeroByteTextFile()
    {
        using var stream = new MemoryStream(Array.Empty<byte>());
        IFormFile file = new FormFile(stream, 0, 0, "file", "empty.txt")
        {
            Headers = new HeaderDictionary(),
            ContentType = "text/plain"
        };

        var success = UploadPolicies.TryValidateChatFile(file, out _, out _, out var error);

        Assert.False(success);
        Assert.Equal("File content does not match the selected file type.", error);
    }

    [Fact]
    public void TryValidateChatFile_AcceptsImageWhenSafeImageExtensionDiffersFromContent()
    {
        var bytes = new byte[]
        {
            (byte)'R', (byte)'I', (byte)'F', (byte)'F',
            0x10, 0x00, 0x00, 0x00,
            (byte)'W', (byte)'E', (byte)'B', (byte)'P',
            0x00
        };
        using var stream = new MemoryStream(bytes);
        IFormFile file = new FormFile(stream, 0, bytes.Length, "file", "renamed.jpg")
        {
            Headers = new HeaderDictionary(),
            ContentType = "image/jpeg"
        };

        var success = UploadPolicies.TryValidateChatFile(file, out var extension, out var contentType, out var error);

        Assert.True(success);
        Assert.Equal(".webp", extension);
        Assert.Equal("image/webp", contentType);
        Assert.Equal(string.Empty, error);
    }

    [Fact]
    public void TryValidateChatFile_NormalizesJfifToJpg()
    {
        var bytes = new byte[] { 0xFF, 0xD8, 0xFF, 0xE0, 0x00 };
        using var stream = new MemoryStream(bytes);
        IFormFile file = new FormFile(stream, 0, bytes.Length, "file", "camera.jfif")
        {
            Headers = new HeaderDictionary(),
            ContentType = "image/jpeg"
        };

        var success = UploadPolicies.TryValidateChatFile(file, out var extension, out var contentType, out var error);

        Assert.True(success);
        Assert.Equal(".jpg", extension);
        Assert.Equal("image/jpeg", contentType);
        Assert.Equal(string.Empty, error);
    }

    [Theory]
    [InlineData("voice.m4a", ".m4a")]
    [InlineData("camera.mov", ".mov")]
    [InlineData("photo.heic", ".heic")]
    [InlineData("photo.heif", ".heif")]
    public void TryValidateChatFile_AcceptsIosMediaFormats(string fileName, string expectedExtension)
    {
        var bytes = new byte[]
        {
            0x00, 0x00, 0x00, 0x18,
            (byte)'f', (byte)'t', (byte)'y', (byte)'p',
            (byte)'i', (byte)'s', (byte)'o', (byte)'m',
            0x00
        };
        using var stream = new MemoryStream(bytes);
        IFormFile file = new FormFile(stream, 0, bytes.Length, "file", fileName)
        {
            Headers = new HeaderDictionary(),
            ContentType = "application/octet-stream"
        };

        var success = UploadPolicies.TryValidateChatFile(file, out var extension, out var contentType, out var error);

        Assert.True(success);
        Assert.Equal(expectedExtension, extension);
        Assert.False(string.IsNullOrWhiteSpace(contentType));
        Assert.Equal(string.Empty, error);
    }

    [Fact]
    public void SanitizeRelativeAssetUrl_AllowsOnlyExpectedPrefix()
    {
        Assert.Equal("/avatars/user-1.png", UploadPolicies.SanitizeRelativeAssetUrl("/avatars/user-1.png", "/avatars/"));
        Assert.Equal(string.Empty, UploadPolicies.SanitizeRelativeAssetUrl("/chat-files/user-1.png", "/avatars/"));
        Assert.Equal(string.Empty, UploadPolicies.SanitizeRelativeAssetUrl("/avatars/../secret.txt", "/avatars/"));
    }

    private static byte[] BuildMp4WithScannableMovieHeader(uint durationSeconds)
    {
        var ftypPayload = new byte[]
        {
            (byte)'i', (byte)'s', (byte)'o', (byte)'m',
            0x00, 0x00, 0x02, 0x00,
            (byte)'i', (byte)'s', (byte)'o', (byte)'m',
            (byte)'m', (byte)'p', (byte)'4', (byte)'2',
        };
        var ftypAtom = BuildAtom("ftyp", ftypPayload);

        var invalidContainerHeader = new byte[8];
        BinaryPrimitives.WriteUInt32BigEndian(invalidContainerHeader.AsSpan(0, 4), 1024);
        invalidContainerHeader[4] = (byte)'f';
        invalidContainerHeader[5] = (byte)'r';
        invalidContainerHeader[6] = (byte)'e';
        invalidContainerHeader[7] = (byte)'e';

        var mvhdPayload = new byte[20];
        mvhdPayload[0] = 0;
        BinaryPrimitives.WriteUInt32BigEndian(mvhdPayload.AsSpan(12, 4), 1000);
        BinaryPrimitives.WriteUInt32BigEndian(mvhdPayload.AsSpan(16, 4), durationSeconds * 1000);
        var mvhdAtom = BuildAtom("mvhd", mvhdPayload);

        return [.. ftypAtom, .. invalidContainerHeader, .. mvhdAtom];
    }

    private static byte[] BuildAtom(string type, byte[] payload)
    {
        var atom = new byte[8 + payload.Length];
        BinaryPrimitives.WriteUInt32BigEndian(atom.AsSpan(0, 4), (uint)atom.Length);
        atom[4] = (byte)type[0];
        atom[5] = (byte)type[1];
        atom[6] = (byte)type[2];
        atom[7] = (byte)type[3];
        payload.CopyTo(atom, 8);
        return atom;
    }
}
