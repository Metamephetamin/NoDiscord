import assert from "node:assert/strict";
import test from "node:test";

import { mergeCurrentVoiceParticipants } from "../../features/menu-main/voiceParticipantsViewUtils.js";

test("live room participant snapshot removes stale server participants", () => {
  const merged = mergeCurrentVoiceParticipants({
    hasLiveKitSnapshot: true,
    rawParticipants: [
      { userId: "1", name: "Alice", joinedAtUtc: "2026-05-31T12:00:00Z", voiceElapsedMs: 5000 },
      { userId: "2", name: "Bob", joinedAtUtc: "2026-05-31T12:00:10Z", voiceElapsedMs: 1000 },
    ],
    liveKitParticipants: [
      { userId: "1", name: "Alice Live" },
    ],
  });

  assert.deepEqual(merged.map((participant) => participant.userId), ["1"]);
  assert.equal(merged[0].name, "Alice Live");
  assert.equal(merged[0].joinedAtUtc, "2026-05-31T12:00:00Z");
  assert.equal(merged[0].voiceElapsedMs, 5000);
});

test("server participant snapshot is used before live room snapshot exists", () => {
  const merged = mergeCurrentVoiceParticipants({
    hasLiveKitSnapshot: false,
    rawParticipants: [
      { userId: "1", name: "Alice" },
    ],
    liveKitParticipants: [],
  });

  assert.deepEqual(merged.map((participant) => participant.userId), ["1"]);
});
