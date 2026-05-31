using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace BackNoDiscord.Migrations
{
    /// <inheritdoc />
    public partial class AddUserProfileStatus : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "profile_status",
                table: "users",
                type: "text",
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "profile_status",
                table: "users");
        }
    }
}
