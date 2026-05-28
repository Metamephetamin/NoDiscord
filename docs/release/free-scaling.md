# Free Scaling Setup

This project can prepare for horizontal scaling without paid managed services. The setup below is still single-server by default: it improves recovery and lets several backend processes share SignalR events through Redis, but it is not full high availability.

## What This Adds

- PostgreSQL scheduled backups through `pg_dump`.
- Upload storage scheduled backups through compressed `tar` archives.
- Optional Redis SignalR backplane.
- Nginx upstream template for several local backend instances.
- Systemd backend instance template for ports such as `7031`, `7032`, and `7033`.
- Shared local upload storage through `Storage__Root=/opt/nodiscord/.deploy/storage`.

## PostgreSQL Backups

Install the script and timer:

```bash
sudo mkdir -p /opt/nodiscord/.deploy/scripts
sudo cp scripts/db-backup.sh /opt/nodiscord/.deploy/scripts/db-backup.sh
sudo chmod 750 /opt/nodiscord/.deploy/scripts/db-backup.sh
sudo chown nodiscord:nodiscord /opt/nodiscord/.deploy/scripts/db-backup.sh

sudo cp infra/systemd/nodiscord-db-backup.service /etc/systemd/system/nodiscord-db-backup.service
sudo cp infra/systemd/nodiscord-db-backup.timer /etc/systemd/system/nodiscord-db-backup.timer
sudo systemctl daemon-reload
sudo systemctl enable --now nodiscord-db-backup.timer
```

Run one manual backup:

```bash
sudo systemctl start nodiscord-db-backup.service
sudo journalctl -u nodiscord-db-backup.service -n 80 --no-pager
sudo ls -lh /opt/nodiscord/.deploy/backups/postgres
```

The backup script reads `ConnectionStrings__DefaultConnection` from `/opt/nodiscord/.deploy/backend/.env`. To use a separate backup user, set `DB_BACKUP_CONNECTION_STRING` in that same env file.

## Upload Storage Backups

Install the storage script and timer:

```bash
sudo mkdir -p /opt/nodiscord/.deploy/scripts
sudo cp scripts/storage-backup.sh /opt/nodiscord/.deploy/scripts/storage-backup.sh
sudo chmod 750 /opt/nodiscord/.deploy/scripts/storage-backup.sh
sudo chown nodiscord:nodiscord /opt/nodiscord/.deploy/scripts/storage-backup.sh

sudo cp infra/systemd/nodiscord-storage-backup.service /etc/systemd/system/nodiscord-storage-backup.service
sudo cp infra/systemd/nodiscord-storage-backup.timer /etc/systemd/system/nodiscord-storage-backup.timer
sudo systemctl daemon-reload
sudo systemctl enable --now nodiscord-storage-backup.timer
```

The storage backup reads `Storage__Root` from `/opt/nodiscord/.deploy/backend/.env` and writes archives to `/opt/nodiscord/.deploy/backups/storage`. Temporary `upload-*.tmp` files are excluded.

## Redis For SignalR

Start local Redis:

```bash
docker compose -f infra/redis/docker-compose.yml up -d
```

Add this to `/opt/nodiscord/.deploy/backend/.env`:

```bash
Redis__ConnectionString=127.0.0.1:6379
Redis__ChannelPrefix=lanaya-signalr
```

Restart backend:

```bash
sudo systemctl restart nodiscord-backend.service
```

If `Redis__ConnectionString` is empty, the backend runs exactly like the previous single-process setup.

## Multiple Backend Instances

Install the template:

```bash
sudo cp infra/systemd/nodiscord-backend@.service /etc/systemd/system/nodiscord-backend@.service
sudo systemctl daemon-reload
```

Start two local instances:

```bash
sudo systemctl enable --now nodiscord-backend@7031.service
sudo systemctl enable --now nodiscord-backend@7032.service
```

Stop the old single-instance service after the template units are healthy:

```bash
sudo systemctl stop nodiscord-backend.service
sudo systemctl disable nodiscord-backend.service
```

Each instance uses the same `/opt/nodiscord/.deploy/backend/.env`. Optional per-port overrides can be placed in `/etc/nodiscord/backend-7031.env` and `/etc/nodiscord/backend-7032.env`.

## Nginx Load Balancer Template

Use `infra/nginx/lanaya.space.load-balanced.conf` after the backend template units are running. The upstream uses `ip_hash` for sticky routing, while Redis carries SignalR messages between instances.

```bash
sudo cp infra/nginx/lanaya.space.load-balanced.conf /etc/nginx/sites-available/lanaya.space
sudo nginx -t
sudo systemctl reload nginx
```

Uncomment more `server 127.0.0.1:703X` lines only after the matching systemd unit is healthy.

## Storage Limits

Multiple backend processes on the same server can share local uploads through:

```bash
Storage__Root=/opt/nodiscord/.deploy/storage
```

This is enough for local multi-process scaling. It is not enough for several physical servers. For multi-server scaling, move uploads to object storage such as S3 or MinIO and add a backend storage provider abstraction before routing traffic to more than one machine.

## What Is Still Not Free HA

- PostgreSQL backup is not automatic failover.
- Local Redis is a single point of failure.
- Local upload storage works only on one server.
- LiveKit remains a single local server in the current compose file.

This setup is the free stepping stone: safer backups now, optional multi-backend on one machine, and fewer code changes later when paid or second-server infrastructure is available.
