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

    [Fact]
    public void ChatHubReadReceiptsAvoidPayloadReadsForModernMessages()
    {
        var source = File.ReadAllText(Path.Combine(
            "..",
            "..",
            "..",
            "..",
            "BackNoDiscord",
            "ChatHub.cs"));

        Assert.Contains("LoadUnreadModernMessageIdsAsync", source);
        Assert.Contains("LoadUnreadLegacyMessageIdsAsync", source);
        Assert.Contains("message.AuthorUserId != null", source);
        Assert.Contains("message.AuthorUserId == null", source);
        Assert.Contains(".Select(message => message.Id)", source);
    }

    [Fact]
    public void ChatHubUsesBurstSpamLimiterForMessageSends()
    {
        var chatHubSource = File.ReadAllText(Path.Combine(
            "..",
            "..",
            "..",
            "..",
            "BackNoDiscord",
            "ChatHub.cs"));

        var limiterSource = File.ReadAllText(Path.Combine(
            "..",
            "..",
            "..",
            "..",
            "BackNoDiscord",
            "Security",
            "ChatSpamBurstLimiter.cs"));

        Assert.Contains("ChatSpamBurstLimiter", chatHubSource);
        Assert.Contains("EnsureMessageBurstAllowedAsync(currentUser.UserId, nowUtc)", chatHubSource);
        Assert.Contains("RecordMessageBurstViolationAsync", chatHubSource);
        Assert.Contains("MaxMessagesPerWindow = 12", limiterSource);
        Assert.Contains("Window = TimeSpan.FromSeconds(10)", limiterSource);
    }

    [Fact]
    public void ServerModerationActionsAreEnforcedAcrossChatInvitesAndVoice()
    {
        var chatHubSource = File.ReadAllText(Path.Combine(
            "..",
            "..",
            "..",
            "..",
            "BackNoDiscord",
            "ChatHub.cs"));
        var invitesSource = File.ReadAllText(Path.Combine(
            "..",
            "..",
            "..",
            "..",
            "BackNoDiscord",
            "Controllers",
            "ServerInvitesController.cs"));
        var voiceHubSource = File.ReadAllText(Path.Combine(
            "..",
            "..",
            "..",
            "..",
            "BackNoDiscord",
            "VoiceHub.cs"));

        Assert.Contains("EnsureServerModerationAllowsTextSendAsync", chatHubSource);
        Assert.Contains("[\"ban\", \"mute\"]", chatHubSource);
        Assert.Contains("GetInvitePreview(request.InviteCode", invitesSource);
        Assert.Contains("[\"ban\"]", invitesSource);
        Assert.Contains("TryGetServerIdFromVoiceChannelName", voiceHubSource);
        Assert.Contains("[\"ban\"]", voiceHubSource);
    }

    [Fact]
    public void ServerSyncPreservesVoiceChannelStatusForNonOwners()
    {
        var source = File.ReadAllText(Path.Combine(
            "..",
            "..",
            "..",
            "..",
            "BackNoDiscord",
            "Controllers",
            "ServerInvitesController.cs"));

        Assert.Contains("GetVoiceChannelStatusesByChannelId(existingSnapshot)", source);
        Assert.Contains("PreserveVoiceChannelStatusesForNonOwner(existingStatusByChannelId, snapshotToSave);", source);
        Assert.Contains("existingStatusByChannelId", source);
        Assert.Contains("channel.Status = existingStatus;", source);
        Assert.Contains("channel.Status = string.Empty;", source);
    }

    [Fact]
    public void ChatHubReactionLimitQueryIsBounded()
    {
        var source = File.ReadAllText(Path.Combine(
            "..",
            "..",
            "..",
            "..",
            "BackNoDiscord",
            "ChatHub.cs"));

        Assert.Contains(".Take(MaxReactionsPerMessageByUser)", source);
        Assert.Contains("ToListAsync(Context.ConnectionAborted)", source);
    }

    [Fact]
    public void ChatHubPresenceDisconnectUsesSetBasedLastSeenUpdate()
    {
        var source = File.ReadAllText(Path.Combine(
            "..",
            "..",
            "..",
            "..",
            "BackNoDiscord",
            "ChatHub.cs"));

        Assert.Contains("SetProperty(user => user.last_seen_at, lastSeenAt)", source);
        Assert.DoesNotContain("user.last_seen_at = lastSeenAt;", source);
    }

    [Fact]
    public void FriendSearchCapsDatabaseCandidatesBeforeInMemoryRanking()
    {
        var source = File.ReadAllText(Path.Combine(
            "..",
            "..",
            "..",
            "..",
            "BackNoDiscord",
            "Controllers",
            "FriendsController.cs"));

        Assert.Contains("const int FriendSearchCandidateLimit", source);
        Assert.Contains(".Take(FriendSearchCandidateLimit)", source);
        Assert.Contains("ToListAsync(cancellationToken)", source);
    }

    [Fact]
    public void PushNotificationsSendWithBoundedParallelism()
    {
        var source = File.ReadAllText(Path.Combine(
            "..",
            "..",
            "..",
            "..",
            "BackNoDiscord",
            "Services",
            "PushNotificationService.cs"));

        Assert.Contains("MaxConcurrentPushSends", source);
        Assert.Contains("SemaphoreSlim", source);
        Assert.Contains("Task.WhenAll", source);
    }

    [Fact]
    public void DatabaseModelKeepsIndexesForBackendHotPaths()
    {
        var dbContextSource = File.ReadAllText(Path.Combine(
            "..",
            "..",
            "..",
            "..",
            "BackNoDiscord",
            "DbContext.cs"));
        var schemaSource = File.ReadAllText(Path.Combine(
            "..",
            "..",
            "..",
            "..",
            "BackNoDiscord",
            "Infrastructure",
            "DatabaseSchemaInitializer.cs"));

        Assert.Contains("HasFilter(\"is_deleted = false\")", dbContextSource);
        Assert.Contains("x.ChannelId, x.Id", dbContextSource);
        Assert.Contains("x.MessageId, x.CreatedAt", dbContextSource);
        Assert.Contains("x.UserLowId, x.CreatedAt", dbContextSource);
        Assert.Contains("x.UserHighId, x.CreatedAt", dbContextSource);
        Assert.Contains("ix_chatmessages_active_channelid_id", schemaSource);
        Assert.Contains("ix_friendships_user_low_created_at", schemaSource);
        Assert.Contains("ix_friendships_user_high_created_at", schemaSource);
    }

    [Fact]
    public void FriendsControllerPropagatesCancellationThroughListHotPath()
    {
        var source = File.ReadAllText(Path.Combine(
            "..",
            "..",
            "..",
            "..",
            "BackNoDiscord",
            "Controllers",
            "FriendsController.cs"));

        Assert.Contains("GetFriends(CancellationToken cancellationToken)", source);
        Assert.Contains("LoadActiveActivitiesAsync(friendIds, cancellationToken)", source);
        Assert.Contains("BuildDirectUnreadCountsAsync(currentUserId, friendIds, cancellationToken)", source);
        Assert.Contains("BuildDirectLastMessageTimestampsAsync(currentUserId, friendIds, cancellationToken)", source);
        Assert.Contains("BuildMutualFriendCountsAsync(currentUserId, friendIds, cancellationToken)", source);
        Assert.Contains("LoadBlockStatesAsync(currentUserId, friendIds, cancellationToken)", source);
        Assert.Contains("GetFriendRequests(CancellationToken cancellationToken)", source);
        Assert.Contains("GetIncomingPendingRequestsAsync(currentUserId, cancellationToken)", source);
        Assert.Contains("GetOutgoingPendingRequestsAsync(currentUserId, cancellationToken)", source);
    }

    [Fact]
    public void ChatFileMetadataRepairRunsOnlyAsOptInMaintenanceJob()
    {
        var programSource = File.ReadAllText(Path.Combine(
            "..",
            "..",
            "..",
            "..",
            "BackNoDiscord",
            "Program.cs"));
        var hostedServiceSource = File.ReadAllText(Path.Combine(
            "..",
            "..",
            "..",
            "..",
            "BackNoDiscord",
            "Services",
            "ChatFileMetadataRepairHostedService.cs"));

        Assert.Contains("AddHostedService<ChatFileMetadataRepairHostedService>", programSource);
        Assert.Contains("ChatFiles:RepairLegacyMetadataOnStartup", hostedServiceSource);
        Assert.Contains("GetValue<bool>", hostedServiceSource);
        Assert.Contains("RepairAsync", hostedServiceSource);
    }

    [Fact]
    public void ProductionSecurityBoundariesRemainEnabled()
    {
        var programSource = File.ReadAllText(Path.Combine(
            "..",
            "..",
            "..",
            "..",
            "BackNoDiscord",
            "Program.cs"));
        var authControllerSource = File.ReadAllText(Path.Combine(
            "..",
            "..",
            "..",
            "..",
            "BackNoDiscord",
            "AuthController.cs"));
        var chatFilesControllerSource = File.ReadAllText(Path.Combine(
            "..",
            "..",
            "..",
            "..",
            "BackNoDiscord",
            "Controllers",
            "ChatFilesController.cs"));

        Assert.Contains("options.AddPolicy(\"auth\"", programSource);
        Assert.Contains("options.AddPolicy(\"email-send\"", programSource);
        Assert.Contains("options.AddPolicy(\"email-verify\"", programSource);
        Assert.Contains("options.AddPolicy(\"qr-login-poll\"", programSource);
        Assert.Contains("options.AddPolicy(\"chat-upload\"", programSource);
        Assert.Contains("const long MaxChatFileUploadBytes = 100L * 1024 * 1024", programSource);
        Assert.Contains("PermitLimit = 12", programSource);
        Assert.Contains("MapHub<ChatHub>(\"/chatHub\").RequireAuthorization()", programSource);
        Assert.Contains("MapHub<VoiceHub>(\"/voiceHub\").RequireAuthorization()", programSource);
        Assert.Contains("FrontendOriginPolicy.IsAllowed", programSource);
        Assert.Contains("X-Content-Type-Options", programSource);
        Assert.Contains("Content-Security-Policy", programSource);
        Assert.Contains("var shouldSecureCookie = !context.RequestServices.GetRequiredService<IWebHostEnvironment>().IsDevelopment() || context.Request.IsHttps", programSource);
        Assert.Contains("Secure = shouldSecureCookie", programSource);
        Assert.Contains("SameSite = shouldSecureCookie ? SameSiteMode.None : SameSiteMode.Lax", programSource);
        Assert.Contains("Cache-Control", programSource);
        Assert.Contains("[EnableRateLimiting(\"auth\")]", authControllerSource);
        Assert.Contains("[EnableRateLimiting(\"chat-upload\")]", chatFilesControllerSource);
        Assert.Contains("StreamedChatFileUploadReader.UploadAsync(", chatFilesControllerSource);
    }

    [Fact]
    public void RateLimitRejectionsExposeRetryAfterWithoutSensitiveLogging()
    {
        var programSource = File.ReadAllText(Path.Combine(
            "..",
            "..",
            "..",
            "..",
            "BackNoDiscord",
            "Program.cs"));

        Assert.Contains("options.OnRejected", programSource);
        Assert.Contains("Headers.RetryAfter", programSource);
        Assert.Contains("Rate limit rejected {Method} {Path}", programSource);
        Assert.Contains("correlationId={CorrelationId}", programSource);
        Assert.DoesNotContain("Request.Body", programSource);
    }

    [Fact]
    public void DatabaseInitializerDefaultsEmailVerificationToFalse()
    {
        var initializerSource = File.ReadAllText(Path.Combine(
            "..",
            "..",
            "..",
            "..",
            "BackNoDiscord",
            "Infrastructure",
            "DatabaseSchemaInitializer.cs"));

        Assert.DoesNotContain("is_email_verified boolean NOT NULL DEFAULT true", initializerSource);
        Assert.Contains("is_email_verified boolean NOT NULL DEFAULT false", initializerSource);
        Assert.Contains("ALTER COLUMN is_email_verified SET DEFAULT false", initializerSource);
        Assert.Contains("UPDATE users SET is_email_verified = false WHERE is_email_verified IS NULL", initializerSource);
    }

    [Fact]
    public void ProductionDoesNotRunSchemaInitializerUnlessExplicitlyEnabled()
    {
        var programSource = File.ReadAllText(Path.Combine(
            "..",
            "..",
            "..",
            "..",
            "BackNoDiscord",
            "Program.cs"));
        var productionSettingsSource = File.ReadAllText(Path.Combine(
            "..",
            "..",
            "..",
            "..",
            "BackNoDiscord",
            "appsettings.Production.json.example"));

        Assert.Contains("GetValue<bool?>(\"Database:RunSchemaInitializer\")", programSource);
        Assert.Contains("runSchemaInitializer ?? !app.Environment.IsProduction()", programSource);
        Assert.Contains("DatabaseSchemaInitializer.InitializeAsync(app.Services)", programSource);
        Assert.Contains("\"RunSchemaInitializer\": false", productionSettingsSource);
    }

    [Fact]
    public void AuthControllerDoesNotKeepContradictoryDisabledEmailVerificationComment()
    {
        var authControllerSource = File.ReadAllText(Path.Combine(
            "..",
            "..",
            "..",
            "..",
            "BackNoDiscord",
            "AuthController.cs"));

        Assert.DoesNotContain("Temporarily disabled email verification flow", authControllerSource);
        Assert.DoesNotContain("//         var emailVerification = await CreateEmailVerificationAsync(user);", authControllerSource);
    }

    [Fact]
    public void IntegrationOAuthStateIsProtectedAndStateless()
    {
        var source = File.ReadAllText(Path.Combine(
            "..",
            "..",
            "..",
            "..",
            "BackNoDiscord",
            "Controllers",
            "UserIntegrationsController.cs"));

        Assert.Contains("IDataProtector", source);
        Assert.Contains("ProtectOAuthState", source);
        Assert.Contains("TryUnprotectOAuthState", source);
        Assert.DoesNotContain("ConcurrentDictionary<string, OAuthStateRecord>", source);
        Assert.DoesNotContain("OAuthStates.TryRemove", source);
        Assert.DoesNotContain("PurgeExpiredOAuthStates", source);
    }
}
