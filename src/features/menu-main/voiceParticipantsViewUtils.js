const getParticipantUserId = (participant) =>
  String(participant?.userId || participant?.UserId || "");

const hasValue = (value) => value !== undefined && value !== null && value !== "";

const mergeParticipantSnapshots = (rawParticipant, liveKitParticipant) => ({
  ...(rawParticipant || {}),
  ...(liveKitParticipant || {}),
  joinedAtUtc: hasValue(liveKitParticipant?.joinedAtUtc ?? liveKitParticipant?.JoinedAtUtc)
    ? liveKitParticipant.joinedAtUtc ?? liveKitParticipant.JoinedAtUtc
    : rawParticipant?.joinedAtUtc ?? rawParticipant?.JoinedAtUtc ?? "",
  voiceElapsedMs: hasValue(liveKitParticipant?.voiceElapsedMs ?? liveKitParticipant?.VoiceElapsedMs)
    ? liveKitParticipant.voiceElapsedMs ?? liveKitParticipant.VoiceElapsedMs
    : rawParticipant?.voiceElapsedMs ?? rawParticipant?.VoiceElapsedMs ?? 0,
  voiceElapsedSyncedAtMs: hasValue(liveKitParticipant?.voiceElapsedSyncedAtMs ?? liveKitParticipant?.VoiceElapsedSyncedAtMs)
    ? liveKitParticipant.voiceElapsedSyncedAtMs ?? liveKitParticipant.VoiceElapsedSyncedAtMs
    : rawParticipant?.voiceElapsedSyncedAtMs ?? rawParticipant?.VoiceElapsedSyncedAtMs ?? 0,
});

export const mergeCurrentVoiceParticipants = ({
  rawParticipants = [],
  liveKitParticipants = [],
  hasLiveKitSnapshot = false,
} = {}) => {
  if (!hasLiveKitSnapshot) {
    return Array.isArray(rawParticipants) ? rawParticipants : [];
  }

  const rawParticipantById = new Map();
  (Array.isArray(rawParticipants) ? rawParticipants : []).forEach((participant) => {
    const userId = getParticipantUserId(participant);
    if (userId && !rawParticipantById.has(userId)) {
      rawParticipantById.set(userId, participant);
    }
  });

  const seenUserIds = new Set();
  return (Array.isArray(liveKitParticipants) ? liveKitParticipants : []).reduce((participants, liveKitParticipant) => {
    const userId = getParticipantUserId(liveKitParticipant);
    if (!userId || seenUserIds.has(userId)) {
      return participants;
    }

    seenUserIds.add(userId);
    participants.push(mergeParticipantSnapshots(rawParticipantById.get(userId), liveKitParticipant));
    return participants;
  }, []);
};
