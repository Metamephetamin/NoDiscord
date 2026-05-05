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

```powershell
$env:LOAD_TEST_BASE_URL="https://lanaya.space"
$env:LOAD_TEST_VOICE_CHANNEL="server:1:voice:1"
$env:LOAD_TEST_TOKENS="token-user-1,token-user-2,token-user-3"
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
