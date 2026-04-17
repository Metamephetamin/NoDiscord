import chatConnection from "../SignalR/ChatConnect";
import { prepareOutgoingTextPayload } from "../security/chatPayloadCrypto";
import {
  COMPAT_FORWARD_DELAY_MS,
  getUserName,
  isMissingHubMethodError,
  sleep,
} from "./textChatModel";

function normalizeHubAttachmentInput(attachment) {
  const attachmentUrl = attachment?.attachmentUrl || attachment?.AttachmentUrl || "";
  const attachmentName = attachment?.attachmentName || attachment?.AttachmentName || null;
  const attachmentSize = attachment?.attachmentSize ?? attachment?.AttachmentSize ?? null;
  const attachmentContentType = attachment?.attachmentContentType || attachment?.AttachmentContentType || "";
  const attachmentSpoiler = Boolean(attachment?.attachmentSpoiler || attachment?.AttachmentSpoiler);
  const attachmentAsFile = Boolean(attachment?.attachmentAsFile || attachment?.AttachmentAsFile);
  const attachmentEncryption = attachment?.attachmentEncryption || attachment?.AttachmentEncryption || null;
  const voiceMessage = attachment?.voiceMessage || attachment?.VoiceMessage || null;

  return {
    attachmentUrl,
    AttachmentUrl: attachmentUrl,
    attachmentName,
    AttachmentName: attachmentName,
    attachmentSize,
    AttachmentSize: attachmentSize,
    attachmentContentType,
    AttachmentContentType: attachmentContentType,
    attachmentSpoiler,
    AttachmentSpoiler: attachmentSpoiler,
    attachmentAsFile,
    AttachmentAsFile: attachmentAsFile,
    attachmentEncryption,
    AttachmentEncryption: attachmentEncryption,
    voiceMessage,
    VoiceMessage: voiceMessage,
  };
}

function normalizeHubMessageInput(item) {
  const attachments = Array.isArray(item?.attachments)
    ? item.attachments.map(normalizeHubAttachmentInput)
    : [];
  const attachmentSpoiler = Boolean(item?.attachmentSpoiler || item?.AttachmentSpoiler || attachments[0]?.attachmentSpoiler);
  const attachmentAsFile = Boolean(item?.attachmentAsFile || item?.AttachmentAsFile || attachments[0]?.attachmentAsFile);

  return {
    ...item,
    attachmentSpoiler,
    AttachmentSpoiler: attachmentSpoiler,
    attachmentAsFile,
    AttachmentAsFile: attachmentAsFile,
    attachments,
    Attachments: attachments,
  };
}

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

  const hubPayload = normalizedPayload.map(normalizeHubMessageInput);
  const containsTextPayload = hubPayload.some((item) => String(item?.message || "").trim());

  if (allowBatch && hubPayload.length > 1 && !containsTextPayload) {
    try {
      await chatConnection.invoke("ForwardMessages", targetChannelId, avatar, hubPayload);
      return;
    } catch (error) {
      if (!isMissingHubMethodError(error, "ForwardMessages")) {
        throw error;
      }
    }
  }

  for (let index = 0; index < hubPayload.length; index += 1) {
    const item = hubPayload[index];
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
      attachmentList,
      item.replyToMessageId || null,
      item.replyToUsername || null,
      item.replyPreview || null,
      Boolean(item.attachmentSpoiler || primaryAttachment?.attachmentSpoiler),
      Boolean(item.attachmentAsFile || primaryAttachment?.attachmentAsFile)
    );

    if (index < hubPayload.length - 1) {
      await sleep(COMPAT_FORWARD_DELAY_MS);
    }
  }
}
