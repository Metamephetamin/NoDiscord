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
