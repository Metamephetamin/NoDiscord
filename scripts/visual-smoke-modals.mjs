import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const menuCss = readFileSync("src/css/MenuMain.css", "utf8");
const textChatCss = readFileSync("src/css/TextChat.css", "utf8");
const overlaysSource = readFileSync("src/components/MenuMainOverlays.jsx", "utf8");
const serverWorkspaceSource = readFileSync("src/components/ServerWorkspace.jsx", "utf8");
const composerSource = readFileSync("src/components/TextChatComposer.jsx", "utf8");
const uploadSource = readFileSync("src/components/TextChatBatchUploadSheet.jsx", "utf8");
const userMenuSource = readFileSync("src/components/TextChatUserContextMenu.jsx", "utf8");
const profileModalSource = readFileSync("src/components/TextChatProfileModal.jsx", "utf8");

const requiredSourceMarkers = [
  [overlaysSource, "create-server-modal"],
  [overlaysSource, "stream-modal"],
  [serverWorkspaceSource, "server-invite-modal"],
  [composerSource, "attach-menu__popover"],
  [uploadSource, "batch-upload-sheet"],
  [userMenuSource, "chat-user-menu"],
  [profileModalSource, "chat-profile-modal"],
];

for (const [source, marker] of requiredSourceMarkers) {
  assert(source.includes(marker), `Missing modal source marker: ${marker}`);
}

const css = `${menuCss}\n${textChatCss}`;
const requiredLightSelectors = [
  'html[data-ui-theme="light"] .stream-modal',
  'html[data-ui-theme="light"] .create-server-modal',
  'html[data-ui-theme="light"] .stream-modal__field select',
  'html[data-ui-theme="light"] .stream-modal__field input',
  'html[data-ui-theme="light"] .device-menu__panel',
  'html[data-ui-theme="light"] .server-invite-modal',
  'html[data-ui-theme="light"] .member-role-menu',
  'html[data-ui-theme="light"] .server-summary-menu',
  'html[data-ui-theme="light"] .attach-menu__popover',
  'html[data-ui-theme="light"] .batch-upload-sheet',
  'html[data-ui-theme="light"] .chat-user-menu',
  'html[data-ui-theme="light"] .message-context-menu',
  'html[data-ui-theme="light"] .chat-profile-modal',
];

for (const selector of requiredLightSelectors) {
  assert(css.includes(selector), `Missing modal light theme selector: ${selector}`);
}

for (const selector of [
  ".stream-modal",
  ".create-server-modal",
  ".device-menu__panel",
  ".attach-menu__popover",
  ".batch-upload-sheet",
  ".chat-user-menu",
  ".message-context-menu",
  ".chat-profile-modal",
]) {
  assert(css.includes(selector), `Missing base modal selector: ${selector}`);
}

assert(css.includes("-webkit-text-fill-color"), "Modal/input CSS must control WebKit text fill.");
assert(css.includes("var(--app-danger)"), "Danger actions must use the theme danger token.");

console.log("Modal visual smoke checks passed.");
