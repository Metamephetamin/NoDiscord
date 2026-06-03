import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const authSource = readFileSync("src/utils/auth.js", "utf8");
const electronMainSource = readFileSync("src/main.js", "utf8");

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

test("browser auth storage never writes bearer or refresh tokens", () => {
  assert(
    !authSource.includes("storage.setItem(TOKEN_STORAGE_KEY"),
    "browser fallback storage must not persist access tokens",
  );
  assert(
    !authSource.includes("storage.setItem(REFRESH_TOKEN_STORAGE_KEY"),
    "browser fallback storage must not persist refresh tokens",
  );
  assert.match(
    authSource,
    /function\s+buildBrowserStorageSession\(/,
    "browser fallback should use an explicit token-stripped storage payload",
  );
});

test("electron secure session fails closed when OS encryption is unavailable", () => {
  assert(
    !electronMainSource.includes("JSON.stringify({ plain: sessionValue })"),
    "Electron secure session must not persist plaintext session fallback",
  );
  assert.match(
    electronMainSource,
    /safeStorage\.isEncryptionAvailable\(\)\s*===\s*false[\s\S]*?throw new Error\("Secure OS storage is unavailable\."\)/,
    "Electron secure session writes should fail when safeStorage cannot encrypt",
  );
  assert(
    !electronMainSource.includes("return payload?.plain ?? null;"),
    "Electron secure session reads must ignore legacy plaintext fallback payloads",
  );
});
