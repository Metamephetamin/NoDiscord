//using Microsoft.EntityFrameworkCore;
//using System;
//using System.ComponentModel.DataAnnotations.Schema;

//[Table("chatmessages")] // указываем существующую таблицу
//public class Message
//{
//    [Column("id")]
//    public int Id { get; set; }

//    [Column("channelid")]
//    public string ChannelId { get; set; } = null!;

//    [Column("username")]
//    public string Username { get; set; } = null!;

//    // ❗ СТАРОЕ ПОЛЕ — НЕ ИСПОЛЬЗУЕМ ДЛЯ НОВЫХ
//    [Column("message")]
//    public string? Content { get; set; }

//    // 🔐 НОВОЕ ПОЛЕ
//    [Column("message_encrypted")]
//    public string? EncryptedContent { get; set; }

//    [Column("photourl")]
//    public string? PhotoUrl { get; set; }

//    [Column("timestamp")]
//    public DateTime Timestamp { get; set; }

//    [Column("is_deleted")]
//    public bool IsDeleted { get; set; }
//}


//public class AppDbContext : DbContext
//{
//    public AppDbContext(DbContextOptions<AppDbContext> options) : base(options) { }

//    public DbSet<Message> Messages { get; set; } = null!;

//    protected override void OnModelCreating(ModelBuilder modelBuilder)
//    {
//        base.OnModelCreating(modelBuilder);

//        // явное соответствие класса и таблицы (альтернатива атрибуту)
//        modelBuilder.Entity<Message>().ToTable("chatmessages");
//    }
//}


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

public class AppDbContext : DbContext
{
    public AppDbContext(DbContextOptions<AppDbContext> options) : base(options)
    {
    }

    public DbSet<Message> Messages => Set<Message>();
    public DbSet<User> Users => Set<User>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        base.OnModelCreating(modelBuilder);

        modelBuilder.Entity<Message>(entity =>
        {
            entity.ToTable("chatmessages");
            entity.HasKey(x => x.Id);
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
    }
}
