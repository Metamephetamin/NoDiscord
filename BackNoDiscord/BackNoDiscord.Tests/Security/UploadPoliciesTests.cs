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
