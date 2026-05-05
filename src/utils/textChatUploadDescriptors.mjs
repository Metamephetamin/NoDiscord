/* global crypto, File */

function buildClientTempId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return `client-temp-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function buildUploadDescriptors({
  messageText = "",
  filesToSend = [],
  outgoingMentions = [],
  replyState = null,
  shouldGroupItems = true,
  sendAsDocuments = false,
} = {}) {
  const normalizedReplyToMessageId = String(replyState?.messageId || "").trim();
  const normalizedReplyToUsername = String(replyState?.username || "").trim();
  const normalizedReplyPreview = String(replyState?.preview || "").trim();

  const normalizedFiles = Array.isArray(filesToSend)
    ? filesToSend.filter((item) => item?.file instanceof File)
    : [];

  const toDescriptorAttachment = (pendingUpload, attachmentIndex = 0) => ({
    id: `${String(pendingUpload?.id || "attachment")}:${attachmentIndex}`,
    uploadId: String(pendingUpload?.id || ""),
    file: pendingUpload.file,
    name: String(pendingUpload?.name || pendingUpload?.file?.name || "attachment").trim() || "attachment",
    size: Number(pendingUpload?.size || pendingUpload?.file?.size || 0) || 0,
    type: String(pendingUpload?.type || pendingUpload?.file?.type || "application/octet-stream").trim(),
    kind: String(pendingUpload?.kind || "").trim(),
    attachmentAsFile: pendingUpload?.kind === "file" || (pendingUpload?.kind === "image" && Boolean(sendAsDocuments)),
  });

  if (!normalizedFiles.length) {
    return [{
      clientTempId: buildClientTempId(),
      message: messageText,
      mentions: outgoingMentions,
      replyToMessageId: normalizedReplyToMessageId,
      replyToUsername: normalizedReplyToUsername,
      replyPreview: normalizedReplyPreview,
      attachments: [],
    }];
  }

  if (shouldGroupItems) {
    return [{
      clientTempId: buildClientTempId(),
      message: messageText,
      mentions: outgoingMentions,
      replyToMessageId: normalizedReplyToMessageId,
      replyToUsername: normalizedReplyToUsername,
      replyPreview: normalizedReplyPreview,
      attachments: normalizedFiles.map((pendingUpload, attachmentIndex) =>
        toDescriptorAttachment(pendingUpload, attachmentIndex)
      ),
    }];
  }

  return normalizedFiles.map((pendingUpload, index) => ({
    clientTempId: buildClientTempId(),
    message: index === 0 ? messageText : "",
    mentions: index === 0 ? outgoingMentions : [],
    replyToMessageId: index === 0 ? normalizedReplyToMessageId : "",
    replyToUsername: index === 0 ? normalizedReplyToUsername : "",
    replyPreview: index === 0 ? normalizedReplyPreview : "",
    attachments: [toDescriptorAttachment(pendingUpload, 0)],
  }));
}
