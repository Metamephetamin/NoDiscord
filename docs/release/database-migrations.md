# Database Migrations

Lanaya still keeps `DatabaseSchemaInitializer` as a production compatibility layer. EF migrations are now the reviewed schema history, but production must not run them automatically until the migration process has been rehearsed with backups.

## Policy

- Review every migration in a PR or local release diff before it reaches `master`.
- Generate an idempotent SQL script during deploy and inspect it before manual execution.
- Take a fresh PostgreSQL backup before running production schema changes.
- Keep changes additive when possible: new nullable columns, new tables, new indexes created concurrently where needed.
- Do not drop columns, rewrite large tables, or tighten constraints without a rollback note and a maintenance window.

## Production Flow

1. Confirm the latest backup timer succeeded.
2. Generate the script:

   ```bash
   dotnet tool run dotnet-ef migrations script --idempotent \
     --project BackNoDiscord/BackNoDiscord/BackNoDiscord.csproj \
     --startup-project BackNoDiscord/BackNoDiscord/BackNoDiscord.csproj \
     --output ./artifacts/backend-migrations.sql
   ```

3. Inspect `./artifacts/backend-migrations.sql`.
4. Apply manually only after backup verification.
5. Check `https://lanaya.space/api/ping` and backend logs.

## Rollback

For additive migrations, rollback normally means reverting application code while leaving unused columns/tables in place. For any destructive migration, write a specific rollback script before release and test it against a restored backup copy.
