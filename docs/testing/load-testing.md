# Load Testing

Use these checks from a developer machine first. Start small, watch server CPU/RAM, PostgreSQL, nginx, ASP.NET logs, websocket count, and LiveKit metrics, then increase gradually.

## HTTP/API Smoke

Local backend:

```powershell
npm run load:http
```

Production, small and safe:

```powershell
$env:LOAD_TEST_BASE_URL="https://lanaya.space"
$env:LOAD_TEST_PATHS="/api/ping"
$env:LOAD_TEST_CONCURRENCY="4"
$env:LOAD_TEST_DURATION_SECONDS="30"
npm run load:http
```

Increase only one dimension at a time: duration, then concurrency, then endpoints. Treat `p95Ms`, `p99Ms`, 5xx count, and network errors as stop signals.

## Voice SignalR Control Plane

This checks voice hub connect/register/join/leave behavior. For real participant fan-out, use tokens from separate test accounts.

Seed dedicated load-test users directly through backend tooling when you need many accounts. Run this only with an explicit database connection string:

```powershell
$env:LOAD_TEST_CONNECTION_STRING="Host=...;Port=5432;Database=...;Username=...;Password=..."
$env:LOAD_TEST_EMAIL_PREFIX="tendload"
$env:LOAD_TEST_EMAIL_DOMAIN="gmail.com"
$env:LOAD_TEST_PASSWORD="shared-test-password"
$env:LOAD_TEST_USER_COUNT="100"
npm run load:seed-users
```

If the users already exist but you need to reset their password:

```powershell
$env:LOAD_TEST_RESET_PASSWORD="true"
npm run load:seed-users
```

Then generate tokens for those users:

```powershell
$env:LOAD_TEST_BASE_URL="https://lanaya.space"
$env:LOAD_TEST_EMAIL_PREFIX="tendload"
$env:LOAD_TEST_EMAIL_DOMAIN="gmail.com"
$env:LOAD_TEST_PASSWORD="shared-test-password"
$env:LOAD_TEST_USER_COUNT="100"
npm run load:auth-tokens
```

This writes `scripts/load/.tokens.json`, which is ignored by git. By default the script only logs in existing users. To let it create missing users too:

```powershell
$env:LOAD_TEST_CREATE_USERS="true"
npm run load:auth-tokens
```

If production registration requires email verification, automatic creation will not produce tokens. In that case seed verified test users through staging/admin DB tooling, then run `load:auth-tokens` in login-only mode.

```powershell
$env:LOAD_TEST_BASE_URL="https://lanaya.space"
$env:LOAD_TEST_VOICE_CHANNEL="server:1:voice:1"
$env:LOAD_TEST_TOKENS_FILE="scripts/load/.tokens.json"
$env:LOAD_TEST_CONNECTIONS="100"
$env:LOAD_TEST_DURATION_SECONDS="60"
npm run load:voice
```

One token is useful for websocket/reconnect smoke, but it does not simulate many real participants because the backend maps one authenticated user to one active voice identity.

## Voice Media Load

SignalR load does not test LiveKit audio/video packet pressure. For that, use a separate staging LiveKit server or a short production window with test accounts:

- 2 users: join, mute/unmute, camera on/off, screen share on/off.
- 5 users: one speaker, one screen share, everyone else listening.
- 10+ users: only after the smaller runs stay stable.

Record join p95, first remote participant visible time, camera preview time, screen publish time, disconnect cleanup time, backend CPU/RAM, LiveKit CPU/RAM, and websocket disconnect/reconnect counts.

## Voice Failure State Checklist

Expected UI states:

- LiveKit room disconnected: voice stage shows a disconnected banner and clears stale remote media.
- LiveKit reconnecting: voice stage shows a reconnecting banner without leaving the current channel immediately.
- Microphone permission denied: join fails with a microphone access message and does not spam expected disconnect logs.
- Device missing or busy: join fails with a device message; user can switch input device in voice settings and retry.
- Screen share denied: stream modal keeps controls available and shows the existing screen share error state.
- Participant media stalled: remote card remains stable in layout; reconnect or track resubscribe should not shift the stage.

Staging LiveKit run:

```powershell
$env:LOAD_TEST_BASE_URL="https://lanaya.space"
$env:LOAD_TEST_VOICE_CHANNEL="server:1:voice:1"
$env:LOAD_TEST_CONNECTIONS="10"
$env:LOAD_TEST_DURATION_SECONDS="120"
npm run load:voice
```

Manual media matrix:

- 3 rooms active at the same time, 2-5 participants per room.
- One screen share at 1080p/60 per room.
- Mute/deafen toggles every 10 seconds for 1 minute.
- Browser/device permission denied for microphone and screen share.
- Network drop for one participant for 5-15 seconds, then reconnect.
