import assert from "node:assert/strict";
import test from "node:test";

import { getDocumentUploadCardState, getTelegramUploadOverlayState } from "../textChatUploadOverlay.mjs";

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

test("getTelegramUploadOverlayState exposes uploaded and total size while uploading", () => {
  const state = getTelegramUploadOverlayState({
    localEchoStatus: "uploading",
    localEchoProgress: 73,
    localEchoUploadedBytes: 7.1 * 1024 * 1024,
    attachmentSize: 9.7 * 1024 * 1024,
  });

  assert.equal(state.visible, true);
  assert.equal(state.primaryAction, "cancel");
  assert.equal(state.progress, 73);
  assert.equal(state.progressLabel, "7.1 MB / 9.7 MB");
});

test("getTelegramUploadOverlayState hides sent overlays", () => {
  const state = getTelegramUploadOverlayState({
    localEchoStatus: "sent",
    localEchoProgress: 100,
  });

  assert.equal(state.visible, false);
  assert.equal(state.primaryAction, "");
});

test("getDocumentUploadCardState exposes uploaded and total size while uploading", () => {
  const state = getDocumentUploadCardState({
    localEchoStatus: "uploading",
    localEchoProgress: 58,
    localEchoUploadedBytes: 50 * 1024 * 1024,
    attachmentSize: 87 * 1024 * 1024,
  });

  assert.equal(state.visible, true);
  assert.equal(state.active, true);
  assert.equal(state.failed, false);
  assert.equal(state.showSpinner, true);
  assert.equal(state.progress, 58);
  assert.equal(state.progressLabel, "50 MB / 87 MB");
  assert.equal(state.statusLabel, "\u0417\u0430\u0433\u0440\u0443\u0437\u043a\u0430");
});

test("getDocumentUploadCardState shows retry state for failed uploads", () => {
  const state = getDocumentUploadCardState({
    localEchoStatus: "failed",
    localEchoProgress: 32,
    localEchoError: "File type is not allowed.",
    attachmentSize: 200,
  });

  assert.equal(state.visible, true);
  assert.equal(state.active, false);
  assert.equal(state.failed, true);
  assert.equal(state.showSpinner, false);
  assert.equal(state.progressLabel, "File type is not allowed.");
  assert.equal(state.primaryAction, "retry");
});
