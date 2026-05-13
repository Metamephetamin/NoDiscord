import assert from "node:assert/strict";
import test from "node:test";

import { canLoadVideoPreviewUrl } from "../mediaPreviewUrls.mjs";

test("video previews can load local and server media URLs", () => {
  assert.equal(canLoadVideoPreviewUrl("blob:http://localhost/video"), true);
  assert.equal(canLoadVideoPreviewUrl("data:video/mp4;base64,AAAA"), true);
  assert.equal(canLoadVideoPreviewUrl("file:///tmp/video.mp4"), true);
  assert.equal(canLoadVideoPreviewUrl("/chat-files/user/video.mp4"), true);
  assert.equal(canLoadVideoPreviewUrl("https://lanaya.space/chat-files/user/video.mp4"), true);
});

test("video previews reject empty and protocol-relative URLs", () => {
  assert.equal(canLoadVideoPreviewUrl(""), false);
  assert.equal(canLoadVideoPreviewUrl("//evil.example/video.mp4"), false);
  assert.equal(canLoadVideoPreviewUrl("javascript:alert(1)"), false);
});
