import { readFileSync } from "node:fs";
import assert from "node:assert/strict";

const voiceHubSource = readFileSync("BackNoDiscord/BackNoDiscord/VoiceHub.cs", "utf8");
const endDirectCallStart = voiceHubSource.indexOf("public async Task EndDirectCall");
const nextMethodStart = voiceHubSource.indexOf("public async Task UpdateScreenShareStatus", endDirectCallStart);

assert(endDirectCallStart !== -1, "VoiceHub.EndDirectCall must exist.");
assert(nextMethodStart !== -1, "VoiceHub.EndDirectCall smoke could not locate the next method boundary.");

const endDirectCallBlock = voiceHubSource.slice(endDirectCallStart, nextMethodStart);

assert(
  endDirectCallBlock.includes("Clients.GroupExcept(channelName"),
  "Ending a connected direct call must notify every other SignalR connection in the direct-call channel."
);
assert(
  !endDirectCallBlock.includes('Clients.Client(targetConnectionId).SendAsync("voice:direct-call-ended"'),
  "EndDirectCall must not rely only on one cached target connection."
);

console.log("direct-call-lifecycle smoke passed");
