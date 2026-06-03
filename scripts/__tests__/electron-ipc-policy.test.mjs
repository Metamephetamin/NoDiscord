import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const electronMain = readFileSync("src/main.js", "utf8");

const countChannelRegistrations = (channel) =>
  [...electronMain.matchAll(new RegExp(`ipcMain\\.handle\\("${channel.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"`, "g"))].length;

const countChannelRemovals = (channel) =>
  [...electronMain.matchAll(new RegExp(`ipcMain\\.removeHandler\\("${channel.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"`, "g"))].length;

test("download IPC channels have one authoritative handler", () => {
  for (const channel of [
    "downloads:save-file",
    "downloads:fetch-and-save",
    "downloads:fetch-bytes",
    "downloads:fetch-and-save-many",
  ]) {
    assert.equal(
      countChannelRegistrations(channel),
      1,
      `${channel} should be registered exactly once`,
    );
    assert.equal(
      countChannelRemovals(channel),
      0,
      `${channel} should not require removeHandler cleanup for dead duplicate implementations`,
    );
  }
});
