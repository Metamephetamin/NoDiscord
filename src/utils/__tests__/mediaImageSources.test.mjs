import assert from "node:assert/strict";
import test from "node:test";

import { canUseDirectImageMediaUrl } from "../mediaImageSources.mjs";

test("direct image fallback skips HEIC and HEIF files that need backend rendering", () => {
  assert.equal(canUseDirectImageMediaUrl("/chat-files/photo.heic"), false);
  assert.equal(canUseDirectImageMediaUrl("https://lanaya.space/chat-files/photo.HEIF?cache=1"), false);
});

test("direct image fallback still allows browser-renderable and local preview URLs", () => {
  assert.equal(canUseDirectImageMediaUrl("/chat-files/photo.png"), true);
  assert.equal(canUseDirectImageMediaUrl("https://lanaya.space/chat-files/photo.webp"), true);
  assert.equal(canUseDirectImageMediaUrl("blob:http://localhost/photo"), true);
  assert.equal(canUseDirectImageMediaUrl("data:image/png;base64,AAAA"), true);
});
