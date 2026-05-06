import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const read = (path) => readFileSync(join(root, path), "utf8");

const tokenSource = read("src/utils/themeTokens.js");
const indexCss = read("src/index.css");
const authCss = read("src/css/Auth.css");
const menuCss = read("src/css/MenuMain.css");
const textChatCss = read("src/css/TextChat.css");
const packageJson = JSON.parse(read("package.json"));

const requiredTokens = [
  "--app-bg",
  "--app-panel",
  "--app-panel-strong",
  "--app-text",
  "--app-text-muted",
  "--app-border",
  "--app-accent",
  "--app-danger",
  "--app-shadow",
];

for (const token of requiredTokens) {
  assert(
    tokenSource.includes(`"${token}"`),
    `Theme token registry is missing ${token}.`,
  );
  assert(indexCss.includes(`${token}:`), `src/index.css is missing ${token}.`);
}

for (const marker of [
  "html[data-ui-theme=\"light\"]",
  "html[data-ui-theme=\"purple\"]",
]) {
  assert(indexCss.includes(marker), `Missing theme token block: ${marker}.`);
}

assert(
  authCss.includes(".auth-input") &&
    authCss.includes("color: #172133") &&
    authCss.includes("-webkit-text-fill-color: #172133"),
  "Auth inputs must set both color and -webkit-text-fill-color.",
);

assert(
  authCss.includes(".auth-page--login .auth-input") &&
    authCss.includes("-webkit-text-fill-color: #1d2738"),
  "Login auth inputs must keep their own readable text fill.",
);

const css = `${menuCss}\n${textChatCss}`;
const requiredCoverage = [
  "html[data-ui-theme=\"light\"] .settings-backdrop",
  "html[data-ui-theme=\"light\"] .settings-shell",
  "html[data-ui-theme=\"light\"] .settings-shell__nav-item",
  "html[data-ui-theme=\"light\"] .voice-settings-card",
  "html[data-ui-theme=\"light\"] .stream-modal",
  "html[data-ui-theme=\"light\"] .server-invite-modal",
  "html[data-ui-theme=\"light\"] .chat-user-menu",
  "html[data-ui-theme=\"light\"] .message-context-menu",
  "html[data-ui-theme=\"light\"] .attach-menu__popover",
  "html[data-ui-theme=\"light\"] .batch-upload-sheet",
  "html[data-ui-theme=\"light\"] .chat-profile-modal",
];

for (const selector of requiredCoverage) {
  assert(css.includes(selector), `Missing light theme coverage for ${selector}.`);
}

for (const token of [
  "--app-text",
  "--app-text-muted",
  "--app-border",
  "--app-accent",
  "--app-danger",
  "--app-shadow",
]) {
  assert(css.includes(`var(${token}`), `Theme CSS does not use var(${token}).`);
}

assert.equal(
  packageJson.scripts?.["test:theme"],
  "node ./scripts/auth-theme-smoke.mjs",
  "package.json must expose npm run test:theme.",
);

console.log("Theme token smoke checks passed.");
