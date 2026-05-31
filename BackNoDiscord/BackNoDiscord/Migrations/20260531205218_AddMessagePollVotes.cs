using System;
using Microsoft.EntityFrameworkCore.Migrations;
using Npgsql.EntityFrameworkCore.PostgreSQL.Metadata;

#nullable disable

namespace BackNoDiscord.Migrations
{
    /// <inheritdoc />
    public partial class AddMessagePollVotes : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "message_poll_votes",
                columns: table => new
                {
                    id = table.Column<int>(type: "integer", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    message_id = table.Column<int>(type: "integer", nullable: false),
                    channel_id = table.Column<string>(type: "text", nullable: false),
                    voter_user_id = table.Column<string>(type: "text", nullable: false),
                    option_ids_json = table.Column<string>(type: "text", nullable: false),
                    created_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    updated_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_message_poll_votes", x => x.id);
                });

            migrationBuilder.CreateIndex(
                name: "IX_message_poll_votes_channel_id_updated_at",
                table: "message_poll_votes",
                columns: new[] { "channel_id", "updated_at" });

            migrationBuilder.CreateIndex(
                name: "IX_message_poll_votes_message_id",
                table: "message_poll_votes",
                column: "message_id");

            migrationBuilder.CreateIndex(
                name: "IX_message_poll_votes_message_id_voter_user_id",
                table: "message_poll_votes",
                columns: new[] { "message_id", "voter_user_id" },
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "message_poll_votes");
        }
    }
}
