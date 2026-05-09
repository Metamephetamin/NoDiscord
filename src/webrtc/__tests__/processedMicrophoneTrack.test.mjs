import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const testDir = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(join(testDir, "../processedMicrophoneTrack.js"), "utf8");
const projectRoot = resolve(testDir, "../../..");

const hasPattern = (pattern) => pattern.test(source);

test("processed microphone helper exposes denoiser feature flag and fallback order", () => {
  assert.ok(source.includes('AUDIO_DENOISER_STORAGE_KEY = "nodiscord.audio.denoiser"'));
  assert.ok(hasPattern(/AUDIO_DENOISER_MODE_DEEPFILTERNET3,\s*AUDIO_DENOISER_MODE_RNNOISE_LEGACY,\s*AUDIO_DENOISER_MODE_WEBRTC,\s*AUDIO_DENOISER_MODE_OFF,/s));
});

test("deep denoisers use AudioWorklet and do not use ScriptProcessorNode", () => {
  assert.ok(source.includes("AudioWorkletNode"));
  assert.equal(source.includes("ScriptProcessorNode"), false);
  assert.equal(source.includes("createScriptProcessor"), false);
});

test("DeepFilterNet runtime is backed by the real audio pipeline package and public assets", () => {
  const packageJson = JSON.parse(readFileSync(resolve(projectRoot, "package.json"), "utf8"));
  assert.ok(packageJson.dependencies["@cc-livekit/audio-pipeline-plugin"]);
  assert.ok(source.includes('@cc-livekit/audio-pipeline-plugin'));
  assert.ok(source.includes("AudioPipelineTrackProcessor"));
  assert.ok(existsSync(resolve(projectRoot, "public/audio/AudioPipelineWorklet.js")));
  assert.ok(existsSync(resolve(projectRoot, "public/audio/AudioPipelineWorker.js")));
  assert.ok(existsSync(resolve(projectRoot, "public/audio/deepfilter.wasm")));
  assert.ok(existsSync(resolve(projectRoot, "public/audio/rnnoise.wasm")));
}
);

test("voice message and broadcast profiles default to DeepFilterNet3", () => {
  assert.ok(hasPattern(/\[AUDIO_PROCESSING_PROFILE_VOICE_MESSAGE\]:\s*AUDIO_DENOISER_MODE_DEEPFILTERNET3/));
  assert.ok(hasPattern(/\[AUDIO_PROCESSING_PROFILE_BROADCAST\]:\s*AUDIO_DENOISER_MODE_DEEPFILTERNET3/));
  assert.ok(hasPattern(/\[AUDIO_PROCESSING_PROFILE_TRANSPARENT\]:\s*AUDIO_DENOISER_MODE_OFF/));
});
