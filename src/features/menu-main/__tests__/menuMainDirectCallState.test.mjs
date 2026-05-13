import test from "node:test";
import assert from "node:assert/strict";

import {
  buildDirectCallState,
  deriveDirectCallStateFromVoiceConnection,
} from "../menuMainDirectCallState.js";

test("deriveDirectCallStateFromVoiceConnection marks active direct call as reconnecting", () => {
  const previous = buildDirectCallState({
    phase: "connected",
    statusLabel: "Идет разговор",
    channelId: "direct-call::1::2",
    peerUserId: "2",
    connectionQuality: "stable",
  });

  const next = deriveDirectCallStateFromVoiceConnection(previous, {
    phase: "reconnecting",
    channel: "direct-call::1::2",
    reason: "signalr-reconnecting",
  });

  assert.equal(next.phase, "reconnecting");
  assert.equal(next.status, "reconnecting");
  assert.equal(next.connectionQuality, "reconnecting");
  assert.equal(next.canRetry, false);
});

test("deriveDirectCallStateFromVoiceConnection restores connected direct call after recovery", () => {
  const previous = buildDirectCallState({
    phase: "reconnecting",
    statusLabel: "Восстанавливаем соединение",
    channelId: "direct-call::1::2",
    peerUserId: "2",
    connectionQuality: "reconnecting",
  });

  const next = deriveDirectCallStateFromVoiceConnection(previous, {
    phase: "connected",
    channel: "direct-call::1::2",
    reason: "signalr-reconnected",
  });

  assert.equal(next.phase, "connected");
  assert.equal(next.status, "connected");
  assert.equal(next.statusLabel, "Идет разговор");
});

test("deriveDirectCallStateFromVoiceConnection ignores unrelated channels", () => {
  const previous = buildDirectCallState({
    phase: "connected",
    channelId: "direct-call::1::2",
    peerUserId: "2",
  });

  const next = deriveDirectCallStateFromVoiceConnection(previous, {
    phase: "reconnecting",
    channel: "server-voice",
  });

  assert.equal(next, previous);
});
