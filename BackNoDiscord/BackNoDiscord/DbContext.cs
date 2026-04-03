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

    [Column("email")]
    public string? email { get; set; }

    [Column("is_email_verified")]
    public bool is_email_verified { get; set; }

    [Column("phone_number")]
    public string? phone_number { get; set; }

    [Column("is_phone_verified")]
    public bool is_phone_verified { get; set; }

    [Column("avatar_url")]
    public string? avatar_url { get; set; }

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

[Table("user_e2ee_keys")]
public class UserE2eeKeyRecord
{
    [Column("id")]
    public int Id { get; set; }

    [Column("user_id")]
    public int UserId { get; set; }

    [Column("algorithm")]
    public string Algorithm { get; set; } = "ECDH-P256";

    [Column("public_key_jwk")]
    public string PublicKeyJwk { get; set; } = "{}";

    [Column("fingerprint")]
    public string Fingerprint { get; set; } = string.Empty;

    [Column("created_at")]
    public DateTimeOffset CreatedAt { get; set; }

    [Column("updated_at")]
    public DateTimeOffset UpdatedAt { get; set; }
}

[Table("channel_e2ee_daily_keys")]
public class ChannelE2eeDailyKeyRecord
{
    [Column("id")]
    public int Id { get; set; }

    [Column("scope")]
    public string Scope { get; set; } = "text";

    [Column("channel_id")]
    public string ChannelId { get; set; } = string.Empty;

    [Column("key_date")]
    public string KeyDate { get; set; } = string.Empty;

    [Column("recipient_user_id")]
    public int RecipientUserId { get; set; }

    [Column("creator_user_id")]
    public int CreatorUserId { get; set; }

    [Column("creator_fingerprint")]
    public string CreatorFingerprint { get; set; } = string.Empty;

    [Column("creator_public_key_jwk")]
    public string CreatorPublicKeyJwk { get; set; } = "{}";

    [Column("wrap_iv")]
    public string WrapIv { get; set; } = string.Empty;

    [Column("wrapped_key")]
    public string WrappedKey { get; set; } = string.Empty;

    [Column("created_at")]
    public DateTimeOffset CreatedAt { get; set; }

    [Column("updated_at")]
    public DateTimeOffset UpdatedAt { get; set; }
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
    public DbSet<PhoneVerificationCodeRecord> PhoneVerificationCodes => Set<PhoneVerificationCodeRecord>();
    public DbSet<EmailVerificationCodeRecord> EmailVerificationCodes => Set<EmailVerificationCodeRecord>();
    public DbSet<MessageReactionRecord> MessageReactions => Set<MessageReactionRecord>();
    public DbSet<UserE2eeKeyRecord> UserE2eeKeys => Set<UserE2eeKeyRecord>();
    public DbSet<ChannelE2eeDailyKeyRecord> ChannelE2eeDailyKeys => Set<ChannelE2eeDailyKeyRecord>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        base.OnModelCreating(modelBuilder);

        modelBuilder.Entity<Message>(entity =>
        {
            entity.ToTable("chatmessages");
            entity.HasKey(x => x.Id);
            entity.HasIndex(x => new { x.ChannelId, x.Timestamp });
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

        modelBuilder.Entity<UserE2eeKeyRecord>(entity =>
        {
            entity.ToTable("user_e2ee_keys");
            entity.HasKey(x => x.Id);
            entity.HasIndex(x => x.UserId).IsUnique();
            entity.HasIndex(x => x.Fingerprint);
            entity.Property(x => x.Algorithm).IsRequired();
            entity.Property(x => x.PublicKeyJwk).IsRequired();
            entity.Property(x => x.Fingerprint).IsRequired();
        });

        modelBuilder.Entity<ChannelE2eeDailyKeyRecord>(entity =>
        {
            entity.ToTable("channel_e2ee_daily_keys");
            entity.HasKey(x => x.Id);
            entity.HasIndex(x => new { x.Scope, x.ChannelId, x.KeyDate, x.RecipientUserId }).IsUnique();
            entity.HasIndex(x => new { x.Scope, x.ChannelId, x.KeyDate });
            entity.Property(x => x.Scope).IsRequired();
            entity.Property(x => x.ChannelId).IsRequired();
            entity.Property(x => x.KeyDate).IsRequired();
            entity.Property(x => x.CreatorFingerprint).IsRequired();
            entity.Property(x => x.CreatorPublicKeyJwk).IsRequired();
            entity.Property(x => x.WrapIv).IsRequired();
            entity.Property(x => x.WrappedKey).IsRequired();
        });

        modelBuilder.Entity<User>(entity =>
        {
            entity.ToTable("users");
            entity.HasKey(x => x.id);
            entity.HasIndex(x => x.email).IsUnique();
            entity.HasIndex(x => x.phone_number).IsUnique();
            entity.Property(x => x.first_name).IsRequired();
            entity.Property(x => x.last_name).IsRequired();
            entity.Property(x => x.email).IsRequired(false);
            entity.Property(x => x.is_email_verified).HasDefaultValue(true);
            entity.Property(x => x.phone_number).IsRequired(false);
            entity.Property(x => x.is_phone_verified).HasDefaultValue(false);
            entity.Property(x => x.avatar_url).IsRequired(false);
            entity.Property(x => x.password_hash).IsRequired();
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
            entity.Property(x => x.Code).IsRequired();
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
