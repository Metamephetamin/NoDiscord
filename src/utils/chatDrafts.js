const CHAT_DRAFT_STORAGE_PREFIX = "nd:chat-draft";
const CHAT_DRAFT_UPDATED_EVENT = "nd-chat-draft-updated";

function getDraftStorage() {
  try {
    return window?.sessionStorage || null;
  } catch {
    return null;
  }
}

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
    return String(getDraftStorage()?.getItem(storageKey) || "");
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
    const storage = getDraftStorage();
    if (!storage) {
      return;
    }

    if (normalizedValue.trim()) {
      storage.setItem(storageKey, normalizedValue);
    } else {
      storage.removeItem(storageKey);
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
    getDraftStorage()?.removeItem(storageKey);
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
