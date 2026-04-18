const TEXT_CHAT_MESSAGE_CACHE_PREFIX = "textchat-message-cache";
const MAX_CACHED_MESSAGES = 60;

function getStorage() {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    return window.localStorage || null;
  } catch {
    return null;
  }
}

function getCacheKey(userId, channelId) {
  const normalizedUserId = String(userId || "").trim();
  const normalizedChannelId = String(channelId || "").trim();
  if (!normalizedUserId || !normalizedChannelId) {
    return "";
  }

  return `${TEXT_CHAT_MESSAGE_CACHE_PREFIX}:${normalizedUserId}:${normalizedChannelId}`;
}

function normalizeCachedMessage(messageItem) {
  if (!messageItem || typeof messageItem !== "object") {
    return null;
  }

  const messageId = String(messageItem.id || messageItem.Id || "").trim();
  if (!messageId) {
    return null;
  }

  return {
    ...messageItem,
    id: messageItem.id ?? messageItem.Id ?? messageId,
    timestamp: messageItem.timestamp || messageItem.Timestamp || messageItem.createdAt || messageItem.CreatedAt || "",
    message: String(messageItem.message || messageItem.Message || ""),
    attachments: Array.isArray(messageItem.attachments)
      ? messageItem.attachments
      : Array.isArray(messageItem.Attachments)
        ? messageItem.Attachments
        : [],
    reactions: Array.isArray(messageItem.reactions)
      ? messageItem.reactions
      : Array.isArray(messageItem.Reactions)
        ? messageItem.Reactions
        : [],
  };
}

export function readCachedTextChatMessages(userId, channelId) {
  const storage = getStorage();
  const cacheKey = getCacheKey(userId, channelId);
  if (!storage || !cacheKey) {
    return [];
  }

  try {
    const rawValue = storage.getItem(cacheKey);
    if (!rawValue) {
      return [];
    }

    const parsedValue = JSON.parse(rawValue);
    const messages = Array.isArray(parsedValue?.messages) ? parsedValue.messages : [];
    return messages.map(normalizeCachedMessage).filter(Boolean);
  } catch {
    return [];
  }
}

export function writeCachedTextChatMessages(userId, channelId, messages) {
  const storage = getStorage();
  const cacheKey = getCacheKey(userId, channelId);
  if (!storage || !cacheKey || !Array.isArray(messages) || !messages.length) {
    return;
  }

  const cachedMessages = messages
    .slice(-MAX_CACHED_MESSAGES)
    .map(normalizeCachedMessage)
    .filter(Boolean);

  if (!cachedMessages.length) {
    return;
  }

  try {
    storage.setItem(cacheKey, JSON.stringify({
      cachedAt: Date.now(),
      messages: cachedMessages,
    }));
  } catch {
    // Cache is a speed-up only; quota/private-mode failures are safe to ignore.
  }
}
