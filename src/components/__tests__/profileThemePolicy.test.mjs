import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const repoRoot = path.resolve(import.meta.dirname, "../../..");

const readRepoFile = (relativePath) =>
  readFileSync(path.join(repoRoot, relativePath), "utf8");

test("light UI theme overrides every customized bottom profile card surface", () => {
  const mainCss = readRepoFile("src/css/MenuMain.css");

  assert.match(
    mainCss,
    /html\[data-ui-theme="light"\] \.menu__profile\.profile-customization \.profile__identity-row,[\s\S]*?html\[data-ui-theme="light"\] \.profile__voice-stack\.profile-customization \{[\s\S]*?background: #ffffff;/,
  );
  assert.match(
    mainCss,
    /html\[data-ui-theme="light"\] \.menu__profile-wrapper--voice-connected\.menu__profile-wrapper--customized \.menu__profile\.profile-customization \.profile__identity-row,[\s\S]*?html\[data-ui-theme="light"\] \.menu__profile-wrapper--voice-connected\.menu__profile-wrapper--customized \.profile__voice-stack\.profile-customization \{[\s\S]*?background: #ffffff;/,
  );
});

test("light UI theme keeps profile customization form labels readable", () => {
  const mainCss = readRepoFile("src/css/MenuMain.css");

  assert.match(
    mainCss,
    /html\[data-ui-theme="light"\] \.profile-settings-form__palette-header span,[\s\S]*?html\[data-ui-theme="light"\] \.profile-settings-form__avatar-frame-option b \{[\s\S]*?color: #0f172a;/,
  );
  assert.match(
    mainCss,
    /html\[data-ui-theme="light"\] \.profile-settings-form__palette-header small,[\s\S]*?html\[data-ui-theme="light"\] \.profile-settings-form__color-field \{[\s\S]*?color: #5f6b82;/,
  );
  assert.match(
    mainCss,
    /html\[data-ui-theme="light"\] \.profile-settings-form__palette-panel,[\s\S]*?html\[data-ui-theme="light"\] \.profile-settings-form__avatar-frame-option \{[\s\S]*?background: #ffffff;/,
  );
});
