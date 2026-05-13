import { readFileSync } from "node:fs";
import assert from "node:assert/strict";

const css = readFileSync("src/css/TextChat.css", "utf8");

assert(
  /\.msg-content--media-only,\s*\.msg-content--dm\.msg-content--media-only,\s*\.msg-content--dm-own\.msg-content--media-only\s*\{[\s\S]*?position:\s*relative;[\s\S]*?flex:\s*0 0 auto;[\s\S]*?width:\s*auto;[\s\S]*?max-width:\s*100%;/.test(css),
  "Media-only message shell should keep intrinsic width without collapsing to a zero-width fit-content shell."
);
assert(
  /\.message-item--dm\s+\.msg-content--media-only,\s*\.message-item--dm-own\s+\.msg-content--media-only\s*\{[\s\S]*?width:\s*auto;/.test(css),
  "DM media-only override should target the message content node for both incoming and own messages."
);
assert(
  css.includes("min-width: 0;") && css.includes("flex: 0 1 auto;"),
  "DM media-only shell should not reserve the old wide media column."
);
assert(
  /\.message-attachments-stack--single\.message-attachments-stack--with-overlay\s*\{[\s\S]*?width:\s*fit-content\s*!important;/.test(css),
  "Single media stacks with overlay should stay fit-content."
);
assert(
  !css.includes("min-width: min(220px, 100%);"),
  "Media-only shells should not use percentage-based min-width guards that can resolve to 0px."
);
assert(
  /\.msg-content--media-only:not\(\.msg-content--single-video-only\)\s+\.message-attachments-stack--single\.message-attachments-stack--with-overlay,[\s\S]*?\.msg-content--media-only:not\(\.msg-content--single-video-only\)\s+\.message-attachment-single\s+\.message-media\s*\{[\s\S]*?min-width:\s*min\(220px,\s*calc\(100vw\s*-\s*160px\)\);/.test(css),
  "Single media-only image shells should have a viewport-based definite width instead of a nested fit-content chain."
);
assert(
  /\.msg-content--media-only:not\(\.msg-content--single-video-only\)\s+\.message-attachment-single\s+\.message-media__image\s*\{[\s\S]*?width:\s*auto;[\s\S]*?height:\s*auto;[\s\S]*?max-width:\s*min\(100%,\s*520px\);/.test(css),
  "Single media-only images should fill the definite media shell without collapsing."
);
assert(
  /\.message-item--dm\s+\.msg-content--visual-attachments\s*\{[\s\S]*?width:\s*fit-content;[\s\S]*?max-width:\s*min\(100%,\s*520px\);[\s\S]*?min-width:\s*0;[\s\S]*?flex:\s*0 1 auto;/.test(css),
  "Captioned DM media shells should shrink to the media/caption width instead of filling the row."
);
assert(
  /\.message-item--dm-own\s+\.msg-content--dm:not\(\.msg-content--attachments\):not\(\.msg-content--media-only\):not\(\.msg-content--file-attachments\):not\(\.msg-content--emoji-only-text\)::before\s*\{[\s\S]*?right:\s*auto;[\s\S]*?left:\s*-9px;[\s\S]*?transform:\s*none;/.test(css),
  "Own DM message tails should stay on the left near the avatar."
);
assert(
  css.includes(".message-attachments-stack--single.message-attachments-stack--with-overlay .message-media-overlay-footer") &&
  css.includes("padding: 3px 8px;") &&
  css.includes("min-height: 22px;"),
  "Single media footer should be a thin bottom overlay."
);
assert(
  /\.msg-content--single-video-only\s+\.message-media-overlay-anchor[\s\S]*?\.msg-content--single-video-only\s+\.message-attachment-single[\s\S]*?\.msg-content--single-video-only\s+\.message-attachment-single\s+\.message-media[\s\S]*?\.msg-content--single-video-only\s*>\s*\.message-media--video\s*\{[\s\S]*?width:\s*min\(620px,\s*calc\(100vw\s*-\s*160px\)\)\s*!important;/.test(css),
  "Single video media shells should use a concrete viewport-based width in all chats."
);
assert(
  /\.message-item--dm\s+\.msg-content--single-video-only\s+\.message-media-overlay-anchor[\s\S]*?\.message-item--dm-own\s+\.msg-content--single-video-only\s*>\s*\.message-media--video\s*\{[\s\S]*?width:\s*min\(620px,\s*calc\(100vw\s*-\s*128px\)\)\s*!important;/.test(css),
  "Single video media shells should use a concrete viewport-based width in direct chats too."
);

console.log("media-message-shell smoke passed");
