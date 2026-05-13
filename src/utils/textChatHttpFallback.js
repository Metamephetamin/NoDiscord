function getAttachmentList(item) {
  return Array.isArray(item?.attachments)
    ? item.attachments
    : Array.isArray(item?.Attachments)
      ? item.Attachments
      : [];
}

function hasAttachmentPayload(item) {
  const attachments = getAttachmentList(item);
  return String(item?.attachmentUrl || item?.AttachmentUrl || "").trim()
    || item?.voiceMessage
    || item?.VoiceMessage
    || attachments.some((attachment) => (
      String(attachment?.attachmentUrl || attachment?.AttachmentUrl || "").trim()
      || attachment?.voiceMessage
      || attachment?.VoiceMessage
    ));
}

export function canUseHttpOutboxFallback(payload) {
  if (!Array.isArray(payload) || payload.length !== 1) {
    return false;
  }

  const item = payload[0];
  return Boolean(String(item?.message || item?.Message || "").trim()) && !hasAttachmentPayload(item);
}

export function isRealtimeSendUnavailableError(error) {
  const message = String(error?.message || error || "").toLowerCase();
  return message.includes("connection is not in the connected state")
    || message.includes("server timeout")
    || message.includes("connection disconnected")
    || message.includes("connection closed")
    || message.includes("websocket")
    || message.includes("networkerror");
}

export async function sendOutboxMessageViaHttp({ targetChannelId, avatar, item, preparedTextPayload }) {
  const { API_BASE_URL } = await import("../config/runtime");
  const { authFetch, parseApiResponse } = await import("./auth");
  const response = await authFetch(`${API_BASE_URL}/chats/${encodeURIComponent(targetChannelId)}/messages/outbox`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      message: preparedTextPayload?.message || item?.message || "",
      encryption: preparedTextPayload?.encryption || null,
      photoUrl: avatar || "",
      clientTempId: item?.clientTempId || item?.ClientTempId || "",
      replyToMessageId: item?.replyToMessageId || item?.ReplyToMessageId || "",
      replyToUsername: item?.replyToUsername || item?.ReplyToUsername || "",
      replyPreview: item?.replyPreview || item?.ReplyPreview || "",
    }),
  });
  const data = await parseApiResponse(response);

  if (!response.ok) {
    throw new Error(data?.message || "Не удалось отправить сообщение через резервный HTTP-канал.");
  }

  return data;
}
