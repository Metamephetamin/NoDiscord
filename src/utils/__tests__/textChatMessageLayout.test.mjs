import assert from "node:assert/strict";
import test from "node:test";

import { shouldUseInlineDirectMessageFooter } from "../textChatMessageLayout.mjs";

test("shouldUseInlineDirectMessageFooter allows long single-line direct text", () => {
  assert.equal(shouldUseInlineDirectMessageFooter({
    isDirectChat: true,
    messageText: "Лывдпьыдабпрдвобедабджвео",
  }), true);
});

test("shouldUseInlineDirectMessageFooter rejects explicit multiline text", () => {
  assert.equal(shouldUseInlineDirectMessageFooter({
    isDirectChat: true,
    messageText: "первая строка\nвторая строка",
  }), false);
});

test("shouldUseInlineDirectMessageFooter rejects attachment messages", () => {
  assert.equal(shouldUseInlineDirectMessageFooter({
    isDirectChat: true,
    messageText: "файл",
    hasRenderableAttachments: true,
  }), false);
});
