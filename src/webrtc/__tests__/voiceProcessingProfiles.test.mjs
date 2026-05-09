import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const testDir = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(join(testDir, "../livekitVoiceRoomClient.js"), "utf8");

const hasPattern = (pattern) => pattern.test(source);

test("voice channel capture delegates browser noise suppression to selected denoiser mode", () => {
  assert.ok(hasPattern(/createProcessedMicrophoneTrack/));
  assert.ok(hasPattern(/shouldUseBrowserNoiseSuppression/));
  assert.ok(hasPattern(/noiseSuppression:\s*useBrowserNoiseSuppression/));
  assert.ok(hasPattern(/googNoiseSuppression:\s*useBrowserNoiseSuppression/));
});

test("voice channel defaults avoid post-processing attenuation and hard gate chopping", () => {
  assert.ok(hasPattern(/let micVolume = 1;/));
  assert.ok(hasPattern(/openThreshold:\s*0\.01,/));
  assert.ok(hasPattern(/floorGain:\s*0\.34,/));
  assert.ok(hasPattern(/holdMs:\s*180,/));
  assert.ok(hasPattern(/releaseTime:\s*0\.28,/));
});

test("broadcast profile favors clear speech without aggressive radio EQ", () => {
  assert.ok(hasPattern(/highPassFrequency:\s*86,/));
  assert.ok(hasPattern(/highPassStages:\s*1,/));
  assert.ok(hasPattern(/mudCutGain:\s*-1\.4,/));
  assert.ok(hasPattern(/presenceGain:\s*1\.4,/));
  assert.ok(hasPattern(/makeupGainDb:\s*3\.5,/));
});
