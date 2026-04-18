const TEXT_CHAT_MESSAGE_CACHE_PREFIX = "textchat-message-cache";
const TEXT_CHAT_CHANNEL_CLEAR_PREFIX = "textchat-channel-clear";
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

function getChannelClearKey(userId, channelId) {
  const normalizedUserId = String(userId || "").trim();
  const normalizedChannelId = String(channelId || "").trim();
  if (!normalizedUserId || !normalizedChannelId) {
    return "";
  }

  return `${TEXT_CHAT_CHANNEL_CLEAR_PREFIX}:${normalizedUserId}:${normalizedChannelId}`;
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
  if (!storage || !cacheKey || !Array.isArray(messages)) {
    return;
  }

  if (!messages.length) {
    try {
      storage.removeItem(cacheKey);
    } catch {
      // Cache is a speed-up only; quota/private-mode failures are safe to ignore.
    }
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

export function clearCachedTextChatMessages(userId, channelId) {
  const storage = getStorage();
  const cacheKey = getCacheKey(userId, channelId);
  if (!storage || !cacheKey) {
    return;
  }

  try {
    storage.removeItem(cacheKey);
  } catch {
    // Cache is a speed-up only; quota/private-mode failures are safe to ignore.
  }
}

export function readTextChatChannelClearedAt(userId, channelId) {
  const storage = getStorage();
  const clearKey = getChannelClearKey(userId, channelId);
  if (!storage || !clearKey) {
    return "";
  }

  try {
    return String(storage.getItem(clearKey) || "").trim();
  } catch {
    return "";
  }
}

export function writeTextChatChannelClearedAt(userId, channelId, clearedAt) {
  const storage = getStorage();
  const clearKey = getChannelClearKey(userId, channelId);
  if (!storage || !clearKey) {
    return;
  }

  const normalizedClearedAt = String(clearedAt || "").trim();

  try {
    if (!normalizedClearedAt) {
      storage.removeItem(clearKey);
      return;
    }

    storage.setItem(clearKey, normalizedClearedAt);
  } catch {
    // Local clear markers are optional UI state; storage failures are safe to ignore.
  }
}
