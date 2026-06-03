import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const deployWorkflow = readFileSync(".github/workflows/deploy.yml", "utf8");
const releaseSmokeRunner = readFileSync("scripts/smoke/release-strict.mjs", "utf8");
const authSmoke = readFileSync("scripts/smoke/auth-smoke.mjs", "utf8");
const menuMainController = readFileSync("src/features/menu-main/MenuMainController.jsx", "utf8");

test("deploy release smoke gate does not require authenticated smoke credentials", () => {
  assert.equal(
    deployWorkflow.includes("SMOKE_REQUIRE_CREDENTIALS"),
    false,
    "deploy workflow must not require smoke account credentials",
  );
  assert.equal(
    releaseSmokeRunner.includes("SMOKE_REQUIRE_CREDENTIALS"),
    false,
    "release smoke runner must not force credential-required mode",
  );
});

test("auth smoke skips before touching production when smoke account is not configured", () => {
  const loginIndex = authSmoke.indexOf("await smokeLogin()");
  const pingIndex = authSmoke.indexOf('requestJson("/api/ping"');

  assert.notEqual(loginIndex, -1, "auth smoke must call smokeLogin so missing credentials can skip");
  assert.notEqual(pingIndex, -1, "auth smoke should still verify ping when credentials are configured");
  assert.ok(
    loginIndex < pingIndex,
    "auth smoke must check credentials before calling production /api/ping",
  );
});

test("pre-deploy release smoke blocks deployment when it fails", () => {
  assert.match(
    deployWorkflow,
    /run:\s*npm run smoke:release\b/,
    "pre-deploy smoke must run as a normal blocking workflow step",
  );
  assert.doesNotMatch(
    deployWorkflow,
    /smoke:release\s*\|\|\s*echo/,
    "pre-deploy smoke failures must stop publish/deploy instead of being downgraded to advisory output",
  );
});

test("production health checks are pinned to lanaya.space", () => {
  assert.match(deployWorkflow, /HEALTHCHECK="https:\/\/lanaya\.space"/);
  assert.match(deployWorkflow, /HEALTHCHECK_URL/);
  assert.match(deployWorkflow, /Unsupported production healthcheck URL/);
  assert.match(deployWorkflow, /tendsec\.ru/);
  assert.match(deployWorkflow, /\/api\/ping/);
  assert.match(deployWorkflow, /\/chatHub\/negotiate\?negotiateVersion=1/);
  assert.match(deployWorkflow, /\/voiceHub\/negotiate\?negotiateVersion=1/);
});

test("production health checks retry while backend warms after restart", () => {
  assert.match(
    deployWorkflow,
    /retry_healthcheck\(\)/,
    "deploy health checks should use one bounded retry helper",
  );
  assert.match(
    deployWorkflow,
    /for attempt in \{1\.\.12\}/,
    "health checks should allow the backend and nginx upstream to warm for about a minute",
  );
  assert.match(
    deployWorkflow,
    /retry_healthcheck "backend API" check_api_once/,
    "backend /api/ping should be retried instead of failing on a transient 502",
  );
  assert.match(
    deployWorkflow,
    /retry_healthcheck "chat negotiate" check_hub_once "Chat hub" "\$CHAT_NEGOTIATE_HEALTHCHECK"/,
    "chat negotiate should also tolerate the short post-restart window",
  );
  assert.match(
    deployWorkflow,
    /retry_healthcheck "voice negotiate" check_hub_once "Voice hub" "\$VOICE_NEGOTIATE_HEALTHCHECK"/,
    "voice negotiate should also tolerate the short post-restart window",
  );
});

test("menu main muted channel storage key is initialized before effects read it", () => {
  const storageKeyIndex = menuMainController.search(/const\s+mutedServerChannelsStorageKey\s*=\s*getMutedChannelsStorageKey\(\s*currentUserId\s*\)\s*;/);
  const effectReadIndex = menuMainController.search(/setMutedServerChannels\(\s*readMutedServerChannels\(\s*mutedServerChannelsStorageKey\s*\)\s*\)/);

  assert.notEqual(storageKeyIndex, -1, "muted channel storage key should be declared");
  assert.notEqual(effectReadIndex, -1, "muted channel restore effect should read the storage key");
  assert.ok(
    storageKeyIndex < effectReadIndex,
    "the restore effect must not close over mutedServerChannelsStorageKey before the const is initialized",
  );
});
