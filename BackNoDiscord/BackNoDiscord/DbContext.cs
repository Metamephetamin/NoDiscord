using Microsoft.EntityFrameworkCore;
using System.ComponentModel.DataAnnotations.Schema;

namespace BackNoDiscord;

[Table("chatmessages")]
public class Message
{
    [Column("id")]
    public int Id { get; set; }

    [Column("channelid")]
    public string ChannelId { get; set; } = null!;

    [Column("username")]
    public string Username { get; set; } = null!;

    [Column("message")]
    public string? Content { get; set; }

    [Column("message_encrypted")]
    public string? EncryptedContent { get; set; }

    [Column("photourl")]
    public string? PhotoUrl { get; set; }

    [Column("timestamp")]
    public DateTime Timestamp { get; set; }

    [Column("read_at")]
    public DateTime? ReadAt { get; set; }

    [Column("read_by_user_id")]
    public string? ReadByUserId { get; set; }

    [Column("is_deleted")]
    public bool IsDeleted { get; set; }
}

[Table("users")]
public class User
{
    [Column("id")]
    public int id { get; set; }

    [Column("first_name")]
    public string first_name { get; set; } = null!;

    [Column("last_name")]
    public string last_name { get; set; } = null!;

    [Column("nickname")]
    public string nickname { get; set; } = null!;

    [Column("email")]
    public string? email { get; set; }

    [Column("is_email_verified")]
    public bool is_email_verified { get; set; }

    [Column("phone_number")]
    public string? phone_number { get; set; }

    [Column("is_phone_verified")]
    public bool is_phone_verified { get; set; }

    [Column("totp_secret")]
    public string? totp_secret { get; set; }

    [Column("is_totp_enabled")]
    public bool is_totp_enabled { get; set; }

    [Column("totp_enabled_at")]
    public DateTimeOffset? totp_enabled_at { get; set; }

    [Column("avatar_url")]
    public string? avatar_url { get; set; }

    [Column("avatar_frame_json")]
    public string? avatar_frame_json { get; set; }

    [Column("profile_background_url")]
    public string? profile_background_url { get; set; }

    [Column("profile_background_frame_json")]
    public string? profile_background_frame_json { get; set; }

    [Column("last_seen_at")]
    public DateTimeOffset? last_seen_at { get; set; }

    [Column("password_hash")]
    public string password_hash { get; set; } = null!;
}

[Table("email_verification_codes")]
public class EmailVerificationCodeRecord
{
    [Column("id")]
    public int Id { get; set; }

    [Column("user_id")]
    public int UserId { get; set; }

    [Column("email")]
    public string Email { get; set; } = string.Empty;

    [Column("verification_token_hash")]
    public string VerificationTokenHash { get; set; } = string.Empty;

    [Column("code_hash")]
    public string CodeHash { get; set; } = string.Empty;

    [Column("created_at")]
    public DateTimeOffset CreatedAt { get; set; }

    [Column("expires_at")]
    public DateTimeOffset ExpiresAt { get; set; }

    [Column("last_sent_at")]
    public DateTimeOffset LastSentAt { get; set; }

    [Column("attempt_count")]
    public int AttemptCount { get; set; }

    [Column("verified_at")]
    public DateTimeOffset? VerifiedAt { get; set; }

    [Column("consumed_at")]
    public DateTimeOffset? ConsumedAt { get; set; }
}

[Table("qr_login_sessions")]
public class QrLoginSessionRecord
{
    [Column("id")]
    public int Id { get; set; }

    [Column("session_id")]
    public string SessionId { get; set; } = string.Empty;

    [Column("browser_token_hash")]
    public string BrowserTokenHash { get; set; } = string.Empty;

    [Column("scanner_token_hash")]
    public string ScannerTokenHash { get; set; } = string.Empty;

    [Column("created_at")]
    public DateTimeOffset CreatedAt { get; set; }

    [Column("expires_at")]
    public DateTimeOffset ExpiresAt { get; set; }

    [Column("approved_at")]
    public DateTimeOffset? ApprovedAt { get; set; }

    [Column("approved_user_id")]
    public int? ApprovedUserId { get; set; }

    [Column("consumed_at")]
    public DateTimeOffset? ConsumedAt { get; set; }

    [Column("canceled_at")]
    public DateTimeOffset? CanceledAt { get; set; }

    [Column("requested_ip")]
    public string RequestedIp { get; set; } = string.Empty;

    [Column("requested_user_agent")]
    public string RequestedUserAgent { get; set; } = string.Empty;

    [Column("approved_ip")]
    public string? ApprovedIp { get; set; }

    [Column("approved_user_agent")]
    public string? ApprovedUserAgent { get; set; }

    public User? ApprovedUser { get; set; }
}

[Table("phone_verification_codes")]
public class PhoneVerificationCodeRecord
{
    [Column("id")]
    public int Id { get; set; }

    [Column("phone_number")]
    public string PhoneNumber { get; set; } = string.Empty;

    [Column("verification_token_hash")]
    public string VerificationTokenHash { get; set; } = string.Empty;

    [Column("code_hash")]
    public string CodeHash { get; set; } = string.Empty;

    [Column("created_at")]
    public DateTimeOffset CreatedAt { get; set; }

    [Column("expires_at")]
    public DateTimeOffset ExpiresAt { get; set; }

    [Column("last_sent_at")]
    public DateTimeOffset LastSentAt { get; set; }

    [Column("attempt_count")]
    public int AttemptCount { get; set; }

    [Column("verified_at")]
    public DateTimeOffset? VerifiedAt { get; set; }

    [Column("consumed_at")]
    public DateTimeOffset? ConsumedAt { get; set; }
}

[Table("refresh_tokens")]
public class RefreshTokenRecord
{
    [Column("id")]
    public int Id { get; set; }

    [Column("user_id")]
    public int UserId { get; set; }

    [Column("token_hash")]
    public string TokenHash { get; set; } = string.Empty;

    [Column("created_at")]
    public DateTimeOffset CreatedAt { get; set; }

    [Column("expires_at")]
    public DateTimeOffset ExpiresAt { get; set; }

    [Column("revoked_at")]
    public DateTimeOffset? RevokedAt { get; set; }

    [Column("replaced_by_token_hash")]
    public string? ReplacedByTokenHash { get; set; }

    [Column("user_agent")]
    public string UserAgent { get; set; } = string.Empty;

    [Column("device_label")]
    public string DeviceLabel { get; set; } = string.Empty;

    [Column("last_ip")]
    public string LastIp { get; set; } = string.Empty;

    [Column("last_used_at")]
    public DateTimeOffset LastUsedAt { get; set; }

    public User? User { get; set; }
}

[Table("shared_server_snapshots")]
public class SharedServerSnapshotRecord
{
    [Column("id")]
    public int Id { get; set; }

    [Column("server_id")]
    public string ServerId { get; set; } = string.Empty;

    [Column("owner_user_id")]
    public string OwnerUserId { get; set; } = string.Empty;

    [Column("snapshot_json")]
    public string SnapshotJson { get; set; } = "{}";

    [Column("created_at")]
    public DateTimeOffset CreatedAt { get; set; }

    [Column("updated_at")]
    public DateTimeOffset UpdatedAt { get; set; }
}

[Table("server_invites")]
public class ServerInviteRecordEntity
{
    [Column("id")]
    public int Id { get; set; }

    [Column("code")]
    public string Code { get; set; } = string.Empty;

    [Column("owner_user_id")]
    public string OwnerUserId { get; set; } = string.Empty;

    [Column("created_at")]
    public DateTimeOffset CreatedAt { get; set; }

    [Column("expires_at")]
    public DateTimeOffset ExpiresAt { get; set; }

    [Column("snapshot_json")]
    public string SnapshotJson { get; set; } = "{}";

    [Column("redeemed_user_ids_json")]
    public string RedeemedUserIdsJson { get; set; } = "[]";
}

[Table("friendships")]
public class FriendshipRecord
{
    [Column("id")]
    public int Id { get; set; }

    [Column("user_low_id")]
    public int UserLowId { get; set; }

    [Column("user_high_id")]
    public int UserHighId { get; set; }

    [Column("created_at")]
    public DateTimeOffset CreatedAt { get; set; }
}

[Table("friend_requests")]
public class FriendRequestRecord
{
    [Column("id")]
    public int Id { get; set; }

    [Column("sender_user_id")]
    public int SenderUserId { get; set; }

    [Column("receiver_user_id")]
    public int ReceiverUserId { get; set; }

    [Column("user_low_id")]
    public int UserLowId { get; set; }

    [Column("user_high_id")]
    public int UserHighId { get; set; }

    [Column("status")]
    public string Status { get; set; } = "pending";

    [Column("created_at")]
    public DateTimeOffset CreatedAt { get; set; }

    [Column("responded_at")]
    public DateTimeOffset? RespondedAt { get; set; }
}

[Table("user_blocks")]
public class UserBlockRecord
{
    [Column("id")]
    public int Id { get; set; }

    [Column("blocker_user_id")]
    public int BlockerUserId { get; set; }

    [Column("blocked_user_id")]
    public int BlockedUserId { get; set; }

    [Column("created_at")]
    public DateTimeOffset CreatedAt { get; set; }
}

[Table("group_conversations")]
public class GroupConversationRecord
{
    [Column("id")]
    public int Id { get; set; }

    [Column("owner_user_id")]
    public int OwnerUserId { get; set; }

    [Column("title")]
    public string Title { get; set; } = string.Empty;

    [Column("avatar_url")]
    public string? AvatarUrl { get; set; }

    [Column("created_at")]
    public DateTimeOffset CreatedAt { get; set; }

    [Column("updated_at")]
    public DateTimeOffset UpdatedAt { get; set; }

    [Column("active_call_channel")]
    public string? ActiveCallChannel { get; set; }

    [Column("active_call_started_at")]
    public DateTimeOffset? ActiveCallStartedAt { get; set; }
}

[Table("group_conversation_members")]
public class GroupConversationMemberRecord
{
    [Column("id")]
    public int Id { get; set; }

    [Column("conversation_id")]
    public int ConversationId { get; set; }

    [Column("user_id")]
    public int UserId { get; set; }

    [Column("role")]
    public string Role { get; set; } = "member";

    [Column("joined_at")]
    public DateTimeOffset JoinedAt { get; set; }

    [Column("last_read_at")]
    public DateTimeOffset? LastReadAt { get; set; }

    [Column("added_by_user_id")]
    public int? AddedByUserId { get; set; }

    [Column("muted_until")]
    public DateTimeOffset? MutedUntil { get; set; }

    [Column("is_banned")]
    public bool IsBanned { get; set; }

    [Column("banned_at")]
    public DateTimeOffset? BannedAt { get; set; }

    [Column("banned_by_user_id")]
    public int? BannedByUserId { get; set; }
}

[Table("message_reactions")]
public class MessageReactionRecord
{
    [Column("id")]
    public int Id { get; set; }

    [Column("message_id")]
    public int MessageId { get; set; }

    [Column("channel_id")]
    public string ChannelId { get; set; } = string.Empty;

    [Column("reactor_user_id")]
    public string ReactorUserId { get; set; } = string.Empty;

    [Column("reaction_key")]
    public string ReactionKey { get; set; } = string.Empty;

    [Column("reaction_glyph")]
    public string ReactionGlyph { get; set; } = string.Empty;

    [Column("created_at")]
    public DateTimeOffset CreatedAt { get; set; }
}

[Table("push_subscriptions")]
public class PushSubscriptionRecord
{
    [Column("id")]
    public int Id { get; set; }

    [Column("user_id")]
    public int UserId { get; set; }

    [Column("endpoint")]
    public string Endpoint { get; set; } = string.Empty;

    [Column("p256dh_key")]
    public string P256dhKey { get; set; } = string.Empty;

    [Column("auth_key")]
    public string AuthKey { get; set; } = string.Empty;

    [Column("user_agent")]
    public string UserAgent { get; set; } = string.Empty;

    [Column("device_label")]
    public string DeviceLabel { get; set; } = string.Empty;

    [Column("created_at")]
    public DateTimeOffset CreatedAt { get; set; }

    [Column("updated_at")]
    public DateTimeOffset UpdatedAt { get; set; }

    [Column("last_success_at")]
    public DateTimeOffset? LastSuccessAt { get; set; }

    [Column("last_failure_at")]
    public DateTimeOffset? LastFailureAt { get; set; }

    [Column("last_failure_reason")]
    public string? LastFailureReason { get; set; }

    [Column("is_active")]
    public bool IsActive { get; set; }
}

[Table("user_integrations")]
public class UserIntegrationRecord
{
    [Column("id")]
    public int Id { get; set; }

    [Column("user_id")]
    public int UserId { get; set; }

    [Column("provider")]
    public string Provider { get; set; } = string.Empty;

    [Column("display_name")]
    public string DisplayName { get; set; } = string.Empty;

    [Column("external_user_id")]
    public string ExternalUserId { get; set; } = string.Empty;

    [Column("display_in_profile")]
    public bool DisplayInProfile { get; set; } = true;

    [Column("use_as_status")]
    public bool UseAsStatus { get; set; } = true;

    [Column("activity_kind")]
    public string ActivityKind { get; set; } = string.Empty;

    [Column("activity_title")]
    public string ActivityTitle { get; set; } = string.Empty;

    [Column("activity_subtitle")]
    public string ActivitySubtitle { get; set; } = string.Empty;

    [Column("activity_details")]
    public string ActivityDetails { get; set; } = string.Empty;

    [Column("activity_updated_at")]
    public DateTimeOffset? ActivityUpdatedAt { get; set; }

    [Column("access_token_encrypted")]
    public string AccessTokenEncrypted { get; set; } = string.Empty;

    [Column("refresh_token_encrypted")]
    public string RefreshTokenEncrypted { get; set; } = string.Empty;

    [Column("token_expires_at")]
    public DateTimeOffset? TokenExpiresAt { get; set; }

    [Column("connected_at")]
    public DateTimeOffset ConnectedAt { get; set; }

    [Column("updated_at")]
    public DateTimeOffset UpdatedAt { get; set; }

    public User? User { get; set; }
}


public class AppDbContext : DbContext
{
    public AppDbContext(DbContextOptions<AppDbContext> options) : base(options)
    {
    }

    public DbSet<Message> Messages => Set<Message>();
    public DbSet<User> Users => Set<User>();
    public DbSet<RefreshTokenRecord> RefreshTokens => Set<RefreshTokenRecord>();
    public DbSet<SharedServerSnapshotRecord> SharedServerSnapshots => Set<SharedServerSnapshotRecord>();
    public DbSet<ServerInviteRecordEntity> ServerInvites => Set<ServerInviteRecordEntity>();
    public DbSet<FriendshipRecord> Friendships => Set<FriendshipRecord>();
    public DbSet<FriendRequestRecord> FriendRequests => Set<FriendRequestRecord>();
    public DbSet<UserBlockRecord> UserBlocks => Set<UserBlockRecord>();
    public DbSet<GroupConversationRecord> GroupConversations => Set<GroupConversationRecord>();
    public DbSet<GroupConversationMemberRecord> GroupConversationMembers => Set<GroupConversationMemberRecord>();
    public DbSet<PhoneVerificationCodeRecord> PhoneVerificationCodes => Set<PhoneVerificationCodeRecord>();
    public DbSet<EmailVerificationCodeRecord> EmailVerificationCodes => Set<EmailVerificationCodeRecord>();
    public DbSet<QrLoginSessionRecord> QrLoginSessions => Set<QrLoginSessionRecord>();
    public DbSet<MessageReactionRecord> MessageReactions => Set<MessageReactionRecord>();
    public DbSet<PushSubscriptionRecord> PushSubscriptions => Set<PushSubscriptionRecord>();
    public DbSet<UserIntegrationRecord> UserIntegrations => Set<UserIntegrationRecord>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        base.OnModelCreating(modelBuilder);

        modelBuilder.Entity<Message>(entity =>
        {
            entity.ToTable("chatmessages");
            entity.HasKey(x => x.Id);
            entity.HasIndex(x => new { x.ChannelId, x.Timestamp });
            entity.HasIndex(x => new { x.ChannelId, x.Id });
            entity.HasIndex(x => x.Timestamp);
        });

        modelBuilder.Entity<MessageReactionRecord>(entity =>
        {
            entity.ToTable("message_reactions");
            entity.HasKey(x => x.Id);
            entity.HasIndex(x => new { x.MessageId, x.ReactionKey });
            entity.HasIndex(x => new { x.ChannelId, x.CreatedAt });
            entity.HasIndex(x => new { x.MessageId, x.ReactorUserId, x.ReactionKey }).IsUnique();
            entity.Property(x => x.ChannelId).IsRequired();
            entity.Property(x => x.ReactorUserId).IsRequired();
            entity.Property(x => x.ReactionKey).IsRequired();
            entity.Property(x => x.ReactionGlyph).IsRequired();
        });

        modelBuilder.Entity<GroupConversationRecord>(entity =>
        {
            entity.ToTable("group_conversations");
            entity.HasKey(x => x.Id);
            entity.HasIndex(x => x.OwnerUserId);
            entity.HasIndex(x => x.UpdatedAt);
            entity.Property(x => x.Title).IsRequired();
        });

        modelBuilder.Entity<GroupConversationMemberRecord>(entity =>
        {
            entity.ToTable("group_conversation_members");
            entity.HasKey(x => x.Id);
            entity.HasIndex(x => new { x.ConversationId, x.UserId }).IsUnique();
            entity.HasIndex(x => new { x.UserId, x.IsBanned });
            entity.HasIndex(x => new { x.ConversationId, x.IsBanned });
            entity.Property(x => x.Role).IsRequired();
            entity.Property(x => x.IsBanned).HasDefaultValue(false);
        });

        modelBuilder.Entity<PushSubscriptionRecord>(entity =>
        {
            entity.ToTable("push_subscriptions");
            entity.HasKey(x => x.Id);
            entity.HasIndex(x => x.Endpoint).IsUnique();
            entity.HasIndex(x => new { x.UserId, x.IsActive, x.UpdatedAt });
            entity.Property(x => x.Endpoint).IsRequired();
            entity.Property(x => x.P256dhKey).IsRequired();
            entity.Property(x => x.AuthKey).IsRequired();
            entity.Property(x => x.UserAgent).IsRequired();
            entity.Property(x => x.DeviceLabel).IsRequired();
            entity.Property(x => x.IsActive).HasDefaultValue(true);
        });

        modelBuilder.Entity<UserIntegrationRecord>(entity =>
        {
            entity.ToTable("user_integrations");
            entity.HasKey(x => x.Id);
            entity.HasIndex(x => new { x.UserId, x.Provider }).IsUnique();
            entity.HasIndex(x => new { x.UserId, x.UseAsStatus, x.ActivityUpdatedAt });
            entity.Property(x => x.Provider).IsRequired();
            entity.Property(x => x.DisplayName).IsRequired();
            entity.Property(x => x.ExternalUserId).IsRequired();
            entity.Property(x => x.DisplayInProfile).HasDefaultValue(true);
            entity.Property(x => x.UseAsStatus).HasDefaultValue(true);
            entity.Property(x => x.ActivityKind).IsRequired();
            entity.Property(x => x.ActivityTitle).IsRequired();
            entity.Property(x => x.ActivitySubtitle).IsRequired();
            entity.Property(x => x.ActivityDetails).IsRequired();
            entity.Property(x => x.AccessTokenEncrypted).IsRequired();
            entity.Property(x => x.RefreshTokenEncrypted).IsRequired();
        });


        modelBuilder.Entity<User>(entity =>
        {
            entity.ToTable("users");
            entity.HasKey(x => x.id);
            entity.HasIndex(x => x.email).IsUnique();
            entity.HasIndex(x => x.phone_number).IsUnique();
            entity.Property(x => x.first_name).IsRequired();
            entity.Property(x => x.last_name).IsRequired();
            entity.Property(x => x.nickname).IsRequired();
            entity.Property(x => x.email).IsRequired(false);
            entity.Property(x => x.is_email_verified).HasDefaultValue(true);
            entity.Property(x => x.phone_number).IsRequired(false);
            entity.Property(x => x.is_phone_verified).HasDefaultValue(false);
            entity.Property(x => x.totp_secret).IsRequired(false);
            entity.Property(x => x.is_totp_enabled).HasDefaultValue(false);
            entity.Property(x => x.totp_enabled_at).IsRequired(false);
            entity.Property(x => x.avatar_url).IsRequired(false);
            entity.Property(x => x.avatar_frame_json).IsRequired(false);
            entity.Property(x => x.profile_background_url).IsRequired(false);
            entity.Property(x => x.profile_background_frame_json).IsRequired(false);
            entity.Property(x => x.last_seen_at).IsRequired(false);
            entity.Property(x => x.password_hash).IsRequired();
        });

        modelBuilder.Entity<FriendRequestRecord>(entity =>
        {
            entity.ToTable("friend_requests");
            entity.HasKey(x => x.Id);
            entity.HasIndex(x => new { x.UserLowId, x.UserHighId })
                .IsUnique()
                .HasFilter("status = 'pending'");
            entity.HasIndex(x => new { x.ReceiverUserId, x.Status, x.CreatedAt });
            entity.HasIndex(x => new { x.SenderUserId, x.Status, x.CreatedAt });
            entity.Property(x => x.Status).IsRequired();
        });

        modelBuilder.Entity<UserBlockRecord>(entity =>
        {
            entity.ToTable("user_blocks");
            entity.HasKey(x => x.Id);
            entity.HasIndex(x => new { x.BlockerUserId, x.BlockedUserId }).IsUnique();
            entity.HasIndex(x => x.BlockerUserId);
            entity.HasIndex(x => x.BlockedUserId);
        });

        modelBuilder.Entity<EmailVerificationCodeRecord>(entity =>
        {
            entity.ToTable("email_verification_codes");
            entity.HasKey(x => x.Id);
            entity.HasIndex(x => x.UserId);
            entity.HasIndex(x => x.Email);
            entity.HasIndex(x => x.VerificationTokenHash).IsUnique();
            entity.Property(x => x.Email).IsRequired();
            entity.Property(x => x.VerificationTokenHash).IsRequired();
            entity.Property(x => x.CodeHash).IsRequired();
        });

        modelBuilder.Entity<QrLoginSessionRecord>(entity =>
        {
            entity.ToTable("qr_login_sessions");
            entity.HasKey(x => x.Id);
            entity.HasIndex(x => x.SessionId).IsUnique();
            entity.HasIndex(x => x.BrowserTokenHash).IsUnique();
            entity.HasIndex(x => new { x.ExpiresAt, x.ConsumedAt });
            entity.Property(x => x.SessionId).IsRequired().HasMaxLength(64);
            entity.Property(x => x.BrowserTokenHash).IsRequired();
            entity.Property(x => x.ScannerTokenHash).IsRequired();
            entity.Property(x => x.RequestedIp).IsRequired();
            entity.Property(x => x.RequestedUserAgent).IsRequired();
            entity.HasOne(x => x.ApprovedUser)
                .WithMany()
                .HasForeignKey(x => x.ApprovedUserId)
                .OnDelete(DeleteBehavior.SetNull);
        });

        modelBuilder.Entity<PhoneVerificationCodeRecord>(entity =>
        {
            entity.ToTable("phone_verification_codes");
            entity.HasKey(x => x.Id);
            entity.HasIndex(x => new { x.PhoneNumber, x.CreatedAt });
            entity.HasIndex(x => x.VerificationTokenHash).IsUnique();
            entity.Property(x => x.PhoneNumber).IsRequired();
            entity.Property(x => x.VerificationTokenHash).IsRequired();
            entity.Property(x => x.CodeHash).IsRequired();
        });

        modelBuilder.Entity<RefreshTokenRecord>(entity =>
        {
            entity.ToTable("refresh_tokens");
            entity.HasKey(x => x.Id);
            entity.HasIndex(x => x.TokenHash).IsUnique();
            entity.HasIndex(x => new { x.UserId, x.ExpiresAt });
            entity.Property(x => x.TokenHash).IsRequired();
            entity.HasOne(x => x.User)
                .WithMany()
                .HasForeignKey(x => x.UserId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<SharedServerSnapshotRecord>(entity =>
        {
            entity.ToTable("shared_server_snapshots");
            entity.HasKey(x => x.Id);
            entity.HasIndex(x => x.ServerId).IsUnique();
            entity.HasIndex(x => x.OwnerUserId);
            entity.Property(x => x.ServerId).IsRequired();
            entity.Property(x => x.OwnerUserId).IsRequired();
            entity.Property(x => x.SnapshotJson).IsRequired();
        });

        modelBuilder.Entity<ServerInviteRecordEntity>(entity =>
        {
            entity.ToTable("server_invites");
            entity.HasKey(x => x.Id);
            entity.HasIndex(x => x.Code).IsUnique();
            entity.HasIndex(x => new { x.OwnerUserId, x.ExpiresAt });
            entity.Property(x => x.Code).IsRequired().HasMaxLength(20);
            entity.Property(x => x.OwnerUserId).IsRequired();
            entity.Property(x => x.SnapshotJson).IsRequired();
            entity.Property(x => x.RedeemedUserIdsJson).IsRequired();
        });

        modelBuilder.Entity<FriendshipRecord>(entity =>
        {
            entity.ToTable("friendships");
            entity.HasKey(x => x.Id);
            entity.HasIndex(x => new { x.UserLowId, x.UserHighId }).IsUnique();
            entity.HasIndex(x => x.CreatedAt);
        });
    }
}
