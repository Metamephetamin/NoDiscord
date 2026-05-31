import test from "node:test";
import assert from "node:assert/strict";

import {
  MAX_PERSISTENT_CACHED_MESSAGES,
  getLatestCachedTextChatMessageId,
  getOldestCachedTextChatMessageId,
  mergeCachedTextChatMessages,
} from "../textChatMessageCache.js";

test("mergeCachedTextChatMessages deduplicates by id and keeps timeline order", () => {
  const existing = [
    { id: "10", message: "old 10", timestamp: "2026-05-31T10:00:00.000Z" },
    { id: "11", message: "old 11", timestamp: "2026-05-31T10:01:00.000Z" },
  ];
  const incoming = [
    { id: "11", message: "updated 11", timestamp: "2026-05-31T10:01:00.000Z" },
    { id: "12", message: "new 12", timestamp: "2026-05-31T10:02:00.000Z" },
  ];

  const merged = mergeCachedTextChatMessages(existing, incoming, { maxMessages: 20 });

  assert.deepEqual(merged.map((message) => message.id), ["10", "11", "12"]);
  assert.equal(merged[1].message, "updated 11");
});

test("mergeCachedTextChatMessages keeps only the latest persistent cache window", () => {
  const messages = Array.from({ length: MAX_PERSISTENT_CACHED_MESSAGES + 5 }, (_, index) => ({
    id: String(index + 1),
    message: `message ${index + 1}`,
    timestamp: new Date(Date.UTC(2026, 4, 31, 10, index, 0)).toISOString(),
  }));

  const merged = mergeCachedTextChatMessages([], messages);

  assert.equal(merged.length, MAX_PERSISTENT_CACHED_MESSAGES);
  assert.equal(merged[0].id, "6");
  assert.equal(merged.at(-1).id, String(MAX_PERSISTENT_CACHED_MESSAGES + 5));
});

test("cached message id helpers find sync cursors", () => {
  const messages = [
    { id: "12", timestamp: "2026-05-31T10:02:00.000Z" },
    { id: "10", timestamp: "2026-05-31T10:00:00.000Z" },
    { id: "11", timestamp: "2026-05-31T10:01:00.000Z" },
  ];

  assert.equal(getOldestCachedTextChatMessageId(messages), 10);
  assert.equal(getLatestCachedTextChatMessageId(messages), 12);
});
