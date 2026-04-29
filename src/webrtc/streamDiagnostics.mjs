const PROFILE_RANK = {
  poor: 0,
  constrained: 1,
  good: 2,
  excellent: 3,
};

const toFiniteNumber = (value, fallback = 0) => {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : fallback;
};

const toPositiveNumber = (value) => {
  const numberValue = toFiniteNumber(value, 0);
  return numberValue > 0 ? numberValue : 0;
};

const normalizeMeasuredPingMs = (value) => {
  const numberValue = toFiniteNumber(value, 0);
  return numberValue > 0 ? Math.max(1, Math.round(numberValue)) : null;
};

const getProfileRank = (profile) => PROFILE_RANK[String(profile || "")] ?? PROFILE_RANK.good;

const isStrongRoute = ({ rttMs, outgoingBitrateBps, videoRetransmitPercent }) =>
  (!rttMs || rttMs <= 80)
  && outgoingBitrateBps >= 4_000_000
  && videoRetransmitPercent < 1.5;

export function getStreamPressureDiagnosis({
  actualFps = 0,
  targetFps = 0,
  outgoingBitrateBps = 0,
  profile = "",
  qualityLimitationReason = "",
  routeType = "",
  rttMs = null,
  videoRetransmitPercent = 0,
} = {}) {
  const reason = String(qualityLimitationReason || "").trim().toLowerCase();
  const normalizedActualFps = toPositiveNumber(actualFps);
  const normalizedTargetFps = toPositiveNumber(targetFps);
  const normalizedRttMs = normalizeMeasuredPingMs(rttMs);
  const normalizedOutgoingBitrateBps = toPositiveNumber(outgoingBitrateBps);
  const normalizedRetransmitPercent = toPositiveNumber(videoRetransmitPercent);
  const routeIsStrong = isStrongRoute({
    rttMs: normalizedRttMs,
    outgoingBitrateBps: normalizedOutgoingBitrateBps,
    videoRetransmitPercent: normalizedRetransmitPercent,
  });

  if (reason === "cpu") {
    return { reason: "cpu", severity: "warning" };
  }

  if (reason === "bandwidth") {
    return { reason: "bandwidth", severity: "danger" };
  }

  if (normalizedRetransmitPercent >= 3) {
    return { reason: "packet-loss", severity: "danger" };
  }

  if (
    (normalizedRttMs && normalizedRttMs >= 340)
    || (normalizedOutgoingBitrateBps > 0 && normalizedOutgoingBitrateBps < 750_000)
  ) {
    return { reason: "bandwidth", severity: "danger" };
  }

  if (
    routeIsStrong
    && getProfileRank(profile) <= PROFILE_RANK.constrained
  ) {
    return { reason: "app-profile", severity: "warning" };
  }

  if (
    routeIsStrong
    && normalizedActualFps > 0
    && normalizedTargetFps >= 30
    && normalizedActualFps < Math.max(18, normalizedTargetFps * 0.55)
  ) {
    return { reason: "capture-or-encoder", severity: "warning" };
  }

  if (String(routeType || "").toLowerCase() === "relay" && normalizedRttMs && normalizedRttMs >= 120) {
    return { reason: "relay-route", severity: "warning" };
  }

  if (normalizedRttMs && normalizedRttMs >= 190) {
    return { reason: "latency", severity: "warning" };
  }

  if (normalizedRetransmitPercent >= 1) {
    return { reason: "packet-loss", severity: "warning" };
  }

  return { reason: "healthy", severity: "ok" };
}

export function buildStreamDiagnostics({
  currentVoiceChannel = "",
  targetFps = 0,
  voicePingMs = null,
  voiceRouteSnapshot = null,
} = {}) {
  if (!currentVoiceChannel || !voiceRouteSnapshot) {
    return null;
  }

  const routes = Array.isArray(voiceRouteSnapshot.transports) ? voiceRouteSnapshot.transports : [];
  const publisherRoute = routes.find((route) => route.label === "publisher") || routes[0] || null;
  const outboundVideo = publisherRoute?.outbound?.video || null;
  const rttMs = normalizeMeasuredPingMs(voiceRouteSnapshot.rttMs ?? publisherRoute?.rttMs ?? voicePingMs);
  const outgoingBitrateBps = toPositiveNumber(publisherRoute?.availableOutgoingBitrate);
  const outboundVideoBitrateBps = toPositiveNumber(publisherRoute?.outboundVideoBitrateBps);
  const audioBitrateKbps = toPositiveNumber(voiceRouteSnapshot.adaptiveAudioBitrateKbps);
  const actualFps = toPositiveNumber(outboundVideo?.framesPerSecond);
  const videoPacketsSent = toPositiveNumber(outboundVideo?.packetsSent);
  const videoRetransmittedPackets = toPositiveNumber(outboundVideo?.retransmittedPacketsSent);
  const videoRetransmitPercent =
    videoPacketsSent > 0 && videoRetransmittedPackets > 0
      ? Math.min(100, (videoRetransmittedPackets / videoPacketsSent) * 100)
      : 0;
  const framesEncoded = toPositiveNumber(outboundVideo?.framesEncoded);
  const totalEncodeTime = toPositiveNumber(outboundVideo?.totalEncodeTime);
  const encodeMsPerFrame =
    framesEncoded > 0 && totalEncodeTime > 0
      ? (totalEncodeTime / framesEncoded) * 1000
      : 0;
  const profile = String(voiceRouteSnapshot.adaptiveMediaProfile || "");
  const routeType = voiceRouteSnapshot.routeType || publisherRoute?.routeType || "unknown";
  const qualityLimitationReason = String(outboundVideo?.qualityLimitationReason || "");
  const pressure = getStreamPressureDiagnosis({
    actualFps,
    targetFps,
    outgoingBitrateBps,
    profile,
    qualityLimitationReason,
    routeType,
    rttMs,
    videoRetransmitPercent,
  });

  return {
    rttMs,
    outgoingBitrateBps,
    outboundVideoBitrateBps,
    routeType,
    profile,
    audioBitrateKbps,
    actualFps,
    targetFps: toPositiveNumber(targetFps),
    qualityLimitationReason,
    videoRetransmitPercent,
    encodeMsPerFrame,
    framesDropped: toPositiveNumber(outboundVideo?.framesDropped),
    framesEncoded,
    pressure,
  };
}
