#!/usr/bin/env bash
set -euo pipefail

storage_root="${STORAGE_BACKUP_SOURCE:-${Storage__Root:-${ND_STORAGE_ROOT:-/opt/nodiscord/.deploy/storage}}}"
backup_dir="${STORAGE_BACKUP_DIR:-/opt/nodiscord/.deploy/backups/storage}"
retention_days="${STORAGE_BACKUP_RETENTION_DAYS:-14}"

if [ -z "$storage_root" ] || [ ! -d "$storage_root" ]; then
  echo "Storage backup skipped: storage root is missing or not a directory." >&2
  exit 1
fi

if ! command -v tar >/dev/null 2>&1; then
  echo "Storage backup failed: tar was not found in PATH." >&2
  exit 1
fi

mkdir -p "$backup_dir"
chmod 700 "$backup_dir"

timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
tmp_file="$backup_dir/lanaya-storage-$timestamp.tar.gz.tmp"
backup_file="$backup_dir/lanaya-storage-$timestamp.tar.gz"

tar \
  --create \
  --gzip \
  --file "$tmp_file" \
  --directory "$storage_root" \
  --exclude="upload-*.tmp" \
  --exclude="*/upload-*.tmp" \
  .

chmod 600 "$tmp_file"
mv "$tmp_file" "$backup_file"

find "$backup_dir" -type f -name "lanaya-storage-*.tar.gz" -mtime "+$retention_days" -delete

echo "Storage backup written: $backup_file"
