export function normalizeClientMessageId(messageItem = {}) {
  return String(
    messageItem?.clientMessageId
      || messageItem?.ClientMessageId
      || messageItem?.clientTempId
      || messageItem?.ClientTempId
      || "",
  ).trim();
}

export function deriveMessageDeliveryState(messageItem = {}, isOwnMessage = false) {
  if (!isOwnMessage) {
    return null;
  }

  const localEchoState = String(
    messageItem?.deliveryState
      || messageItem?.localEchoUploadState
      || messageItem?.localEchoStatus
      || "",
  ).trim();

  if (messageItem?.isLocalEcho) {
    if (localEchoState === "failed" || localEchoState === "canceled") {
      return { state: "failed", label: "Не отправлено", isTerminal: true };
    }

    if (localEchoState === "pending" || localEchoState === "queued") {
      return { state: "queued", label: "Ожидает отправки", isTerminal: false };
    }

    return { state: "sending", label: "Отправляется", isTerminal: false };
  }

  if (messageItem?.isRead || messageItem?.readAt) {
    return { state: "delivered", label: "Прочитано", isTerminal: true };
  }

  return { state: "sent", label: "Отправлено", isTerminal: true };
}
