import { API_URL } from "../config/runtime";
import { prepareOutgoingAttachmentPayload } from "../security/chatPayloadCrypto";
import { authFetch } from "./auth";
import { resolveMediaUrl } from "./media";
import {
  MAX_FORWARD_BATCH_SIZE,
  shouldUseAuthenticatedDownload,
} from "./textChatHelpers";
import { normalizeAttachmentItems } from "./textChatModel";

export async function buildForwardPayloadForTargetChannel({
  sourceMessages,
  uploadAttachment,
}) {
  const payload = [];

  for (const messageItem of sourceMessages.slice(0, MAX_FORWARD_BATCH_SIZE)) {
    const sourceAttachments = normalizeAttachmentItems(messageItem);
    const forwardedAttachments = [];

    for (let attachmentIndex = 0; attachmentIndex < sourceAttachments.length; attachmentIndex += 1) {
      const attachmentItem = sourceAttachments[attachmentIndex];
      if (!attachmentItem.attachmentUrl) {
        continue;
      }

      const sourceUrl = resolveMediaUrl(attachmentItem.attachmentUrl, attachmentItem.attachmentUrl);
      const response = shouldUseAuthenticatedDownload(sourceUrl, API_URL)
        ? await authFetch(sourceUrl)
        : await fetch(sourceUrl);

      if (!response.ok) {
        throw new Error("Не удалось загрузить файл для пересылки.");
      }

      const blob = await response.blob();
      const forwardFile = new File([blob], attachmentItem.attachmentName || "file", {
        type: attachmentItem.attachmentContentType || blob.type || "application/octet-stream",
      });
      const preparedAttachment = await prepareOutgoingAttachmentPayload({ file: forwardFile });
      const uploaded = await uploadAttachment({
        blob: preparedAttachment.uploadBlob,
        fileName: preparedAttachment.uploadFileName
          || forwardFile.name
          || `attachment-forward-${Date.now()}-${messageItem.id}-${attachmentIndex}`,
      });

      forwardedAttachments.push({
        attachmentUrl: uploaded?.fileUrl || "",
        attachmentName: uploaded?.fileName || forwardFile.name || "attachment",
        attachmentSize: uploaded?.size || preparedAttachment.uploadBlob.size || null,
        attachmentContentType: uploaded?.contentType || forwardFile.type || "application/octet-stream",
        attachmentAsFile: Boolean(attachmentItem.attachmentAsFile),
        attachmentEncryption: null,
        voiceMessage: attachmentItem.voiceMessage || null,
      });
    }

    if (!String(messageItem.message || "").trim() && !forwardedAttachments.length) {
      continue;
    }

    payload.push({
      message: String(messageItem.message || ""),
      forwardedFromUserId: String(messageItem.forwardedFromUserId || messageItem.authorUserId || ""),
      forwardedFromUsername: String(messageItem.forwardedFromUsername || messageItem.username || ""),
      replyToMessageId: String(messageItem.replyToMessageId || ""),
      replyToUsername: String(messageItem.replyToUsername || ""),
      replyPreview: String(messageItem.replyPreview || ""),
      voiceMessage: forwardedAttachments[0]?.voiceMessage || messageItem.voiceMessage || null,
      attachments: forwardedAttachments,
      attachmentUrl: forwardedAttachments[0]?.attachmentUrl || "",
      attachmentName: forwardedAttachments[0]?.attachmentName || "",
      attachmentSize: forwardedAttachments[0]?.attachmentSize || null,
      attachmentContentType: forwardedAttachments[0]?.attachmentContentType || "",
      attachmentAsFile: Boolean(forwardedAttachments[0]?.attachmentAsFile),
      attachmentEncryption: null,
    });
  }

  return payload;
}
