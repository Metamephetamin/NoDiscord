# Production Release Checklist

## Last Verification Snapshot

Date: 2026-05-13
Commit checked locally: `f7f83fd` (`Require user agreement consent at registration`)
Branch: `master`
Production health checked: `https://lanaya.space/api/ping` returned `{"status":"ok"}`.

Passed locally:

- `node --test src\components\__tests__\userAgreementText.test.mjs`
- `dotnet test BackNoDiscord\BackNoDiscord.Tests\BackNoDiscord.Tests.csproj --configuration Release --filter AuthControllerTests`
- `git diff --check`
- `npm run check:encoding`
- `npm run lint:ci`
- `dotnet test BackNoDiscord\BackNoDiscord.Tests\BackNoDiscord.Tests.csproj --configuration Release`
- `npm run build:frontend`
- `dotnet build BackNoDiscord\BackNoDiscord\BackNoDiscord.csproj --configuration Release`
- `npm run audit:perf`
- `npm run smoke:release` in skip-mode because production smoke credentials are not configured in the local environment.

Not completed locally:

- GitHub Actions deploy status could not be read from this machine: `gh` is not installed, and unauthenticated GitHub API access returned `404`.
- Deep production smoke with `SMOKE_TEST_EMAIL`, `SMOKE_TEST_PASSWORD`, `SMOKE_CHAT_ID`, and `SMOKE_VOICE_CHANNEL`.
- Manual QA: registration consent click-through, login, message send, image in DM, image in server chat, offline/reconnect send, call start/accept/end, poor network status, upload quota error, report user, mute user, revoke session.

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
- `npm run smoke:release`
- `node ./scripts/verify-release-gate.mjs`
- `npm run test:e2e-smoke`
- `powershell -ExecutionPolicy Bypass -File .\scripts\db-backup-drill.ps1`
- `dotnet test BackNoDiscord\BackNoDiscord.Tests\BackNoDiscord.Tests.csproj --configuration Release`
- Confirm PostgreSQL backup exists and a recent non-production restore drill is recorded.
- Confirm client diagnostics and backend request logs include a correlation id/status without secrets or message bodies.
- Confirm auth, email verification, QR login, media render, and chat upload rate-limit policies are active.
- For deep release smoke, configure `SMOKE_TEST_EMAIL`, `SMOKE_TEST_PASSWORD`, `SMOKE_CHAT_ID`, and `SMOKE_VOICE_CHANNEL`; set `SMOKE_REQUIRE_CREDENTIALS=1` in CI when these are ready.

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
- `npm run smoke:release` passes against `https://lanaya.space` with the production smoke account.
- Backend service is active.
- nginx config validates with `nginx -t`.

## Rollback

- Follow `docs/release/rollback.md`.
