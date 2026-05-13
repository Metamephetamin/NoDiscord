import test from "node:test";
import assert from "node:assert/strict";

import { isServerRailItemActive } from "../serverRailState.mjs";

test("isServerRailItemActive matches ids after string normalization", () => {
  assert.equal(isServerRailItemActive({ workspaceMode: "servers", serverId: 42, activeServerId: "42" }), true);
});

test("isServerRailItemActive only marks servers workspace", () => {
  assert.equal(isServerRailItemActive({ workspaceMode: "friends", serverId: "42", activeServerId: "42" }), false);
});
