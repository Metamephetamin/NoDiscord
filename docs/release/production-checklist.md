# Production Release Checklist

## Required Automated Checks

- `git status --short` shows no `.env`, local secrets, or unrelated generated files staged.
- `git branch --show-current` returns `master`.
- `git remote get-url origin` points to `https://github.com/Metamephetamin/NoDiscord.git`.
- `npm run check:encoding`
- `npm run test:encoding`
- `npm run test:auth-branding`
- `npm run lint:ci`
- `npm run build:frontend`
- `npm run audit:public-assets`
- `npm run audit:perf`
- `node ./scripts/release-smoke.mjs`
- `node ./scripts/verify-release-gate.mjs`
- `npm run test:e2e-smoke`
- `powershell -ExecutionPolicy Bypass -File .\scripts\db-backup-drill.ps1`
- `dotnet test BackNoDiscord\BackNoDiscord.Tests\BackNoDiscord.Tests.csproj --configuration Release`
- Confirm PostgreSQL backup exists and a recent non-production restore drill is recorded.
- Confirm client diagnostics and backend request logs include a correlation id/status without secrets or message bodies.

## Manual Smoke Before Pushing To master

- Login with an existing account.
- Confirm auth background video renders on login and registration.
- Open QR login and confirm the QR panel renders with the current app logo.
- Confirm production email verification uses live delivery mode and does not show a debug code in the UI.
- Send and receive a direct message.
- Send and receive a server channel message.
- Upload a small image.
- Upload a `.zip` and confirm progress UI.
- Try blocked `.exe` and confirm a clear error.
- Join voice, speak, leave voice.
- Start camera, stop camera.
- Start screen share, stop screen share.
- Minimize app and confirm a native notification arrives.
- Click notification and confirm it opens the expected area.
- Restart app and confirm session restore.

## Production Health After Deploy

- `https://lanaya.space/api/ping` returns `{"status":"ok"}`.
- Frontend opens without chunk load errors.
- `/chatHub/negotiate` returns non-5xx.
- `/voiceHub/negotiate` returns non-5xx.
- Backend service is active.
- nginx config validates with `nginx -t`.
