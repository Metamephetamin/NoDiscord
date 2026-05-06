export function shouldUseInlineDirectMessageFooter({
  isDirectChat = false,
  messageText = "",
  hasMessagePoll = false,
  hasRenderableAttachments = false,
  hasReactions = false,
  hasForwardedFromUsername = false,
  hasReplyToMessageId = false,
} = {}) {
  const normalizedText = String(messageText || "");
  return Boolean(isDirectChat)
    && Boolean(normalizedText.trim())
    && !hasMessagePoll
    && !hasRenderableAttachments
    && !hasReactions
    && !hasForwardedFromUsername
    && !hasReplyToMessageId
    && !normalizedText.includes("\n");
}

export function shouldReserveVisualAttachmentWidth({
  hasVisualAttachmentGroup = false,
  isMediaOnlyMessage = false,
} = {}) {
  return Boolean(hasVisualAttachmentGroup) && !isMediaOnlyMessage;
}
