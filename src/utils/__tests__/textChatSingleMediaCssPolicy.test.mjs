import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const css = readFileSync(resolve("src/css/TextChat.css"), "utf8");

test("direct single media messages keep a concrete responsive width", () => {
  assert.match(css, /\.message-item--dm\s+\.msg-content--media-only:not\(\.msg-content--single-video-only\)\s+\.message-attachment-single[\s\S]*?\.message-item--dm\s+\.msg-content--media-only:not\(\.msg-content--single-video-only\)\s+\.message-attachment-single\s+\.message-media[\s\S]*?\{[\s\S]*?min-width:\s*min\(220px,\s*calc\(100vw\s*-\s*128px\)\)/);
});
