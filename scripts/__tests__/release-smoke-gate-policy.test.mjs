import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const deployWorkflow = readFileSync(".github/workflows/deploy.yml", "utf8");
const releaseSmokeRunner = readFileSync("scripts/smoke/release-strict.mjs", "utf8");
const authSmoke = readFileSync("scripts/smoke/auth-smoke.mjs", "utf8");

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

test("pre-deploy release smoke is advisory and cannot block deployment fixes", () => {
  assert.match(
    deployWorkflow,
    /npm run smoke:release \|\| echo "Release smoke failed before deploy; continuing because deploy may repair production."/,
    "pre-deploy smoke must not block publish/deploy when current production is broken",
  );
});
