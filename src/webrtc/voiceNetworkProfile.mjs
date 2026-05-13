const PROFILE_LABELS = {
  good: "сеть хорошая",
  constrained: "сеть нестабильная",
  poor: "слабая сеть",
  reconnecting: "переподключение",
};

const ADAPTIVE_PROFILE_MAP = {
  excellent: "good",
  good: "good",
  constrained: "constrained",
  poor: "poor",
};

const toPositiveNumber = (value) => {
  const numericValue = Number(value);
  return Number.isFinite(numericValue) && numericValue > 0 ? numericValue : 0;
};

export function normalizeVoiceNetworkProfile({
  phase = "",
  adaptiveMediaProfile = "",
  rttMs = 0,
  outgoingBitrateBps = 0,
  videoRetransmitPercent = 0,
} = {}) {
  if (String(phase || "").trim() === "reconnecting") {
    return "reconnecting";
  }

  const normalizedRttMs = toPositiveNumber(rttMs);
  const normalizedOutgoingBitrate = toPositiveNumber(outgoingBitrateBps);
  const normalizedRetransmitPercent = toPositiveNumber(videoRetransmitPercent);

  if (
    normalizedRttMs >= 650 ||
    (normalizedOutgoingBitrate > 0 && normalizedOutgoingBitrate < 220_000) ||
    normalizedRetransmitPercent >= 3
  ) {
    return "poor";
  }

  if (
    normalizedRttMs >= 240 ||
    (normalizedOutgoingBitrate > 0 && normalizedOutgoingBitrate < 750_000) ||
    normalizedRetransmitPercent >= 1
  ) {
    return "constrained";
  }

  return ADAPTIVE_PROFILE_MAP[String(adaptiveMediaProfile || "").trim()] || "good";
}

export function getVoiceNetworkProfileLabel(profile) {
  return PROFILE_LABELS[String(profile || "").trim()] || PROFILE_LABELS.good;
}
