export const TEXT_CHAT_INSERT_MENTION_EVENT = "nd:text-chat-insert-mention";

export function emitInsertMentionRequest(detail) {
  if (typeof window === "undefined") {
    return;
  }

  window.dispatchEvent(new CustomEvent(TEXT_CHAT_INSERT_MENTION_EVENT, {
    detail: detail || {},
  }));
}
