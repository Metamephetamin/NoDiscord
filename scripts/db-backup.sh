#!/usr/bin/env bash
set -euo pipefail

backup_dir="${DB_BACKUP_DIR:-/opt/nodiscord/.deploy/backups/postgres}"
retention_days="${DB_BACKUP_RETENTION_DAYS:-14}"
connection_string="${DB_BACKUP_CONNECTION_STRING:-${ConnectionStrings__DefaultConnection:-}}"

if [ -z "$connection_string" ]; then
  echo "DB backup skipped: database connection string is missing." >&2
  exit 1
fi

if ! command -v pg_dump >/dev/null 2>&1; then
  echo "DB backup failed: pg_dump was not found in PATH." >&2
  exit 1
fi

mkdir -p "$backup_dir"
chmod 700 "$backup_dir"

timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
tmp_file="$backup_dir/lanaya-$timestamp.dump.tmp"
backup_file="$backup_dir/lanaya-$timestamp.dump"

pg_dump --format=custom --no-owner --no-acl --file "$tmp_file" "$connection_string"
chmod 600 "$tmp_file"
mv "$tmp_file" "$backup_file"

find "$backup_dir" -type f -name "lanaya-*.dump" -mtime "+$retention_days" -delete

echo "PostgreSQL backup written: $backup_file"
