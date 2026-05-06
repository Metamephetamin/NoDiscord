import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const chatSignalRSource = readFileSync("src/SignalR/ChatConnect.jsx", "utf8");
const chatUploadSource = readFileSync("src/utils/chatAttachmentUpload.js", "utf8");
const chatHubSource = readFileSync("BackNoDiscord/BackNoDiscord/ChatHub.cs", "utf8");
const menuMainControllerSource = readFileSync("src/features/menu-main/MenuMainController.jsx", "utf8");
const voiceClientSource = readFileSync("src/webrtc/livekitVoiceRoomClient.js", "utf8");
const mainSource = readFileSync("src/main.js", "utf8");
const programSource = readFileSync("BackNoDiscord/BackNoDiscord/Program.cs", "utf8");

assert(!chatSignalRSource.includes("accessTokenFactory"), "Chat SignalR must not put access tokens into websocket URLs.");
assert(!voiceClientSource.includes("accessTokenFactory"), "Voice SignalR must not put access tokens into websocket URLs.");
assert(chatSignalRSource.includes("withCredentials: true"), "Chat SignalR should use the HttpOnly session cookie.");
assert(voiceClientSource.includes("withCredentials: true"), "Voice SignalR should use the HttpOnly session cookie.");
assert(voiceClientSource.includes('getItem("ND_VOICE_DEBUG") === "1"'), "Voice debug logs must stay opt-in.");
assert(
  menuMainControllerSource.includes("shouldShowVoiceDebugInfo ? selectedStreamDebugInfo : null"),
  "Screen share debug overlays must stay behind the voice debug flag."
);
assert(!chatUploadSource.includes("response: data"), "Chat upload errors must not log raw API response payloads.");
assert(!chatHubSource.includes("LegacyAttachmentUrl"), "Chat hub logs must not include attachment URLs.");
assert(mainSource.includes("redactSensitiveLogText"), "Electron renderer log forwarding must redact sensitive values.");
assert(programSource.includes("HubCookieTokenPolicy.CanAcceptCookieToken"), "Backend hubs must accept trusted HttpOnly cookie tokens.");

console.log("Console secret smoke checks passed.");
