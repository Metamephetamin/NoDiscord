const CHAT_DRAFT_STORAGE_PREFIX = "nd:chat-draft";
const CHAT_DRAFT_UPDATED_EVENT = "nd-chat-draft-updated";

function getUserStorageScope(user) {
  return String(user?.id || user?.email || "guest").trim() || "guest";
}

export function getChatDraftStorageKey(user, channelId) {
  const scope = getUserStorageScope(user);
  const normalizedChannelId = String(channelId || "").trim();
  return normalizedChannelId ? `${CHAT_DRAFT_STORAGE_PREFIX}:${scope}:${normalizedChannelId}` : "";
}

export function readChatDraft(user, channelId) {
  const storageKey = getChatDraftStorageKey(user, channelId);
  if (!storageKey) {
    return "";
  }

  try {
    return String(localStorage.getItem(storageKey) || "");
  } catch {
    return "";
  }
}

function emitDraftChanged(channelId) {
  window.dispatchEvent(new CustomEvent(CHAT_DRAFT_UPDATED_EVENT, {
    detail: { channelId: String(channelId || "") },
  }));
}

export function writeChatDraft(user, channelId, value) {
  const storageKey = getChatDraftStorageKey(user, channelId);
  if (!storageKey) {
    return;
  }

  const normalizedValue = String(value || "");

  try {
    if (normalizedValue.trim()) {
      localStorage.setItem(storageKey, normalizedValue);
    } else {
      localStorage.removeItem(storageKey);
    }
  } catch {
    return;
  }

  emitDraftChanged(channelId);
}

export function clearChatDraft(user, channelId) {
  const storageKey = getChatDraftStorageKey(user, channelId);
  if (!storageKey) {
    return;
  }

  try {
    localStorage.removeItem(storageKey);
  } catch {
    return;
  }

  emitDraftChanged(channelId);
}

export function hasChatDraft(user, channelId) {
  return Boolean(readChatDraft(user, channelId).trim());
}

export function getChatDraftUpdatedEventName() {
  return CHAT_DRAFT_UPDATED_EVENT;
}
