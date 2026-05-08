import { readFileSync } from "node:fs";
import assert from "node:assert/strict";

const css = readFileSync("src/css/TextChat.css", "utf8");

assert(
  css.includes(".message-item--dm .msg-content--media-only,\n.message-item--dm-own.msg-content--media-only {\n  width: fit-content;"),
  "DM media-only message shell should shrink to the media width."
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
