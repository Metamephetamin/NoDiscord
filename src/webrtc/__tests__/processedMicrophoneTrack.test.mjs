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
  assert.ok(hasPattern(/AUDIO_DENOISER_MODE_DEEPFILTERNET3,\s*AUDIO_DENOISER_MODE_WEBRTC,\s*AUDIO_DENOISER_MODE_OFF,/s));
  assert.equal(source.includes("AUDIO_DENOISER_MODE_RNNOISE_LEGACY"), false);
  assert.equal(source.includes("rnnoise_legacy"), false);
});

test("deep denoisers use AudioWorklet and do not use ScriptProcessorNode", () => {
  assert.ok(source.includes("AudioWorkletNode"));
  assert.equal(source.includes("ScriptProcessorNode"), false);
  assert.equal(source.includes("createScriptProcessor"), false);
});

test("DeepFilterNet runtime is backed by the real audio pipeline package and public assets", () => {
  const packageJson = JSON.parse(readFileSync(resolve(projectRoot, "package.json"), "utf8"));
  const workerSource = readFileSync(resolve(projectRoot, "public/audio/AudioPipelineWorker.js"), "utf8");
  assert.ok(packageJson.dependencies["@cc-livekit/audio-pipeline-plugin"]);
  assert.ok(source.includes('@cc-livekit/audio-pipeline-plugin'));
  assert.ok(source.includes("AudioPipelineTrackProcessor"));
  assert.ok(existsSync(resolve(projectRoot, "public/audio/AudioPipelineWorklet.js")));
  assert.ok(existsSync(resolve(projectRoot, "public/audio/AudioPipelineWorker.js")));
  assert.ok(existsSync(resolve(projectRoot, "public/audio/deepfilter.wasm")));
  assert.equal(existsSync(resolve(projectRoot, "public/audio/rnnoise.wasm")), false);
  assert.equal(workerSource.includes("m.initSync(e),g=!0"), false);
  assert.ok(workerSource.includes("m.initSync({module:e}),g=!0"));
  assert.equal(workerSource.includes("PRE_INIT rnnoise"), false);
}
);

test("voice message and realtime voice profiles default to DeepFilterNet3", () => {
  assert.ok(hasPattern(/\[AUDIO_PROCESSING_PROFILE_VOICE_MESSAGE\]:\s*AUDIO_DENOISER_MODE_DEEPFILTERNET3/));
  assert.ok(hasPattern(/\[AUDIO_PROCESSING_PROFILE_BROADCAST\]:\s*AUDIO_DENOISER_MODE_DEEPFILTERNET3/));
  assert.ok(hasPattern(/\[AUDIO_PROCESSING_PROFILE_TRANSPARENT\]:\s*AUDIO_DENOISER_MODE_DEEPFILTERNET3/));
});

test("DeepFilterNet strength is profile tuned instead of one aggressive default", () => {
  assert.ok(hasPattern(/AUDIO_PROCESSING_PROFILE_TRANSPARENT\]:\s*\{\s*attenLimDb:\s*35,\s*postFilterBeta:\s*0\.005\s*\}/s));
  assert.ok(hasPattern(/AUDIO_PROCESSING_PROFILE_BROADCAST\]:\s*\{\s*attenLimDb:\s*52,\s*postFilterBeta:\s*0\.012\s*\}/s));
  assert.ok(hasPattern(/AUDIO_PROCESSING_PROFILE_NOISY_ROOM\]:\s*\{\s*attenLimDb:\s*72,\s*postFilterBeta:\s*0\.02\s*\}/s));
  assert.ok(hasPattern(/AUDIO_PROCESSING_PROFILE_VOICE_MESSAGE\]:\s*\{\s*attenLimDb:\s*52,\s*postFilterBeta:\s*0\.012\s*\}/s));
});

test("DeepFilterNet runtime does not fetch or initialize RNNoise", () => {
  assert.ok(source.includes("runWithRnnoiseFetchDisabled"));
  assert.equal(source.includes("moduleConfigs: {\\n      rnnoise:"), false);
  assert.equal(source.includes('moduleId: "rnnoise"'), false);
});
