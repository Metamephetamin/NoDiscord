import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const controllerSource = readFileSync("src/features/menu-main/MenuMainController.jsx", "utf8");
const rendererSource = readFileSync("src/features/menu-main/MenuMainSettingsRenderer.jsx", "utf8");
const settingsPanelsSource = readFileSync("src/components/MenuSettingsPanels.jsx", "utf8");
const adminCssSource = readFileSync("src/css/AdminSecurity.css", "utf8");
const adminControllerSource = readFileSync("BackNoDiscord/BackNoDiscord/Controllers/AdminController.cs", "utf8");

test("admin security entry stays visible for configured admins before TOTP setup", () => {
  assert.match(
    controllerSource,
    /const\s+canOpenAdminSecurity\s*=\s*isCurrentUserAdmin;/,
    "configured admins should still see the admin security entry even when TOTP is not enabled yet",
  );
  assert.match(
    controllerSource,
    /showAdminSettingsLink=\{canOpenAdminSecurity\}/,
    "settings shell should render the admin entry for configured admins",
  );
  assert.doesNotMatch(
    controllerSource,
    /showAdminSettingsLink=\{canUseAdminSecurity\}/,
    "TOTP must gate admin actions, not hide the entry completely",
  );
  assert.doesNotMatch(
    controllerSource,
    /return\s+canUseAdminSecurity\s+&&\s+adminSettingsItem/,
    "mobile settings navigation should not hide the admin entry before TOTP setup",
  );
});

test("admin security page explains TOTP requirement before loading admin tools", () => {
  assert.match(
    rendererSource,
    /isTotpEnabled/,
    "admin security page should receive the current TOTP state",
  );
  assert.match(
    rendererSource,
    /Включите двухфакторную защиту/,
    "admin security page should explain why admin tools are locked",
  );
  assert.match(
    rendererSource,
    /if\s*\(\s*!isTotpEnabled\s*\)/,
    "admin tools should stay gated before TOTP is enabled",
  );
});

test("admin security layout prevents horizontal overflow from long ids and filenames", () => {
  assert.match(
    adminCssSource,
    /\.admin-security-page\s*\{[^}]*overflow-x:\s*hidden;/s,
    "admin page must clip horizontal overflow at the overlay boundary",
  );
  assert.match(
    adminCssSource,
    /\.admin-security-page__body\s*\{[^}]*overflow-x:\s*hidden;/s,
    "admin page body must not create a left-right scroll area",
  );
  assert.match(
    adminCssSource,
    /\.admin-security-overflow-safe[^{]*\{[^}]*overflow-wrap:\s*anywhere;/s,
    "long report ids, channel ids and filenames must wrap instead of expanding the viewport",
  );
  assert.match(
    adminCssSource,
    /\.admin-users-window\s*\{[^}]*max-height:/s,
    "account review should live in a bounded scroll window",
  );
});

test("admin security view uses risk events instead of raw encrypted message feeds", () => {
  assert.match(
    settingsPanelsSource,
    /riskEvents/,
    "admin page should build a risk-event list for moderation triage",
  );
  assert.doesNotMatch(
    settingsPanelsSource,
    /Зашифровано:/,
    "admin UI should not pretend encrypted message bodies are readable",
  );
  assert.match(
    settingsPanelsSource,
    /Контент скрыт/,
    "encrypted content should be explained as hidden unless attached to a report",
  );
});

test("admin can dismiss false reports and notify users without reading encrypted content", () => {
  assert.match(
    adminControllerSource,
    /reports\/chat\/\{reportId:int\}\/dismiss/,
    "admin API should let moderators dismiss chat reports",
  );
  assert.match(
    adminControllerSource,
    /reports\/user\/\{reportId:int\}\/dismiss/,
    "admin API should let moderators dismiss user reports",
  );
  assert.match(
    adminControllerSource,
    /PushNotificationPayload/,
    "admin decisions should reuse the existing push notification channel",
  );
  assert.match(
    settingsPanelsSource,
    /Отклонить и уведомить/,
    "risk events should expose a clear false-report action",
  );
});
