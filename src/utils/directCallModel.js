export const getDirectCallChannelId = (firstUserId, secondUserId) => {
  const firstId = Number.parseInt(String(firstUserId || "").trim(), 10);
  const secondId = Number.parseInt(String(secondUserId || "").trim(), 10);

  if (!Number.isFinite(firstId) || !Number.isFinite(secondId) || firstId <= 0 || secondId <= 0 || firstId === secondId) {
    return "";
  }

  const lowUserId = Math.min(firstId, secondId);
  const highUserId = Math.max(firstId, secondId);
  return `direct-call::${lowUserId}::${highUserId}`;
};

export const isDirectCallChannelId = (channelId) => /^direct-call::\d+::\d+$/i.test(String(channelId || "").trim());
