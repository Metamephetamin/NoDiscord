import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const panelsSource = readFileSync("src/components/MenuSettingsPanels.jsx", "utf8");
const rendererSource = readFileSync("src/features/menu-main/MenuMainSettingsRenderer.jsx", "utf8");
const controllerSource = readFileSync("src/features/menu-main/MenuMainController.jsx", "utf8");
const css = readFileSync("src/css/MenuMain.css", "utf8");
const indexCss = readFileSync("src/index.css", "utf8");

const requiredPanels = [
  "export const AccountSettings",
  "export const VoiceSettingsPanel",
  "export const PersonalProfileSettings",
  "export const AppearanceAccessibilitySettings",
  "theme-choice-list",
  "UI_THEME_OPTIONS.map",
  "theme-choice--${option.id}",
  "onThemeChange",
];

for (const marker of requiredPanels) {
  assert(panelsSource.includes(marker), `Missing settings panel marker: ${marker}`);
}

for (const tab of [
  'case "account"',
  'case "personal_profile"',
  'case "appearance_accessibility"',
  'case "voice_video"',
]) {
  assert(rendererSource.includes(tab), `Settings renderer is missing ${tab}.`);
}

assert(controllerSource.includes("setUiTheme"), "Menu controller must wire theme changes.");
assert(controllerSource.includes("normalizeUiTheme"), "Menu controller must normalize theme ids.");
assert(indexCss.includes('html[data-ui-theme="light"]'), "Light theme root tokens are missing.");
assert(indexCss.includes('html[data-ui-theme="purple"]'), "Purple theme root tokens are missing.");

const requiredThemeSelectors = [
  'html[data-ui-theme="light"] .settings-shell',
  'html[data-ui-theme="light"] .settings-shell__sidebar',
  'html[data-ui-theme="light"] .settings-shell__content-header h2',
  'html[data-ui-theme="light"] .account-settings-panel',
  'html[data-ui-theme="light"] .voice-settings-card',
  'html[data-ui-theme="light"] .voice-settings-select',
  ".theme-choice",
  'html[data-ui-theme="purple"] .settings-shell',
  'html[data-ui-theme="purple"] .voice-settings-card',
];

for (const selector of requiredThemeSelectors) {
  assert(css.includes(selector), `Missing settings theme selector: ${selector}`);
}

for (const token of ["var(--app-text)", "var(--app-text-muted)", "var(--app-border)", "var(--app-surface)"]) {
  assert(css.includes(token), `Settings CSS should use ${token}.`);
}

console.log("Settings visual smoke checks passed.");
