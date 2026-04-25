export const DIRECT_CALL_NO_ANSWER_TIMEOUT_MS = 180000;

export const readDirectCallHistory = (storageKey) => {
  if (!storageKey) {
    return [];
  }

  try {
    const raw = window.localStorage.getItem(storageKey);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

export const writeDirectCallHistory = (storageKey, history) => {
  if (!storageKey) {
    return;
  }

  try {
    window.localStorage.setItem(storageKey, JSON.stringify(Array.isArray(history) ? history : []));
  } catch {
    // ignore storage failures
  }
};

export const getDirectCallConnectionQuality = (pingMs, phase) => {
  if (phase === "reconnecting") {
    return "reconnecting";
  }

  const numericPing = Number(pingMs);
  if (!Number.isFinite(numericPing) || numericPing <= 0) {
    return phase === "connected" ? "stable" : "unknown";
  }

  if (numericPing >= 240) {
    return "weak";
  }

  return "stable";
};

export const createDirectCallState = () => ({
  phase: "idle",
  status: "idle",
  statusLabel: "",
  channelId: "",
  peerUserId: "",
  peerName: "",
  peerAvatar: "",
  peerAvatarFrame: null,
  peer: null,
  connectionQuality: "unknown",
  canRetry: false,
  isMiniMode: false,
  direction: "",
  startedAt: "",
  endedAt: "",
  lastReason: "",
});

export const normalizeMeasuredPingMs = (value) => {
  const numericValue = Number(value);
  return Number.isFinite(numericValue) && numericValue > 0
    ? Math.max(1, Math.round(numericValue))
    : null;
};

export const buildDirectCallState = (overrides = {}) => {
  const phase = String(overrides.phase || overrides.status || "idle");
  const peer = {
    userId: String(overrides.peer?.userId || overrides.peerUserId || "").trim(),
    name: String(overrides.peer?.name || overrides.peerName || "").trim(),
    avatar: String(overrides.peer?.avatar || overrides.peerAvatar || "").trim(),
    avatarFrame: overrides.peer?.avatarFrame ?? overrides.peerAvatarFrame ?? null,
  };

  return {
    ...createDirectCallState(),
    ...overrides,
    phase,
    status: phase,
    peerUserId: peer.userId,
    peerName: peer.name,
    peerAvatar: peer.avatar,
    peerAvatarFrame: peer.avatarFrame,
    peer,
  };
};
