import chatConnection from "../SignalR/ChatConnect";
import { prepareOutgoingTextPayload } from "../security/chatPayloadCrypto";
import {
  COMPAT_FORWARD_DELAY_MS,
  getUserName,
  isMissingHubMethodError,
  sleep,
} from "./textChatModel";

export async function sendMessagesCompat({
  targetChannelId,
  avatar,
  payload,
  user,
  allowBatch = true,
}) {
  const normalizedPayload = Array.isArray(payload)
    ? payload.filter((item) => {
        const attachments = Array.isArray(item?.attachments) ? item.attachments : [];
        return String(item?.message || "").trim()
          || String(item?.attachmentUrl || "").trim()
          || item?.voiceMessage
          || attachments.some((attachment) => String(attachment?.attachmentUrl || "").trim() || attachment?.voiceMessage);
      })
    : [];

  if (!normalizedPayload.length) {
    throw new Error("Нет данных для отправки.");
  }

  const containsTextPayload = normalizedPayload.some((item) => String(item?.message || "").trim());

  if (allowBatch && normalizedPayload.length > 1 && !containsTextPayload) {
    try {
      await chatConnection.invoke("ForwardMessages", targetChannelId, avatar, normalizedPayload);
      return;
    } catch (error) {
      if (!isMissingHubMethodError(error, "ForwardMessages")) {
        throw error;
      }
    }
  }

  for (let index = 0; index < normalizedPayload.length; index += 1) {
    const item = normalizedPayload[index];
    const preparedTextPayload = await prepareOutgoingTextPayload({
      text: String(item.message || ""),
    });
    const attachmentList = Array.isArray(item.attachments) ? item.attachments : [];
    const primaryAttachment = attachmentList[0] || null;

    await chatConnection.invoke(
      "SendMessage",
      targetChannelId,
      getUserName(user),
      preparedTextPayload.message,
      avatar,
      primaryAttachment?.attachmentUrl || item.attachmentUrl || null,
      primaryAttachment?.attachmentName || item.attachmentName || null,
      primaryAttachment?.attachmentSize || item.attachmentSize || null,
      primaryAttachment?.attachmentContentType || item.attachmentContentType || null,
      preparedTextPayload.encryption || null,
      primaryAttachment?.attachmentEncryption || item.attachmentEncryption || null,
      Array.isArray(item.mentions) ? item.mentions : [],
      primaryAttachment?.voiceMessage || item.voiceMessage || null,
      attachmentList
    );

    if (index < normalizedPayload.length - 1) {
      await sleep(COMPAT_FORWARD_DELAY_MS);
    }
  }
}
