import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildWaveformSamplesFromChannelData,
  normalizeWaveformSamples,
} from "../soundboardWaveform.mjs";

describe("soundboard waveform helpers", () => {
  it("builds stable waveform samples from audio channel data", () => {
    const samples = new Float32Array([
      0, 0.1, -0.3, 0.7,
      0.2, -0.4, 0.9, -1,
    ]);

    assert.deepEqual(
      buildWaveformSamplesFromChannelData(samples, 4),
      [0.1, 0.7, 0.4, 1],
    );
  });

  it("normalizes stored samples to the requested bar count", () => {
    assert.deepEqual(normalizeWaveformSamples([0, 0.5, 2, -1], 4), [0, 0.5, 1, 0]);
    assert.deepEqual(normalizeWaveformSamples([0.2, 0.8], 4), [0.2, 0.2, 0.8, 0.8]);
  });
});
