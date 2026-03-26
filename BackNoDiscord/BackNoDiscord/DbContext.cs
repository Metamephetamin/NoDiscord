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
    public string email { get; set; } = null!;

    [Column("password_hash")]
    public string password_hash { get; set; } = null!;
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

        modelBuilder.Entity<User>(entity =>
        {
            entity.ToTable("users");
            entity.HasKey(x => x.id);
            entity.HasIndex(x => x.email).IsUnique();
            entity.Property(x => x.first_name).IsRequired();
            entity.Property(x => x.last_name).IsRequired();
            entity.Property(x => x.email).IsRequired();
            entity.Property(x => x.password_hash).IsRequired();
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
