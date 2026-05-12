# Product SLOs

## Frontend

- App first meaningful screen: target <= 2 s on reference Windows machine.
- Route switch: target <= 150 ms to first visible update.
- Text input latency: target no repeated long tasks > 100 ms while typing.
- Long chat scroll: target no visible blanking or stuck scroll.
- Batch upload modal first paint: target <= 150 ms.

## Voice

- Voice join UI acknowledgement: target <= 300 ms.
- Voice media connected: target <= 2 s on healthy network.
- Microphone mute/unmute: target <= 100 ms UI feedback.
- Denoiser init: must not run before microphone capture is requested.

## Backend

- `/api/ping`: target p95 <= 100 ms from production region.
- SignalR negotiate: non-5xx and auth-enforced.
- Message send API/hub acknowledgement: target p95 <= 500 ms under normal load.
