# Production Monitoring Policy

This project keeps production logs operational and non-sensitive. Logs are for diagnosing availability, reconnects, delivery failures, media fallbacks, and uploads. They are not an audit store for user content.

## Allowed Operational Events

- `auth.failure` - authentication failed without including credentials, codes, tokens, cookies, or request bodies.
- `auth.unauthorized` - a stored session was rejected or expired.
- `auth.refresh_failure` - refresh failed without logging the refresh token.
- `media.missing` - media render failed or used a placeholder; log path category and status only.
- `signalr.disconnect` - SignalR disconnected or reconnect recovery failed; log hub/channel identifiers only.
- `livekit.reconnect` - LiveKit reconnecting/reconnected/disconnected state changed; log phase and room identity only when needed.
- `upload.failure` - upload failed; log file size, MIME category, and status, not file bytes or message text.

## Forbidden Values

Never log or store these in application logs, audit metadata, browser console output, or push payloads:

- passwords;
- email verification codes;
- TOTP secrets;
- access tokens, refresh tokens, cookies, auth headers, session IDs, and bearer values;
- message bodies, uploaded file bytes, QR scanner/browser tokens, and raw webhook payloads.

## Runtime Rules

- Backend production logging keeps ASP.NET request internals at `Warning` or higher to avoid noisy query/body logs.
- Backend structured logs should use IDs and counters, not serialized request DTOs.
- Frontend runtime console logs must be either opt-in debug logs or user-action failures without secrets.
- LiveKit debug dumps remain behind `ND_VOICE_DEBUG=1`.
- Electron renderer log forwarding must redact sensitive text before forwarding to the main process.

## Readiness Triage

- `database=unavailable`: check PostgreSQL service, connection string, and latest backup before restarting.
- `redis=unavailable`: check local Redis or Docker Compose; SignalR may lose cross-instance delivery until fixed.
- `storage=missing|unavailable`: check `Storage__Root`, disk space, ownership, and write permissions.
- `configuration=missing`: inspect `/opt/nodiscord/.deploy/backend/.env` without printing secrets into shared logs.
- `backupTimer=unavailable`: run `systemctl status nodiscord-db-backup.timer` and check `journalctl -u nodiscord-db-backup.service`.

## Release Check

Run before production deploy:

```powershell
npm run test:console-secrets
node ./scripts/console-error-smoke.mjs
dotnet test BackNoDiscord\BackNoDiscord.Tests\BackNoDiscord.Tests.csproj --configuration Release
npm run lint:ci
```
