export const CONVERSATION_PREFIX = "conversation:";
export const CONVERSATION_VOICE_SUFFIX = "::voice:main";

export function buildConversationTargetId(conversationId) {
  const normalizedId = Number(conversationId || 0);
  return normalizedId > 0 ? `${CONVERSATION_PREFIX}${normalizedId}` : "";
}

export function buildConversationChatChannelId(conversationId) {
  return buildConversationTargetId(conversationId);
}

export function buildConversationVoiceChannelId(conversationId) {
  const chatChannelId = buildConversationChatChannelId(conversationId);
  return chatChannelId ? `${chatChannelId}${CONVERSATION_VOICE_SUFFIX}` : "";
}

export function extractConversationIdFromTargetId(value) {
  const normalizedValue = String(value || "").trim();
  if (!normalizedValue.startsWith(CONVERSATION_PREFIX)) {
    return 0;
  }

  const suffix = normalizedValue.slice(CONVERSATION_PREFIX.length);
  if (suffix.includes("::")) {
    return 0;
  }

  const parsedValue = Number.parseInt(suffix, 10);
  return Number.isFinite(parsedValue) && parsedValue > 0 ? parsedValue : 0;
}

export function isConversationTargetId(value) {
  return extractConversationIdFromTargetId(value) > 0;
}

export function extractConversationIdFromVoiceChannelId(value) {
  const normalizedValue = String(value || "").trim();
  if (!normalizedValue.endsWith(CONVERSATION_VOICE_SUFFIX)) {
    return 0;
  }

  return extractConversationIdFromTargetId(normalizedValue.slice(0, -CONVERSATION_VOICE_SUFFIX.length));
}

export function isConversationVoiceChannelId(value) {
  return extractConversationIdFromVoiceChannelId(value) > 0;
}
