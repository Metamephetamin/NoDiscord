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

const isDirectCallChannel = (channelId) => /^direct-call::\d+::\d+$/i.test(String(channelId || "").trim());

const DIRECT_CALL_SIGNAL_LABELS = {
  StartDirectCall: {
    queued: "Отправляем вызов",
    running: "Отправляем вызов",
    retrying: "Плохая сеть, повторяем вызов",
    failed: "Не удалось отправить вызов",
  },
  AcceptDirectCall: {
    queued: "Отправляем ответ",
    running: "Отправляем ответ",
    retrying: "Плохая сеть, повторяем ответ",
    failed: "Не удалось отправить ответ",
  },
  DeclineDirectCall: {
    queued: "Отправляем отмену",
    running: "Отправляем отмену",
    retrying: "Плохая сеть, повторяем отмену",
    failed: "Не удалось отправить отмену",
  },
  EndDirectCall: {
    queued: "Завершаем звонок",
    running: "Завершаем звонок",
    retrying: "Плохая сеть, повторяем завершение",
    failed: "Не удалось завершить звонок",
  },
};

const ACTIVE_SIGNAL_STATUSES = new Set(["queued", "running", "retrying", "failed"]);
const CLEAR_SIGNAL_STATUSES = new Set(["sent", "superseded"]);

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
  signalStatus: "",
  signalCommand: "",
  signalAttempt: 0,
  signalError: "",
  signalErrorName: "",
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

export const getDirectCallSignalStatusLabel = (methodName, status) => (
  DIRECT_CALL_SIGNAL_LABELS[String(methodName || "").trim()]?.[String(status || "").trim()] || ""
);

export const deriveDirectCallStateFromSignalCommand = (previousState, signalStatus = {}) => {
  const previous = previousState || createDirectCallState();
  if (previous.phase === "idle") {
    return previous;
  }

  const methodName = String(signalStatus?.methodName || "").trim();
  const status = String(signalStatus?.status || "").trim();
  const args = Array.isArray(signalStatus?.args) ? signalStatus.args : [];
  const commandChannel = String(
    signalStatus?.channelName
      || signalStatus?.channelId
      || args[1]
      || "",
  ).trim();

  if (!methodName || !status || !commandChannel || commandChannel !== String(previous.channelId || "").trim()) {
    return previous;
  }

  if (CLEAR_SIGNAL_STATUSES.has(status)) {
    return {
      ...previous,
      signalStatus: "",
      signalCommand: "",
      signalAttempt: 0,
      signalError: "",
      signalErrorName: "",
    };
  }

  if (!ACTIVE_SIGNAL_STATUSES.has(status)) {
    return previous;
  }

  const label = getDirectCallSignalStatusLabel(methodName, status);
  const attempt = Number(signalStatus?.attempt || 0);
  const error = String(signalStatus?.error || "").trim();
  const errorName = String(signalStatus?.errorName || "").trim();

  return {
    ...previous,
    statusLabel: label || previous.statusLabel,
    canRetry: status === "failed" ? true : previous.canRetry,
    lastReason: status === "failed" ? (error || previous.lastReason) : previous.lastReason,
    signalStatus: status,
    signalCommand: methodName,
    signalAttempt: Number.isFinite(attempt) && attempt > 0 ? Math.round(attempt) : 0,
    signalError: error,
    signalErrorName: errorName,
  };
};

export const deriveDirectCallStateFromVoiceConnection = (previousState, voiceConnectionState = {}) => {
  const previous = previousState || createDirectCallState();
  const phase = String(previous.phase || "");
  const channelId = String(previous.channelId || "").trim();
  const connectionPhase = String(voiceConnectionState?.phase || "").trim();
  const connectionChannel = String(voiceConnectionState?.channel || "").trim();

  if (!isDirectCallChannel(channelId) || (connectionChannel && connectionChannel !== channelId)) {
    return previous;
  }

  if (
    connectionPhase === "reconnecting"
    && (phase === "connected" || phase === "connecting")
  ) {
    return {
      ...previous,
      phase: "reconnecting",
      status: "reconnecting",
      statusLabel: "Восстанавливаем соединение",
      connectionQuality: "reconnecting",
      canRetry: false,
    };
  }

  if (connectionPhase === "connected" && phase === "reconnecting") {
    return {
      ...previous,
      phase: "connected",
      status: "connected",
      statusLabel: "Идет разговор",
      connectionQuality: getDirectCallConnectionQuality(null, "connected"),
      canRetry: false,
    };
  }

  return previous;
};
