import test from "node:test";
import assert from "node:assert/strict";

import {
  formatVoiceChannelDuration,
  getVoiceChannelDurationMs,
  getVoiceParticipantDurationMs,
  resolveVoiceChannelSessionStartedAtMs,
} from "../voiceChannelDuration.js";

test("formats voice channel duration without hours until an hour passes", () => {
  assert.equal(formatVoiceChannelDuration(0), "00:00");
  assert.equal(formatVoiceChannelDuration(5_000), "00:05");
  assert.equal(formatVoiceChannelDuration(65_000), "01:05");
  assert.equal(formatVoiceChannelDuration(3_599_000), "59:59");
  assert.equal(formatVoiceChannelDuration(3_600_000), "1:00:00");
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

test("channel session start survives when the oldest participant leaves", () => {
  const startedAtMs = resolveVoiceChannelSessionStartedAtMs({
    previousStartedAtMs: null,
    participants: [
      { voiceElapsedMs: 60_000, voiceElapsedSyncedAtMs: 1_000 },
      { voiceElapsedMs: 20_000, voiceElapsedSyncedAtMs: 1_000 },
    ],
    nowMs: 1_000,
  });

  assert.equal(startedAtMs, -59_000);

  const nextStartedAtMs = resolveVoiceChannelSessionStartedAtMs({
    previousStartedAtMs: startedAtMs,
    participants: [
      { voiceElapsedMs: 22_000, voiceElapsedSyncedAtMs: 3_000 },
    ],
    nowMs: 3_000,
  });

  assert.equal(nextStartedAtMs, startedAtMs);
  assert.equal(formatVoiceChannelDuration(63_000 - nextStartedAtMs), "02:02");
});

test("channel session start resets when channel becomes empty", () => {
  assert.equal(resolveVoiceChannelSessionStartedAtMs({
    previousStartedAtMs: -59_000,
    participants: [],
    nowMs: 10_000,
  }), null);
});
