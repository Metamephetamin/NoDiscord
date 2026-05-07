import { readFileSync } from "node:fs";
import assert from "node:assert/strict";

const css = readFileSync("src/css/TextChat.css", "utf8");

assert(
  css.includes(".msg-content--dm:not(.msg-content--attachments):not(.msg-content--media-only):not(.msg-content--file-attachments):not(.msg-content--emoji-only-text)::before"),
  "DM message tail rule should stay explicit."
);
assert(
  !css.includes("border-left: 1px solid rgba(255, 255, 255, 0.08);"),
  "DM message tail should not draw a left outline."
);
assert(
  !css.includes("border-bottom: 1px solid rgba(255, 255, 255, 0.08);"),
  "DM message tail should not draw a bottom outline."
);
assert(
  css.includes("html[data-ui-theme=\"light\"] .msg-content--dm,\nhtml[data-ui-theme=\"light\"] .message-item:not(.message-item--dm) .msg-content,\nhtml[data-ui-theme=\"purple\"] .msg-content--dm,\nhtml[data-ui-theme=\"purple\"] .message-item:not(.message-item--dm) .msg-content {\n  border-color: transparent;\n}"),
  "Theme overrides should keep message shell borders visually hidden."
);

console.log("message-shell-border smoke passed");
