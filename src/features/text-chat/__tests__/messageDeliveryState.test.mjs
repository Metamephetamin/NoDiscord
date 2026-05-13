import test from "node:test";
import assert from "node:assert/strict";

import {
  deriveMessageDeliveryState,
  normalizeClientMessageId,
} from "../messageDeliveryState.mjs";

test("normalizeClientMessageId prefers explicit clientMessageId and falls back to clientTempId", () => {
  assert.equal(normalizeClientMessageId({ clientMessageId: "msg-1", clientTempId: "temp-1" }), "msg-1");
  assert.equal(normalizeClientMessageId({ ClientMessageId: "msg-2" }), "msg-2");
  assert.equal(normalizeClientMessageId({ clientTempId: "temp-2" }), "temp-2");
  assert.equal(normalizeClientMessageId({ ClientTempId: "temp-3" }), "temp-3");
});

test("deriveMessageDeliveryState exposes queued sending sent delivered and failed", () => {
  assert.deepEqual(deriveMessageDeliveryState({ isLocalEcho: true, localEchoUploadState: "pending" }, true), {
    state: "queued",
    label: "Ожидает отправки",
    isTerminal: false,
  });

  assert.deepEqual(deriveMessageDeliveryState({ isLocalEcho: true, localEchoUploadState: "uploading" }, true), {
    state: "sending",
    label: "Отправляется",
    isTerminal: false,
  });

  assert.deepEqual(deriveMessageDeliveryState({ id: 1, isRead: false }, true), {
    state: "sent",
    label: "Отправлено",
    isTerminal: true,
  });

  assert.deepEqual(deriveMessageDeliveryState({ id: 1, isRead: true }, true), {
    state: "delivered",
    label: "Прочитано",
    isTerminal: true,
  });

  assert.deepEqual(deriveMessageDeliveryState({ isLocalEcho: true, localEchoUploadState: "failed" }, true), {
    state: "failed",
    label: "Не отправлено",
    isTerminal: true,
  });
});
