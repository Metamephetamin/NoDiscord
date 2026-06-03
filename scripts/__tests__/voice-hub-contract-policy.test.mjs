import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const voiceHub = readFileSync("BackNoDiscord/BackNoDiscord/VoiceHub.cs", "utf8");
const voiceClient = readFileSync("src/webrtc/livekitVoiceRoomClient.js", "utf8");

test("voice hub identity-sensitive methods do not accept ignored client identity parameters", () => {
  assert.match(
    voiceHub,
    /public async Task Register\(string avatar\)/,
    "Register should only accept display data not supplied identity ids/names",
  );
  assert.match(
    voiceHub,
    /public async Task<JoinChannelResponse> JoinChannel\(string channelName, string avatar\)/,
    "JoinChannel should not accept client-supplied userId/name",
  );
  assert.match(
    voiceHub,
    /public async Task LeaveChannel\(\)/,
    "LeaveChannel should derive user identity from claims",
  );
  assert.match(
    voiceHub,
    /public async Task UpdateScreenShareStatus\(bool isSharing\)/,
    "UpdateScreenShareStatus should derive user identity from claims",
  );
  assert.doesNotMatch(
    voiceHub,
    /Register\(string userId, string name|JoinChannel\(string channelName, string userId|LeaveChannel\(string userId|UpdateScreenShareStatus\(string userId/,
    "voice hub should not keep ignored spoofable identity parameters on public methods",
  );
});

test("voice client invokes identity-sensitive hub methods without spoofable identity arguments", () => {
  assert.doesNotMatch(
    voiceClient,
    /invoke\("UpdateScreenShareStatus",\s*String\(currentUser\.id\)|invoke\("LeaveChannel",\s*String\(|"JoinChannel",\s*[\s\S]{0,120}?String\((?:currentUser|user)\.id\)/,
    "voice client should not send user ids to identity-derived hub methods",
  );
  assert.match(
    voiceClient,
    /invoke\("UpdateScreenShareStatus",\s*Boolean\(isSharing\)\)/,
    "screen share status should pass only the sharing flag",
  );
  assert.match(
    voiceClient,
    /invoke\("LeaveChannel"\)/,
    "leave should pass no identity argument",
  );
  assert.match(
    voiceClient,
    /"JoinChannel",\s*channelName,\s*getAvatar\(user\)/,
    "join should pass only channel and avatar display data",
  );
});
