namespace BackNoDiscord.Tests.Security;

public sealed class BackendSourcePolicyTests
{
    [Fact]
    public void ChatFilesUploadEndpointUsesStreamingRequestReader()
    {
        var source = File.ReadAllText(Path.Combine(
            "..",
            "..",
            "..",
            "..",
            "BackNoDiscord",
            "Controllers",
            "ChatFilesController.cs"));

        Assert.Contains("StreamedChatFileUploadReader.UploadAsync(", source);
        Assert.Contains("Request,", source);
        Assert.DoesNotContain("[FromForm(Name = \"file\")] IFormFile", source);
    }

    [Fact]
    public void RefreshTokenRotationUsesConditionalRevocationUpdate()
    {
        var source = File.ReadAllText(Path.Combine(
            "..",
            "..",
            "..",
            "..",
            "BackNoDiscord",
            "AuthController.cs"));

        Assert.Contains("RevokeRefreshTokenForRotationAsync", source);
        Assert.Contains("ExecuteUpdateAsync", source);
        Assert.Contains("item.RevokedAt == null", source);
    }

    [Fact]
    public void ChatMessagesStoreAuthorUserIdForReadStateQueries()
    {
        var dbContextSource = File.ReadAllText(Path.Combine(
            "..",
            "..",
            "..",
            "..",
            "BackNoDiscord",
            "DbContext.cs"));
        var chatHubSource = File.ReadAllText(Path.Combine(
            "..",
            "..",
            "..",
            "..",
            "BackNoDiscord",
            "ChatHub.cs"));

        Assert.Contains("public string? AuthorUserId", dbContextSource);
        Assert.Contains("ADD COLUMN IF NOT EXISTS author_user_id", File.ReadAllText(Path.Combine(
            "..",
            "..",
            "..",
            "..",
            "BackNoDiscord",
            "Infrastructure",
            "DatabaseSchemaInitializer.cs")));
        Assert.Contains("AuthorUserId = currentUser.UserId", chatHubSource);
        Assert.Contains("message.AuthorUserId != currentUser.UserId", chatHubSource);
    }
}
