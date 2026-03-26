using BackNoDiscord.Security;
using Microsoft.AspNetCore.Http;

namespace BackNoDiscord.Tests.Security;

public class UploadPoliciesTests
{
    [Fact]
    public void TryValidateAvatar_AcceptsAllowedImage()
    {
        using var stream = new MemoryStream([1, 2, 3]);
        IFormFile file = new FormFile(stream, 0, stream.Length, "avatar", "avatar.png")
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
