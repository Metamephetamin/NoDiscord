import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const css = readFileSync("src/css/MenuMain.css", "utf8");
const source = readFileSync("src/components/FriendsWorkspace.jsx", "utf8");

assert(source.includes('className="friends-conversation-card__avatar"'), "Conversation cards should use the stable avatar class.");
assert(css.includes(".friends-conversation-card__avatar"), "Conversation avatar CSS should exist.");
assert(css.includes("aspect-ratio: 1 / 1;"), "Conversation avatars should keep a square box before media settles.");
assert(css.includes("border-radius: 50%;"), "Conversation avatars should always be circular.");
assert(css.includes("overflow: hidden;"), "Conversation avatars should clip media during hover/load transitions.");
assert(css.includes("-webkit-clip-path: inset(0 round 50%);"), "Conversation avatars should clip consistently in Chromium.");
assert(css.includes("object-fit: cover;") && css.includes("object-position: center;"), "Conversation avatars should crop centered media consistently.");

console.log("friends-conversation-avatar smoke passed");
