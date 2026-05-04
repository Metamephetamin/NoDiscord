export const createVoiceSessionPrewarmCache = ({ ttlMs = 20_000, now = () => Date.now() } = {}) => {
  let prewarmedSession = null;

  const isReusable = (channelName, user, at = now()) => {
    if (!prewarmedSession) {
      return false;
    }

    const isExpired = at - prewarmedSession.createdAt > ttlMs;
    const sameChannel = prewarmedSession.channelName === channelName;
    const sameUser = prewarmedSession.userId === String(user?.id || "");
    if (isExpired || !sameChannel || !sameUser) {
      prewarmedSession = null;
      return false;
    }

    return true;
  };

  return {
    isReusable,

    store(channelName, user, value, at = now()) {
      prewarmedSession = {
        channelName,
        userId: String(user?.id || ""),
        createdAt: at,
        value,
      };
    },

    take(channelName, user, at = now()) {
      if (!isReusable(channelName, user, at)) {
        return null;
      }

      const cachedValue = prewarmedSession.value;
      prewarmedSession = null;
      return cachedValue;
    },

    clear() {
      prewarmedSession = null;
    },
  };
};
