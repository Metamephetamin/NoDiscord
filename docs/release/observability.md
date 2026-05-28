# Production Observability

## Client Events

- renderer uncaught exception
- renderer unhandled promise rejection
- Electron main uncaught exception
- failed chunk load
- SignalR reconnect failure
- voice join failure
- media device permission failure

## Server Events

- unhandled HTTP exception
- failed authentication attempt aggregate
- SignalR hub disconnect with exception
- database command failure
- file upload rejection aggregate

## Readiness Endpoint

`GET https://lanaya.space/api/health/ready` returns `status` and a `checks` object:

- `database`: `ok` when PostgreSQL is reachable, `unavailable` when the backend cannot connect.
- `redis`: `ok` when configured and reachable, `disabled` when no Redis connection string is configured, `unavailable` when Redis is configured but down.
- `storage`: `ok` when the upload root exists and is writable, `missing` or `unavailable` when uploads are unsafe.
- `configuration`: `ok` when critical config is present, `missing` when connection string or JWT key is absent.
- `backupTimer`: `ok` when `nodiscord-db-backup.timer` is enabled, `unavailable` when disabled on Linux, `unknown` outside Linux or when systemd cannot be queried.

Use this endpoint for operator diagnosis; keep `/api/ping` as the tiny liveness check.

## Captured Fields

- event class
- sanitized message summary
- stack hash
- route or surface
- app version
- timestamp
- server correlation id and status code

## Never Log

- passwords
- tokens
- cookies
- authorization headers
- message bodies
- uploaded file contents
- raw microphone/audio data
