import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const voiceHub = readFileSync("BackNoDiscord/BackNoDiscord/VoiceHub.cs", "utf8");
const voiceController = readFileSync("BackNoDiscord/BackNoDiscord/Controllers/VoiceController.cs", "utf8");

test("voice hub snapshots are caller-authorized instead of global", () => {
  assert.match(
    voiceHub,
    /BuildAuthorizedVoiceSnapshotAsync/,
    "VoiceHub should build caller-authorized channel snapshots",
  );
  assert.match(
    voiceHub,
    /SendAuthorizedVoiceSnapshotToCallerAsync/,
    "VoiceHub should centralize authorized snapshot delivery",
  );
  assert.doesNotMatch(
    voiceHub,
    /SendAsync\("voice:update",\s*_channels\.GetAllChannels\(\)\)/,
    "VoiceHub must not send all voice channels to a caller",
  );
  assert.doesNotMatch(
    voiceHub,
    /SendAsync\("voice:screen-share-users",\s*_channels\.GetScreenSharingUserIds\(\)\)/,
    "VoiceHub must not send global screen-share user ids",
  );
});

test("voice realtime updates are scoped to channel groups", () => {
  assert.doesNotMatch(
    voiceHub,
    /Clients\.All\.SendAsync\("voice:(?:channel-update|screen-share-users)"/,
    "VoiceHub should not broadcast voice presence or screen-share state to every client",
  );
  assert.match(
    voiceHub,
    /Clients\.Group\(channelName\)\.SendAsync\("voice:channel-update"/,
    "VoiceHub channel updates should target the voice channel group",
  );
  assert.match(
    voiceHub,
    /Clients\.Group\(channelName\)\.SendAsync\("voice:screen-share-users"/,
    "VoiceHub screen-share updates should target the voice channel group",
  );
  assert.doesNotMatch(
    voiceController,
    /Clients\.All\.SendAsync\("voice:channel-update"/,
    "HTTP voice controller should not broadcast voice updates to all clients",
  );
  assert.match(
    voiceController,
    /Clients\.Group\(normalizedChannel\)\.SendAsync\("voice:channel-update"/,
    "HTTP voice controller join updates should target the voice channel group",
  );
});
