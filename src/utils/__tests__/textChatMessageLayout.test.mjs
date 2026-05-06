import assert from "node:assert/strict";
import test from "node:test";

import {
  shouldReserveVisualAttachmentWidth,
  shouldUseInlineDirectMessageFooter,
} from "../textChatMessageLayout.mjs";

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

test("shouldReserveVisualAttachmentWidth keeps captioned media from collapsing to caption width", () => {
  assert.equal(shouldReserveVisualAttachmentWidth({
    hasVisualAttachmentGroup: true,
    isMediaOnlyMessage: false,
  }), true);
});

test("shouldReserveVisualAttachmentWidth does not affect media-only or file attachment messages", () => {
  assert.equal(shouldReserveVisualAttachmentWidth({
    hasVisualAttachmentGroup: true,
    isMediaOnlyMessage: true,
  }), false);

  assert.equal(shouldReserveVisualAttachmentWidth({
    hasVisualAttachmentGroup: false,
    isMediaOnlyMessage: false,
  }), false);
});
