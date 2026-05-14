import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const css = readFileSync(resolve("src/css/TextChat.css"), "utf8");

test("direct single media messages keep a concrete responsive width", () => {
  assert.match(css, /\.message-item--dm\s+\.msg-content--media-only:not\(\.msg-content--single-video-only\)\s+\.message-attachment-single[\s\S]*?\.message-item--dm\s+\.msg-content--media-only:not\(\.msg-content--single-video-only\)\s+\.message-attachment-single\s+\.message-media[\s\S]*?\{[\s\S]*?min-width:\s*min\(220px,\s*calc\(100vw\s*-\s*128px\)\)/);
});

test("single video messages keep a concrete responsive width in every chat", () => {
  assert.match(
    css,
    /\.msg-content--single-video-only\s+\.message-media-overlay-anchor[\s\S]*?\.msg-content--single-video-only\s+\.message-attachment-single[\s\S]*?\.msg-content--single-video-only\s+\.message-attachment-single\s+\.message-media[\s\S]*?\.msg-content--single-video-only\s*>\s*\.message-media--video\s*\{[\s\S]*?width:\s*clamp\(240px,\s*32vw,\s*340px\)\s*!important;/,
    "single video shells should match the compact location-card width instead of stretching across the chat",
  );
  assert.match(
    css,
    /\.message-item--dm\s+\.msg-content--single-video-only\s+\.message-media-overlay-anchor[\s\S]*?\.message-item--dm-own\s+\.msg-content--single-video-only\s*>\s*\.message-media--video\s*\{[\s\S]*?width:\s*clamp\(240px,\s*32vw,\s*340px\)\s*!important;/,
    "direct chat single videos should keep the same compact width for both incoming and own messages",
  );
});
