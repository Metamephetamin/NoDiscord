import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const css = readFileSync("src/css/TextChat.css", "utf8");
const messageListSource = readFileSync("src/components/TextChatMessageList.jsx", "utf8");

const requiredSelectors = [
  ".msg-content--dm",
  ".msg-content--dm:not(.msg-content--attachments):not(.msg-content--media-only):not(.msg-content--file-attachments):not(.msg-content--emoji-only-text)::before",
  ".message-text-row",
  ".message-footer--inline",
  ".message-read-status__check",
  ".message-attachment--document.message-attachment--local-echo",
  ".message-attachment__upload-control",
  ".msg-content--dm.msg-content--emoji-only-text",
  ".message-item--emoji-only-text",
  ".msg-content--dm.msg-content--file-only",
  ".msg-content--dm.msg-content--file-only::before",
];

for (const selector of requiredSelectors) {
  assert(css.includes(selector), `Missing selector: ${selector}`);
}

assert(css.includes("isolation: isolate"), "DM bubble tail must stay in an isolated stacking context.");
assert(css.includes("z-index: -1"), "DM bubble tail must remain behind the bubble.");
assert(css.includes(".msg-content--dm.msg-content--emoji-only-text::before"), "Emoji-only DM messages must not render a bubble tail.");
assert(css.includes(":not(.msg-content--emoji-only-text)::before"), "Emoji-only DM messages must be excluded from the shared DM tail selector.");
assert(css.includes("background: transparent"), "Emoji-only DM messages must not render a bubble background.");
assert(css.includes("flex-direction: row"), "Emoji-only DM messages must keep emoji and time on one row.");
assert(css.includes(".msg-content--dm.msg-content--file-only::before"), "File-only DM messages must not render a bubble tail.");
assert(css.includes(".msg-content--file-only .message-attachment--document"), "File-only document attachments must use the compact file pill style.");
assert(!messageListSource.includes("message-attachment__upload-spinner"), "Document upload rows must not render a second right-side loader.");
assert(!messageListSource.includes("OPEN WITH"), "Ready document attachments must not render the legacy OPEN WITH label.");

console.log("Chat visual smoke checks passed.");
