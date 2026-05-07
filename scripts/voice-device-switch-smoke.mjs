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

const setInputDeviceStart = voiceClientSource.indexOf("async setInputDevice(deviceId) {");
const setOutputDeviceStart = voiceClientSource.indexOf("async setOutputDevice(deviceId)", setInputDeviceStart);
assert(setInputDeviceStart >= 0 && setOutputDeviceStart > setInputDeviceStart, "Voice client must expose setInputDevice before setOutputDevice.");
const setInputDeviceSource = voiceClientSource.slice(setInputDeviceStart, setOutputDeviceStart);
assert(
  !setInputDeviceSource.includes("emitVoiceConnectionState({ phase: \"reconnecting\""),
  "Changing microphone input must hot-swap the local audio track without showing reconnecting UI."
);

const setNoiseModeStart = voiceClientSource.indexOf("async setNoiseSuppressionMode(mode) {");
const setNoiseStrengthStart = voiceClientSource.indexOf("async setNoiseSuppressionStrength(value)", setNoiseModeStart);
assert(setNoiseModeStart >= 0 && setNoiseStrengthStart > setNoiseModeStart, "Voice client must expose setNoiseSuppressionMode before setNoiseSuppressionStrength.");
const setNoiseModeSource = voiceClientSource.slice(setNoiseModeStart, setNoiseStrengthStart);
assert(
  setNoiseModeSource.includes("applyVoiceProcessingPipelineChange"),
  "Changing voice input profile during a call must rebuild/replace the active audio pipeline."
);
assert(
  !setNoiseModeSource.includes("if (hasActiveVoiceAudioSession())") || !setNoiseModeSource.includes("return;\n      }\n\n      await runLocalAudioRebuildOperation"),
  "Changing voice input profile must not defer active-call audio rebuilds."
);

const setEchoStart = voiceClientSource.indexOf("async setEchoCancellationEnabled(enabled) {");
const updateSelfVoiceStart = voiceClientSource.indexOf("async updateSelfVoiceState", setEchoStart);
assert(setEchoStart >= 0 && updateSelfVoiceStart > setEchoStart, "Voice client must expose setEchoCancellationEnabled before updateSelfVoiceState.");
const setEchoSource = voiceClientSource.slice(setEchoStart, updateSelfVoiceStart);
assert(
  setEchoSource.includes("applyVoiceProcessingPipelineChange"),
  "Changing echo cancellation during a call must reacquire and replace the active audio track."
);

const hardGateProfileMatch = voiceClientSource.match(/if \(mode === NOISE_SUPPRESSION_MODE_HARD_GATE\) \{\s*return \{[\s\S]*?floorGain: ([0-9.]+)/);
assert(hardGateProfileMatch, "Hard Gate profile must define a closed-gate floor gain.");
assert(
  Number(hardGateProfileMatch[1]) <= 0.18,
  "Hard Gate must strongly reduce background noise when the gate is closed."
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
