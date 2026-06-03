import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const electronMain = readFileSync("src/main.js", "utf8");

test("electron media permissions are granted only through the trusted renderer gate", () => {
  assert.match(
    electronMain,
    /const\s+ELECTRON_MEDIA_PERMISSIONS\s*=\s*new Set\(\[\s*"media",\s*"display-capture",\s*"microphone",\s*"camera"\s*\]\);/,
    "media permission names should live in one shared allow-list",
  );
  assert.match(
    electronMain,
    /const\s+isTrustedMediaPermissionRequest\s*=\s*\(/,
    "permission handlers should delegate to a trusted renderer gate",
  );
  assert.match(
    electronMain,
    /setPermissionRequestHandler\(\(\s*webContents,\s*permission,\s*callback,\s*details\s*\)\s*=>\s*\{\s*callback\(isTrustedMediaPermissionRequest\(webContents,\s*permission,\s*details\)\);/s,
    "permission request handler should evaluate the webContents and request details",
  );
  assert.match(
    electronMain,
    /setPermissionCheckHandler\(\(\s*webContents,\s*permission,\s*requestingOrigin,\s*details\s*\)\s*=>\s*isTrustedMediaPermissionRequest\(webContents,\s*permission,\s*details,\s*requestingOrigin\)\s*\);/,
    "permission check handler should evaluate the webContents, origin, and details",
  );
  assert.doesNotMatch(
    electronMain,
    /callback\(allowedPermissions\.has\(permission\)\)|return\s+allowedPermissions\.has\(permission\)/,
    "permission handlers must not grant allowed media permissions globally",
  );
});

test("trusted media permission gate verifies main window, origin, and frame", () => {
  assert.match(
    electronMain,
    /webContents\?\.id\s*===\s*mainWindow\.webContents\?\.id/,
    "media permission requests should be limited to the app main window",
  );
  assert.match(
    electronMain,
    /details\?\.isMainFrame\s*===\s*false/,
    "media permission requests from subframes should be rejected when Electron provides frame details",
  );
  assert.match(
    electronMain,
    /RENDERER_DEV_SERVER_URL[\s\S]*?new URL\(RENDERER_DEV_SERVER_URL\)\.origin/,
    "development permissions should be limited to the configured renderer dev origin",
  );
  assert.match(
    electronMain,
    /requestUrl\.startsWith\("file:\/\/"\)/,
    "packaged permissions should be limited to the local renderer file URL",
  );
});
