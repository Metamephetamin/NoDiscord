import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import test from "node:test";

const backendProject = readFileSync("BackNoDiscord/BackNoDiscord/BackNoDiscord.csproj", "utf8");
const deployWorkflow = readFileSync(".github/workflows/deploy.yml", "utf8");

test("database migrations are versioned without automatic production execution", () => {
  assert(
    existsSync("BackNoDiscord/BackNoDiscord/Infrastructure/AppDbContextDesignTimeFactory.cs"),
    "AppDbContext design-time factory must exist for EF migration generation."
  );
  assert(
    existsSync("BackNoDiscord/BackNoDiscord/Migrations/AppDbContextModelSnapshot.cs"),
    "EF Core migration snapshot must exist."
  );
  const migrationFiles = existsSync("BackNoDiscord/BackNoDiscord/Migrations")
    ? readdirSync("BackNoDiscord/BackNoDiscord/Migrations")
    : [];
  assert(
    migrationFiles.some((file) => /^\d+_BaselineProductionSchema\.cs$/.test(file)) &&
      migrationFiles.some((file) => /^\d+_BaselineProductionSchema\.Designer\.cs$/.test(file)),
    "BaselineProductionSchema migration files must exist."
  );
  assert(
    backendProject.includes("Microsoft.EntityFrameworkCore.Design"),
    "Backend project must reference EF Core design package."
  );
  assert(
    existsSync("BackNoDiscord/BackNoDiscord/Infrastructure/DatabaseSchemaInitializer.cs"),
    "DatabaseSchemaInitializer must remain during the migration transition."
  );
  assert(
    !/dotnet\s+(?:tool\s+run\s+)?dotnet-ef\s+database\s+update/.test(deployWorkflow) &&
      !/dotnet\s+ef\s+database\s+update/.test(deployWorkflow),
    "Deploy workflow must not automatically execute database migrations."
  );
});
