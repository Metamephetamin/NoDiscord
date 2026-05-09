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
  assert.ok(hasPattern(/boxCutGain:\s*-0\.8,/));
  assert.ok(hasPattern(/presenceGain:\s*1\.3,/));
  assert.ok(hasPattern(/airGain:\s*0\.65,/));
  assert.ok(hasPattern(/threshold:\s*-18,/));
  assert.ok(hasPattern(/ratio:\s*1\.45,/));
  assert.ok(hasPattern(/makeupGainDb:\s*4\.5,/));
});

test("transparent and noisy room profiles stay simple and avoid overprocessing", () => {
  assert.equal(hasPattern(/mudCutFilter\.frequency\.value = 260;/), false);
  assert.equal(hasPattern(/airFilter\.frequency\.value = 6500;/), false);
  assert.ok(hasPattern(/threshold:\s*-21,/));
  assert.ok(hasPattern(/ratio:\s*1\.65,/));
  assert.ok(hasPattern(/makeupGainDb:\s*5,/));
  assert.ok(hasPattern(/mudCutGain:\s*-1\.8,/));
  assert.ok(hasPattern(/boxCutGain:\s*-1,/));
  assert.ok(hasPattern(/presenceGain:\s*1\.2,/));
  assert.ok(hasPattern(/airGain:\s*0\.35,/));
});

test("voice mode changes replace the active LiveKit microphone publication", () => {
  assert.ok(hasPattern(/const getCurrentMicrophonePublication = \(\) =>/));
  assert.ok(hasPattern(/getTrackPublication\?\.\(Track\.Source\.Microphone\)/));
  assert.ok(hasPattern(/getTrackPublicationByName\?\.\(MICROPHONE_TRACK_NAME\)/));
  assert.ok(hasPattern(/replaceTrack\(nextTrack,\s*\{\s*userProvidedTrack:\s*true,\s*stopProcessor:\s*true\s*\}\)/s));
  assert.ok(hasPattern(/unpublishExistingMicrophonePublication/));
});
