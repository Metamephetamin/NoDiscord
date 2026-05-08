import { readFileSync } from "node:fs";
import assert from "node:assert/strict";

const css = readFileSync("src/css/TextChat.css", "utf8");

assert(
  css.includes(".msg-content--media-only,\n.msg-content--dm.msg-content--media-only,\n.msg-content--dm-own.msg-content--media-only {\n  position: relative;\n  flex: 0 0 auto;\n  width: auto;\n  max-width: 100%;"),
  "Media-only message shell should keep intrinsic width without collapsing to a zero-width fit-content shell."
);
assert(
  css.includes(".message-item--dm .msg-content--media-only,\n.message-item--dm-own .msg-content--media-only {\n  width: auto;"),
  "DM media-only override should target the message content node for both incoming and own messages."
);
assert(
  css.includes("min-width: 0;") && css.includes("flex: 0 1 auto;"),
  "DM media-only shell should not reserve the old wide media column."
);
assert(
  css.includes(".message-attachments-stack--single.message-attachments-stack--with-overlay {\n  width: fit-content !important;"),
  "Single media stacks with overlay should stay fit-content."
);
assert(
  css.includes(".message-attachment-single .message-media {\n  margin-top: 0;\n  width: fit-content;\n  min-width: min(220px, 100%);") &&
    css.includes(".message-attachment-single .message-media__image {\n  width: auto;\n  max-width: min(100%, 520px);"),
  "Single image media should not collapse through a 100%-width child inside a fit-content shell."
);
assert(
  css.includes(".message-item--dm .msg-content--visual-attachments {\n  width: fit-content;") &&
    css.includes(".message-item--dm .msg-content--visual-attachments {\n  width: fit-content;\n  max-width: min(100%, 520px);\n  min-width: 0;\n  flex: 0 1 auto;"),
  "Captioned DM media shells should shrink to the media/caption width instead of filling the row."
);
assert(
  css.includes(".message-item--dm-own .msg-content--dm:not(.msg-content--attachments):not(.msg-content--media-only):not(.msg-content--file-attachments):not(.msg-content--emoji-only-text)::before {\n  right: auto;\n  left: -10px;\n  transform: none;"),
  "Own DM message tails should stay on the left near the avatar."
);
assert(
  css.includes(".message-attachments-stack--single.message-attachments-stack--with-overlay .message-media-overlay-footer") &&
  css.includes("padding: 3px 8px;") &&
  css.includes("min-height: 22px;"),
  "Single media footer should be a thin bottom overlay."
);

console.log("media-message-shell smoke passed");
