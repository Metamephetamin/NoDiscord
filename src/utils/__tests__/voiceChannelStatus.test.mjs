import assert from "node:assert/strict";
import test from "node:test";

import {
  VOICE_CHANNEL_STATUS_CHAR_LIMIT,
  VOICE_CHANNEL_STATUS_WORD_LIMIT,
  normalizeVoiceChannelStatus,
} from "../voiceChannelStatus.js";

test("voice channel status is whitespace-normalized and bounded", () => {
  const longStatus = "  one   two three four five six seven eight nine ten eleven twelve thirteen fourteen  ";
  const normalized = normalizeVoiceChannelStatus(longStatus);

  assert.equal(normalized, "one two three four five six seven eight nine ten eleven twelve");
  assert.equal(normalized.split(/\s+/).length, VOICE_CHANNEL_STATUS_WORD_LIMIT);
  assert.equal(normalizeVoiceChannelStatus("  стрим   после   ужина  "), "стрим после ужина");
});

test("voice channel status also has a hard character cap", () => {
  const normalized = normalizeVoiceChannelStatus("a".repeat(VOICE_CHANNEL_STATUS_CHAR_LIMIT + 40));

  assert.ok(normalized.length <= VOICE_CHANNEL_STATUS_CHAR_LIMIT);
});
