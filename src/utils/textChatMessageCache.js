const TEXT_CHAT_MESSAGE_CACHE_PREFIX = "textchat-message-cache";
const TEXT_CHAT_CHANNEL_CLEAR_PREFIX = "textchat-channel-clear";
const TEXT_CHAT_HIDDEN_MESSAGES_PREFIX = "textchat-hidden-messages";
const TEXT_CHAT_CACHE_DB_NAME = "lanaya-text-chat-cache";
const TEXT_CHAT_CACHE_DB_VERSION = 1;
const TEXT_CHAT_CACHE_STORE_NAME = "channelMessages";
const MAX_LOCAL_CACHED_MESSAGES = 160;
const MAX_HIDDEN_MESSAGE_IDS = 1000;
export const MAX_PERSISTENT_CACHED_MESSAGES = 1000;

let indexedDbOpenPromise = null;

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

function getIndexedDb() {
  if (typeof window !== "undefined" && window.indexedDB) {
    return window.indexedDB;
  }

  return globalThis.indexedDB || null;
}

function getCacheKey(userId, channelId) {
  const normalizedUserId = String(userId || "").trim();
  const normalizedChannelId = String(channelId || "").trim();
  if (!normalizedUserId || !normalizedChannelId) {
    return "";
  }

  return `${TEXT_CHAT_MESSAGE_CACHE_PREFIX}:${normalizedUserId}:${normalizedChannelId}`;
}

function getMessageSortTimestamp(messageItem, fallbackIndex = 0) {
  const rawTimestamp = messageItem?.timestamp || messageItem?.Timestamp || messageItem?.createdAt || messageItem?.CreatedAt || "";
  const parsedTimestamp = rawTimestamp ? new Date(rawTimestamp).getTime() : Number.NaN;
  return Number.isFinite(parsedTimestamp) ? parsedTimestamp : fallbackIndex;
}

function compareCachedMessages(leftMessage, rightMessage) {
  const timestampDelta = getMessageSortTimestamp(leftMessage) - getMessageSortTimestamp(rightMessage);
  if (timestampDelta !== 0) {
    return timestampDelta;
  }

  return Number(leftMessage?.id || 0) - Number(rightMessage?.id || 0);
}

function getChannelClearKey(userId, channelId) {
  const normalizedUserId = String(userId || "").trim();
  const normalizedChannelId = String(channelId || "").trim();
  if (!normalizedUserId || !normalizedChannelId) {
    return "";
  }

  return `${TEXT_CHAT_CHANNEL_CLEAR_PREFIX}:${normalizedUserId}:${normalizedChannelId}`;
}

function getHiddenMessagesKey(userId, channelId) {
  const normalizedUserId = String(userId || "").trim();
  const normalizedChannelId = String(channelId || "").trim();
  if (!normalizedUserId || !normalizedChannelId) {
    return "";
  }

  return `${TEXT_CHAT_HIDDEN_MESSAGES_PREFIX}:${normalizedUserId}:${normalizedChannelId}`;
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

function openTextChatCacheDb() {
  const indexedDb = getIndexedDb();
  if (!indexedDb) {
    return Promise.resolve(null);
  }

  if (indexedDbOpenPromise) {
    return indexedDbOpenPromise;
  }

  indexedDbOpenPromise = new Promise((resolve) => {
    const request = indexedDb.open(TEXT_CHAT_CACHE_DB_NAME, TEXT_CHAT_CACHE_DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(TEXT_CHAT_CACHE_STORE_NAME)) {
        db.createObjectStore(TEXT_CHAT_CACHE_STORE_NAME, { keyPath: "cacheKey" });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => resolve(null);
    request.onblocked = () => resolve(null);
  });

  return indexedDbOpenPromise;
}

async function readPersistentCacheRecord(userId, channelId) {
  const cacheKey = getCacheKey(userId, channelId);
  const db = await openTextChatCacheDb();
  if (!db || !cacheKey) {
    return null;
  }

  return new Promise((resolve) => {
    const transaction = db.transaction(TEXT_CHAT_CACHE_STORE_NAME, "readonly");
    const store = transaction.objectStore(TEXT_CHAT_CACHE_STORE_NAME);
    const request = store.get(cacheKey);

    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => resolve(null);
    transaction.onerror = () => resolve(null);
  });
}

async function writePersistentCacheRecord(userId, channelId, messages) {
  const cacheKey = getCacheKey(userId, channelId);
  const db = await openTextChatCacheDb();
  if (!db || !cacheKey) {
    return false;
  }

  return new Promise((resolve) => {
    const transaction = db.transaction(TEXT_CHAT_CACHE_STORE_NAME, "readwrite");
    const store = transaction.objectStore(TEXT_CHAT_CACHE_STORE_NAME);
    const normalizedMessages = mergeCachedTextChatMessages([], messages);
    const request = store.put({
      cacheKey,
      userId: String(userId || "").trim(),
      channelId: String(channelId || "").trim(),
      cachedAt: Date.now(),
      messages: normalizedMessages,
    });

    request.onsuccess = () => resolve(true);
    request.onerror = () => resolve(false);
    transaction.onerror = () => resolve(false);
  });
}

async function deletePersistentCacheRecord(userId, channelId) {
  const cacheKey = getCacheKey(userId, channelId);
  const db = await openTextChatCacheDb();
  if (!db || !cacheKey) {
    return false;
  }

  return new Promise((resolve) => {
    const transaction = db.transaction(TEXT_CHAT_CACHE_STORE_NAME, "readwrite");
    const store = transaction.objectStore(TEXT_CHAT_CACHE_STORE_NAME);
    const request = store.delete(cacheKey);

    request.onsuccess = () => resolve(true);
    request.onerror = () => resolve(false);
    transaction.onerror = () => resolve(false);
  });
}

export function mergeCachedTextChatMessages(existingMessages, incomingMessages, { maxMessages = MAX_PERSISTENT_CACHED_MESSAGES } = {}) {
  const indexById = new Map();
  const mergedMessages = [];

  [...(Array.isArray(existingMessages) ? existingMessages : []), ...(Array.isArray(incomingMessages) ? incomingMessages : [])]
    .map(normalizeCachedMessage)
    .filter(Boolean)
    .forEach((messageItem) => {
      const messageId = String(messageItem?.id || "").trim();
      if (!messageId) {
        return;
      }

      if (indexById.has(messageId)) {
        mergedMessages[indexById.get(messageId)] = messageItem;
        return;
      }

      indexById.set(messageId, mergedMessages.length);
      mergedMessages.push(messageItem);
    });

  const normalizedMaxMessages = Math.max(1, Number(maxMessages) || MAX_PERSISTENT_CACHED_MESSAGES);
  return mergedMessages
    .sort(compareCachedMessages)
    .slice(-normalizedMaxMessages);
}

export function getLatestCachedTextChatMessageId(messages) {
  return (Array.isArray(messages) ? messages : []).reduce((latestMessageId, messageItem) => {
    const messageId = Number(messageItem?.id || messageItem?.Id || 0) || 0;
    return messageId > latestMessageId ? messageId : latestMessageId;
  }, 0);
}

export function getOldestCachedTextChatMessageId(messages) {
  return (Array.isArray(messages) ? messages : []).reduce((oldestMessageId, messageItem) => {
    const messageId = Number(messageItem?.id || messageItem?.Id || 0) || 0;
    if (!messageId) {
      return oldestMessageId;
    }

    return oldestMessageId <= 0 || messageId < oldestMessageId ? messageId : oldestMessageId;
  }, 0);
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
    .slice(-MAX_LOCAL_CACHED_MESSAGES)
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

export async function readPersistentCachedTextChatMessages(userId, channelId) {
  const legacyMessages = readCachedTextChatMessages(userId, channelId);

  try {
    const record = await readPersistentCacheRecord(userId, channelId);
    const persistentMessages = Array.isArray(record?.messages)
      ? mergeCachedTextChatMessages([], record.messages)
      : [];

    if (persistentMessages.length) {
      return persistentMessages;
    }

    if (legacyMessages.length) {
      await writePersistentCacheRecord(userId, channelId, legacyMessages);
    }

    return legacyMessages;
  } catch {
    return legacyMessages;
  }
}

export async function writePersistentCachedTextChatMessages(userId, channelId, messages) {
  if (!Array.isArray(messages) || !messages.length) {
    return;
  }

  const legacyMessages = readCachedTextChatMessages(userId, channelId);
  let existingMessages = legacyMessages;

  try {
    const record = await readPersistentCacheRecord(userId, channelId);
    if (Array.isArray(record?.messages) && record.messages.length) {
      existingMessages = record.messages;
    }
  } catch {
    existingMessages = legacyMessages;
  }

  const mergedMessages = mergeCachedTextChatMessages(existingMessages, messages);
  writeCachedTextChatMessages(userId, channelId, mergedMessages);

  try {
    await writePersistentCacheRecord(userId, channelId, mergedMessages);
  } catch {
    // Persistent cache is a speed-up only; localStorage already has a small fallback window.
  }
}

export function clearCachedTextChatMessages(userId, channelId) {
  const storage = getStorage();
  const cacheKey = getCacheKey(userId, channelId);
  if (!cacheKey) {
    return;
  }

  if (storage) {
    try {
      storage.removeItem(cacheKey);
    } catch {
      // Cache is a speed-up only; quota/private-mode failures are safe to ignore.
    }
  }

  deletePersistentCacheRecord(userId, channelId).catch(() => {});
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

export function readHiddenTextChatMessageIds(userId, channelId) {
  const storage = getStorage();
  const hiddenKey = getHiddenMessagesKey(userId, channelId);
  if (!storage || !hiddenKey) {
    return [];
  }

  try {
    const rawValue = storage.getItem(hiddenKey);
    if (!rawValue) {
      return [];
    }

    const parsedValue = JSON.parse(rawValue);
    const messageIds = Array.isArray(parsedValue?.messageIds) ? parsedValue.messageIds : [];
    return Array.from(new Set(messageIds.map((messageId) => String(messageId || "").trim()).filter(Boolean)));
  } catch {
    return [];
  }
}

export function writeHiddenTextChatMessageIds(userId, channelId, messageIds) {
  const storage = getStorage();
  const hiddenKey = getHiddenMessagesKey(userId, channelId);
  if (!storage || !hiddenKey) {
    return;
  }

  const normalizedMessageIds = Array.from(
    new Set((Array.isArray(messageIds) ? messageIds : []).map((messageId) => String(messageId || "").trim()).filter(Boolean))
  ).slice(-MAX_HIDDEN_MESSAGE_IDS);

  try {
    if (!normalizedMessageIds.length) {
      storage.removeItem(hiddenKey);
      return;
    }

    storage.setItem(hiddenKey, JSON.stringify({
      updatedAt: Date.now(),
      messageIds: normalizedMessageIds,
    }));
  } catch {
    // Local hidden-message state is optional UI state; storage failures are safe to ignore.
  }
}
