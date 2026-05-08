import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const controllerSource = readFileSync("src/features/menu-main/MenuMainController.jsx", "utf8");
const settingsSource = readFileSync("src/components/MenuSettingsPanels.jsx", "utf8");
const rendererSource = readFileSync("src/features/menu-main/MenuMainSettingsRenderer.jsx", "utf8");
const storageSource = readFileSync("src/features/menu-main/menuMainWorkspaceStorage.js", "utf8");
const themeSource = readFileSync("src/utils/chatTheme.mjs", "utf8");
const chatCss = readFileSync("src/css/TextChat.css", "utf8");
const menuCss = readFileSync("src/css/MenuMain.css", "utf8");

assert(themeSource.includes("CHAT_THEME_OPTIONS"), "Chat theme presets should live in a dedicated utility.");
assert(themeSource.includes("applyChatThemePreference"), "Chat theme utility should apply root/body CSS variables.");
assert(themeSource.includes("--chat-message-bubble-bg"), "Chat theme presets should control message bubble color.");
assert(themeSource.includes("--chat-document-bg"), "Chat theme presets should control document block color.");
assert(themeSource.includes("--chat-custom-background-image"), "Custom chat background should be applied through a CSS variable.");

assert(storageSource.includes("chatThemeStorageKey"), "Chat theme should be persisted per user.");
assert(storageSource.includes("chatBackgroundStorageKey"), "Custom chat background should be persisted per user.");
assert(controllerSource.includes("MAX_CHAT_BACKGROUND_BYTES"), "Custom chat background should have a storage-friendly size limit.");
assert(controllerSource.includes("CHAT_BACKGROUND_IMAGE_TYPES"), "Custom chat background should restrict image formats.");
assert(controllerSource.includes("handleCustomChatBackgroundChange"), "Settings should handle custom chat background upload.");

assert(settingsSource.includes("Темы чата"), "Appearance settings should expose chat theme controls.");
assert(settingsSource.includes("CHAT_THEME_OPTIONS.map"), "Chat theme presets should render as selectable options.");
assert(settingsSource.includes("accept=\"image/png,image/jpeg,image/webp,image/gif\""), "Custom chat background input should accept safe raster formats.");
assert(rendererSource.includes("onChatThemeChange={setChatThemeId}"), "Settings renderer should wire chat theme changes.");

assert(chatCss.includes("background:\n    var(--chat-theme-overlay),\n    var(--chat-custom-background-image),\n    var(--chat-theme-background);"), "Text chat container should render chat-only gradient/custom background.");
assert(chatCss.includes("--message-bubble-bg: var(--chat-message-bubble-bg"), "DM bubbles should use chat theme color variables.");
assert(chatCss.includes("background: var(--chat-document-bg"), "Document blocks should use chat theme document variables.");
assert(
  chatCss.includes('html[data-chat-theme]:not([data-chat-theme="default"]) .msg-content--dm:not(.msg-content--attachments):not(.msg-content--media-only):not(.msg-content--file-attachments):not(.msg-content--emoji-only-text)'),
  "Chat theme bubble rule must not override media-only or attachment message shells."
);
assert(
  !chatCss.includes('html[data-chat-theme]:not([data-chat-theme="default"]) .msg-content--dm,\nbody[data-chat-theme]:not([data-chat-theme="default"]) .msg-content--dm'),
  "Chat theme should not apply a broad background rule to every DM message shell."
);
assert(menuCss.includes(".chat-theme-choice-list"), "Menu CSS should style chat theme picker.");
assert(menuCss.includes(".chat-background-picker"), "Menu CSS should style custom chat background picker.");

console.log("chat-theme smoke passed");
