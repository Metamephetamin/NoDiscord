# Storage Backup And Restore

Upload files live under `Storage__Root`, currently `/opt/nodiscord/.deploy/storage` in production. PostgreSQL backups alone are not enough because chat records and profile records can point to files on disk.

## Backup

Production installs:

- `/opt/nodiscord/.deploy/scripts/storage-backup.sh`
- `nodiscord-storage-backup.service`
- `nodiscord-storage-backup.timer`

The timer writes `lanaya-storage-*.tar.gz` archives to `/opt/nodiscord/.deploy/backups/storage` and deletes archives older than `STORAGE_BACKUP_RETENTION_DAYS`, default `14`.

Run one manual backup:

```bash
sudo systemctl start nodiscord-storage-backup.service
sudo journalctl -u nodiscord-storage-backup.service -n 80 --no-pager
sudo ls -lh /opt/nodiscord/.deploy/backups/storage
```

## Restore

1. Stop backend services that write uploads.
2. Move the current storage root aside.
3. Extract the selected archive into the storage root:

   ```bash
   sudo mkdir -p /opt/nodiscord/.deploy/storage
   sudo tar -xzf /opt/nodiscord/.deploy/backups/storage/lanaya-storage-YYYYMMDDTHHMMSSZ.tar.gz \
     -C /opt/nodiscord/.deploy/storage
   sudo chown -R nodiscord:nodiscord /opt/nodiscord/.deploy/storage
   ```

4. Restore the matching PostgreSQL backup if needed.
5. Start backend services and check `/api/ping`.
