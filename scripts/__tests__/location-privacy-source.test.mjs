import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const controllerSource = readFileSync("src/features/menu-main/MenuMainController.jsx", "utf8");
const settingsSource = readFileSync("src/components/MenuSettingsPanels.jsx", "utf8");
const rendererSource = readFileSync("src/features/menu-main/MenuMainSettingsRenderer.jsx", "utf8");
const friendsWorkspaceSource = readFileSync("src/components/FriendsWorkspace.jsx", "utf8");
const hookPath = "src/hooks/useLocationSharingPreference.js";

test("location sharing is controlled by a dedicated preference hook and settings UI", () => {
  assert(existsSync(hookPath), "Location sharing preference hook must exist.");

  const hookSource = readFileSync(hookPath, "utf8");
  assert(
    controllerSource.includes("useLocationSharingPreference"),
    "MenuMainController must wire the location sharing preference hook."
  );
  assert(
    !controllerSource.includes("navigator.geolocation.watchPosition"),
    "MenuMainController must not start geolocation directly."
  );
  assert(
    hookSource.includes("/api/user/location-sharing") &&
      hookSource.includes("watchPosition") &&
      hookSource.includes("UpdateLocation") &&
      hookSource.includes("enabled"),
    "Location sharing hook must fetch preferences before publishing coordinates."
  );
  assert(
    settingsSource.includes("Показывать меня на карте") &&
      settingsSource.includes("Стереть мою последнюю локацию"),
    "Account settings must expose location sharing controls."
  );
  assert(
    rendererSource.includes("locationSharing") &&
      rendererSource.includes("onToggleLocationSharing") &&
      rendererSource.includes("onClearLocationSharing"),
    "Settings renderer must pass location sharing controls into account settings."
  );
  assert(
    friendsWorkspaceSource.includes("геолокация выключена в настройках"),
    "Friends map must explain when self location is disabled."
  );
});
