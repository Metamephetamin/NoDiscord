import test from "node:test";
import assert from "node:assert/strict";

import {
  formatVoiceChannelDuration,
  getVoiceChannelDurationMs,
  getVoiceParticipantDurationMs,
} from "../voiceChannelDuration.js";

test("formats voice channel duration as hours minutes and seconds", () => {
  assert.equal(formatVoiceChannelDuration(0), "0:00:00");
  assert.equal(formatVoiceChannelDuration(5_000), "0:00:05");
  assert.equal(formatVoiceChannelDuration(65_000), "0:01:05");
  assert.equal(formatVoiceChannelDuration(21_322_000), "5:55:22");
});

test("participant duration advances from server elapsed with monotonic client ticks", () => {
  const participant = {
    voiceElapsedMs: 10_000,
    voiceElapsedSyncedAtMs: 2_000,
  };

  assert.equal(getVoiceParticipantDurationMs(participant, 7_500), 15_500);
});

test("channel duration uses oldest active participant", () => {
  const participants = [
    { voiceElapsedMs: 12_000, voiceElapsedSyncedAtMs: 2_000 },
    { voiceElapsedMs: 30_000, voiceElapsedSyncedAtMs: 5_000 },
  ];

  assert.equal(getVoiceChannelDurationMs(participants, 8_000), 33_000);
});
