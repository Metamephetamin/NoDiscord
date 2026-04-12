import { formatVoiceMessageDuration, normalizeVoiceMessageMetadata, restoreRussianSpeechPunctuation } from "./voiceMessages";
export const MAX_FILE_SIZE_BYTES = 100 * 1024 * 1024;
export const MESSAGE_SEND_COOLDOWN_MS = 1500;
export const COMPAT_FORWARD_DELAY_MS = 1600;
export const VOICE_LOCK_DRAG_THRESHOLD_PX = 34;
export const VOICE_LEVEL_SAMPLE_INTERVAL_MS = 72;
export const VOICE_RECORDING_AUDIO_BITS_PER_SECOND = 192000;
export const VOICE_RECORDING_SAMPLE_RATE = 48000;
export const VOICE_HIGH_PASS_FREQUENCY_HZ = 95;
export const VOICE_PRESENCE_FREQUENCY_HZ = 2800;
export const VOICE_PRESENCE_GAIN_DB = 1.8;
export const VOICE_HIGH_SHELF_FREQUENCY_HZ = 5600;
export const VOICE_HIGH_SHELF_GAIN_DB = 2.4;
export const SPEECH_RECOGNITION_RESTART_DELAY_MS = 240;
export const AUTO_PUNCTUATE_TYPED_MESSAGES = true;
export const ENABLE_VOICE_MESSAGE_BUTTON = true; // flip to false to hide the simple voice-message record button
export const ENABLE_SPEECH_INPUT_BUTTON = true; // flip to false to hide the speech-to-text mic button again
export const COMPOSER_EMOJI_OPTIONS = [
  { key: "grinning", glyph: "😀", label: "Улыбка" },
  { key: "smile", glyph: "😄", label: "Радость" },
  { key: "beaming", glyph: "😁", label: "Счастье" },
  { key: "laugh", glyph: "😂", label: "Смех" },
  { key: "rofl", glyph: "🤣", label: "Ржу" },
  { key: "wink", glyph: "😉", label: "Подмигивание" },
  { key: "heart_eyes", glyph: "😍", label: "Влюблён" },
  { key: "cool", glyph: "😎", label: "Круто" },
  { key: "thinking", glyph: "🤔", label: "Думаю" },
  { key: "pleading", glyph: "🥺", label: "Пожалуйста" },
  { key: "party", glyph: "🥳", label: "Праздник" },
  { key: "fire", glyph: "🔥", label: "Огонь" },
  { key: "cry", glyph: "😭", label: "Плачу" },
  { key: "angry", glyph: "😡", label: "Злость" },
  { key: "heart", glyph: "❤️", label: "Любовь" },
  { key: "thumbs_up", glyph: "👍", label: "Нравится" },
];
export const MESSAGE_REACTION_OPTIONS = [
  { key: "grinning", glyph: "😀", label: "Улыбка" },
  { key: "smile", glyph: "😄", label: "Радость" },
  { key: "beaming", glyph: "😁", label: "Сияю" },
  { key: "laugh", glyph: "😂", label: "Смешно" },
  { key: "rofl", glyph: "🤣", label: "Очень смешно" },
  { key: "heart_eyes", glyph: "😍", label: "Влюблён" },
  { key: "wink", glyph: "😉", label: "Подмигиваю" },
  { key: "cool", glyph: "😎", label: "Круто" },
  { key: "thinking", glyph: "🤔", label: "Думаю" },
  { key: "wow", glyph: "😮", label: "Удивление" },
  { key: "pleading", glyph: "🥺", label: "Пожалуйста" },
  { key: "cry", glyph: "😭", label: "Плачу" },
  { key: "angry", glyph: "😡", label: "Злюсь" },
  { key: "mind_blown", glyph: "🤯", label: "Разрыв" },
  { key: "party", glyph: "🥳", label: "Праздник" },
  { key: "fire", glyph: "🔥", label: "Огонь" },
];
export const PRIMARY_MESSAGE_REACTION_OPTIONS = MESSAGE_REACTION_OPTIONS.slice(0, 8);
export const STICKER_MESSAGE_REACTION_OPTIONS = MESSAGE_REACTION_OPTIONS.slice(8);

export function getMentionQueryContext(text, caretPosition) {
  const normalizedText = String(text || "");
  const caret = Math.max(0, Math.min(Number(caretPosition) || 0, normalizedText.length));
  const beforeCaret = normalizedText.slice(0, caret);
  const triggerIndex = beforeCaret.lastIndexOf("@");
  if (triggerIndex < 0) {
    return null;
  }

  const precedingCharacter = triggerIndex > 0 ? beforeCaret[triggerIndex - 1] : "";
  if (precedingCharacter && /[\p{L}\p{N}_.-]/u.test(precedingCharacter)) {
    return null;
  }

  const betweenTriggerAndCaret = normalizedText.slice(triggerIndex + 1, caret);
  if (/\s/.test(betweenTriggerAndCaret)) {
    return null;
  }

  let tokenEnd = caret;
  while (tokenEnd < normalizedText.length && !/\s/u.test(normalizedText[tokenEnd])) {
    tokenEnd += 1;
  }

  return {
    triggerIndex,
    tokenEnd,
    query: betweenTriggerAndCaret,
  };
}

export const getUserName = (user) => user?.firstName || user?.first_name || user?.name || "User";
export const getScopedChatChannelId = (serverId, channelId) =>
  serverId && channelId ? `server:${serverId}::channel:${channelId}` : "";

export function normalizeAttachmentItems(messageItem) {
  const sourceAttachments = Array.isArray(messageItem?.attachments)
    ? messageItem.attachments
    : Array.isArray(messageItem?.Attachments)
      ? messageItem.Attachments
      : [];

  const normalizedFromArray = sourceAttachments
    .map((attachment, index) => ({
      id: String(attachment?.id || attachment?.Id || `${messageItem?.id || "message"}:${index}`),
      attachmentUrl: String(attachment?.attachmentUrl || attachment?.AttachmentUrl || "").trim(),
      attachmentName: String(attachment?.attachmentName || attachment?.AttachmentName || "").trim(),
      attachmentSize: Number.isFinite(Number(attachment?.attachmentSize))
        ? Number(attachment.attachmentSize)
        : Number.isFinite(Number(attachment?.AttachmentSize))
          ? Number(attachment.AttachmentSize)
          : null,
      attachmentContentType: String(attachment?.attachmentContentType || attachment?.AttachmentContentType || "").trim(),
      attachmentEncryption: attachment?.attachmentEncryption || attachment?.AttachmentEncryption || null,
      voiceMessage: normalizeVoiceMessageMetadata(attachment?.voiceMessage || attachment?.VoiceMessage),
    }))
    .filter((attachment) => attachment.attachmentUrl || attachment.attachmentEncryption || attachment.voiceMessage);

  if (normalizedFromArray.length) {
    return normalizedFromArray;
  }

  const legacyAttachmentUrl = String(messageItem?.attachmentUrl || messageItem?.AttachmentUrl || "").trim();
  const legacyAttachmentEncryption = messageItem?.attachmentEncryption || messageItem?.AttachmentEncryption || null;
  const legacyVoiceMessage = normalizeVoiceMessageMetadata(messageItem?.voiceMessage || messageItem?.VoiceMessage);

  if (!legacyAttachmentUrl && !legacyAttachmentEncryption && !legacyVoiceMessage) {
    return [];
  }

  return [{
    id: String(messageItem?.id || "message"),
    attachmentUrl: legacyAttachmentUrl,
    attachmentName: String(messageItem?.attachmentName || messageItem?.AttachmentName || "").trim(),
    attachmentSize: Number.isFinite(Number(messageItem?.attachmentSize))
      ? Number(messageItem.attachmentSize)
      : Number.isFinite(Number(messageItem?.AttachmentSize))
        ? Number(messageItem.AttachmentSize)
        : null,
    attachmentContentType: String(messageItem?.attachmentContentType || messageItem?.AttachmentContentType || "").trim(),
    attachmentEncryption: legacyAttachmentEncryption,
    voiceMessage: legacyVoiceMessage,
  }];
}

export function getPrimaryAttachment(messageItem) {
  return normalizeAttachmentItems(messageItem)[0] || null;
}

export function getAttachmentKind(messageItem) {
  const primaryAttachment = getPrimaryAttachment(messageItem);
  if (primaryAttachment?.attachmentContentType?.startsWith("image/")) {
    return "image";
  }

  if (primaryAttachment?.attachmentContentType?.startsWith("video/")) {
    return "video";
  }

  if (primaryAttachment?.attachmentUrl) {
    return "file";
  }

  return "";
}

export function getDownloadLabel(kind) {
  if (kind === "image") {
    return "Скачать фото";
  }

  if (kind === "video") {
    return "Скачать видео";
  }

  return "Скачать файл";
}

export function getAttachmentCacheKey(messageId, attachmentIndex = 0) {
  return `${String(messageId || "")}:${Number(attachmentIndex) || 0}`;
}

export function getMessagePreview(messageItem) {
  const text = String(messageItem?.message || "").trim();
  if (text) {
    return text;
  }

  const attachments = normalizeAttachmentItems(messageItem);
  const voiceAttachment = attachments.find((attachment) => attachment.voiceMessage);
  if (voiceAttachment?.voiceMessage) {
    return buildVoiceMessageLabel(voiceAttachment.voiceMessage.durationMs);
  }

  if (attachments.length > 1) {
    return `${attachments.length} вложений`;
  }

  const kind = getAttachmentKind(messageItem);
  if (kind === "image") {
    return "Изображение";
  }

  if (kind === "video") {
    return "Видео";
  }

  return String(messageItem?.attachmentName || "Файл").trim() || "Вложение";
}

export function createPinnedSnapshot(messageItem) {
  return {
    id: messageItem.id,
    username: String(messageItem.username || "User"),
    preview: getMessagePreview(messageItem),
    timestamp: messageItem.timestamp,
  };
}

export function isVoiceMessage(messageItem) {
  return Boolean(messageItem?.voiceMessage) && (Boolean(messageItem?.attachmentUrl) || Boolean(messageItem?.attachmentEncryption));
}

export function buildVoiceMessageLabel(durationMs) {
  return durationMs > 0 ? `Голосовое сообщение • ${formatVoiceMessageDuration(durationMs)}` : "Голосовое сообщение";
}

export function getSpeechRecognitionConstructor() {
  if (typeof window === "undefined") {
    return null;
  }

  return window.SpeechRecognition || window.webkitSpeechRecognition || null;
}

export function shouldAutoPunctuateTypedText(text) {
  const normalizedText = String(text || "").trim();
  if (!AUTO_PUNCTUATE_TYPED_MESSAGES || normalizedText.length < 8) {
    return false;
  }

  if (!/[а-яё]/i.test(normalizedText)) {
    return false;
  }

  if (/https?:\/\/|www\.|```|^\s*[/>]/i.test(normalizedText)) {
    return false;
  }

  const words = normalizedText.split(/\s+/).filter(Boolean);
  return words.length >= 3;
}

export function formatTypedMessageText(text) {
  const normalizedText = String(text || "").trim();
  if (!shouldAutoPunctuateTypedText(normalizedText)) {
    return normalizedText;
  }

  return restoreRussianSpeechPunctuation(normalizedText, { finalize: true });
}

export function getChatErrorMessage(error, fallbackMessage) {
  const rawMessage = String(error?.message || "").trim();
  if (!rawMessage) {
    return fallbackMessage;
  }

  if (rawMessage.includes("Method does not exist")) {
    return "Backend ещё не поддерживает новую возможность. Перезапустите сервер и повторите действие.";
  }

  if (rawMessage.includes("Forbidden")) {
    return "Нет доступа к этому чату.";
  }

  if (rawMessage.includes("Unauthorized")) {
    return "Сессия недействительна. Войдите снова.";
  }

  return rawMessage;
}

export function sleep(delayMs) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, delayMs);
  });
}

export function revokeAttachmentObjectUrl(entry) {
  if (entry?.objectUrl) {
    try {
      URL.revokeObjectURL(entry.objectUrl);
    } catch {
      // ignore object URL cleanup failures
    }
  }
}

export function isMissingHubMethodError(error, methodName) {
  const rawMessage = String(error?.message || error?.toString?.() || "");
  if (!rawMessage) {
    return false;
  }

  return rawMessage.includes("Method does not exist")
    || rawMessage.includes(`'${methodName}'`)
    || rawMessage.includes(`"${methodName}"`);
}

export function normalizeReactions(reactions) {
  return Array.isArray(reactions)
    ? reactions
      .map((reaction) => ({
        key: String(reaction?.key || ""),
        glyph: String(reaction?.glyph || ""),
        count: Number(reaction?.count || 0),
        reactorUserIds: Array.isArray(reaction?.reactorUserIds)
          ? reaction.reactorUserIds.map((item) => String(item || "")).filter(Boolean)
          : [],
        users: Array.isArray(reaction?.users)
          ? reaction.users
            .map((user) => ({
              userId: String(user?.userId || ""),
              displayName: String(user?.displayName || user?.userId || "User"),
              avatarUrl: String(user?.avatarUrl || user?.avatar_url || ""),
            }))
            .filter((user) => user.userId)
          : [],
      }))
      .filter((reaction) => reaction.key && reaction.glyph && reaction.count > 0)
    : [];
}

