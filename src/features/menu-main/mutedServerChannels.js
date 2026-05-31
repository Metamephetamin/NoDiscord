export const getMutedChannelKey = (serverId, type, channelId) => {
  const normalizedServerId = String(serverId || "").trim();
  const normalizedChannelId = String(channelId || "").trim();
  if (!normalizedServerId || !normalizedChannelId) {
    return "";
  }

  const normalizedType = String(type || "text") === "voice" ? "voice" : "text";
  return `${normalizedServerId}:${normalizedType}:${normalizedChannelId}`;
};

export const normalizeMutedChannelMap = (value) => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(value)
      .filter(([key, isMuted]) => String(key || "").trim() && Boolean(isMuted))
      .map(([key]) => [String(key), true])
  );
};

export const toggleMutedChannelKey = (state, key) => {
  const normalizedKey = String(key || "").trim();
  if (!normalizedKey) {
    return normalizeMutedChannelMap(state);
  }

  const nextState = normalizeMutedChannelMap(state);
  if (nextState[normalizedKey]) {
    delete nextState[normalizedKey];
    return nextState;
  }

  return {
    ...nextState,
    [normalizedKey]: true,
  };
};

export const getMutedChannelsStorageKey = (currentUserId) =>
  `nd:muted-server-channels:${String(currentUserId || "guest").trim() || "guest"}`;

export const readMutedServerChannels = (storageKey) => {
  if (!storageKey || typeof window === "undefined") {
    return {};
  }

  try {
    const rawValue = window.localStorage.getItem(storageKey);
    return normalizeMutedChannelMap(rawValue ? JSON.parse(rawValue) : {});
  } catch {
    return {};
  }
};

export const writeMutedServerChannels = (storageKey, state) => {
  if (!storageKey || typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(storageKey, JSON.stringify(normalizeMutedChannelMap(state)));
  } catch {
    // Channel mute is local UI state; ignore unavailable storage.
  }
};
