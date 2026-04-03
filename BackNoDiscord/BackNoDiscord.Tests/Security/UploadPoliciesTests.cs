using BackNoDiscord.Security;
using Microsoft.AspNetCore.Http;

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
    public void TryValidateChatFile_RejectsDisallowedExtension()
    {
        using var stream = new MemoryStream([1, 2, 3]);
        IFormFile file = new FormFile(stream, 0, stream.Length, "file", "script.html")
        {
            Headers = new HeaderDictionary(),
            ContentType = "text/html"
        };

        var success = UploadPolicies.TryValidateChatFile(file, out _, out _, out var error);

        Assert.False(success);
        Assert.Equal("This file type is not allowed.", error);
    }

    [Fact]
    public void SanitizeRelativeAssetUrl_AllowsOnlyExpectedPrefix()
    {
        Assert.Equal("/avatars/user-1.png", UploadPolicies.SanitizeRelativeAssetUrl("/avatars/user-1.png", "/avatars/"));
        Assert.Equal(string.Empty, UploadPolicies.SanitizeRelativeAssetUrl("/chat-files/user-1.png", "/avatars/"));
        Assert.Equal(string.Empty, UploadPolicies.SanitizeRelativeAssetUrl("/avatars/../secret.txt", "/avatars/"));
    }
}
