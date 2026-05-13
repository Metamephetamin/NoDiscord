import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const testDir = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(join(testDir, "../MenuMainController.jsx"), "utf8");
const voiceClientSource = readFileSync(join(testDir, "../../../webrtc/livekitVoiceRoomClient.js"), "utf8");

function sliceFunction(name) {
  const start = source.indexOf(`const ${name} =`);
  const end = source.indexOf("const leaveVoiceChannel =", start);
  assert.notEqual(start, -1, `${name} function must exist`);
  assert.notEqual(end, -1, "leaveVoiceChannel marker must exist after joinVoiceChannel");
  return source.slice(start, end);
}

test("voice join switches visible voice UI before awaiting network and media join", () => {
  const joinVoiceChannel = sliceFunction("joinVoiceChannel");
  const optimisticUiIndex = joinVoiceChannel.indexOf("activatePendingVoiceUi();");
  const firstJoinAwaitIndex = joinVoiceChannel.indexOf("await voiceClientRef.current.joinChannel");

  assert.notEqual(optimisticUiIndex, -1, "join path must activate pending voice UI");
  assert.notEqual(firstJoinAwaitIndex, -1, "join path must await voice client join");
  assert.ok(
    optimisticUiIndex < firstJoinAwaitIndex,
    "pending voice UI must render before SignalR/LiveKit/microphone work finishes",
  );
});

test("voice signal reconnect updates visible connection state and recovers current channel", () => {
  assert.match(voiceClientSource, /connection\.onreconnecting\(/, "voice SignalR connection must expose reconnecting state");
  assert.match(voiceClientSource, /emitVoiceConnectionState\(\{\s*phase:\s*"reconnecting"[\s\S]*reason:\s*"signalr-reconnecting"/, "voice SignalR reconnecting must update UI state");
  assert.match(voiceClientSource, /connection\.onreconnected\(/, "voice SignalR connection must handle reconnected");
  assert.match(voiceClientSource, /reason:\s*"signalr-reconnected"/, "voice SignalR reconnected must update UI state");
  assert.match(voiceClientSource, /connection\.invoke\(\s*"JoinChannel"/, "voice SignalR reconnected must rejoin the active channel");
});
