import chatConnection from "../SignalR/ChatConnect";
import { prepareOutgoingTextPayload } from "../security/chatPayloadCrypto";
import {
  COMPAT_FORWARD_DELAY_MS,
  getUserName,
  isMissingHubMethodError,
  sleep,
} from "./textChatModel";

function normalizeHubAttachmentInput(attachment) {
  const attachmentUrl = normalizeChatFileHubUrl(attachment?.attachmentUrl || attachment?.AttachmentUrl || "");
  const attachmentName = attachment?.attachmentName || attachment?.AttachmentName || null;
  const attachmentSize = attachment?.attachmentSize ?? attachment?.AttachmentSize ?? null;
  const attachmentContentType = attachment?.attachmentContentType || attachment?.AttachmentContentType || "";
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
    attachmentAsFile,
    AttachmentAsFile: attachmentAsFile,
    attachmentEncryption,
    AttachmentEncryption: attachmentEncryption,
    voiceMessage,
    VoiceMessage: voiceMessage,
  };
}

function normalizeChatFileHubUrl(value) {
  const normalizedValue = String(value || "").trim();
  if (!normalizedValue) {
    return "";
  }

  if (normalizedValue.startsWith("/chat-files/")) {
    return normalizedValue;
  }

  if (normalizedValue.startsWith("chat-files/")) {
    return `/${normalizedValue}`;
  }

  try {
    const parsedUrl = new URL(normalizedValue);
    const pathname = String(parsedUrl.pathname || "").trim();
    return pathname.startsWith("/chat-files/") ? pathname : "";
  } catch {
    return "";
  }
}

function normalizeHubMessageInput(item) {
  const attachments = Array.isArray(item?.attachments)
    ? item.attachments.map(normalizeHubAttachmentInput)
    : [];
  const attachmentAsFile = Boolean(item?.attachmentAsFile || item?.AttachmentAsFile || attachments[0]?.attachmentAsFile);
  const clientTempId = String(item?.clientTempId || item?.ClientTempId || "").trim();

  return {
    ...item,
    clientTempId,
    ClientTempId: clientTempId,
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
    const sendMessageArgs = [
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
      false,
      Boolean(item.attachmentAsFile || primaryAttachment?.attachmentAsFile),
      item.clientTempId || null,
    ];

    try {
      await chatConnection.invoke("SendMessage", ...sendMessageArgs);
    } catch (error) {
      const rawMessage = String(error?.message || "");
      const expectsLegacySignature = rawMessage.includes("provides 19 argument(s) but target expects 18");
      if (!expectsLegacySignature) {
        throw error;
      }

      console.warn("SendMessage legacy signature fallback: backend expects 18 arguments.", error);
      await chatConnection.invoke("SendMessage", ...sendMessageArgs.slice(0, -1));
    }

    if (index < hubPayload.length - 1) {
      await sleep(COMPAT_FORWARD_DELAY_MS);
    }
  }
}
