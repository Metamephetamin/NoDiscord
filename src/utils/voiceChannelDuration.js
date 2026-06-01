const getMonotonicNow = () => {
  if (typeof performance !== "undefined" && typeof performance.now === "function") {
    return performance.now();
  }

  return 0;
};

const readNumber = (...values) => {
  for (const value of values) {
    const numberValue = Number(value);
    if (Number.isFinite(numberValue)) {
      return numberValue;
    }
  }

  return 0;
};

export function formatVoiceChannelDuration(durationMs) {
  const totalSeconds = Math.max(0, Math.floor((Number(durationMs) || 0) / 1000));
  const seconds = totalSeconds % 60;
  const minutes = Math.floor(totalSeconds / 60) % 60;
  const hours = Math.floor(totalSeconds / 3600);

  return `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

export function stampVoiceDurationSync(participant = {}, nowMs = getMonotonicNow()) {
  return {
    ...participant,
    voiceElapsedSyncedAtMs: Number.isFinite(Number(nowMs)) ? Number(nowMs) : 0,
  };
}

export function getVoiceParticipantDurationMs(participant = {}, nowMs = getMonotonicNow()) {
  const baseElapsedMs = Math.max(0, readNumber(
    participant.voiceElapsedMs,
    participant.VoiceElapsedMs
  ));
  const syncedAtMs = readNumber(
    participant.voiceElapsedSyncedAtMs,
    participant.VoiceElapsedSyncedAtMs,
    nowMs
  );
  const monotonicDeltaMs = Math.max(0, (Number(nowMs) || 0) - syncedAtMs);

  return Math.max(0, Math.floor(baseElapsedMs + monotonicDeltaMs));
}

export function getVoiceChannelDurationMs(participants = [], nowMs = getMonotonicNow()) {
  return (Array.isArray(participants) ? participants : []).reduce(
    (maxDurationMs, participant) => Math.max(maxDurationMs, getVoiceParticipantDurationMs(participant, nowMs)),
    0
  );
}

export function resolveVoiceChannelSessionStartedAtMs({
  previousStartedAtMs,
  participants = [],
  nowMs = getMonotonicNow(),
} = {}) {
  const participantList = Array.isArray(participants) ? participants : [];
  if (!participantList.length) {
    return null;
  }

  const hasPreviousStartedAt = previousStartedAtMs !== undefined && previousStartedAtMs !== null && previousStartedAtMs !== "";
  const previousStartedAtNumber = Number(previousStartedAtMs);
  if (hasPreviousStartedAt && Number.isFinite(previousStartedAtNumber)) {
    return previousStartedAtNumber;
  }

  const normalizedNowMs = Number.isFinite(Number(nowMs)) ? Number(nowMs) : getMonotonicNow();
  return normalizedNowMs - getVoiceChannelDurationMs(participantList, normalizedNowMs);
}
