import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const chatSignalRSource = readFileSync("src/SignalR/ChatConnect.jsx", "utf8");
const voiceClientSource = readFileSync("src/webrtc/livekitVoiceRoomClient.js", "utf8");
const mainSource = readFileSync("src/main.js", "utf8");
const programSource = readFileSync("BackNoDiscord/BackNoDiscord/Program.cs", "utf8");

assert(!chatSignalRSource.includes("accessTokenFactory"), "Chat SignalR must not put access tokens into websocket URLs.");
assert(!voiceClientSource.includes("accessTokenFactory"), "Voice SignalR must not put access tokens into websocket URLs.");
assert(chatSignalRSource.includes("withCredentials: true"), "Chat SignalR should use the HttpOnly session cookie.");
assert(voiceClientSource.includes("withCredentials: true"), "Voice SignalR should use the HttpOnly session cookie.");
assert(voiceClientSource.includes('getItem("ND_VOICE_DEBUG") === "1"'), "Voice debug logs must stay opt-in.");
assert(mainSource.includes("redactSensitiveLogText"), "Electron renderer log forwarding must redact sensitive values.");
assert(programSource.includes("HubCookieTokenPolicy.CanAcceptCookieToken"), "Backend hubs must accept trusted HttpOnly cookie tokens.");

console.log("Console secret smoke checks passed.");
