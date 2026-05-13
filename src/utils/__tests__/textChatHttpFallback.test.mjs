import test from "node:test";
import assert from "node:assert/strict";

import {
  canUseHttpOutboxFallback,
  isRealtimeSendUnavailableError,
} from "../textChatHttpFallback.js";

test("canUseHttpOutboxFallback allows one plain text payload without attachments", () => {
  assert.equal(canUseHttpOutboxFallback([
    {
      message: "hello",
      attachments: [],
      attachmentUrl: "",
      voiceMessage: null,
    },
  ]), true);
});

test("canUseHttpOutboxFallback rejects attachments and batched sends", () => {
  assert.equal(canUseHttpOutboxFallback([{ message: "one" }, { message: "two" }]), false);
  assert.equal(canUseHttpOutboxFallback([{ message: "file", attachments: [{ attachmentUrl: "/chat-files/a.png" }] }]), false);
  assert.equal(canUseHttpOutboxFallback([{ message: "legacy file", attachmentUrl: "/chat-files/a.png" }]), false);
  assert.equal(canUseHttpOutboxFallback([{ message: "voice", voiceMessage: { durationMs: 1000 } }]), false);
});

test("isRealtimeSendUnavailableError detects connection failures but not hub validation", () => {
  assert.equal(isRealtimeSendUnavailableError(new Error("Cannot send data if the connection is not in the Connected State.")), true);
  assert.equal(isRealtimeSendUnavailableError(new Error("Server timeout elapsed without receiving a message from the server.")), true);
  assert.equal(isRealtimeSendUnavailableError(new Error("Слишком много сообщений подряд. Подождите 4 сек.")), false);
});
