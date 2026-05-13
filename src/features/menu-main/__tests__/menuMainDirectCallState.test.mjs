import test from "node:test";
import assert from "node:assert/strict";

import {
  buildDirectCallState,
  deriveDirectCallStateFromSignalCommand,
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

test("deriveDirectCallStateFromSignalCommand marks matching command retry", () => {
  const previous = buildDirectCallState({
    phase: "outgoing",
    statusLabel: "Ожидаем ответ",
    channelId: "direct-call::1::2",
    peerUserId: "2",
    canRetry: true,
  });

  const next = deriveDirectCallStateFromSignalCommand(previous, {
    methodName: "StartDirectCall",
    status: "retrying",
    args: ["2", "direct-call::1::2"],
    attempt: 1,
  });

  assert.equal(next.phase, "outgoing");
  assert.equal(next.signalStatus, "retrying");
  assert.equal(next.signalCommand, "StartDirectCall");
  assert.equal(next.signalAttempt, 1);
  assert.equal(next.statusLabel, "Плохая сеть, повторяем вызов");
  assert.equal(next.canRetry, true);
});

test("deriveDirectCallStateFromSignalCommand ignores unrelated command channel", () => {
  const previous = buildDirectCallState({
    phase: "outgoing",
    statusLabel: "Ожидаем ответ",
    channelId: "direct-call::1::2",
    peerUserId: "2",
  });

  const next = deriveDirectCallStateFromSignalCommand(previous, {
    methodName: "StartDirectCall",
    status: "retrying",
    args: ["3", "direct-call::1::3"],
    attempt: 1,
  });

  assert.equal(next, previous);
});

test("deriveDirectCallStateFromSignalCommand preserves visible label after sent", () => {
  const previous = buildDirectCallState({
    phase: "connecting",
    statusLabel: "Плохая сеть, повторяем ответ",
    channelId: "direct-call::1::2",
    peerUserId: "2",
    signalStatus: "retrying",
    signalCommand: "AcceptDirectCall",
    signalAttempt: 1,
  });

  const next = deriveDirectCallStateFromSignalCommand(previous, {
    methodName: "AcceptDirectCall",
    status: "sent",
    args: ["2", "direct-call::1::2"],
  });

  assert.equal(next.phase, "connecting");
  assert.equal(next.statusLabel, "Плохая сеть, повторяем ответ");
  assert.equal(next.signalStatus, "");
  assert.equal(next.signalCommand, "");
  assert.equal(next.signalAttempt, 0);
});
