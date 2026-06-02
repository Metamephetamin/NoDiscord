import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";

function readCssWithImports(path, seen = new Set()) {
  if (seen.has(path)) {
    return "";
  }

  seen.add(path);
  const source = readFileSync(path, "utf8");
  const baseDir = dirname(path);
  const imports = [...source.matchAll(/@import\s+["'](.+?)["'];/g)]
    .map((match) => readCssWithImports(join(baseDir, match[1]), seen));

  return [source, ...imports].join("\n");
}

const css = readCssWithImports("src/css/TextChat.css");
const messageListSource = readFileSync("src/components/TextChatMessageList.jsx", "utf8");
const friendsControllerSource = readFileSync("BackNoDiscord/BackNoDiscord/Controllers/FriendsController.cs", "utf8");
const conversationsControllerSource = readFileSync("BackNoDiscord/BackNoDiscord/Controllers/ConversationsController.cs", "utf8");

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
assert(css.includes("--voice-waveform-width"), "Voice messages must reserve a stable, wider waveform width instead of leaving empty bubble space.");
assert(!css.includes("background: linear-gradient(180deg, #356d9e 0%, #2b5f8d 100%)"), "File-only document bubbles must not use the old bright blue background.");
assert(!messageListSource.includes("message-attachment__upload-spinner"), "Document upload rows must not render a second right-side loader.");
assert(!messageListSource.includes("OPEN WITH"), "Ready document attachments must not render the legacy OPEN WITH label.");
assert(friendsControllerSource.includes("profile_background_url = friend.profile_background_url"), "Friends payload must include profile background URLs for profile cards.");
assert(friendsControllerSource.includes("profile_background_frame = MediaFrameSerializer.Parse(friend.profile_background_frame_json"), "Friends payload must include profile background frames.");
assert(conversationsControllerSource.includes("ProfileBackgroundUrl = item.profile_background_url"), "Conversation member payload must load profile background URLs.");
assert(conversationsControllerSource.includes("profile_background_url = user?.ProfileBackgroundUrl"), "Conversation member payload must expose profile background URLs.");

console.log("Chat visual smoke checks passed.");
