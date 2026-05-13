const TEXT_CHAT_OUTBOX_PREFIX = "textchat-outbox";
const MAX_OUTBOX_ITEMS_PER_CHANNEL = 50;

function getStorage() {
  const browserWindow = globalThis.window;
  if (!browserWindow) {
    return null;
  }

  try {
    return browserWindow.localStorage || null;
  } catch {
    return null;
  }
}

function getOutboxKey(userId, channelId) {
  const normalizedUserId = String(userId || "").trim();
  const normalizedChannelId = String(channelId || "").trim();
  if (!normalizedUserId || !normalizedChannelId) {
    return "";
  }

  return `${TEXT_CHAT_OUTBOX_PREFIX}:${normalizedUserId}:${normalizedChannelId}`;
}

function normalizeOutboxPayload(payload) {
  return (Array.isArray(payload) ? payload : [])
    .map((item) => (item && typeof item === "object" ? { ...item } : null))
    .filter(Boolean);
}

function normalizeOutboxItem(item) {
  if (!item || typeof item !== "object") {
    return null;
  }

  const clientMessageId = String(item.clientMessageId || item.ClientMessageId || "").trim();
  if (!clientMessageId) {
    return null;
  }

  const queuedAt = Number(item.queuedAt || item.QueuedAt || 0);
  const attemptCount = Math.max(0, Math.round(Number(item.attemptCount || item.AttemptCount || 0) || 0));
  const payload = normalizeOutboxPayload(item.payload || item.Payload);
  if (!payload.length) {
    return null;
  }

  return {
    ...item,
    clientMessageId,
    message: String(item.message || item.Message || ""),
    avatar: String(item.avatar || item.Avatar || ""),
    payload,
    queuedAt: Number.isFinite(queuedAt) && queuedAt > 0 ? queuedAt : Date.now(),
    attemptCount,
    lastAttemptAt: Number(item.lastAttemptAt || item.LastAttemptAt || 0) || 0,
  };
}

function writeTextChatOutboxItems(userId, channelId, items) {
  const storage = getStorage();
  const outboxKey = getOutboxKey(userId, channelId);
  if (!storage || !outboxKey) {
    return;
  }

  const normalizedItems = (Array.isArray(items) ? items : [])
    .map(normalizeOutboxItem)
    .filter(Boolean)
    .slice(-MAX_OUTBOX_ITEMS_PER_CHANNEL);

  try {
    if (!normalizedItems.length) {
      storage.removeItem(outboxKey);
      return;
    }

    storage.setItem(outboxKey, JSON.stringify({
      updatedAt: Date.now(),
      items: normalizedItems,
    }));
  } catch {
    // Outbox persistence is best-effort; sending still works in memory.
  }
}

export function readTextChatOutboxItems(userId, channelId) {
  const storage = getStorage();
  const outboxKey = getOutboxKey(userId, channelId);
  if (!storage || !outboxKey) {
    return [];
  }

  try {
    const rawValue = storage.getItem(outboxKey);
    if (!rawValue) {
      return [];
    }

    const parsedValue = JSON.parse(rawValue);
    return (Array.isArray(parsedValue?.items) ? parsedValue.items : [])
      .map(normalizeOutboxItem)
      .filter(Boolean);
  } catch {
    return [];
  }
}

export function upsertTextChatOutboxItem(userId, channelId, item) {
  const normalizedItem = normalizeOutboxItem(item);
  if (!normalizedItem) {
    return null;
  }

  const previousItems = readTextChatOutboxItems(userId, channelId);
  const nextItems = [
    ...previousItems.filter((previousItem) => previousItem.clientMessageId !== normalizedItem.clientMessageId),
    normalizedItem,
  ];
  writeTextChatOutboxItems(userId, channelId, nextItems);
  return normalizedItem;
}

export function removeTextChatOutboxItem(userId, channelId, clientMessageId) {
  const normalizedClientMessageId = String(clientMessageId || "").trim();
  if (!normalizedClientMessageId) {
    return;
  }

  const nextItems = readTextChatOutboxItems(userId, channelId)
    .filter((item) => item.clientMessageId !== normalizedClientMessageId);
  writeTextChatOutboxItems(userId, channelId, nextItems);
}

export function markTextChatOutboxItemAttempt(userId, channelId, clientMessageId) {
  const normalizedClientMessageId = String(clientMessageId || "").trim();
  if (!normalizedClientMessageId) {
    return null;
  }

  let updatedItem = null;
  const nextItems = readTextChatOutboxItems(userId, channelId)
    .map((item) => {
      if (item.clientMessageId !== normalizedClientMessageId) {
        return item;
      }

      updatedItem = {
        ...item,
        attemptCount: Math.max(0, Number(item.attemptCount) || 0) + 1,
        lastAttemptAt: Date.now(),
      };
      return updatedItem;
    });

  writeTextChatOutboxItems(userId, channelId, nextItems);
  return updatedItem;
}
