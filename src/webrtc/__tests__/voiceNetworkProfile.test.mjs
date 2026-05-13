import assert from "node:assert/strict";
import test from "node:test";

import {
  getVoiceNetworkProfileLabel,
  normalizeVoiceNetworkProfile,
} from "../voiceNetworkProfile.mjs";

test("normalizeVoiceNetworkProfile maps reconnecting phase explicitly", () => {
  assert.equal(normalizeVoiceNetworkProfile({ phase: "reconnecting" }), "reconnecting");
});

test("normalizeVoiceNetworkProfile maps adaptive media profile to stable network profiles", () => {
  assert.equal(normalizeVoiceNetworkProfile({ adaptiveMediaProfile: "excellent" }), "good");
  assert.equal(normalizeVoiceNetworkProfile({ adaptiveMediaProfile: "constrained" }), "constrained");
  assert.equal(normalizeVoiceNetworkProfile({ adaptiveMediaProfile: "poor" }), "poor");
});

test("normalizeVoiceNetworkProfile degrades on latency, low bitrate, and packet retries", () => {
  assert.equal(normalizeVoiceNetworkProfile({ rttMs: 700, outgoingBitrateBps: 2_000_000 }), "poor");
  assert.equal(normalizeVoiceNetworkProfile({ rttMs: 260, outgoingBitrateBps: 500_000 }), "constrained");
  assert.equal(normalizeVoiceNetworkProfile({ videoRetransmitPercent: 4 }), "poor");
});

test("getVoiceNetworkProfileLabel returns user-facing labels", () => {
  assert.equal(getVoiceNetworkProfileLabel("good"), "сеть хорошая");
  assert.equal(getVoiceNetworkProfileLabel("reconnecting"), "переподключение");
});
