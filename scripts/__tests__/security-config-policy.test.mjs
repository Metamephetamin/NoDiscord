import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const appsettings = readFileSync("BackNoDiscord/BackNoDiscord/appsettings.json", "utf8");
const developmentAppsettings = readFileSync("BackNoDiscord/BackNoDiscord/appsettings.Development.json", "utf8");
const liveKitCompose = readFileSync("src/livekit/docker-compose.yml", "utf8");
const packageJson = JSON.parse(readFileSync("package.json", "utf8"));

test("committed appsettings do not grant admin privileges to personal emails", () => {
  for (const [name, source] of [
    ["appsettings.json", appsettings],
    ["appsettings.Development.json", developmentAppsettings],
  ]) {
    assert.doesNotMatch(source, /"Emails"\s*:\s*"[^"]+@[^"]+"/, `${name} must not contain a committed admin email`);
    assert.doesNotMatch(source, /andrey1689123@gmail\.com/i, `${name} must not contain a personal admin email`);
  }
});

test("LiveKit docker image is pinned to an exact version tag", () => {
  assert.doesNotMatch(liveKitCompose, /livekit\/livekit-server:(?:latest|master)\b/);
  assert.match(liveKitCompose, /livekit\/livekit-server:v\d+\.\d+\.\d+\b/);
});

test("SignalR browser packages stay on the same major", () => {
  const signalr = packageJson.dependencies["@microsoft/signalr"];
  const messagePack = packageJson.dependencies["@microsoft/signalr-protocol-msgpack"];
  assert.ok(signalr, "@microsoft/signalr dependency is required");
  assert.ok(messagePack, "@microsoft/signalr-protocol-msgpack dependency is required");

  const majorOf = (version) => {
    const match = String(version).match(/\d+/);
    return match ? Number(match[0]) : NaN;
  };

  assert.equal(majorOf(messagePack), majorOf(signalr));
});
