import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const deployWorkflow = readFileSync(".github/workflows/deploy.yml", "utf8");
const releaseSmokeRunner = readFileSync("scripts/smoke/release-strict.mjs", "utf8");

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
