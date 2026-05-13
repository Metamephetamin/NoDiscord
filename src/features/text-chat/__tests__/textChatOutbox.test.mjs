import test from "node:test";
import assert from "node:assert/strict";

import {
  markTextChatOutboxItemAttempt,
  readTextChatOutboxItems,
  removeTextChatOutboxItem,
  upsertTextChatOutboxItem,
} from "../textChatOutbox.mjs";

function installLocalStorageMock() {
  const values = new Map();
  globalThis.window = {
    localStorage: {
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => values.set(key, String(value)),
      removeItem: (key) => values.delete(key),
    },
  };
}

test("text chat outbox persists and deduplicates items by clientMessageId", () => {
  installLocalStorageMock();
  const item = {
    clientMessageId: "client-1",
    message: "hello",
    payload: [{ message: "hello", clientMessageId: "client-1" }],
  };

  upsertTextChatOutboxItem("42", "channel-1", item);
  upsertTextChatOutboxItem("42", "channel-1", { ...item, message: "hello again" });

  const items = readTextChatOutboxItems("42", "channel-1");
  assert.equal(items.length, 1);
  assert.equal(items[0].clientMessageId, "client-1");
  assert.equal(items[0].message, "hello again");
});

test("text chat outbox removes delivered items and tracks attempts", () => {
  installLocalStorageMock();

  upsertTextChatOutboxItem("42", "channel-1", {
    clientMessageId: "client-1",
    payload: [{ message: "hello", clientMessageId: "client-1" }],
  });

  const attempted = markTextChatOutboxItemAttempt("42", "channel-1", "client-1");
  assert.equal(attempted?.attemptCount, 1);

  removeTextChatOutboxItem("42", "channel-1", "client-1");
  assert.deepEqual(readTextChatOutboxItems("42", "channel-1"), []);
});
