import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const voiceClientSource = readFileSync("src/webrtc/livekitVoiceRoomClient.js", "utf8");

assert(
  voiceClientSource.includes("local-audio:rebuild-disconnect-recover"),
  "Voice client must recover LiveKit room disconnects that happen during microphone device rebuilds."
);

assert(
  voiceClientSource.includes("localAudioRebuildOperationPromise") &&
    voiceClientSource.includes("recoverLiveKitRoomAfterLocalAudioRebuildDisconnect"),
  "Voice client disconnect handling must branch on active local audio rebuild operations."
);

assert(
  voiceClientSource.indexOf("recoverLiveKitRoomAfterLocalAudioRebuildDisconnect") <
    voiceClientSource.indexOf("await signalConnection.invoke(\"LeaveChannel\""),
  "Audio rebuild disconnect recovery must run before SignalR LeaveChannel cleanup."
);

console.log("Voice device switch smoke checks passed.");
