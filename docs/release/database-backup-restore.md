# Database Backup And Restore

## Policy

- Take scheduled PostgreSQL backups before production deploys.
- Keep at least one recent restore-tested backup.
- Never store backups in the repo.
- Never print database passwords in logs.

## Restore Drill

1. Restore latest backup into a non-production database.
2. Run backend migration/startup checks.
3. Run API health check against the restored database.
4. Record restore duration and result.
