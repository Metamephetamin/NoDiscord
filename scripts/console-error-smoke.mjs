import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(path, "utf8");

const monitoringDoc = read("docs/release/monitoring.md");
const authSource = read("src/utils/auth.js");
const voiceSource = read("src/webrtc/livekitVoiceRoomClient.js");
const programSource = read("BackNoDiscord/BackNoDiscord/Program.cs");
const productionConfig = read("BackNoDiscord/BackNoDiscord/appsettings.Production.json.example");

const requiredEvents = [
  "auth.failure",
  "auth.unauthorized",
  "auth.refresh_failure",
  "media.missing",
  "signalr.disconnect",
  "livekit.reconnect",
  "upload.failure",
];

for (const eventName of requiredEvents) {
  assert(
    monitoringDoc.includes(eventName),
    `Monitoring policy must document ${eventName}.`
  );
}

for (const forbiddenValue of ["passwords", "access tokens", "refresh tokens", "cookies", "message bodies"]) {
  assert(
    monitoringDoc.includes(forbiddenValue),
    `Monitoring policy must forbid ${forbiddenValue}.`
  );
}

assert(
  authSource.includes("AUTH_MONITORING_EVENT_NAMES"),
  "Auth monitoring event names must be centralized."
);
assert(
  !/console\.(log|debug|info|warn|error)\s*\(/.test(authSource),
  "Auth utilities must not write auth/session failures directly to the browser console."
);
assert(
  voiceSource.includes("VOICE_MONITORING_EVENT_NAMES"),
  "Voice monitoring event names must be centralized."
);
assert(
  voiceSource.includes('getItem("ND_VOICE_DEBUG") === "1"'),
  "LiveKit debug dumps must remain opt-in."
);
assert(
  programSource.includes("ActivityTrackingOptions.TraceId") &&
    programSource.includes("Microsoft.AspNetCore.HttpLogging"),
  "Backend logging must include trace context and suppress HTTP body/query logging noise."
);
assert(
  productionConfig.includes('"Microsoft.AspNetCore.HttpLogging": "Warning"'),
  "Production config must keep HTTP logging at Warning or higher."
);

console.log("Console error monitoring smoke checks passed.");
