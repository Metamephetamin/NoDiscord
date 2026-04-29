import assert from "node:assert/strict";
import test from "node:test";

import { buildStreamDiagnostics } from "../streamDiagnostics.mjs";

test("buildStreamDiagnostics reports CPU pressure from WebRTC quality limitation", () => {
  const diagnostics = buildStreamDiagnostics({
    currentVoiceChannel: "server::voice",
    voicePingMs: 11,
    voiceRouteSnapshot: {
      adaptiveMediaProfile: "excellent",
      adaptiveAudioBitrateKbps: 64,
      routeType: "direct",
      rttMs: 11,
      transports: [{
        label: "publisher",
        routeType: "direct",
        availableOutgoingBitrate: 17_100_000,
        outboundVideoBitrateBps: 3_200_000,
        outbound: {
          video: {
            framesPerSecond: 19,
            packetsSent: 2000,
            retransmittedPacketsSent: 4,
            qualityLimitationReason: "cpu",
          },
        },
      }],
    },
  });

  assert.equal(diagnostics.pressure.reason, "cpu");
  assert.equal(diagnostics.pressure.severity, "warning");
});

test("buildStreamDiagnostics reports bandwidth pressure from bitrate and packet retries", () => {
  const diagnostics = buildStreamDiagnostics({
    currentVoiceChannel: "server::voice",
    voiceRouteSnapshot: {
      adaptiveMediaProfile: "constrained",
      adaptiveAudioBitrateKbps: 48,
      routeType: "direct",
      rttMs: 260,
      transports: [{
        label: "publisher",
        routeType: "direct",
        availableOutgoingBitrate: 460_000,
        outboundVideoBitrateBps: 390_000,
        outbound: {
          video: {
            framesPerSecond: 17,
            packetsSent: 1000,
            retransmittedPacketsSent: 45,
            qualityLimitationReason: "bandwidth",
          },
        },
      }],
    },
  });

  assert.equal(diagnostics.pressure.reason, "bandwidth");
  assert.equal(diagnostics.pressure.severity, "danger");
  assert.ok(diagnostics.videoRetransmitPercent >= 4);
});

test("buildStreamDiagnostics reports app profile pressure when network is healthy but profile is weak", () => {
  const diagnostics = buildStreamDiagnostics({
    currentVoiceChannel: "server::voice",
    voiceRouteSnapshot: {
      adaptiveMediaProfile: "poor",
      adaptiveAudioBitrateKbps: 22,
      routeType: "direct",
      rttMs: 14,
      transports: [{
        label: "publisher",
        routeType: "direct",
        availableOutgoingBitrate: 14_000_000,
        outboundVideoBitrateBps: 1_400_000,
        outbound: {
          video: {
            framesPerSecond: 19,
            packetsSent: 1000,
            retransmittedPacketsSent: 2,
            qualityLimitationReason: "",
          },
        },
      }],
    },
  });

  assert.equal(diagnostics.pressure.reason, "app-profile");
});

test("buildStreamDiagnostics reports healthy when route and profile are good", () => {
  const diagnostics = buildStreamDiagnostics({
    currentVoiceChannel: "server::voice",
    voiceRouteSnapshot: {
      adaptiveMediaProfile: "excellent",
      adaptiveAudioBitrateKbps: 64,
      routeType: "direct",
      rttMs: 18,
      transports: [{
        label: "publisher",
        routeType: "direct",
        availableOutgoingBitrate: 12_000_000,
        outboundVideoBitrateBps: 7_500_000,
        outbound: {
          video: {
            framesPerSecond: 60,
            packetsSent: 1000,
            retransmittedPacketsSent: 1,
            qualityLimitationReason: "",
          },
        },
      }],
    },
  });

  assert.equal(diagnostics.pressure.reason, "healthy");
  assert.equal(diagnostics.pressure.severity, "ok");
});
