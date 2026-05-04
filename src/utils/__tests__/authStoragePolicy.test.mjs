import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const authSource = readFileSync("src/utils/auth.js", "utf8");

test("auth storage keeps refresh-token fallback isolated", () => {
  assert(authSource.includes("REFRESH_TOKEN_STORAGE_KEY"), "auth module should centralize refresh token key usage");
  assert(authSource.includes("electronSecureSession"), "auth module should prefer Electron secure session storage");
});

test("auth storage does not log raw tokens", () => {
  assert(!/console\.(log|warn|error)\([^)]*refreshToken/.test(authSource), "refreshToken must not be logged");
  assert(!/console\.(log|warn|error)\([^)]*accessToken/.test(authSource), "accessToken must not be logged");
});

test("auth storage does not persist new sessions to localStorage", () => {
  assert(!authSource.includes("writePersistentSession(nextSession)"), "new sessions must not be written to localStorage");
  assert(!authSource.includes("writePersistentSession(resolvedSession)"), "migrated sessions must not be kept in localStorage");
});
