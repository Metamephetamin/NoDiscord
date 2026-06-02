import assert from "node:assert/strict";
import test from "node:test";
import { readRepoFile } from "../../components/__tests__/readRepoFile.mjs";

const css = readRepoFile("src/css/TextChat.css");
const messageListSource = readRepoFile("src/components/TextChatMessageList.jsx");

test("single image messages match the large feature tile size from grouped media", () => {
  assert.match(
    css,
    /\.msg-content--media-only:not\(\.msg-content--single-video-only\)\s+\.message-attachment-single[\s\S]*?\.msg-content--media-only:not\(\.msg-content--single-video-only\)\s+\.message-attachment-single\s+\.message-media[\s\S]*?\{[\s\S]*?width:\s*clamp\(320px,\s*52vw,\s*520px\)\s*!important;[\s\S]*?height:\s*clamp\(320px,\s*84vw,\s*430px\);/,
  );
  assert.match(
    css,
    /\.msg-content--media-only:not\(\.msg-content--single-video-only\)\s+\.message-attachment-single\s+\.message-media__image\s*\{[\s\S]*?width:\s*100%\s*!important;[\s\S]*?height:\s*100%\s*!important;[\s\S]*?object-fit:\s*cover;/,
  );
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

test("media-only reactions stay outside the absolute media footer overlay", () => {
  assert.match(
    messageListSource,
    /message-bottom-row--media-reactions/,
    "media-only messages with reactions need a dedicated row class",
  );
  assert.match(
    css,
    /\.msg-content--media-only\s+\.message-bottom-row--media-reactions\s*\{[\s\S]*?position:\s*static;[\s\S]*?pointer-events:\s*auto;/,
    "reaction rows should participate in layout instead of being painted as the media footer overlay",
  );
});
