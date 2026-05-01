import assert from "node:assert/strict";
import test from "node:test";

import { getTelegramUploadOverlayState } from "../textChatUploadOverlay.mjs";

test("getTelegramUploadOverlayState exposes retry action for failed uploads", () => {
  const state = getTelegramUploadOverlayState({
    localEchoStatus: "failed",
    localEchoProgress: 43,
    localEchoError: "Network failed",
  });

  assert.equal(state.visible, true);
  assert.equal(state.failed, true);
  assert.equal(state.primaryAction, "retry");
  assert.equal(state.label, "Network failed");
  assert.equal(state.progress, 43);
});

test("getTelegramUploadOverlayState exposes cancel action while uploading", () => {
  const state = getTelegramUploadOverlayState({
    localEchoStatus: "uploading",
    localEchoProgress: 57.6,
  });

  assert.equal(state.visible, true);
  assert.equal(state.failed, false);
  assert.equal(state.primaryAction, "cancel");
  assert.equal(state.label, "\u0417\u0430\u0433\u0440\u0443\u0437\u043a\u0430 58%");
  assert.equal(state.progress, 58);
});

test("getTelegramUploadOverlayState hides sent overlays", () => {
  const state = getTelegramUploadOverlayState({
    localEchoStatus: "sent",
    localEchoProgress: 100,
  });

  assert.equal(state.visible, false);
  assert.equal(state.primaryAction, "");
});
