using System;
using Microsoft.EntityFrameworkCore.Migrations;
using Npgsql.EntityFrameworkCore.PostgreSQL.Metadata;

#nullable disable

namespace BackNoDiscord.Migrations
{
    /// <inheritdoc />
    public partial class BaselineProductionSchema : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "banned_identity_records",
                columns: table => new
                {
                    id = table.Column<int>(type: "integer", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    identity_type = table.Column<string>(type: "text", nullable: false),
                    identity_hash = table.Column<string>(type: "text", nullable: false),
                    source_user_id = table.Column<int>(type: "integer", nullable: false),
                    created_by_user_id = table.Column<int>(type: "integer", nullable: true),
                    created_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    revoked_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    revoked_by_user_id = table.Column<int>(type: "integer", nullable: true),
                    last_matched_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    match_count = table.Column<int>(type: "integer", nullable: false, defaultValue: 0),
                    reason = table.Column<string>(type: "text", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_banned_identity_records", x => x.id);
                });

            migrationBuilder.CreateTable(
                name: "chat_channel_read_states",
                columns: table => new
                {
                    id = table.Column<int>(type: "integer", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    user_id = table.Column<string>(type: "text", nullable: false),
                    channel_id = table.Column<string>(type: "text", nullable: false),
                    last_read_message_id = table.Column<int>(type: "integer", nullable: true),
                    last_read_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    updated_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_chat_channel_read_states", x => x.id);
                });

            migrationBuilder.CreateTable(
                name: "chat_file_uploads",
                columns: table => new
                {
                    id = table.Column<int>(type: "integer", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    file_name = table.Column<string>(type: "text", nullable: false),
                    owner_user_id = table.Column<string>(type: "text", nullable: false),
                    display_file_name = table.Column<string>(type: "text", nullable: false),
                    content_type = table.Column<string>(type: "text", nullable: false),
                    size = table.Column<long>(type: "bigint", nullable: false),
                    channel_id = table.Column<string>(type: "text", nullable: true),
                    message_id = table.Column<int>(type: "integer", nullable: true),
                    created_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    bound_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    checksum_sha256 = table.Column<string>(type: "text", nullable: false),
                    deleted_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_chat_file_uploads", x => x.id);
                });

            migrationBuilder.CreateTable(
                name: "chat_moderation_actions",
                columns: table => new
                {
                    id = table.Column<int>(type: "integer", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    server_id = table.Column<string>(type: "text", nullable: false),
                    actor_user_id = table.Column<string>(type: "text", nullable: false),
                    target_user_id = table.Column<string>(type: "text", nullable: false),
                    action_type = table.Column<string>(type: "text", nullable: false),
                    reason = table.Column<string>(type: "text", nullable: false),
                    created_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    expires_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    revoked_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    revoked_by_user_id = table.Column<string>(type: "text", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_chat_moderation_actions", x => x.id);
                });

            migrationBuilder.CreateTable(
                name: "chat_moderation_reports",
                columns: table => new
                {
                    id = table.Column<int>(type: "integer", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    server_id = table.Column<string>(type: "text", nullable: false),
                    channel_id = table.Column<string>(type: "text", nullable: false),
                    message_id = table.Column<int>(type: "integer", nullable: true),
                    reporter_user_id = table.Column<string>(type: "text", nullable: false),
                    target_user_id = table.Column<string>(type: "text", nullable: false),
                    reason = table.Column<string>(type: "text", nullable: false),
                    status = table.Column<string>(type: "text", nullable: false),
                    created_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    reviewed_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    reviewed_by_user_id = table.Column<string>(type: "text", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_chat_moderation_reports", x => x.id);
                });

            migrationBuilder.CreateTable(
                name: "chatmessages",
                columns: table => new
                {
                    id = table.Column<int>(type: "integer", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    channelid = table.Column<string>(type: "text", nullable: false),
                    username = table.Column<string>(type: "text", nullable: false),
                    message = table.Column<string>(type: "text", nullable: true),
                    message_encrypted = table.Column<string>(type: "text", nullable: true),
                    photourl = table.Column<string>(type: "text", nullable: true),
                    author_user_id = table.Column<string>(type: "text", nullable: true),
                    client_message_id = table.Column<string>(type: "text", nullable: true),
                    timestamp = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    read_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    read_by_user_id = table.Column<string>(type: "text", nullable: true),
                    is_deleted = table.Column<bool>(type: "boolean", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_chatmessages", x => x.id);
                });

            migrationBuilder.CreateTable(
                name: "email_verification_codes",
                columns: table => new
                {
                    id = table.Column<int>(type: "integer", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    user_id = table.Column<int>(type: "integer", nullable: false),
                    email = table.Column<string>(type: "text", nullable: false),
                    purpose = table.Column<string>(type: "text", nullable: false),
                    verification_token_hash = table.Column<string>(type: "text", nullable: false),
                    code_hash = table.Column<string>(type: "text", nullable: false),
                    created_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    expires_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    last_sent_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    attempt_count = table.Column<int>(type: "integer", nullable: false),
                    verified_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    consumed_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_email_verification_codes", x => x.id);
                });

            migrationBuilder.CreateTable(
                name: "friend_requests",
                columns: table => new
                {
                    id = table.Column<int>(type: "integer", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    sender_user_id = table.Column<int>(type: "integer", nullable: false),
                    receiver_user_id = table.Column<int>(type: "integer", nullable: false),
                    user_low_id = table.Column<int>(type: "integer", nullable: false),
                    user_high_id = table.Column<int>(type: "integer", nullable: false),
                    status = table.Column<string>(type: "text", nullable: false),
                    created_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    responded_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_friend_requests", x => x.id);
                });

            migrationBuilder.CreateTable(
                name: "friendships",
                columns: table => new
                {
                    id = table.Column<int>(type: "integer", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    user_low_id = table.Column<int>(type: "integer", nullable: false),
                    user_high_id = table.Column<int>(type: "integer", nullable: false),
                    created_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_friendships", x => x.id);
                });

            migrationBuilder.CreateTable(
                name: "group_conversation_members",
                columns: table => new
                {
                    id = table.Column<int>(type: "integer", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    conversation_id = table.Column<int>(type: "integer", nullable: false),
                    user_id = table.Column<int>(type: "integer", nullable: false),
                    role = table.Column<string>(type: "text", nullable: false),
                    joined_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    last_read_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    added_by_user_id = table.Column<int>(type: "integer", nullable: true),
                    muted_until = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    is_banned = table.Column<bool>(type: "boolean", nullable: false, defaultValue: false),
                    banned_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    banned_by_user_id = table.Column<int>(type: "integer", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_group_conversation_members", x => x.id);
                });

            migrationBuilder.CreateTable(
                name: "group_conversations",
                columns: table => new
                {
                    id = table.Column<int>(type: "integer", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    owner_user_id = table.Column<int>(type: "integer", nullable: false),
                    title = table.Column<string>(type: "text", nullable: false),
                    avatar_url = table.Column<string>(type: "text", nullable: true),
                    created_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    updated_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    active_call_channel = table.Column<string>(type: "text", nullable: true),
                    active_call_started_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_group_conversations", x => x.id);
                });

            migrationBuilder.CreateTable(
                name: "message_reactions",
                columns: table => new
                {
                    id = table.Column<int>(type: "integer", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    message_id = table.Column<int>(type: "integer", nullable: false),
                    channel_id = table.Column<string>(type: "text", nullable: false),
                    reactor_user_id = table.Column<string>(type: "text", nullable: false),
                    reaction_key = table.Column<string>(type: "text", nullable: false),
                    reaction_glyph = table.Column<string>(type: "text", nullable: false),
                    created_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_message_reactions", x => x.id);
                });

            migrationBuilder.CreateTable(
                name: "phone_verification_codes",
                columns: table => new
                {
                    id = table.Column<int>(type: "integer", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    phone_number = table.Column<string>(type: "text", nullable: false),
                    verification_token_hash = table.Column<string>(type: "text", nullable: false),
                    code_hash = table.Column<string>(type: "text", nullable: false),
                    created_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    expires_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    last_sent_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    attempt_count = table.Column<int>(type: "integer", nullable: false),
                    verified_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    consumed_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_phone_verification_codes", x => x.id);
                });

            migrationBuilder.CreateTable(
                name: "push_subscriptions",
                columns: table => new
                {
                    id = table.Column<int>(type: "integer", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    user_id = table.Column<int>(type: "integer", nullable: false),
                    endpoint = table.Column<string>(type: "text", nullable: false),
                    p256dh_key = table.Column<string>(type: "text", nullable: false),
                    auth_key = table.Column<string>(type: "text", nullable: false),
                    user_agent = table.Column<string>(type: "text", nullable: false),
                    device_label = table.Column<string>(type: "text", nullable: false),
                    created_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    updated_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    last_success_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    last_failure_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    last_failure_reason = table.Column<string>(type: "text", nullable: true),
                    is_active = table.Column<bool>(type: "boolean", nullable: false, defaultValue: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_push_subscriptions", x => x.id);
                });

            migrationBuilder.CreateTable(
                name: "server_audit_logs",
                columns: table => new
                {
                    id = table.Column<int>(type: "integer", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    server_id = table.Column<string>(type: "text", nullable: false),
                    actor_user_id = table.Column<string>(type: "text", nullable: false),
                    action_type = table.Column<string>(type: "text", nullable: false),
                    target_id = table.Column<string>(type: "text", nullable: false),
                    metadata_json = table.Column<string>(type: "text", nullable: false),
                    created_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_server_audit_logs", x => x.id);
                });

            migrationBuilder.CreateTable(
                name: "server_invites",
                columns: table => new
                {
                    id = table.Column<int>(type: "integer", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    code = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                    owner_user_id = table.Column<string>(type: "text", nullable: false),
                    created_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    expires_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    snapshot_json = table.Column<string>(type: "text", nullable: false),
                    redeemed_user_ids_json = table.Column<string>(type: "text", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_server_invites", x => x.id);
                });

            migrationBuilder.CreateTable(
                name: "shared_server_snapshots",
                columns: table => new
                {
                    id = table.Column<int>(type: "integer", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    server_id = table.Column<string>(type: "text", nullable: false),
                    owner_user_id = table.Column<string>(type: "text", nullable: false),
                    snapshot_json = table.Column<string>(type: "text", nullable: false),
                    created_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    updated_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_shared_server_snapshots", x => x.id);
                });

            migrationBuilder.CreateTable(
                name: "user_blocks",
                columns: table => new
                {
                    id = table.Column<int>(type: "integer", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    blocker_user_id = table.Column<int>(type: "integer", nullable: false),
                    blocked_user_id = table.Column<int>(type: "integer", nullable: false),
                    created_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_user_blocks", x => x.id);
                });

            migrationBuilder.CreateTable(
                name: "user_reports",
                columns: table => new
                {
                    id = table.Column<int>(type: "integer", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    reporter_user_id = table.Column<int>(type: "integer", nullable: false),
                    target_user_id = table.Column<int>(type: "integer", nullable: false),
                    reason = table.Column<string>(type: "text", nullable: false),
                    status = table.Column<string>(type: "text", nullable: false),
                    created_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    reviewed_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    reviewed_by_user_id = table.Column<int>(type: "integer", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_user_reports", x => x.id);
                });

            migrationBuilder.CreateTable(
                name: "users",
                columns: table => new
                {
                    id = table.Column<int>(type: "integer", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    first_name = table.Column<string>(type: "text", nullable: false),
                    last_name = table.Column<string>(type: "text", nullable: false),
                    nickname = table.Column<string>(type: "text", nullable: false),
                    email = table.Column<string>(type: "text", nullable: true),
                    is_email_verified = table.Column<bool>(type: "boolean", nullable: false, defaultValue: true),
                    phone_number = table.Column<string>(type: "text", nullable: true),
                    is_phone_verified = table.Column<bool>(type: "boolean", nullable: false, defaultValue: false),
                    totp_secret = table.Column<string>(type: "text", nullable: true),
                    is_totp_enabled = table.Column<bool>(type: "boolean", nullable: false, defaultValue: false),
                    totp_enabled_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    avatar_url = table.Column<string>(type: "text", nullable: true),
                    avatar_frame_json = table.Column<string>(type: "text", nullable: true),
                    profile_background_url = table.Column<string>(type: "text", nullable: true),
                    profile_background_frame_json = table.Column<string>(type: "text", nullable: true),
                    profile_customization_json = table.Column<string>(type: "text", nullable: true),
                    last_seen_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    last_location_latitude = table.Column<double>(type: "double precision", nullable: true),
                    last_location_longitude = table.Column<double>(type: "double precision", nullable: true),
                    last_location_updated_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    last_location_expires_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    location_sharing_enabled = table.Column<bool>(type: "boolean", nullable: false, defaultValue: true),
                    location_visibility = table.Column<string>(type: "text", nullable: false, defaultValue: "public"),
                    terms_accepted_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    terms_version = table.Column<string>(type: "text", nullable: true),
                    privacy_version = table.Column<string>(type: "text", nullable: true),
                    is_banned = table.Column<bool>(type: "boolean", nullable: false, defaultValue: false),
                    banned_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    banned_by_user_id = table.Column<int>(type: "integer", nullable: true),
                    ban_reason = table.Column<string>(type: "text", nullable: true),
                    password_hash = table.Column<string>(type: "text", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_users", x => x.id);
                });

            migrationBuilder.CreateTable(
                name: "qr_login_sessions",
                columns: table => new
                {
                    id = table.Column<int>(type: "integer", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    session_id = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    browser_token_hash = table.Column<string>(type: "text", nullable: false),
                    scanner_token_hash = table.Column<string>(type: "text", nullable: false),
                    created_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    expires_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    approved_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    approved_user_id = table.Column<int>(type: "integer", nullable: true),
                    consumed_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    canceled_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    requested_ip = table.Column<string>(type: "text", nullable: false),
                    requested_user_agent = table.Column<string>(type: "text", nullable: false),
                    approved_ip = table.Column<string>(type: "text", nullable: true),
                    approved_user_agent = table.Column<string>(type: "text", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_qr_login_sessions", x => x.id);
                    table.ForeignKey(
                        name: "FK_qr_login_sessions_users_approved_user_id",
                        column: x => x.approved_user_id,
                        principalTable: "users",
                        principalColumn: "id",
                        onDelete: ReferentialAction.SetNull);
                });

            migrationBuilder.CreateTable(
                name: "refresh_tokens",
                columns: table => new
                {
                    id = table.Column<int>(type: "integer", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    user_id = table.Column<int>(type: "integer", nullable: false),
                    token_hash = table.Column<string>(type: "text", nullable: false),
                    created_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    expires_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    revoked_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    replaced_by_token_hash = table.Column<string>(type: "text", nullable: true),
                    user_agent = table.Column<string>(type: "text", nullable: false),
                    device_label = table.Column<string>(type: "text", nullable: false),
                    device_token_hash = table.Column<string>(type: "text", nullable: false),
                    last_ip = table.Column<string>(type: "text", nullable: false),
                    last_used_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_refresh_tokens", x => x.id);
                    table.ForeignKey(
                        name: "FK_refresh_tokens_users_user_id",
                        column: x => x.user_id,
                        principalTable: "users",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "user_integrations",
                columns: table => new
                {
                    id = table.Column<int>(type: "integer", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    user_id = table.Column<int>(type: "integer", nullable: false),
                    provider = table.Column<string>(type: "text", nullable: false),
                    display_name = table.Column<string>(type: "text", nullable: false),
                    external_user_id = table.Column<string>(type: "text", nullable: false),
                    display_in_profile = table.Column<bool>(type: "boolean", nullable: false, defaultValue: true),
                    use_as_status = table.Column<bool>(type: "boolean", nullable: false, defaultValue: true),
                    activity_kind = table.Column<string>(type: "text", nullable: false),
                    activity_title = table.Column<string>(type: "text", nullable: false),
                    activity_subtitle = table.Column<string>(type: "text", nullable: false),
                    activity_details = table.Column<string>(type: "text", nullable: false),
                    activity_updated_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    access_token_encrypted = table.Column<string>(type: "text", nullable: false),
                    refresh_token_encrypted = table.Column<string>(type: "text", nullable: false),
                    token_expires_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    connected_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    updated_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_user_integrations", x => x.id);
                    table.ForeignKey(
                        name: "FK_user_integrations_users_user_id",
                        column: x => x.user_id,
                        principalTable: "users",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_banned_identity_records_identity_type_identity_hash",
                table: "banned_identity_records",
                columns: new[] { "identity_type", "identity_hash" },
                unique: true,
                filter: "revoked_at IS NULL");

            migrationBuilder.CreateIndex(
                name: "IX_banned_identity_records_identity_type_revoked_at",
                table: "banned_identity_records",
                columns: new[] { "identity_type", "revoked_at" });

            migrationBuilder.CreateIndex(
                name: "IX_banned_identity_records_source_user_id_revoked_at",
                table: "banned_identity_records",
                columns: new[] { "source_user_id", "revoked_at" });

            migrationBuilder.CreateIndex(
                name: "IX_chat_channel_read_states_channel_id_last_read_at",
                table: "chat_channel_read_states",
                columns: new[] { "channel_id", "last_read_at" });

            migrationBuilder.CreateIndex(
                name: "IX_chat_channel_read_states_user_id_channel_id",
                table: "chat_channel_read_states",
                columns: new[] { "user_id", "channel_id" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_chat_file_uploads_channel_id_deleted_at",
                table: "chat_file_uploads",
                columns: new[] { "channel_id", "deleted_at" });

            migrationBuilder.CreateIndex(
                name: "IX_chat_file_uploads_channel_id_message_id",
                table: "chat_file_uploads",
                columns: new[] { "channel_id", "message_id" });

            migrationBuilder.CreateIndex(
                name: "IX_chat_file_uploads_file_name",
                table: "chat_file_uploads",
                column: "file_name",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_chat_file_uploads_owner_user_id_created_at",
                table: "chat_file_uploads",
                columns: new[] { "owner_user_id", "created_at" });

            migrationBuilder.CreateIndex(
                name: "IX_chat_file_uploads_owner_user_id_deleted_at",
                table: "chat_file_uploads",
                columns: new[] { "owner_user_id", "deleted_at" });

            migrationBuilder.CreateIndex(
                name: "IX_chat_moderation_actions_server_id_created_at",
                table: "chat_moderation_actions",
                columns: new[] { "server_id", "created_at" });

            migrationBuilder.CreateIndex(
                name: "IX_chat_moderation_actions_server_id_target_user_id_action_typ~",
                table: "chat_moderation_actions",
                columns: new[] { "server_id", "target_user_id", "action_type", "revoked_at", "expires_at" });

            migrationBuilder.CreateIndex(
                name: "IX_chat_moderation_reports_server_id_status_created_at",
                table: "chat_moderation_reports",
                columns: new[] { "server_id", "status", "created_at" });

            migrationBuilder.CreateIndex(
                name: "IX_chat_moderation_reports_server_id_target_user_id_created_at",
                table: "chat_moderation_reports",
                columns: new[] { "server_id", "target_user_id", "created_at" });

            migrationBuilder.CreateIndex(
                name: "ix_chatmessages_active_channelid_id",
                table: "chatmessages",
                columns: new[] { "channelid", "id" },
                filter: "is_deleted = false");

            migrationBuilder.CreateIndex(
                name: "ix_chatmessages_active_channelid_timestamp",
                table: "chatmessages",
                columns: new[] { "channelid", "timestamp" },
                filter: "is_deleted = false");

            migrationBuilder.CreateIndex(
                name: "ix_chatmessages_author_channel_client_message_id",
                table: "chatmessages",
                columns: new[] { "author_user_id", "channelid", "client_message_id" },
                unique: true,
                filter: "client_message_id IS NOT NULL AND client_message_id <> '' AND is_deleted = false");

            migrationBuilder.CreateIndex(
                name: "IX_chatmessages_channelid_read_at_author_user_id",
                table: "chatmessages",
                columns: new[] { "channelid", "read_at", "author_user_id" });

            migrationBuilder.CreateIndex(
                name: "IX_chatmessages_timestamp",
                table: "chatmessages",
                column: "timestamp");

            migrationBuilder.CreateIndex(
                name: "IX_email_verification_codes_email",
                table: "email_verification_codes",
                column: "email");

            migrationBuilder.CreateIndex(
                name: "IX_email_verification_codes_user_id",
                table: "email_verification_codes",
                column: "user_id");

            migrationBuilder.CreateIndex(
                name: "IX_email_verification_codes_user_id_purpose",
                table: "email_verification_codes",
                columns: new[] { "user_id", "purpose" });

            migrationBuilder.CreateIndex(
                name: "IX_email_verification_codes_verification_token_hash",
                table: "email_verification_codes",
                column: "verification_token_hash",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_friend_requests_receiver_user_id_status_created_at",
                table: "friend_requests",
                columns: new[] { "receiver_user_id", "status", "created_at" });

            migrationBuilder.CreateIndex(
                name: "IX_friend_requests_sender_user_id_status_created_at",
                table: "friend_requests",
                columns: new[] { "sender_user_id", "status", "created_at" });

            migrationBuilder.CreateIndex(
                name: "IX_friend_requests_user_high_id_status_created_at",
                table: "friend_requests",
                columns: new[] { "user_high_id", "status", "created_at" });

            migrationBuilder.CreateIndex(
                name: "IX_friend_requests_user_low_id_status_created_at",
                table: "friend_requests",
                columns: new[] { "user_low_id", "status", "created_at" });

            migrationBuilder.CreateIndex(
                name: "IX_friend_requests_user_low_id_user_high_id",
                table: "friend_requests",
                columns: new[] { "user_low_id", "user_high_id" },
                unique: true,
                filter: "status = 'pending'");

            migrationBuilder.CreateIndex(
                name: "IX_friendships_created_at",
                table: "friendships",
                column: "created_at");

            migrationBuilder.CreateIndex(
                name: "IX_friendships_user_high_id_created_at",
                table: "friendships",
                columns: new[] { "user_high_id", "created_at" });

            migrationBuilder.CreateIndex(
                name: "IX_friendships_user_low_id_created_at",
                table: "friendships",
                columns: new[] { "user_low_id", "created_at" });

            migrationBuilder.CreateIndex(
                name: "IX_friendships_user_low_id_user_high_id",
                table: "friendships",
                columns: new[] { "user_low_id", "user_high_id" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_group_conversation_members_conversation_id_is_banned",
                table: "group_conversation_members",
                columns: new[] { "conversation_id", "is_banned" });

            migrationBuilder.CreateIndex(
                name: "IX_group_conversation_members_conversation_id_user_id",
                table: "group_conversation_members",
                columns: new[] { "conversation_id", "user_id" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_group_conversation_members_user_id_is_banned",
                table: "group_conversation_members",
                columns: new[] { "user_id", "is_banned" });

            migrationBuilder.CreateIndex(
                name: "IX_group_conversations_owner_user_id",
                table: "group_conversations",
                column: "owner_user_id");

            migrationBuilder.CreateIndex(
                name: "IX_group_conversations_updated_at",
                table: "group_conversations",
                column: "updated_at");

            migrationBuilder.CreateIndex(
                name: "IX_message_reactions_channel_id_created_at",
                table: "message_reactions",
                columns: new[] { "channel_id", "created_at" });

            migrationBuilder.CreateIndex(
                name: "IX_message_reactions_message_id_created_at",
                table: "message_reactions",
                columns: new[] { "message_id", "created_at" });

            migrationBuilder.CreateIndex(
                name: "IX_message_reactions_message_id_reaction_key",
                table: "message_reactions",
                columns: new[] { "message_id", "reaction_key" });

            migrationBuilder.CreateIndex(
                name: "IX_message_reactions_message_id_reactor_user_id_reaction_key",
                table: "message_reactions",
                columns: new[] { "message_id", "reactor_user_id", "reaction_key" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_phone_verification_codes_phone_number_created_at",
                table: "phone_verification_codes",
                columns: new[] { "phone_number", "created_at" });

            migrationBuilder.CreateIndex(
                name: "IX_phone_verification_codes_verification_token_hash",
                table: "phone_verification_codes",
                column: "verification_token_hash",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_push_subscriptions_endpoint",
                table: "push_subscriptions",
                column: "endpoint",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_push_subscriptions_user_id_is_active_updated_at",
                table: "push_subscriptions",
                columns: new[] { "user_id", "is_active", "updated_at" });

            migrationBuilder.CreateIndex(
                name: "IX_qr_login_sessions_approved_user_id",
                table: "qr_login_sessions",
                column: "approved_user_id");

            migrationBuilder.CreateIndex(
                name: "IX_qr_login_sessions_browser_token_hash",
                table: "qr_login_sessions",
                column: "browser_token_hash",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_qr_login_sessions_expires_at_consumed_at",
                table: "qr_login_sessions",
                columns: new[] { "expires_at", "consumed_at" });

            migrationBuilder.CreateIndex(
                name: "IX_qr_login_sessions_session_id",
                table: "qr_login_sessions",
                column: "session_id",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_refresh_tokens_token_hash",
                table: "refresh_tokens",
                column: "token_hash",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_refresh_tokens_user_id_expires_at",
                table: "refresh_tokens",
                columns: new[] { "user_id", "expires_at" });

            migrationBuilder.CreateIndex(
                name: "IX_server_audit_logs_actor_user_id",
                table: "server_audit_logs",
                column: "actor_user_id");

            migrationBuilder.CreateIndex(
                name: "IX_server_audit_logs_server_id_created_at",
                table: "server_audit_logs",
                columns: new[] { "server_id", "created_at" });

            migrationBuilder.CreateIndex(
                name: "IX_server_invites_code",
                table: "server_invites",
                column: "code",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_server_invites_owner_user_id_expires_at",
                table: "server_invites",
                columns: new[] { "owner_user_id", "expires_at" });

            migrationBuilder.CreateIndex(
                name: "IX_shared_server_snapshots_owner_user_id",
                table: "shared_server_snapshots",
                column: "owner_user_id");

            migrationBuilder.CreateIndex(
                name: "IX_shared_server_snapshots_server_id",
                table: "shared_server_snapshots",
                column: "server_id",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_user_blocks_blocked_user_id",
                table: "user_blocks",
                column: "blocked_user_id");

            migrationBuilder.CreateIndex(
                name: "IX_user_blocks_blocker_user_id",
                table: "user_blocks",
                column: "blocker_user_id");

            migrationBuilder.CreateIndex(
                name: "IX_user_blocks_blocker_user_id_blocked_user_id",
                table: "user_blocks",
                columns: new[] { "blocker_user_id", "blocked_user_id" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_user_integrations_user_id_display_in_profile_use_as_status_~",
                table: "user_integrations",
                columns: new[] { "user_id", "display_in_profile", "use_as_status", "activity_updated_at" });

            migrationBuilder.CreateIndex(
                name: "IX_user_integrations_user_id_provider",
                table: "user_integrations",
                columns: new[] { "user_id", "provider" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_user_integrations_user_id_use_as_status_activity_updated_at",
                table: "user_integrations",
                columns: new[] { "user_id", "use_as_status", "activity_updated_at" });

            migrationBuilder.CreateIndex(
                name: "IX_user_reports_reporter_user_id_target_user_id_created_at",
                table: "user_reports",
                columns: new[] { "reporter_user_id", "target_user_id", "created_at" });

            migrationBuilder.CreateIndex(
                name: "IX_user_reports_status_created_at",
                table: "user_reports",
                columns: new[] { "status", "created_at" });

            migrationBuilder.CreateIndex(
                name: "IX_user_reports_target_user_id_status_created_at",
                table: "user_reports",
                columns: new[] { "target_user_id", "status", "created_at" });

            migrationBuilder.CreateIndex(
                name: "IX_users_email",
                table: "users",
                column: "email",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_users_is_banned_banned_at",
                table: "users",
                columns: new[] { "is_banned", "banned_at" });

            migrationBuilder.CreateIndex(
                name: "IX_users_phone_number",
                table: "users",
                column: "phone_number",
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "banned_identity_records");

            migrationBuilder.DropTable(
                name: "chat_channel_read_states");

            migrationBuilder.DropTable(
                name: "chat_file_uploads");

            migrationBuilder.DropTable(
                name: "chat_moderation_actions");

            migrationBuilder.DropTable(
                name: "chat_moderation_reports");

            migrationBuilder.DropTable(
                name: "chatmessages");

            migrationBuilder.DropTable(
                name: "email_verification_codes");

            migrationBuilder.DropTable(
                name: "friend_requests");

            migrationBuilder.DropTable(
                name: "friendships");

            migrationBuilder.DropTable(
                name: "group_conversation_members");

            migrationBuilder.DropTable(
                name: "group_conversations");

            migrationBuilder.DropTable(
                name: "message_reactions");

            migrationBuilder.DropTable(
                name: "phone_verification_codes");

            migrationBuilder.DropTable(
                name: "push_subscriptions");

            migrationBuilder.DropTable(
                name: "qr_login_sessions");

            migrationBuilder.DropTable(
                name: "refresh_tokens");

            migrationBuilder.DropTable(
                name: "server_audit_logs");

            migrationBuilder.DropTable(
                name: "server_invites");

            migrationBuilder.DropTable(
                name: "shared_server_snapshots");

            migrationBuilder.DropTable(
                name: "user_blocks");

            migrationBuilder.DropTable(
                name: "user_integrations");

            migrationBuilder.DropTable(
                name: "user_reports");

            migrationBuilder.DropTable(
                name: "users");
        }
    }
}
