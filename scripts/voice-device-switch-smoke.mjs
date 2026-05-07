import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const voiceClientSource = readFileSync("src/webrtc/livekitVoiceRoomClient.js", "utf8");
const menuMainSource = readFileSync("src/features/menu-main/MenuMainController.jsx", "utf8");

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
  voiceClientSource.includes("LOCAL_AUDIO_REBUILD_RECOVERY_WINDOW_MS = 15_000"),
  "Voice client must keep a long enough recovery window for delayed LiveKit disconnects during device switches."
);

assert(
  voiceClientSource.includes("LOCAL_AUDIO_REBUILD_RECOVERY_RETRY_DELAYS_MS"),
  "Voice client must retry room recovery after device-switch disconnects."
);

assert(
  voiceClientSource.indexOf("recoverLiveKitRoomAfterLocalAudioRebuildDisconnect") <
    voiceClientSource.indexOf("await signalConnection.invoke(\"LeaveChannel\""),
  "Audio rebuild disconnect recovery must run before SignalR LeaveChannel cleanup."
);

assert(
  menuMainSource.includes("const stableApplySelectedAudioDevicesToClient = useStableEvent(applySelectedAudioDevicesToClient);"),
  "MenuMainController must use a stable audio-device applicator so changing selected input does not recreate the voice client."
);

assert(
  !menuMainSource.includes("\n    applySelectedAudioDevicesToClient,\n    applyVoiceProcessingToClient,"),
  "Voice client initialization effect must not depend directly on selected input device state."
);

console.log("Voice device switch smoke checks passed.");
