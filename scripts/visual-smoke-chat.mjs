import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const css = readFileSync("src/css/TextChat.css", "utf8");

const requiredSelectors = [
  ".msg-content--dm",
  ".msg-content--dm:not(.msg-content--attachments):not(.msg-content--media-only):not(.msg-content--file-attachments)::before",
  ".message-text-row",
  ".message-footer--inline",
  ".message-read-status__check",
  ".message-attachment--document.message-attachment--local-echo",
  ".message-attachment__upload-spinner",
];

for (const selector of requiredSelectors) {
  assert(css.includes(selector), `Missing selector: ${selector}`);
}

assert(css.includes("isolation: isolate"), "DM bubble tail must stay in an isolated stacking context.");
assert(css.includes("z-index: -1"), "DM bubble tail must remain behind the bubble.");

console.log("Chat visual smoke checks passed.");
