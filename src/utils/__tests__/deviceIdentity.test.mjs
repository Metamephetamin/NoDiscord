import assert from "node:assert/strict";
import test from "node:test";

import { normalizeAuthDeviceTokenForTest } from "../deviceIdentity.js";

test("normalizeAuthDeviceTokenForTest accepts stable ascii device tokens", () => {
  const token = "ldv1.11111111-1111-1111-1111-111111111111.22222222-2222-2222-2222-222222222222";

  assert.equal(normalizeAuthDeviceTokenForTest(token), token);
});

test("normalizeAuthDeviceTokenForTest rejects short or non-ascii values", () => {
  assert.equal(normalizeAuthDeviceTokenForTest("short"), "");
  assert.equal(normalizeAuthDeviceTokenForTest("ldv1.токен-с-кириллицей-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"), "");
});
