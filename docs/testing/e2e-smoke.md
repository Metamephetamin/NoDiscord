# E2E Smoke Scope

- login with existing account
- send and receive direct message
- send and receive server channel message
- upload small image
- upload zip and see progress UI
- blocked exe shows clear error
- join voice, speak, leave
- start/stop camera
- start/stop screen share
- native notification opens expected area
- restart app restores session

Run `npm run test:e2e-smoke` for automated local helpers. The logged-in Electron flows above remain manual until credentials and a controlled test tenant are available to automation.
