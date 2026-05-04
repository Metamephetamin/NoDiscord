# Production Release Checklist

## Required Automated Checks

- `npm run check:encoding`
- `npm run test:encoding`
- `npm run lint:ci`
- `npm run build:frontend`
- `npm run audit:public-assets`
- `npm run audit:perf`
- `dotnet test BackNoDiscord\BackNoDiscord.Tests\BackNoDiscord.Tests.csproj --configuration Release`

## Manual Smoke Before Pushing To master

- Login with an existing account.
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
