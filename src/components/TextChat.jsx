import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import AnimatedAvatar from "./AnimatedAvatar";
import VoiceMessageBubble from "./VoiceMessageBubble";
import chatConnection, { startChatConnection } from "../SignalR/ChatConnect";
import "../css/TextChat.css";
import { API_URL } from "../config/runtime";
import {
  decryptIncomingAttachment,
  decryptIncomingMessageText,
  prepareOutgoingAttachmentEncryption,
  prepareOutgoingTextEncryption,
} from "../e2ee/chatEncryption";
import { authFetch, getStoredToken } from "../utils/auth";
import { copyTextToClipboard } from "../utils/clipboard";
import { clearChatDraft, readChatDraft, writeChatDraft } from "../utils/chatDrafts";
import { isDirectMessageChannelId } from "../utils/directMessageChannels";
import { resolveDirectMessageSoundPath } from "../utils/directMessageSounds";
import {
  extractMentionsFromText,
  getMentionHandleForMember,
  normalizeMentionAlias,
  segmentMessageTextByMentions,
} from "../utils/messageMentions";
import { resolveMediaUrl } from "../utils/media";
import {
  buildVoiceWaveform,
  formatVoiceMessageDuration,
  getSupportedVoiceRecordingMimeType,
  getVoiceRecordingExtension,
  MAX_VOICE_MESSAGE_DURATION_MS,
  normalizeVoiceMessageMetadata,
} from "../utils/voiceMessages";

const MAX_FILE_SIZE_BYTES = 100 * 1024 * 1024;
const MESSAGE_SEND_COOLDOWN_MS = 1500;
const COMPAT_FORWARD_DELAY_MS = 1600;
const VOICE_LOCK_DRAG_THRESHOLD_PX = 34;
const VOICE_LEVEL_SAMPLE_INTERVAL_MS = 72;
const VOICE_RECORDING_AUDIO_BITS_PER_SECOND = 192000;
const VOICE_RECORDING_SAMPLE_RATE = 48000;
const VOICE_HIGH_PASS_FREQUENCY_HZ = 95;
const VOICE_PRESENCE_FREQUENCY_HZ = 2800;
const VOICE_PRESENCE_GAIN_DB = 1.8;
const VOICE_HIGH_SHELF_FREQUENCY_HZ = 5600;
const VOICE_HIGH_SHELF_GAIN_DB = 2.4;
const ENABLE_VOICE_MESSAGE_BUTTON = true; // flip to false to hide the simple voice-message record button
const ENABLE_SPEECH_INPUT_BUTTON = true; // flip to false to hide the speech-to-text mic button again
const COMPOSER_EMOJI_OPTIONS = [
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
const MESSAGE_REACTION_OPTIONS = [
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
const PRIMARY_MESSAGE_REACTION_OPTIONS = MESSAGE_REACTION_OPTIONS.slice(0, 8);
const STICKER_MESSAGE_REACTION_OPTIONS = MESSAGE_REACTION_OPTIONS.slice(8);

function getMentionQueryContext(text, caretPosition) {
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

const getUserName = (user) => user?.firstName || user?.first_name || user?.name || "User";
const getScopedChatChannelId = (serverId, channelId) =>
  serverId && channelId ? `server:${serverId}::channel:${channelId}` : "";

function normalizeAttachmentItems(messageItem) {
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

function getPrimaryAttachment(messageItem) {
  return normalizeAttachmentItems(messageItem)[0] || null;
}

function getAttachmentCacheKey(messageId, attachmentIndex = 0) {
  return `${String(messageId || "")}:${Number(attachmentIndex) || 0}`;
}

function formatFileSize(size) {
  if (!size) {
    return "0 B";
  }

  const units = ["B", "KB", "MB", "GB"];
  let value = size;
  let unitIndex = 0;

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }

  return `${value.toFixed(value >= 10 || unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
}

function isImageAttachment(messageItem) {
  return Boolean(getPrimaryAttachment(messageItem)?.attachmentContentType?.startsWith("image/"));
}

function isVideoAttachment(messageItem) {
  return Boolean(getPrimaryAttachment(messageItem)?.attachmentContentType?.startsWith("video/"));
}

function getAttachmentKind(messageItem) {
  if (isImageAttachment(messageItem)) {
    return "image";
  }

  if (isVideoAttachment(messageItem)) {
    return "video";
  }

  if (getPrimaryAttachment(messageItem)?.attachmentUrl) {
    return "file";
  }

  return "";
}

function getDownloadLabel(kind) {
  if (kind === "image") {
    return "Скачать фото";
  }

  if (kind === "video") {
    return "Скачать видео";
  }

  return "Скачать файл";
}

function getExtensionFromContentType(contentType) {
  const normalized = String(contentType || "").toLowerCase();
  if (!normalized) {
    return "";
  }

  const extensionMap = {
    "image/jpeg": ".jpg",
    "image/jpg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
    "image/gif": ".gif",
    "image/heic": ".heic",
    "video/mp4": ".mp4",
    "video/webm": ".webm",
    "video/quicktime": ".mov",
    "video/x-matroska": ".mkv",
    "application/pdf": ".pdf",
  };

  return extensionMap[normalized] || "";
}

function sanitizeDownloadFileName(name) {
  const normalized = Array.from(String(name || "").trim())
    .map((character) => {
      const code = character.charCodeAt(0);
      return '<>:"/\\|?*'.includes(character) || code < 32 ? "_" : character;
    })
    .join("");
  return normalized;
}

function buildDownloadFileName({ type, url, name, contentType }) {
  const normalizedName = sanitizeDownloadFileName(name);
  if (normalizedName) {
    return normalizedName;
  }

  try {
    const parsed = new URL(String(url || ""), window.location.href);
    const candidate = sanitizeDownloadFileName(decodeURIComponent(parsed.pathname.split("/").pop() || ""));
    if (candidate) {
      return candidate;
    }
  } catch {
    // ignore malformed URLs
  }

  const fallbackBaseName =
    type === "image"
      ? "photo"
      : type === "video"
        ? "video"
        : "file";

  return `${fallbackBaseName}${getExtensionFromContentType(contentType)}`;
}

function shouldUseAuthenticatedDownload(url) {
  try {
    const parsed = new URL(String(url || ""), window.location.href);
    const apiOrigin = new URL(API_URL).origin;
    return parsed.origin === apiOrigin;
  } catch {
    return false;
  }
}

async function saveBlobWithBrowser(blob, fileName) {
  const objectUrl = URL.createObjectURL(blob);

  try {
    const link = document.createElement("a");
    link.href = objectUrl;
    link.download = fileName;
    link.rel = "noopener";
    document.body.append(link);
    link.click();
    link.remove();
  } finally {
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 0);
  }
}

const MAX_PINNED_MESSAGES = 8;
const MAX_FORWARD_BATCH_SIZE = 30;

function getPinnedStorageKey(userId, channelId) {
  const normalizedUserId = String(userId || "").trim();
  const normalizedChannelId = String(channelId || "").trim();
  return normalizedUserId && normalizedChannelId ? `nd:pinned:${normalizedUserId}:${normalizedChannelId}` : "";
}

function readPinnedMessages(storageKey) {
  if (!storageKey) {
    return [];
  }

  try {
    const raw = localStorage.getItem(storageKey);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writePinnedMessages(storageKey, pinnedMessages) {
  if (!storageKey) {
    return;
  }

  try {
    localStorage.setItem(storageKey, JSON.stringify(Array.isArray(pinnedMessages) ? pinnedMessages : []));
  } catch {
    // ignore storage failures
  }
}

function getMessagePreview(messageItem) {
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

function createPinnedSnapshot(messageItem) {
  return {
    id: messageItem.id,
    username: String(messageItem.username || "User"),
    preview: getMessagePreview(messageItem),
    timestamp: messageItem.timestamp,
  };
}

function getTargetDisplayName(target) {
  const displayName = String(target?.name || "").trim();
  if (displayName) {
    return displayName;
  }

  const firstName = String(target?.firstName || target?.first_name || "").trim();
  const lastName = String(target?.lastName || target?.last_name || "").trim();
  return `${firstName} ${lastName}`.trim() || String(target?.email || "Без имени");
}

function formatTime(timestamp) {
  const date = new Date(timestamp);
  const hours = date.getHours().toString().padStart(2, "0");
  const minutes = date.getMinutes().toString().padStart(2, "0");
  return `${hours}:${minutes}`;
}

function formatDayLabel(timestamp) {
  const date = new Date(timestamp);
  const now = new Date();
  const isToday =
    date.getDate() === now.getDate() &&
    date.getMonth() === now.getMonth() &&
    date.getFullYear() === now.getFullYear();
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  const isYesterday =
    date.getDate() === yesterday.getDate() &&
    date.getMonth() === yesterday.getMonth() &&
    date.getFullYear() === yesterday.getFullYear();

  if (isToday) {
    return "Сегодня";
  }

  if (isYesterday) {
    return "Вчера";
  }

  return date.toLocaleDateString("ru-RU", {
    day: "numeric",
    month: "long",
    year: now.getFullYear() === date.getFullYear() ? undefined : "numeric",
  });
}

function formatTimestamp(timestamp) {
  const date = new Date(timestamp);
  const now = new Date();
  const isToday =
    date.getDate() === now.getDate() &&
    date.getMonth() === now.getMonth() &&
    date.getFullYear() === now.getFullYear();
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  const isYesterday =
    date.getDate() === yesterday.getDate() &&
    date.getMonth() === yesterday.getMonth() &&
    date.getFullYear() === yesterday.getFullYear();
  const hours = date.getHours().toString().padStart(2, "0");
  const minutes = date.getMinutes().toString().padStart(2, "0");

  if (isToday) {
    return `Сегодня в ${hours}:${minutes}`;
  }

  if (isYesterday) {
    return `Вчера в ${hours}:${minutes}`;
  }

  return `${date.getDate()}.${(date.getMonth() + 1).toString().padStart(2, "0")}.${date.getFullYear()} в ${hours}:${minutes}`;
}

function isAudioAttachment(messageItem) {
  return Boolean(messageItem?.attachmentContentType?.startsWith("audio/"));
}

function isVoiceMessage(messageItem) {
  return Boolean(messageItem?.voiceMessage) && (Boolean(messageItem?.attachmentUrl) || Boolean(messageItem?.attachmentEncryption));
}

function buildVoiceMessageLabel(durationMs) {
  return durationMs > 0 ? `Голосовое сообщение • ${formatVoiceMessageDuration(durationMs)}` : "Голосовое сообщение";
}

function getSpeechRecognitionConstructor() {
  if (typeof window === "undefined") {
    return null;
  }

  return window.SpeechRecognition || window.webkitSpeechRecognition || null;
}

function getChatErrorMessage(error, fallbackMessage) {
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

function sleep(delayMs) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, delayMs);
  });
}

function revokeAttachmentObjectUrl(entry) {
  if (entry?.objectUrl) {
    try {
      URL.revokeObjectURL(entry.objectUrl);
    } catch {
      // ignore object URL cleanup failures
    }
  }
}

function isExpectedAttachmentKeyError(error) {
  const message = String(error?.message || error || "").toLowerCase();
  return message.includes("daily e2ee key has not been shared")
    || message.includes("not all participants have published e2ee keys yet");
}

function isMissingHubMethodError(error, methodName) {
  const rawMessage = String(error?.message || error?.toString?.() || "");
  if (!rawMessage) {
    return false;
  }

  return rawMessage.includes("Method does not exist")
    || rawMessage.includes(`'${methodName}'`)
    || rawMessage.includes(`"${methodName}"`);
}

function normalizeReactions(reactions) {
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

export default function TextChat({ serverId, channelId, user, resolvedChannelId = "", searchQuery = "", directTargets = [], serverMembers = [] }) {
  const [message, setMessage] = useState("");
  const [messageEditState, setMessageEditState] = useState(null);
  const [messagesByChannel, setMessagesByChannel] = useState({});
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [mediaPreview, setMediaPreview] = useState(null);
  const [uploadingFile, setUploadingFile] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [isChannelReady, setIsChannelReady] = useState(false);
  const [voiceRecordingState, setVoiceRecordingState] = useState("idle");
  const [voiceRecordingDurationMs, setVoiceRecordingDurationMs] = useState(0);
  const [voiceMicLevel, setVoiceMicLevel] = useState(0);
  const [speechRecognitionActive, setSpeechRecognitionActive] = useState(false);
  const [composerEmojiPickerOpen, setComposerEmojiPickerOpen] = useState(false);
  const [mentionSuggestionsOpen, setMentionSuggestionsOpen] = useState(false);
  const [selectedMentionSuggestionIndex, setSelectedMentionSuggestionIndex] = useState(0);
  const [highlightedMessageId, setHighlightedMessageId] = useState("");
  const [floatingDateLabel, setFloatingDateLabel] = useState("");
  const [messageContextMenu, setMessageContextMenu] = useState(null);
  const [reactionStickerPanelOpen, setReactionStickerPanelOpen] = useState(false);
  const [pinnedMessages, setPinnedMessages] = useState([]);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedMessageIds, setSelectedMessageIds] = useState([]);
  const [decryptedAttachmentsByMessageId, setDecryptedAttachmentsByMessageId] = useState({});
  const [preferExplicitSend, setPreferExplicitSend] = useState(() => (
    typeof window !== "undefined"
      ? window.matchMedia("(pointer: coarse), (max-width: 900px)").matches
      : false
  ));
  const [forwardModal, setForwardModal] = useState({
    open: false,
    messageIds: [],
    targetIds: [],
    query: "",
    submitting: false,
  });
  const messagesEndRef = useRef(null);
  const messagesListRef = useRef(null);
  const textareaRef = useRef(null);
  const composerEmojiButtonRef = useRef(null);
  const composerEmojiPickerRef = useRef(null);
  const mentionSuggestionsRef = useRef(null);
  const composerSelectionRef = useRef({ start: 0, end: 0 });
  const contextMenuRef = useRef(null);
  const mediaPreviewVideoRef = useRef(null);
  const joinedChannelRef = useRef("");
  const messageRefs = useRef(new Map());
  const lastSendAtRef = useRef(0);
  const previousChannelIdRef = useRef("");
  const editDraftBackupRef = useRef("");
  const forceScrollToBottomRef = useRef(false);
  const pendingInitialScrollChannelRef = useRef("");
  const hasInitializedVisibleChannelRef = useRef(false);
  const decryptingAttachmentIdsRef = useRef(new Set());
  const decryptedAttachmentsRef = useRef({});
  const voiceRecorderRef = useRef(null);
  const voiceInputStreamRef = useRef(null);
  const voiceStreamRef = useRef(null);
  const voiceRecordingChunksRef = useRef([]);
  const voiceRecordingStartAtRef = useRef(0);
  const voicePointerStateRef = useRef({ pointerId: null, startY: 0, locked: false });
  const voiceAudioContextRef = useRef(null);
  const voiceAnalyserRef = useRef(null);
  const voiceLevelFrameRef = useRef(0);
  const voiceLevelSamplesRef = useRef([]);
  const voiceLastSampleAtRef = useRef(0);
  const speechRecognitionRef = useRef(null);
  const speechFinalTranscriptRef = useRef("");
  const speechDraftBaseRef = useRef("");
  const speechDisplayedTranscriptRef = useRef("");
  const speechPunctuationRequestIdRef = useRef(0);
  const scopedChannelId = resolvedChannelId || getScopedChatChannelId(serverId, channelId);
  const currentUserId = String(user?.id || "");
  const isDirectChat = isDirectMessageChannelId(scopedChannelId);
  const messages = messagesByChannel[scopedChannelId] || [];
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) {
      return undefined;
    }

    const mediaQuery = window.matchMedia("(pointer: coarse), (max-width: 900px)");
    const syncPreference = () => setPreferExplicitSend(mediaQuery.matches);
    syncPreference();

    if (typeof mediaQuery.addEventListener === "function") {
      mediaQuery.addEventListener("change", syncPreference);
      return () => mediaQuery.removeEventListener("change", syncPreference);
    }

    mediaQuery.addListener(syncPreference);
    return () => mediaQuery.removeListener(syncPreference);
  }, []);

  const pinnedStorageKey = useMemo(() => getPinnedStorageKey(currentUserId, scopedChannelId), [currentUserId, scopedChannelId]);
  const selectedMessageIdSet = useMemo(() => new Set(selectedMessageIds.map((id) => String(id))), [selectedMessageIds]);
  const pinnedMessageIdSet = useMemo(() => new Set(pinnedMessages.map((item) => String(item.id))), [pinnedMessages]);
  const normalizedForwardQuery = forwardModal.query.trim().toLowerCase();
  const availableForwardTargets = useMemo(() => {
    if (!normalizedForwardQuery) {
      return directTargets;
    }

    return directTargets.filter((target) => {
      const displayName = getTargetDisplayName(target).toLowerCase();
      const email = String(target?.email || "").toLowerCase();
      return displayName.includes(normalizedForwardQuery) || email.includes(normalizedForwardQuery);
    });
  }, [directTargets, normalizedForwardQuery]);
  const forwardableMessages = useMemo(() => {
    const messageIds = new Set((forwardModal.messageIds || []).map((id) => String(id)));
    return messages
      .filter((messageItem) => messageIds.has(String(messageItem.id)))
      .sort((left, right) => new Date(left.timestamp).getTime() - new Date(right.timestamp).getTime());
  }, [forwardModal.messageIds, messages]);
  const speechRecognitionSupported = useMemo(() => Boolean(getSpeechRecognitionConstructor()), []);
  const mentionQueryContext = useMemo(
    () => (!isDirectChat ? getMentionQueryContext(message, textareaRef.current?.selectionStart ?? composerSelectionRef.current.start) : null),
    [isDirectChat, message]
  );
  const mentionSuggestions = useMemo(() => {
    if (isDirectChat || !mentionQueryContext) {
      return [];
    }

    const normalizedQuery = normalizeMentionAlias(mentionQueryContext.query);
    return (serverMembers || [])
      .map((member) => {
        const handle = getMentionHandleForMember(member);
        const displayName = String(member?.name || "User").trim() || "User";
        const userId = String(member?.userId || "").trim();
        const avatar = String(member?.avatar || member?.avatarUrl || "").trim();
        if (!handle || !userId) {
          return null;
        }

        const normalizedHandle = normalizeMentionAlias(handle);
        const normalizedName = normalizeMentionAlias(displayName);
        const startsWithHandle = normalizedQuery ? normalizedHandle.startsWith(normalizedQuery) : true;
        const startsWithName = normalizedQuery ? normalizedName.startsWith(normalizedQuery) : true;
        const includesHandle = normalizedQuery ? normalizedHandle.includes(normalizedQuery) : true;
        const includesName = normalizedQuery ? normalizedName.includes(normalizedQuery) : true;
        if (normalizedQuery && !startsWithHandle && !startsWithName && !includesHandle && !includesName) {
          return null;
        }

        return {
          userId,
          handle,
          displayName,
          avatar,
          score: startsWithHandle ? 0 : startsWithName ? 1 : includesHandle ? 2 : 3,
        };
      })
      .filter(Boolean)
      .sort((left, right) =>
        left.score - right.score
        || left.displayName.localeCompare(right.displayName, "ru", { sensitivity: "base" })
      )
      .slice(0, 8);
  }, [isDirectChat, mentionQueryContext, serverMembers]);

  const normalizeIncomingMessage = async (messageItem) => {
    const decrypted = await decryptIncomingMessageText(messageItem, user, { channelId: scopedChannelId });
    const attachments = normalizeAttachmentItems(messageItem);
    const primaryAttachment = attachments[0] || null;
    return {
      ...messageItem,
      message: decrypted.text,
      encryption: messageItem?.encryption || messageItem?.Encryption || null,
      attachments,
      attachmentEncryption: primaryAttachment?.attachmentEncryption || messageItem?.attachmentEncryption || messageItem?.AttachmentEncryption || null,
      attachmentUrl: primaryAttachment?.attachmentUrl || messageItem?.attachmentUrl || messageItem?.AttachmentUrl || "",
      attachmentName: primaryAttachment?.attachmentName || messageItem?.attachmentName || messageItem?.AttachmentName || "",
      attachmentSize: primaryAttachment?.attachmentSize ?? messageItem?.attachmentSize ?? messageItem?.AttachmentSize ?? null,
      attachmentContentType: primaryAttachment?.attachmentContentType || messageItem?.attachmentContentType || messageItem?.AttachmentContentType || "",
      voiceMessage: primaryAttachment?.voiceMessage || normalizeVoiceMessageMetadata(messageItem?.voiceMessage || messageItem?.VoiceMessage),
      editedAt: messageItem?.editedAt || messageItem?.EditedAt || null,
      encryptionState: decrypted.encryptionState,
      reactions: normalizeReactions(messageItem?.reactions),
      mentions: Array.isArray(messageItem?.mentions)
        ? messageItem.mentions
          .map((mention) => ({
            userId: String(mention?.userId || ""),
            handle: String(mention?.handle || ""),
            displayName: String(mention?.displayName || mention?.handle || "User"),
          }))
          .filter((mention) => mention.userId && mention.handle)
        : [],
    };
  };

  const isEditableMessage = (messageItem) => {
    if (!messageItem) {
      return false;
    }

    const authorUserId = String(messageItem.authorUserId || "");
    const isOwnMessage =
      authorUserId === currentUserId ||
      (!authorUserId && String(messageItem.username || "").toLowerCase() === getUserName(user).toLowerCase());

    return isOwnMessage && Boolean(String(messageItem.message || "").trim());
  };

  const focusComposerToEnd = () => {
    window.requestAnimationFrame(() => {
      const textarea = textareaRef.current;
      if (!textarea) {
        return;
      }

      textarea.focus();
      const nextLength = textarea.value.length;
      textarea.setSelectionRange(nextLength, nextLength);
      composerSelectionRef.current = { start: nextLength, end: nextLength };
    });
  };

  const syncComposerSelection = () => {
    const textarea = textareaRef.current;
    if (!textarea) {
      return;
    }

    composerSelectionRef.current = {
      start: Number(textarea.selectionStart || 0),
      end: Number(textarea.selectionEnd || 0),
    };
  };

  const insertComposerEmoji = (emojiGlyph) => {
    const textarea = textareaRef.current;
    const currentValue = String(textarea?.value || message || "");
    const selectionStart = Number(textarea?.selectionStart ?? composerSelectionRef.current.start ?? currentValue.length);
    const selectionEnd = Number(textarea?.selectionEnd ?? composerSelectionRef.current.end ?? currentValue.length);
    const nextValue = `${currentValue.slice(0, selectionStart)}${emojiGlyph}${currentValue.slice(selectionEnd)}`;
    const nextCaretPosition = selectionStart + emojiGlyph.length;
    setMessage(nextValue);
    setComposerEmojiPickerOpen(false);
    window.requestAnimationFrame(() => {
      const nextTextarea = textareaRef.current;
      if (!nextTextarea) {
        return;
      }

      nextTextarea.focus();
      nextTextarea.setSelectionRange(nextCaretPosition, nextCaretPosition);
      composerSelectionRef.current = { start: nextCaretPosition, end: nextCaretPosition };
    });
  };

  const applyMentionSuggestion = (suggestion) => {
    if (!suggestion?.handle || !mentionQueryContext) {
      return;
    }

    const currentValue = String(textareaRef.current?.value || message || "");
    const mentionText = `@${suggestion.handle} `;
    const nextValue = `${currentValue.slice(0, mentionQueryContext.triggerIndex)}${mentionText}${currentValue.slice(mentionQueryContext.tokenEnd)}`;
    const nextCaretPosition = mentionQueryContext.triggerIndex + mentionText.length;
    setMessage(nextValue);
    setMentionSuggestionsOpen(false);
    setSelectedMentionSuggestionIndex(0);
    window.requestAnimationFrame(() => {
      const nextTextarea = textareaRef.current;
      if (!nextTextarea) {
        return;
      }

      nextTextarea.focus();
      nextTextarea.setSelectionRange(nextCaretPosition, nextCaretPosition);
      composerSelectionRef.current = { start: nextCaretPosition, end: nextCaretPosition };
    });
  };

  const stopEditingMessage = ({ restoreDraft = true } = {}) => {
    const nextDraft = restoreDraft ? editDraftBackupRef.current : "";
    editDraftBackupRef.current = "";
    setMessageEditState(null);
    setMessage(nextDraft);
  };

  const startEditingMessage = (messageItem) => {
    if (!isEditableMessage(messageItem)) {
      return;
    }

    if (selectedFiles.length) {
      setErrorMessage("Сначала уберите новые вложения из поля ввода, затем откройте редактирование.");
      setMessageContextMenu(null);
      return;
    }

    if (!messageEditState) {
      editDraftBackupRef.current = message;
    }

    setErrorMessage("");
    setMessageEditState({
      messageId: messageItem.id,
      originalText: String(messageItem.message || ""),
    });
    setMessage(String(messageItem.message || ""));
    setMessageContextMenu(null);
    focusComposerToEnd();
  };

  const startEditingLatestOwnMessage = () => {
    const latestOwnMessage = [...messages].reverse().find((messageItem) => isEditableMessage(messageItem));
    if (!latestOwnMessage) {
      return;
    }

    startEditingMessage(latestOwnMessage);
  };

  const renderEditedBadge = (messageItem) => (
    messageItem?.editedAt ? (
      <span className="message-edited-badge" title="Сообщение было отредактировано">
        <span className="message-edited-badge__icon" aria-hidden="true">✎</span>
        <span className="message-edited-badge__label">ред.</span>
      </span>
    ) : null
  );

  const playDirectMessageSound = (type) => {
    if (!isDirectChat) {
      return;
    }

    const soundPath = resolveDirectMessageSoundPath(user, type);
    if (!soundPath) {
      return;
    }

    try {
      const audio = new Audio(soundPath);
      audio.volume = type === "send" ? 0.34 : 0.4;
      audio.preload = "auto";
      audio.play().catch(() => {});
    } catch {
      // ignore DM sound failures
    }
  };

  useEffect(() => {
    if (!composerEmojiPickerOpen) {
      return undefined;
    }

    const handlePointerDownOutside = (event) => {
      const target = event.target;
      if (
        composerEmojiPickerRef.current?.contains(target)
        || composerEmojiButtonRef.current?.contains(target)
      ) {
        return;
      }

      setComposerEmojiPickerOpen(false);
    };

    document.addEventListener("mousedown", handlePointerDownOutside);
    document.addEventListener("touchstart", handlePointerDownOutside);
    return () => {
      document.removeEventListener("mousedown", handlePointerDownOutside);
      document.removeEventListener("touchstart", handlePointerDownOutside);
    };
  }, [composerEmojiPickerOpen]);

  useEffect(() => {
    if (!mentionSuggestionsOpen) {
      return undefined;
    }

    const handlePointerDownOutside = (event) => {
      const target = event.target;
      if (mentionSuggestionsRef.current?.contains(target) || textareaRef.current?.contains(target)) {
        return;
      }

      setMentionSuggestionsOpen(false);
    };

    document.addEventListener("mousedown", handlePointerDownOutside);
    document.addEventListener("touchstart", handlePointerDownOutside);
    return () => {
      document.removeEventListener("mousedown", handlePointerDownOutside);
      document.removeEventListener("touchstart", handlePointerDownOutside);
    };
  }, [mentionSuggestionsOpen]);

  useEffect(() => {
    if (!mentionSuggestions.length || !mentionQueryContext) {
      setMentionSuggestionsOpen(false);
      setSelectedMentionSuggestionIndex(0);
      return;
    }

    setMentionSuggestionsOpen(true);
    setSelectedMentionSuggestionIndex((previous) => Math.min(previous, mentionSuggestions.length - 1));
  }, [mentionQueryContext, mentionSuggestions]);

  useEffect(() => {
    setComposerEmojiPickerOpen(false);
    setMentionSuggestionsOpen(false);
    setSelectedMentionSuggestionIndex(0);
  }, [scopedChannelId]);

  useEffect(() => {
    decryptedAttachmentsRef.current = decryptedAttachmentsByMessageId;
  }, [decryptedAttachmentsByMessageId]);

  const stopVoiceLevelLoop = () => {
    if (voiceLevelFrameRef.current) {
      cancelAnimationFrame(voiceLevelFrameRef.current);
      voiceLevelFrameRef.current = 0;
    }
  };

  const cleanupVoiceRecordingResources = () => {
    stopVoiceLevelLoop();
    voiceAnalyserRef.current = null;
    setVoiceMicLevel(0);

    if (voiceAudioContextRef.current) {
      voiceAudioContextRef.current.close().catch(() => {});
      voiceAudioContextRef.current = null;
    }

    const processedStream = voiceStreamRef.current;
    const inputStream = voiceInputStreamRef.current;

    if (processedStream) {
      processedStream.getTracks().forEach((track) => track.stop());
      voiceStreamRef.current = null;
    }

    if (inputStream && inputStream !== processedStream) {
      inputStream.getTracks().forEach((track) => track.stop());
    }
    voiceInputStreamRef.current = null;

    voiceRecorderRef.current = null;
    voiceRecordingChunksRef.current = [];
    voiceLevelSamplesRef.current = [];
    voiceLastSampleAtRef.current = 0;
    voicePointerStateRef.current = { pointerId: null, startY: 0, locked: false };
  };

  const stopSpeechRecognition = (shouldFinalize = true) => {
    const recognition = speechRecognitionRef.current;
    if (!recognition) {
      setSpeechRecognitionActive(false);
      return;
    }

    recognition.__shouldFinalize = shouldFinalize;
    try {
      recognition.stop();
    } catch {
      setSpeechRecognitionActive(false);
      speechRecognitionRef.current = null;
    }
  };

  const composeSpeechDraftMessage = (baseText, transcriptText) => {
    const normalizedBase = String(baseText || "").trim();
    const normalizedTranscript = String(transcriptText || "").trim();
    return [normalizedBase, normalizedTranscript].filter(Boolean).join(normalizedBase ? " " : "");
  };

  const punctuateSpeechTranscriptOnServer = async (rawTranscript) => {
    const normalizedTranscript = String(rawTranscript || "").trim();
    if (!normalizedTranscript) {
      return "";
    }

    const response = await authFetch(`${API_URL}/api/speech/punctuate`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ text: normalizedTranscript }),
    });

    if (!response.ok) {
      if (response.status === 413) {
        throw new Error("Файл слишком большой для загрузки на сервер. Уменьшите размер вложения.");
      }
      throw new Error("Не удалось проставить пунктуацию на сервере.");
    }

    const payload = await response.json().catch(() => ({}));
    return String(payload?.text || normalizedTranscript).trim();
  };

  const sampleVoiceLevel = () => {
    const analyser = voiceAnalyserRef.current;
    if (!analyser) {
      setVoiceMicLevel(0);
      return;
    }

    const data = new Uint8Array(analyser.fftSize);
    analyser.getByteTimeDomainData(data);
    let sum = 0;
    for (let index = 0; index < data.length; index += 1) {
      const normalized = (data[index] - 128) / 128;
      sum += normalized * normalized;
    }

    const rms = Math.sqrt(sum / data.length);
    const normalizedLevel = Math.max(0, Math.min(1, rms * 3.6));
    setVoiceMicLevel(normalizedLevel);

    const now = performance.now();
    if (now - voiceLastSampleAtRef.current >= VOICE_LEVEL_SAMPLE_INTERVAL_MS) {
      voiceLevelSamplesRef.current.push(normalizedLevel);
      voiceLastSampleAtRef.current = now;
    }

    voiceLevelFrameRef.current = requestAnimationFrame(sampleVoiceLevel);
  };

  const startMicrophoneAnalysis = async (stream) => {
    if (typeof window === "undefined" || !window.AudioContext) {
      return stream;
    }

    const audioContext = new window.AudioContext({
      latencyHint: "interactive",
      sampleRate: VOICE_RECORDING_SAMPLE_RATE,
    });

    if (audioContext.state === "suspended") {
      await audioContext.resume().catch(() => {});
    }

    const source = audioContext.createMediaStreamSource(stream);
    const analyser = audioContext.createAnalyser();
    analyser.fftSize = 256;
    analyser.smoothingTimeConstant = 0.84;

    const highPassFilter = audioContext.createBiquadFilter();
    highPassFilter.type = "highpass";
    highPassFilter.frequency.value = VOICE_HIGH_PASS_FREQUENCY_HZ;
    highPassFilter.Q.value = 0.82;

    const presenceFilter = audioContext.createBiquadFilter();
    presenceFilter.type = "peaking";
    presenceFilter.frequency.value = VOICE_PRESENCE_FREQUENCY_HZ;
    presenceFilter.Q.value = 0.88;
    presenceFilter.gain.value = VOICE_PRESENCE_GAIN_DB;

    const highShelfFilter = audioContext.createBiquadFilter();
    highShelfFilter.type = "highshelf";
    highShelfFilter.frequency.value = VOICE_HIGH_SHELF_FREQUENCY_HZ;
    highShelfFilter.gain.value = VOICE_HIGH_SHELF_GAIN_DB;

    const compressor = audioContext.createDynamicsCompressor();
    compressor.threshold.value = -20;
    compressor.knee.value = 12;
    compressor.ratio.value = 2.4;
    compressor.attack.value = 0.003;
    compressor.release.value = 0.18;

    const destination = audioContext.createMediaStreamDestination();

    source.connect(highPassFilter);
    highPassFilter.connect(presenceFilter);
    presenceFilter.connect(highShelfFilter);
    highShelfFilter.connect(compressor);
    compressor.connect(analyser);
    compressor.connect(destination);

    voiceAudioContextRef.current = audioContext;
    voiceAnalyserRef.current = analyser;
    voiceLastSampleAtRef.current = performance.now();
    stopVoiceLevelLoop();
    voiceLevelFrameRef.current = requestAnimationFrame(sampleVoiceLevel);

    return destination.stream;
  };

  const sendVoiceRecordingFile = async (voiceFile, durationMs, waveformSamples) => {
    const avatar = user?.avatarUrl || user?.avatar || "";
    const encryptedAttachment = await prepareOutgoingAttachmentEncryption({
      channelId: scopedChannelId,
      user,
      file: voiceFile,
    });
    const uploaded = await uploadAttachment({
      blob: encryptedAttachment.uploadBlob,
      fileName: encryptedAttachment.uploadFileName || voiceFile.name,
    });

    await sendMessagesCompat(scopedChannelId, avatar, [
      {
        message: "",
        mentions: [],
        attachments: [
          {
            attachmentUrl: uploaded?.fileUrl || "",
            attachmentName: uploaded?.fileName || voiceFile.name,
            attachmentSize: uploaded?.size || voiceFile.size || null,
            attachmentContentType: uploaded?.contentType || voiceFile.type || "application/octet-stream",
            attachmentEncryption: encryptedAttachment.attachmentEncryption || null,
            voiceMessage: {
              durationMs,
              mimeType: voiceFile.type || "audio/webm",
              fileName: voiceFile.name || "voice-message.webm",
              waveform: buildVoiceWaveform(waveformSamples),
            },
          },
        ],
        attachmentUrl: uploaded?.fileUrl || "",
        attachmentName: uploaded?.fileName || voiceFile.name,
        attachmentSize: uploaded?.size || voiceFile.size || null,
        attachmentContentType: uploaded?.contentType || voiceFile.type || "application/octet-stream",
        attachmentEncryption: encryptedAttachment.attachmentEncryption || null,
        voiceMessage: {
          durationMs,
          mimeType: voiceFile.type || "audio/webm",
          fileName: voiceFile.name || "voice-message.webm",
          waveform: buildVoiceWaveform(waveformSamples),
        },
      },
    ]);
  };

  const finalizeVoiceRecording = (shouldSend) =>
    new Promise((resolve, reject) => {
      const recorder = voiceRecorderRef.current;
      if (!recorder) {
        cleanupVoiceRecordingResources();
        setVoiceRecordingState("idle");
        setVoiceRecordingDurationMs(0);
        resolve();
        return;
      }

      const finalize = async () => {
        const mimeType = recorder.mimeType || getSupportedVoiceRecordingMimeType() || "audio/webm";
        const blob = new Blob(voiceRecordingChunksRef.current, { type: mimeType });
        const durationMs = Math.max(0, Date.now() - voiceRecordingStartAtRef.current);
        const waveformSamples = [...voiceLevelSamplesRef.current];

        cleanupVoiceRecordingResources();

        if (!shouldSend || blob.size === 0) {
          setVoiceRecordingState("idle");
          setVoiceRecordingDurationMs(0);
          resolve();
          return;
        }

        try {
          setVoiceRecordingState("sending");
          setUploadingFile(true);

          const extension = getVoiceRecordingExtension(mimeType);
          const voiceFile = new File([blob], `voice-message-${Date.now()}.${extension}`, {
            type: mimeType,
            lastModified: Date.now(),
          });

          await ensureChannelJoined();
          await sendVoiceRecordingFile(voiceFile, durationMs, waveformSamples);
          forceScrollToBottomRef.current = true;
          lastSendAtRef.current = Date.now();
          setIsChannelReady(true);
          if (isDirectChat) {
            playDirectMessageSound("send");
          }
          setVoiceRecordingState("idle");
          setVoiceRecordingDurationMs(0);
          resolve();
        } catch (error) {
          console.error("Voice message send error:", error);
          setVoiceRecordingState("idle");
          setVoiceRecordingDurationMs(0);
          setErrorMessage(getChatErrorMessage(error, "Не удалось отправить голосовое сообщение."));
          reject(error);
        } finally {
          setUploadingFile(false);
        }
      };

      recorder.onstop = () => {
        void finalize();
      };
      recorder.onerror = (event) => {
        cleanupVoiceRecordingResources();
        setVoiceRecordingState("idle");
        setVoiceRecordingDurationMs(0);
        reject(event?.error || new Error("Не удалось записать голосовое сообщение."));
      };

      try {
        recorder.stop();
      } catch (error) {
        cleanupVoiceRecordingResources();
        setVoiceRecordingState("idle");
        setVoiceRecordingDurationMs(0);
        reject(error);
      }
    });

  const startVoiceRecording = async (pointerEvent = null) => {
    if (voiceRecordingState === "locked") {
      await finalizeVoiceRecording(true);
      return;
    }

    if (voiceRecordingState !== "idle" || uploadingFile || !scopedChannelId) {
      return;
    }

    const mimeType = getSupportedVoiceRecordingMimeType();
    if (!mimeType) {
      setErrorMessage("На этом устройстве запись голосовых сообщений недоступна.");
      return;
    }

    if (!navigator.mediaDevices?.getUserMedia) {
      setErrorMessage("Доступ к микрофону недоступен в этом окружении.");
      return;
    }

    try {
      setErrorMessage("");
      const inputStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          channelCount: 1,
          sampleRate: VOICE_RECORDING_SAMPLE_RATE,
        },
      });

      voiceInputStreamRef.current = inputStream;
      voiceRecordingChunksRef.current = [];
      voiceLevelSamplesRef.current = [];
      voicePointerStateRef.current = {
        pointerId: pointerEvent?.pointerId ?? null,
        startY: pointerEvent?.clientY ?? 0,
        locked: false,
      };

      const processedStream = await startMicrophoneAnalysis(inputStream);
      voiceStreamRef.current = processedStream;

      const recorder = new MediaRecorder(processedStream, {
        mimeType,
        audioBitsPerSecond: VOICE_RECORDING_AUDIO_BITS_PER_SECOND,
      });
      recorder.ondataavailable = (event) => {
        if (event.data?.size) {
          voiceRecordingChunksRef.current.push(event.data);
        }
      };

      voiceRecorderRef.current = recorder;
      voiceRecordingStartAtRef.current = Date.now();
      setVoiceRecordingState("holding");
      setVoiceRecordingDurationMs(0);
      recorder.start(220);
    } catch (error) {
      cleanupVoiceRecordingResources();
      setVoiceRecordingState("idle");
      setVoiceRecordingDurationMs(0);
      setErrorMessage(error?.name === "NotAllowedError"
        ? "Доступ к микрофону запрещён."
        : "Не удалось включить микрофон для записи.");
    }
  };

  const startSpeechRecognition = () => {
    const SpeechRecognitionCtor = getSpeechRecognitionConstructor();
    if (!SpeechRecognitionCtor) {
      setErrorMessage("Голосовой ввод текста недоступен в этом окружении.");
      return;
    }

    try {
      setErrorMessage("");
      const recognition = new SpeechRecognitionCtor();
      speechDraftBaseRef.current = message;
      speechFinalTranscriptRef.current = "";
      speechDisplayedTranscriptRef.current = "";
      recognition.lang = "ru-RU";
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.maxAlternatives = 1;
      recognition.__shouldFinalize = true;

      recognition.onresult = (event) => {
        let finalTranscript = speechFinalTranscriptRef.current;
        let interimTranscript = "";

        for (let index = event.resultIndex; index < event.results.length; index += 1) {
          const transcript = String(event.results[index][0]?.transcript || "");
          if (event.results[index].isFinal) {
            finalTranscript = `${finalTranscript} ${transcript}`.trim();
          } else {
            interimTranscript = `${interimTranscript} ${transcript}`.trim();
          }
        }

        speechFinalTranscriptRef.current = finalTranscript;
        const composedTranscript = [finalTranscript, interimTranscript].filter(Boolean).join(" ").trim();
        speechDisplayedTranscriptRef.current = composedTranscript;
        setMessage(composeSpeechDraftMessage(speechDraftBaseRef.current, composedTranscript));
      };

      recognition.onerror = (event) => {
        const errorCode = String(event?.error || "");
        if (errorCode !== "no-speech" && errorCode !== "aborted") {
          setErrorMessage("Не удалось распознать речь. Проверьте доступ к микрофону.");
        }
      };

      recognition.onend = () => {
        const shouldFinalize = recognition.__shouldFinalize !== false;
        setSpeechRecognitionActive(false);
        speechRecognitionRef.current = null;
        speechDisplayedTranscriptRef.current = "";

        if (shouldFinalize) {
          const finalTranscript = String(speechFinalTranscriptRef.current || speechDisplayedTranscriptRef.current || "").trim();
          const draftBase = speechDraftBaseRef.current;
          const rawDraftValue = composeSpeechDraftMessage(draftBase, finalTranscript);
          const requestId = speechPunctuationRequestIdRef.current + 1;
          speechPunctuationRequestIdRef.current = requestId;

          if (finalTranscript) {
            void punctuateSpeechTranscriptOnServer(finalTranscript)
              .then((punctuatedTranscript) => {
                if (speechPunctuationRequestIdRef.current !== requestId) {
                  return;
                }

                const currentValue = String(textareaRef.current?.value || message || "").trim();
                if (currentValue && currentValue !== rawDraftValue) {
                  return;
                }

                const nextMessage = composeSpeechDraftMessage(draftBase, punctuatedTranscript || finalTranscript);
                if (nextMessage) {
                  setMessage(nextMessage);
                }
              })
              .catch((error) => {
                console.error("Speech punctuation error:", error);
                const currentValue = String(textareaRef.current?.value || message || "").trim();
                if (!currentValue || currentValue === rawDraftValue) {
                  setMessage(rawDraftValue);
                }
              });
          }
        }
      };

      speechRecognitionRef.current = recognition;
      setSpeechRecognitionActive(true);
      recognition.start();
    } catch {
      setSpeechRecognitionActive(false);
      speechRecognitionRef.current = null;
      setErrorMessage("Не удалось запустить голосовой ввод текста.");
    }
  };

  useEffect(() => {
    setDecryptedAttachmentsByMessageId((previous) => {
      Object.values(previous || {}).forEach(revokeAttachmentObjectUrl);
      return {};
    });
    decryptingAttachmentIdsRef.current.clear();
  }, [scopedChannelId]);

  useEffect(() => () => {
    Object.values(decryptedAttachmentsRef.current || {}).forEach(revokeAttachmentObjectUrl);
  }, []);

  useEffect(() => {
    if (voiceRecordingState !== "holding" && voiceRecordingState !== "locked") {
      return undefined;
    }

    const intervalId = window.setInterval(() => {
      const nextDurationMs = Math.max(0, Date.now() - voiceRecordingStartAtRef.current);
      setVoiceRecordingDurationMs(nextDurationMs);

      if (nextDurationMs >= MAX_VOICE_MESSAGE_DURATION_MS) {
        void finalizeVoiceRecording(true);
      }
    }, 180);

    return () => window.clearInterval(intervalId);
  }, [voiceRecordingState]);

  useEffect(() => () => {
    cleanupVoiceRecordingResources();
    stopSpeechRecognition(false);
  }, []);

  useEffect(() => {
    if (!messages.length || !user?.id) {
      return undefined;
    }

    let cancelled = false;
    messages.forEach((messageItem) => {
      const attachments = normalizeAttachmentItems(messageItem);
      attachments.forEach((attachmentItem, attachmentIndex) => {
        if (!attachmentItem?.attachmentEncryption || !String(attachmentItem?.attachmentUrl || "").trim()) {
          return;
        }

        const cacheKey = getAttachmentCacheKey(messageItem.id, attachmentIndex);
        if (!cacheKey
          || decryptedAttachmentsByMessageId[cacheKey]
          || decryptingAttachmentIdsRef.current.has(cacheKey)) {
          return;
        }

        decryptingAttachmentIdsRef.current.add(cacheKey);

        void (async () => {
          try {
            const decryptedAttachment = await decryptIncomingAttachment(attachmentItem, user, { channelId: scopedChannelId });
            if (cancelled || !decryptedAttachment) {
              if (decryptedAttachment?.objectUrl) {
                revokeAttachmentObjectUrl(decryptedAttachment);
              }
              return;
            }

            setDecryptedAttachmentsByMessageId((previous) => {
              const existingEntry = previous[cacheKey];
              if (existingEntry) {
                revokeAttachmentObjectUrl(existingEntry);
              }

              return {
                ...previous,
                [cacheKey]: decryptedAttachment,
              };
            });
          } catch (error) {
            if (cancelled) {
              return;
            }

            if (isExpectedAttachmentKeyError(error)) {
              setDecryptedAttachmentsByMessageId((previous) => ({
                ...previous,
                [cacheKey]: {
                  unavailable: true,
                  reason: "missing-shared-key",
                },
              }));
              return;
            }

            console.warn("Failed to decrypt attachment:", error?.message || error);
          } finally {
            decryptingAttachmentIdsRef.current.delete(cacheKey);
          }
        })();
      });
    });

    return () => {
      cancelled = true;
    };
  }, [decryptedAttachmentsByMessageId, messages, scopedChannelId, user]);

  useEffect(() => {
    const updateFloatingDate = () => {
      const list = messagesListRef.current;
      if (!list || messages.length === 0) {
        setFloatingDateLabel("");
        return;
      }

      const scrollTop = list.scrollTop;
      const probeLine = scrollTop + 24;
      let nextVisibleMessage = messages[0];

      for (const messageItem of messages) {
        const node = messageRefs.current.get(messageItem.id);
        if (!node) {
          continue;
        }

        const nodeBottom = node.offsetTop + node.offsetHeight;
        if (nodeBottom >= probeLine) {
          nextVisibleMessage = messageItem;
          break;
        }
      }

      const nextLabel = nextVisibleMessage?.timestamp ? formatDayLabel(nextVisibleMessage.timestamp) : "";
      setFloatingDateLabel((current) => (current === nextLabel ? current : nextLabel));
    };

    updateFloatingDate();
    const list = messagesListRef.current;
    if (!list) {
      return undefined;
    }

    list.addEventListener("scroll", updateFloatingDate, { passive: true });
    window.addEventListener("resize", updateFloatingDate);

    return () => {
      list.removeEventListener("scroll", updateFloatingDate);
      window.removeEventListener("resize", updateFloatingDate);
    };
  }, [messages, scopedChannelId]);

  useLayoutEffect(() => {
    const list = messagesListRef.current;
    const end = messagesEndRef.current;
    if (!list || !end) {
      previousChannelIdRef.current = scopedChannelId;
      return;
    }

    const channelChanged = previousChannelIdRef.current !== scopedChannelId;
    previousChannelIdRef.current = scopedChannelId;

    if (channelChanged) {
      forceScrollToBottomRef.current = false;
      pendingInitialScrollChannelRef.current = scopedChannelId;
      list.scrollTop = list.scrollHeight;
      return;
    }

    if (pendingInitialScrollChannelRef.current === scopedChannelId) {
      if (messages.length === 0) {
        return;
      }

      pendingInitialScrollChannelRef.current = "";
      list.scrollTop = list.scrollHeight;
      return;
    }

    if (forceScrollToBottomRef.current) {
      forceScrollToBottomRef.current = false;
      end.scrollIntoView({ behavior: "smooth", block: "end" });
      return;
    }

    const distanceFromBottom = list.scrollHeight - list.scrollTop - list.clientHeight;
    const shouldStickToBottom = distanceFromBottom < 96;
    if (!shouldStickToBottom) {
      return;
    }

    end.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages.length, scopedChannelId]);

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) {
      return;
    }

    const minHeight = 48;
    const maxHeight = 140;

    textarea.style.height = `${minHeight}px`;
    const nextHeight = Math.min(Math.max(textarea.scrollHeight, minHeight), maxHeight);
    textarea.style.height = `${nextHeight}px`;
    textarea.style.overflowY = textarea.scrollHeight > maxHeight ? "auto" : "hidden";
  }, [message]);

  useEffect(() => {
    if (!mediaPreview) {
      return undefined;
    }

    const handleEscape = (event) => {
      if (event.key === "Escape") {
        setMediaPreview(null);
      }
    };

    window.addEventListener("keydown", handleEscape);
    return () => {
      window.removeEventListener("keydown", handleEscape);
    };
  }, [mediaPreview]);

  useEffect(() => {
    if (!forwardModal.open) {
      return undefined;
    }

    const handleEscape = (event) => {
      if (event.key === "Escape") {
        closeForwardModal();
      }
    };

    window.addEventListener("keydown", handleEscape);
    return () => {
      window.removeEventListener("keydown", handleEscape);
    };
  }, [forwardModal.open]);

  useEffect(() => {
    if (!messageContextMenu) {
      setReactionStickerPanelOpen(false);
      return undefined;
    }

    const handlePointerDown = (event) => {
      if (contextMenuRef.current?.contains(event.target)) {
        return;
      }

      setMessageContextMenu(null);
    };

    const handleEscape = (event) => {
      if (event.key === "Escape") {
        setMessageContextMenu(null);
        if (speechRecognitionActive) {
          stopSpeechRecognition(false);
        }
        if (voiceRecordingState === "holding" || voiceRecordingState === "locked") {
          void handleCancelVoiceRecording();
        }
      }
    };

    const handleViewportChange = () => {
      setMessageContextMenu(null);
    };

    window.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("keydown", handleEscape);
    window.addEventListener("resize", handleViewportChange);
    window.addEventListener("scroll", handleViewportChange, true);

    return () => {
      window.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("keydown", handleEscape);
      window.removeEventListener("resize", handleViewportChange);
      window.removeEventListener("scroll", handleViewportChange, true);
    };
  }, [messageContextMenu, speechRecognitionActive, voiceRecordingState]);

  useEffect(() => {
    setPinnedMessages(readPinnedMessages(pinnedStorageKey));
    setSelectionMode(false);
    setSelectedMessageIds([]);
    editDraftBackupRef.current = "";
    setMessageEditState(null);
    setForwardModal({
      open: false,
      messageIds: [],
      targetIds: [],
      query: "",
      submitting: false,
    });
  }, [pinnedStorageKey]);

  useEffect(() => {
    writePinnedMessages(pinnedStorageKey, pinnedMessages);
  }, [pinnedMessages, pinnedStorageKey]);

  useEffect(() => {
    if (!user || !scopedChannelId) {
      editDraftBackupRef.current = "";
      setMessageEditState(null);
      setMessage("");
      return;
    }

    editDraftBackupRef.current = "";
    setMessageEditState(null);
    setMessage(readChatDraft(user, scopedChannelId));
  }, [scopedChannelId, user]);

  useEffect(() => {
    if (!user || !scopedChannelId || messageEditState) {
      return;
    }

    writeChatDraft(user, scopedChannelId, message);
  }, [message, messageEditState, scopedChannelId, user]);

  const ensureChannelJoined = async () => {
    const connection = await startChatConnection();
    if (!connection) {
      throw new Error("Сессия недействительна. Войдите снова.");
    }

    if (joinedChannelRef.current === scopedChannelId) {
      return;
    }

    const initialMessages = await chatConnection.invoke("JoinChannel", scopedChannelId);
    const normalizedInitialMessages = Array.isArray(initialMessages)
      ? await Promise.all(initialMessages.map((messageItem) => normalizeIncomingMessage(messageItem)))
      : [];
    joinedChannelRef.current = scopedChannelId;
    setIsChannelReady(true);
    hasInitializedVisibleChannelRef.current = true;
    setMessagesByChannel((previous) => ({
      ...previous,
      [scopedChannelId]: normalizedInitialMessages,
    }));

    if (isDirectChat) {
      chatConnection.invoke("MarkChannelRead", scopedChannelId).catch(() => {});
    }
  };

  useEffect(() => {
    if (!scopedChannelId) {
      setIsChannelReady(false);
      joinedChannelRef.current = "";
      hasInitializedVisibleChannelRef.current = false;
      return undefined;
    }

    let isMounted = true;

    const handleReceiveMessage = (nextMessage) => {
      if (String(nextMessage?.channelId || scopedChannelId) !== String(scopedChannelId)) {
        return;
      }

      void (async () => {
        const normalizedMessage = await normalizeIncomingMessage(nextMessage);

        setMessagesByChannel((previous) => {
          const channelMessages = previous[scopedChannelId] || [];
          return { ...previous, [scopedChannelId]: [...channelMessages, normalizedMessage] };
        });

        if (isDirectChat && String(nextMessage?.authorUserId || "") !== String(currentUserId)) {
          playDirectMessageSound("receive");
          chatConnection.invoke("MarkChannelRead", scopedChannelId).catch(() => {});
        }
      })();
    };

    const handleMessageDeleted = (deletedId) => {
      if (String(messageEditState?.messageId || "") === String(deletedId)) {
        stopEditingMessage();
      }

      setMessageContextMenu((current) => (String(current?.messageId || "") === String(deletedId) ? null : current));
      setPinnedMessages((previous) => previous.filter((item) => String(item.id) !== String(deletedId)));
      setSelectedMessageIds((previous) => previous.filter((itemId) => String(itemId) !== String(deletedId)));
      setForwardModal((previous) =>
        previous.open
          ? {
              ...previous,
              messageIds: previous.messageIds.filter((itemId) => String(itemId) !== String(deletedId)),
            }
          : previous
      );
      setMessagesByChannel((previous) => {
        const channelMessages = previous[scopedChannelId] || [];
        return {
          ...previous,
          [scopedChannelId]: channelMessages.filter((item) => item.id !== deletedId),
        };
      });
    };

    const handleMessageUpdated = (updatedMessage) => {
      if (String(updatedMessage?.channelId || scopedChannelId) !== String(scopedChannelId)) {
        return;
      }

      void (async () => {
        const normalizedMessage = await normalizeIncomingMessage(updatedMessage);

        setMessageContextMenu((current) =>
          String(current?.messageId || "") === String(normalizedMessage.id)
            ? {
                ...current,
                text: String(normalizedMessage.message || current?.text || "").trim(),
                hasText: Boolean(String(normalizedMessage.message || "").trim()),
              }
            : current
        );

        setPinnedMessages((previous) =>
          previous.map((item) => (String(item.id) === String(normalizedMessage.id) ? createPinnedSnapshot(normalizedMessage) : item))
        );

        setMessagesByChannel((previous) => {
          const channelMessages = previous[scopedChannelId] || [];
          return {
            ...previous,
            [scopedChannelId]: channelMessages.map((messageItem) =>
              String(messageItem.id) === String(normalizedMessage.id) ? normalizedMessage : messageItem
            ),
          };
        });
      })();
    };

    const handleMessagesRead = (payload) => {
      if (String(payload?.channelId || "") !== String(scopedChannelId)) {
        return;
      }

      const readMessageIds = new Set((payload?.messageIds || []).map((messageId) => String(messageId)));
      if (readMessageIds.size === 0) {
        return;
      }

      setMessagesByChannel((previous) => {
        const channelMessages = previous[scopedChannelId] || [];
        return {
          ...previous,
          [scopedChannelId]: channelMessages.map((messageItem) =>
            readMessageIds.has(String(messageItem.id))
              ? {
                  ...messageItem,
                  isRead: true,
                  readAt: payload?.readAt || messageItem.readAt || null,
                  readByUserId: payload?.readerUserId || messageItem.readByUserId || null,
                }
              : messageItem
          ),
        };
      });
    };

    const handleMessageReactionsUpdated = (payload) => {
      const messageId = String(payload?.messageId || "");
      if (!messageId) {
        return;
      }

      setMessagesByChannel((previous) => {
        const channelMessages = previous[scopedChannelId] || [];
        return {
          ...previous,
          [scopedChannelId]: channelMessages.map((messageItem) =>
            String(messageItem.id) === messageId
              ? {
                  ...messageItem,
                  reactions: normalizeReactions(payload?.reactions),
                }
              : messageItem
          ),
        };
      });
    };

    const init = async () => {
      try {
        setErrorMessage("");
        setIsChannelReady(false);
        hasInitializedVisibleChannelRef.current = false;

        chatConnection.off("ReceiveMessage", handleReceiveMessage);
        chatConnection.off("MessageDeleted", handleMessageDeleted);
        chatConnection.off("MessageUpdated", handleMessageUpdated);
        chatConnection.off("MessagesRead", handleMessagesRead);
        chatConnection.off("MessageReactionsUpdated", handleMessageReactionsUpdated);
        chatConnection.on("ReceiveMessage", handleReceiveMessage);
        chatConnection.on("MessageDeleted", handleMessageDeleted);
        chatConnection.on("MessageUpdated", handleMessageUpdated);
        chatConnection.on("MessagesRead", handleMessagesRead);
        chatConnection.on("MessageReactionsUpdated", handleMessageReactionsUpdated);

        await ensureChannelJoined();
      } catch (error) {
        console.error("SignalR chat init error:", error);
        if (!isMounted) {
          return;
        }

        joinedChannelRef.current = "";
        setIsChannelReady(false);
        setMessagesByChannel((previous) => ({ ...previous, [scopedChannelId]: previous[scopedChannelId] || [] }));
        if (!hasInitializedVisibleChannelRef.current) {
          return;
        }
        setErrorMessage(getChatErrorMessage(error, "Не удалось подключить чат."));
      }
    };

    init();

    return () => {
      isMounted = false;

      if (joinedChannelRef.current === scopedChannelId) {
        chatConnection.invoke("LeaveChannel", scopedChannelId).catch(() => {});
        joinedChannelRef.current = "";
      }

      chatConnection.off("ReceiveMessage", handleReceiveMessage);
      chatConnection.off("MessageDeleted", handleMessageDeleted);
      chatConnection.off("MessageUpdated", handleMessageUpdated);
      chatConnection.off("MessagesRead", handleMessagesRead);
      chatConnection.off("MessageReactionsUpdated", handleMessageReactionsUpdated);
    };
  }, [currentUserId, isDirectChat, messageEditState?.messageId, scopedChannelId]);

  useEffect(() => {
    const handleProfileUpdated = (payload) => {
      const updatedUserId = String(payload?.userId || "");
      if (!updatedUserId) {
        return;
      }

      const nextFirstName = String(payload?.first_name || payload?.firstName || "").trim();
      const nextLastName = String(payload?.last_name || payload?.lastName || "").trim();
      const nextAvatar = String(payload?.avatar_url || payload?.avatarUrl || payload?.avatar || "").trim();
      const nextUsername = `${nextFirstName} ${nextLastName}`.trim();

      setMessagesByChannel((previous) =>
        Object.fromEntries(
          Object.entries(previous || {}).map(([channelKey, channelMessages]) => [
            channelKey,
            Array.isArray(channelMessages)
              ? channelMessages.map((messageItem) =>
                  String(messageItem?.authorUserId || "") === updatedUserId
                    ? {
                        ...messageItem,
                        username: nextUsername || messageItem.username || "User",
                        photoUrl: nextAvatar || messageItem.photoUrl || "",
                      }
                    : messageItem
                )
              : channelMessages,
          ])
        )
      );
    };

    chatConnection.on("ProfileUpdated", handleProfileUpdated);

    return () => {
      chatConnection.off("ProfileUpdated", handleProfileUpdated);
    };
  }, []);

  const uploadAttachment = async ({ blob, fileName = "" }) => {
    const uploadFile = blob instanceof File
      ? blob
      : new File([blob], fileName || "attachment.bin", { type: blob?.type || "application/octet-stream" });
    const formData = new FormData();
    formData.append("file", uploadFile);

    const response = await authFetch(`${API_URL}/api/chat-files/upload`, {
      method: "POST",
      body: formData,
    });

    const rawText = await response.text();
    let data = null;

    if (rawText) {
      try {
        data = JSON.parse(rawText);
      } catch {
        data = { message: rawText };
      }
    }

    if (!response.ok) {
      throw new Error(data?.message || "Не удалось загрузить файл");
    }

    return data;
  };

  const send = async () => {
    const messageText = message.trim();
    const filesToSend = selectedFiles;

    if (messageEditState && filesToSend.length) {
      setErrorMessage("Во время редактирования нельзя добавлять новые вложения.");
      return;
    }

    if ((!messageText && !filesToSend.length) || !scopedChannelId || uploadingFile || voiceRecordingState === "holding" || voiceRecordingState === "locked" || voiceRecordingState === "sending") {
      return;
    }

    const now = Date.now();
    const cooldownLeft = MESSAGE_SEND_COOLDOWN_MS - (now - lastSendAtRef.current);
    if (!messageEditState && cooldownLeft > 0) {
      setErrorMessage("Подождите 1.5 секунды перед повторной отправкой.");
      return;
    }

    const avatar = user?.avatarUrl || user?.avatar || "";
    const outgoingMentions = !isDirectChat ? extractMentionsFromText(messageText, serverMembers) : [];

    try {
      setErrorMessage("");
      await ensureChannelJoined();

      if (messageEditState?.messageId) {
        const preparedTextPayload = await prepareOutgoingTextEncryption({
          channelId: scopedChannelId,
          user,
          text: messageText,
        });

        if (preparedTextPayload.reason) {
          console.warn("E2EE fallback:", preparedTextPayload.reason);
        }

        await chatConnection.invoke(
          "EditMessage",
          messageEditState.messageId,
          preparedTextPayload.message,
          preparedTextPayload.encryption || null,
          outgoingMentions
        );

        const preservedDraft = editDraftBackupRef.current;
        editDraftBackupRef.current = "";
        setMessageEditState(null);
        setMessage(preservedDraft);
        if (!preservedDraft) {
          clearChatDraft(user, scopedChannelId);
        }
        setIsChannelReady(true);
        focusComposerToEnd();
        return;
      }

      let attachments = [];
      if (filesToSend.length) {
        setUploadingFile(true);
        for (let index = 0; index < filesToSend.length; index += 1) {
          const fileItem = filesToSend[index];
          const encryptedAttachment = await prepareOutgoingAttachmentEncryption({
            channelId: scopedChannelId,
            user,
            file: fileItem,
          });
          const uploaded = await uploadAttachment({
            blob: encryptedAttachment.uploadBlob,
            fileName: encryptedAttachment.uploadFileName || fileItem.name || `attachment-${Date.now()}-${index}`,
          });
          attachments.push({
            fileUrl: uploaded?.fileUrl || null,
            fileName: uploaded?.fileName || fileItem.name || "attachment",
            size: uploaded?.size || encryptedAttachment.uploadBlob.size || null,
            contentType: uploaded?.contentType || fileItem.type || "application/octet-stream",
            attachmentEncryption: encryptedAttachment.attachmentEncryption,
          });
        }
      }

      const payload = [{
        message: messageText,
        mentions: outgoingMentions,
        attachments: attachments.map((attachment) => ({
          attachmentUrl: attachment.fileUrl || "",
          attachmentName: attachment.fileName || "",
          attachmentSize: attachment.size || null,
          attachmentContentType: attachment.contentType || "",
          attachmentEncryption: attachment.attachmentEncryption || null,
          voiceMessage: null,
        })),
        attachmentUrl: attachments[0]?.fileUrl || "",
        attachmentName: attachments[0]?.fileName || "",
        attachmentSize: attachments[0]?.size || null,
        attachmentContentType: attachments[0]?.contentType || "",
        attachmentEncryption: attachments[0]?.attachmentEncryption || null,
        voiceMessage: null,
      }];

      await sendMessagesCompat(scopedChannelId, avatar, payload);

      forceScrollToBottomRef.current = true;
      lastSendAtRef.current = Date.now();
      setMessage("");
      clearChatDraft(user, scopedChannelId);
      setSelectedFiles([]);
      setIsChannelReady(true);
      if (isDirectChat) {
        playDirectMessageSound("send");
      }
    } catch (error) {
      console.error(messageEditState ? "EditMessage error:" : "SendMessage error:", error);
      if (!messageEditState) {
        joinedChannelRef.current = "";
        setIsChannelReady(false);
      }
      if (messageEditState) {
        setErrorMessage(getChatErrorMessage(error, "Не удалось сохранить изменения сообщения."));
      }
      setErrorMessage(getChatErrorMessage(error, "Не удалось отправить сообщение."));
      if (messageEditState) {
        setErrorMessage(getChatErrorMessage(error, "Не удалось сохранить изменения сообщения."));
      }
    } finally {
      setUploadingFile(false);
    }
  };

  const handleFileChange = (event) => {
    const files = Array.from(event.target.files || []);
    event.target.value = "";

    if (!files.length) {
      return;
    }

    const validFiles = [];
    let hasOversizedFile = false;

    for (const file of files) {
      if (file.size > MAX_FILE_SIZE_BYTES) {
        hasOversizedFile = true;
        continue;
      }

      validFiles.push(file);
    }

    if (!validFiles.length) {
      setErrorMessage("Размер файла не должен быть больше 100 МБ.");
      return;
    }

    if (hasOversizedFile) {
      setErrorMessage("Некоторые файлы пропущены: размер файла не должен быть больше 100 МБ.");
    } else {
      setErrorMessage("");
    }

    setSelectedFiles((previous) => [...previous, ...validFiles]);
  };

  const handleVoiceRecordPointerDown = async (event) => {
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget?.setPointerCapture?.(event.pointerId);

    if (speechRecognitionActive) {
      stopSpeechRecognition(true);
    }

    if (voiceRecordingState === "locked") {
      await finalizeVoiceRecording(true);
      return;
    }

    await startVoiceRecording(event);
  };

  const handleVoiceRecordPointerMove = (event) => {
    if (voiceRecordingState !== "holding") {
      return;
    }

    const pointerState = voicePointerStateRef.current;
    if (pointerState.locked || pointerState.pointerId !== event.pointerId) {
      return;
    }

    if (pointerState.startY - event.clientY >= VOICE_LOCK_DRAG_THRESHOLD_PX) {
      voicePointerStateRef.current = {
        ...pointerState,
        locked: true,
      };
      setVoiceRecordingState("locked");
    }
  };

  const handleVoiceRecordPointerUp = async (event) => {
    const pointerState = voicePointerStateRef.current;
    if (voiceRecordingState === "holding" && pointerState.pointerId === event.pointerId && !pointerState.locked) {
      await finalizeVoiceRecording(true);
    }
  };

  const handleVoiceRecordPointerCancel = async (event) => {
    const pointerState = voicePointerStateRef.current;
    if (voiceRecordingState === "holding" && pointerState.pointerId === event.pointerId && !pointerState.locked) {
      await finalizeVoiceRecording(false);
    }
  };

  const handleCancelVoiceRecording = async () => {
    if (voiceRecordingState === "holding" || voiceRecordingState === "locked") {
      await finalizeVoiceRecording(false);
    }
  };

  const handleSpeechRecognitionToggle = () => {
    if (voiceRecordingState === "holding" || voiceRecordingState === "locked" || voiceRecordingState === "sending") {
      return;
    }

    if (speechRecognitionActive) {
      stopSpeechRecognition(true);
      return;
    }

    startSpeechRecognition();
  };

  const buildForwardPayloadForTargetChannel = async (targetChannelId, sourceMessages) => {
    const payload = [];

    for (const messageItem of sourceMessages.slice(0, MAX_FORWARD_BATCH_SIZE)) {
      const sourceAttachments = normalizeAttachmentItems(messageItem);
      const forwardedAttachments = [];

      for (let attachmentIndex = 0; attachmentIndex < sourceAttachments.length; attachmentIndex += 1) {
        const attachmentItem = sourceAttachments[attachmentIndex];
        if (!attachmentItem.attachmentUrl) {
          continue;
        }

        let forwardFile = null;

        if (attachmentItem.attachmentEncryption) {
          const cacheKey = getAttachmentCacheKey(messageItem.id, attachmentIndex);
          const cachedAttachment = decryptedAttachmentsByMessageId[cacheKey];
          const decryptedAttachment = cachedAttachment || await decryptIncomingAttachment(attachmentItem, user, { channelId: scopedChannelId });
          if (!decryptedAttachment?.blob) {
            throw new Error("Не удалось подготовить вложение для пересылки.");
          }

          forwardFile = new File([decryptedAttachment.blob], decryptedAttachment.name || "file", {
            type: decryptedAttachment.contentType || "application/octet-stream",
          });

          if (!cachedAttachment && decryptedAttachment?.objectUrl) {
            revokeAttachmentObjectUrl(decryptedAttachment);
          }
        } else {
          const sourceUrl = resolveMediaUrl(attachmentItem.attachmentUrl, attachmentItem.attachmentUrl);
          const response = shouldUseAuthenticatedDownload(sourceUrl)
            ? await authFetch(sourceUrl)
            : await fetch(sourceUrl);
          if (!response.ok) {
            throw new Error("Не удалось загрузить файл для пересылки.");
          }

          const blob = await response.blob();
          forwardFile = new File([blob], attachmentItem.attachmentName || "file", {
            type: attachmentItem.attachmentContentType || blob.type || "application/octet-stream",
          });
        }

        const encryptedAttachment = await prepareOutgoingAttachmentEncryption({
          channelId: targetChannelId,
          user,
          file: forwardFile,
        });
        const uploaded = await uploadAttachment({
          blob: encryptedAttachment.uploadBlob,
          fileName: encryptedAttachment.uploadFileName
            || forwardFile.name
            || `attachment-forward-${Date.now()}-${messageItem.id}-${attachmentIndex}`,
        });

        forwardedAttachments.push({
          attachmentUrl: uploaded?.fileUrl || "",
          attachmentName: uploaded?.fileName || forwardFile.name || "attachment",
          attachmentSize: uploaded?.size || encryptedAttachment.uploadBlob.size || null,
          attachmentContentType: uploaded?.contentType || forwardFile.type || "application/octet-stream",
          attachmentEncryption: encryptedAttachment.attachmentEncryption,
          voiceMessage: attachmentItem.voiceMessage || null,
        });
      }

      if (!String(messageItem.message || "").trim() && !forwardedAttachments.length) {
        continue;
      }

      payload.push({
        message: String(messageItem.message || ""),
        forwardedFromUserId: String(messageItem.authorUserId || ""),
        forwardedFromUsername: String(messageItem.username || ""),
        voiceMessage: forwardedAttachments[0]?.voiceMessage || messageItem.voiceMessage || null,
        attachments: forwardedAttachments,
        attachmentUrl: forwardedAttachments[0]?.attachmentUrl || "",
        attachmentName: forwardedAttachments[0]?.attachmentName || "",
        attachmentSize: forwardedAttachments[0]?.attachmentSize || null,
        attachmentContentType: forwardedAttachments[0]?.attachmentContentType || "",
        attachmentEncryption: forwardedAttachments[0]?.attachmentEncryption || null,
      });
    }

    return payload;
  };

  const normalizedSearchQuery = searchQuery.trim().toLowerCase();
  const searchResults = useMemo(() => {
    if (normalizedSearchQuery.length < 2) {
      return [];
    }

    return messages
      .filter((messageItem) => {
        const messageText = String(messageItem.message || "").toLowerCase();
        const attachmentName = normalizeAttachmentItems(messageItem)
          .map((attachment) => String(attachment.attachmentName || "").toLowerCase())
          .join(" ");
        return messageText.includes(normalizedSearchQuery) || attachmentName.includes(normalizedSearchQuery);
      })
      .map((messageItem) => ({
        id: messageItem.id,
        username: messageItem.username,
        timestamp: messageItem.timestamp,
        preview: getMessagePreview(messageItem),
      }));
  }, [messages, normalizedSearchQuery]);

  const scrollToMessage = (messageId) => {
    const element = messageRefs.current.get(messageId);
    if (!element) {
      return;
    }

    setHighlightedMessageId(String(messageId));
    element.scrollIntoView({ behavior: "smooth", block: "center" });
    window.setTimeout(() => {
      setHighlightedMessageId((current) => (current === String(messageId) ? "" : current));
    }, 2200);
  };

  const toggleMessageSelection = (messageId) => {
    const normalizedMessageId = String(messageId);
    setSelectedMessageIds((previous) => {
      const exists = previous.some((itemId) => String(itemId) === normalizedMessageId);
      if (exists) {
        return previous.filter((itemId) => String(itemId) !== normalizedMessageId);
      }

      return [...previous, messageId];
    });
  };

  const openSelectionMode = (messageId) => {
    setSelectionMode(true);
    setSelectedMessageIds((previous) => {
      const normalizedMessageId = String(messageId);
      return previous.some((itemId) => String(itemId) === normalizedMessageId) ? previous : [...previous, messageId];
    });
    setMessageContextMenu(null);
  };

  const clearSelectionMode = () => {
    setSelectionMode(false);
    setSelectedMessageIds([]);
  };

  const togglePinnedMessage = (messageItem) => {
    if (!messageItem?.id) {
      return;
    }

    const normalizedMessageId = String(messageItem.id);
    setPinnedMessages((previous) => {
      const exists = previous.some((item) => String(item.id) === normalizedMessageId);
      if (exists) {
        return previous.filter((item) => String(item.id) !== normalizedMessageId);
      }

      return [createPinnedSnapshot(messageItem), ...previous].slice(0, MAX_PINNED_MESSAGES);
    });
    setMessageContextMenu(null);
  };

  const openForwardModal = (messageIds) => {
    const normalizedIds = Array.from(new Set((messageIds || []).map((id) => String(id))));
    if (!normalizedIds.length) {
      return;
    }

    setForwardModal({
      open: true,
      messageIds: normalizedIds,
      targetIds: [],
      query: "",
      submitting: false,
    });
    setMessageContextMenu(null);
  };

  const closeForwardModal = () => {
    setForwardModal({
      open: false,
      messageIds: [],
      targetIds: [],
      query: "",
      submitting: false,
    });
  };

  const toggleForwardTarget = (targetId) => {
    const normalizedTargetId = String(targetId);
    setForwardModal((previous) => {
      const exists = previous.targetIds.some((itemId) => String(itemId) === normalizedTargetId);
      return {
        ...previous,
        targetIds: exists
          ? previous.targetIds.filter((itemId) => String(itemId) !== normalizedTargetId)
          : [...previous.targetIds, normalizedTargetId],
      };
    });
  };

  const openMediaPreview = (type, url, name, contentType = "", messageId = "", attachmentEncryption = null, sourceUrl = "", attachmentIndex = 0) => {
    if (!url) {
      return;
    }

    setMediaPreview({
      type,
      url,
      name: name || (type === "image" ? "Изображение" : "Видео"),
      contentType,
      messageId: String(messageId || ""),
      attachmentIndex: Number(attachmentIndex) || 0,
      attachmentEncryption,
      sourceUrl: sourceUrl || url,
    });
  };

  const openMessageContextMenu = (event, messageItem, isOwnMessage) => {
    event.preventDefault();

    const decryptedAttachment = decryptedAttachmentsByMessageId[getAttachmentCacheKey(messageItem?.id, 0)];
    const resolvedAttachmentContentType = decryptedAttachment?.contentType || messageItem?.attachmentContentType || "";
    const attachmentKind = resolvedAttachmentContentType.startsWith("image/")
      ? "image"
      : resolvedAttachmentContentType.startsWith("video/")
        ? "video"
        : messageItem?.attachmentUrl
          ? "file"
          : "";
    const hasAttachment = Boolean(messageItem?.attachmentUrl);
    const hasText = Boolean(String(messageItem?.message || messageItem?.attachmentName || "").trim());
    const canEdit = Boolean(isOwnMessage) && Boolean(String(messageItem?.message || "").trim());
    const enabledActionCount = 7 + (hasAttachment ? 1 : 0);
    const menuWidth = 224;
    const reactionPanelHeight = 58;
    const menuHeight = reactionPanelHeight + 16 + enabledActionCount * 46;
    const padding = 12;
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const nextX = Math.min(event.clientX, viewportWidth - menuWidth - padding);
    const nextY = Math.min(event.clientY, viewportHeight - menuHeight - padding);

    setReactionStickerPanelOpen(false);
    setMessageContextMenu({
      x: Math.max(padding, nextX),
      y: Math.max(padding, nextY),
      messageId: messageItem.id,
      text: String(messageItem.message || decryptedAttachment?.name || messageItem.attachmentName || "").trim(),
      attachmentKind,
      attachmentUrl: decryptedAttachment?.objectUrl || (messageItem?.attachmentUrl ? resolveMediaUrl(messageItem.attachmentUrl, messageItem.attachmentUrl) : ""),
      attachmentSourceUrl: messageItem?.attachmentUrl ? resolveMediaUrl(messageItem.attachmentUrl, messageItem.attachmentUrl) : "",
      attachmentName: decryptedAttachment?.name || messageItem?.attachmentName || "",
      attachmentContentType: resolvedAttachmentContentType,
      attachmentEncryption: messageItem?.attachmentEncryption || null,
      hasAttachment,
      hasText,
      canEdit,
      isPinned: pinnedMessageIdSet.has(String(messageItem.id)),
      canDelete: Boolean(isOwnMessage),
    });
  };

  const handleCopyMessageText = async () => {
    if (!messageContextMenu?.text) {
      return;
    }

    try {
      await copyTextToClipboard(messageContextMenu.text);
      setErrorMessage("");
    } catch {
      setErrorMessage("Не удалось скопировать текст в буфер обмена.");
    } finally {
      setMessageContextMenu(null);
    }
  };

  const handleDeleteMessage = async () => {
    if (!messageContextMenu?.canDelete || !messageContextMenu?.messageId) {
      return;
    }

    try {
      await chatConnection.invoke("DeleteMessage", messageContextMenu.messageId);
      setErrorMessage("");
    } catch (error) {
      console.error("DeleteMessage error:", error);
      setErrorMessage(getChatErrorMessage(error, "Не удалось удалить сообщение."));
    } finally {
      setMessageContextMenu(null);
    }
  };

  const handleStartEditingMessage = () => {
    if (!messageContextMenu?.canEdit || !messageContextMenu?.messageId) {
      return;
    }

    const messageItem = messages.find((item) => String(item.id) === String(messageContextMenu.messageId));
    if (!messageItem) {
      setMessageContextMenu(null);
      return;
    }

    startEditingMessage(messageItem);
  };

  const handleDownloadAttachment = async (attachment = messageContextMenu) => {
    if (!attachment?.attachmentUrl) {
      return;
    }

    try {
      setErrorMessage("");
      const sourceAttachmentUrl = attachment.attachmentSourceUrl || attachment.attachmentUrl;
      let resolvedContentType = attachment.attachmentContentType || "";
      let fileName = buildDownloadFileName({
        type: attachment.attachmentKind,
        url: sourceAttachmentUrl,
        name: attachment.attachmentName,
        contentType: resolvedContentType,
      });
      let fileBytes = null;

      if (attachment?.attachmentEncryption) {
        const cachedAttachment = decryptedAttachmentsByMessageId[getAttachmentCacheKey(attachment?.messageId, attachment?.attachmentIndex)];
        const decryptedAttachment = cachedAttachment || await decryptIncomingAttachment(attachment, user, { channelId: scopedChannelId });
        if (!decryptedAttachment?.blob) {
          throw new Error("Не удалось расшифровать файл.");
        }

        if (!cachedAttachment && decryptedAttachment?.objectUrl) {
          revokeAttachmentObjectUrl(decryptedAttachment);
        }

        resolvedContentType = decryptedAttachment.contentType || resolvedContentType;
        fileName = buildDownloadFileName({
          type: attachment.attachmentKind,
          url: sourceAttachmentUrl,
          name: decryptedAttachment.name || attachment.attachmentName,
          contentType: resolvedContentType,
        });
        fileBytes = new Uint8Array(await decryptedAttachment.blob.arrayBuffer());
      } else {
        const requestUrl = sourceAttachmentUrl;

        if (window?.electronDownloads?.fetchAndSave) {
          const headers = shouldUseAuthenticatedDownload(requestUrl) && getStoredToken()
            ? { Authorization: `Bearer ${getStoredToken()}` }
            : {};
          const result = await window.electronDownloads.fetchAndSave({
            url: requestUrl,
            defaultFileName: fileName,
            headers,
          });

          if (!result?.canceled) {
            setMessageContextMenu(null);
          }
          return;
        }

        const response = shouldUseAuthenticatedDownload(requestUrl)
          ? await authFetch(requestUrl)
          : await fetch(requestUrl);

        if (!response.ok) {
          throw new Error("Не удалось загрузить файл для скачивания.");
        }

        resolvedContentType = response.headers.get("content-type") || attachment.attachmentContentType || "";
        fileName = buildDownloadFileName({
          type: attachment.attachmentKind,
          url: requestUrl,
          name: attachment.attachmentName,
          contentType: resolvedContentType,
        });
        fileBytes = new Uint8Array(await response.arrayBuffer());
      }

      if (window?.electronDownloads?.saveFile) {
        const result = await window.electronDownloads.saveFile({
          defaultFileName: fileName,
          bytes: Array.from(fileBytes),
        });

        if (!result?.canceled) {
          setMessageContextMenu(null);
        }
        return;
      }

      await saveBlobWithBrowser(new Blob([fileBytes], { type: resolvedContentType || "application/octet-stream" }), fileName);
      setMessageContextMenu(null);
    } catch (error) {
      console.error("Download attachment error:", error);
      setErrorMessage(error?.message || "Не удалось скачать файл.");
      setMessageContextMenu(null);
    }
  };

  const handleToggleReaction = async (messageId, reactionOption) => {
    if (!messageId || !reactionOption?.key || !reactionOption?.glyph) {
      return;
    }

    try {
      setErrorMessage("");
      await chatConnection.invoke("ToggleReaction", messageId, reactionOption.key, reactionOption.glyph);
      setMessageContextMenu(null);
    } catch (error) {
      console.error("ToggleReaction error:", error);
      setErrorMessage(getChatErrorMessage(error, "Не удалось поставить реакцию."));
    }
  };

  const handleOpenMediaPreviewFullscreen = async () => {
    const mediaElement = mediaPreviewVideoRef.current;
    const requestFullscreen =
      mediaElement?.requestFullscreen
      || mediaElement?.webkitRequestFullscreen
      || mediaElement?.mozRequestFullScreen
      || mediaElement?.msRequestFullscreen;

    if (!requestFullscreen) {
      return;
    }

    try {
      await requestFullscreen.call(mediaElement);
    } catch (error) {
      console.error("Fullscreen preview error:", error);
    }
  };

  const resolveRenderedAttachments = (messageItem) =>
    normalizeAttachmentItems(messageItem).map((attachmentItem, attachmentIndex) => {
      const cacheKey = getAttachmentCacheKey(messageItem?.id, attachmentIndex);
      const attachmentView = decryptedAttachmentsByMessageId[cacheKey] || null;
      const attachmentUnavailable = Boolean(attachmentView?.unavailable);
      const attachmentUrl = attachmentView?.objectUrl || (
        attachmentItem.attachmentEncryption
          ? ""
          : attachmentItem.attachmentUrl
            ? resolveMediaUrl(attachmentItem.attachmentUrl, attachmentItem.attachmentUrl)
            : ""
      );
      const attachmentName = attachmentView?.name || attachmentItem.attachmentName || "";
      const attachmentContentType = attachmentView?.contentType || attachmentItem.attachmentContentType || "";
      const attachmentSize = attachmentView?.size || attachmentItem.attachmentSize || null;
      const voiceMessage = normalizeVoiceMessageMetadata(attachmentItem.voiceMessage);

      return {
        ...attachmentItem,
        attachmentIndex,
        cacheKey,
        attachmentView,
        attachmentUnavailable,
        attachmentUrl,
        attachmentName,
        attachmentContentType,
        attachmentSize,
        voiceMessage,
        isImage: String(attachmentContentType).startsWith("image/"),
        isVideo: String(attachmentContentType).startsWith("video/"),
        isVoice: isVoiceMessage({
          attachmentUrl,
          attachmentEncryption: attachmentItem.attachmentEncryption,
          voiceMessage,
        }) && !attachmentUnavailable,
      };
    });

  const renderAttachmentCard = (messageItem, attachmentItem) => {
    if (attachmentItem.isVoice) {
      return (
        <VoiceMessageBubble
          src={attachmentItem.attachmentUrl}
          pending={!attachmentItem.attachmentUrl}
          waveform={attachmentItem.voiceMessage?.waveform || []}
          durationMs={attachmentItem.voiceMessage?.durationMs || 0}
          fileName={attachmentItem.voiceMessage?.fileName || attachmentItem.attachmentName}
        />
      );
    }

    if (attachmentItem.attachmentUrl) {
      if (attachmentItem.isImage) {
        return (
          <button
            type="button"
            className="message-media message-media--button"
            onClick={(event) => {
              if (selectionMode) {
                event.preventDefault();
                event.stopPropagation();
                toggleMessageSelection(messageItem.id);
                return;
              }

              openMediaPreview(
                "image",
                attachmentItem.attachmentUrl,
                attachmentItem.attachmentName,
                attachmentItem.attachmentContentType,
                messageItem.id,
                attachmentItem.attachmentEncryption,
                attachmentItem.attachmentUrl ? resolveMediaUrl(attachmentItem.attachmentUrl, attachmentItem.attachmentUrl) : attachmentItem.attachmentUrl,
                attachmentItem.attachmentIndex
              );
            }}
            aria-label={`Открыть изображение ${attachmentItem.attachmentName || ""}`.trim()}
          >
            <img className="message-media__image" src={attachmentItem.attachmentUrl} alt={attachmentItem.attachmentName || "image"} />
          </button>
        );
      }

      if (attachmentItem.isVideo) {
        return (
          <button
            type="button"
            className="message-media message-media--video message-media--button"
            onClick={(event) => {
              if (selectionMode) {
                event.preventDefault();
                event.stopPropagation();
                toggleMessageSelection(messageItem.id);
                return;
              }

              openMediaPreview(
                "video",
                attachmentItem.attachmentUrl,
                attachmentItem.attachmentName,
                attachmentItem.attachmentContentType,
                messageItem.id,
                attachmentItem.attachmentEncryption,
                attachmentItem.attachmentUrl ? resolveMediaUrl(attachmentItem.attachmentUrl, attachmentItem.attachmentUrl) : attachmentItem.attachmentUrl,
                attachmentItem.attachmentIndex
              );
            }}
            aria-label={`Открыть видео ${attachmentItem.attachmentName || ""}`.trim()}
          >
            <video className="message-media__video" src={attachmentItem.attachmentUrl} preload="metadata" playsInline muted />
            <span className="message-media__play" aria-hidden="true" />
          </button>
        );
      }

      return (
        <a
          className="message-attachment"
          href={attachmentItem.attachmentUrl}
          target="_blank"
          rel="noreferrer"
          onClick={(event) => {
            if (!selectionMode) {
              return;
            }

            event.preventDefault();
            event.stopPropagation();
            toggleMessageSelection(messageItem.id);
          }}
        >
          <span className="message-attachment__icon" aria-hidden="true" />
          <span className="message-attachment__meta">
            <span className="message-attachment__name">{attachmentItem.attachmentName || "Файл"}</span>
            <span className="message-attachment__size">{formatFileSize(attachmentItem.attachmentSize)}</span>
          </span>
        </a>
      );
    }

    if (attachmentItem.attachmentEncryption) {
      return (
        <div className={`message-attachment ${attachmentItem.attachmentUnavailable ? "message-attachment--unavailable" : "message-attachment--pending"}`}>
          <span className="message-attachment__icon" aria-hidden="true" />
          <span className="message-attachment__meta">
            <span className="message-attachment__name">
              {attachmentItem.attachmentUnavailable ? "Зашифрованное вложение недоступно" : "Зашифрованный файл"}
            </span>
            <span className="message-attachment__size">
              {attachmentItem.attachmentUnavailable ? "На этом устройстве нет ключа для расшифровки" : "Расшифровывается автоматически"}
            </span>
          </span>
        </div>
      );
    }

    return null;
  };

  const renderResolvedAttachmentCollection = (messageItem, attachments) => {
    if (!attachments.length) {
      return null;
    }

    if (attachments.length === 1) {
      return renderAttachmentCard(messageItem, attachments[0]);
    }

    const visualAttachments = attachments.filter((attachmentItem) => attachmentItem.isVoice || attachmentItem.isImage || attachmentItem.isVideo);
    const fileAttachments = attachments.filter((attachmentItem) => !attachmentItem.isVoice && !attachmentItem.isImage && !attachmentItem.isVideo);

    return (
      <div className="message-attachments-stack">
        {visualAttachments.length ? (
          <div className="message-attachment-grid">
            {visualAttachments.map((attachmentItem) => (
              <div
                key={`${messageItem.id}-${attachmentItem.attachmentIndex}`}
                className={`message-attachment-grid__item ${attachmentItem.isVoice ? "message-attachment-grid__item--voice" : ""}`}
              >
                {renderAttachmentCard(messageItem, attachmentItem)}
              </div>
            ))}
          </div>
        ) : null}

        {fileAttachments.length ? (
          <div className="message-attachment-list">
            {fileAttachments.map((attachmentItem) => (
              <div key={`${messageItem.id}-${attachmentItem.attachmentIndex}`} className="message-attachment-list__item">
                {renderAttachmentCard(messageItem, attachmentItem)}
              </div>
            ))}
          </div>
        ) : null}
      </div>
    );
  };

  const renderMessageAttachments = (messageItem) => renderResolvedAttachmentCollection(messageItem, resolveRenderedAttachments(messageItem));

  const renderMessageText = (text, mentions) => (
    segmentMessageTextByMentions(text, mentions).map((segment, index) => (
      segment.isMention ? (
        <span
          key={`mention-${index}-${segment.userId}`}
          className={`message-text__mention ${String(segment.userId || "") === currentUserId ? "message-text__mention--self" : ""}`}
          title={segment.displayName || segment.text}
        >
          {segment.text}
        </span>
      ) : (
        <span key={`text-${index}`}>{segment.text}</span>
      )
    ))
  );

  const sendMessagesCompat = async (targetChannelId, avatar, payload, { allowBatch = true } = {}) => {
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
      const preparedTextPayload = await prepareOutgoingTextEncryption({
        channelId: targetChannelId,
        user,
        text: String(item.message || ""),
      });

      if (preparedTextPayload.reason) {
        console.warn("E2EE fallback:", preparedTextPayload.reason);
      }

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
  };

  const handleForwardSubmit = async () => {
    if (!forwardModal.targetIds.length) {
      setErrorMessage("Выберите хотя бы один чат получателя.");
      return;
    }

    if (!forwardableMessages.length) {
      setErrorMessage("Не удалось найти сообщения для пересылки.");
      return;
    }

    try {
      setErrorMessage("");
      setForwardModal((previous) => ({ ...previous, submitting: true }));

      const connection = await startChatConnection();
      if (!connection) {
        throw new Error("Сессия недействительна. Войдите снова.");
      }

      const avatar = user?.avatarUrl || user?.avatar || "";

      const targetChannels = directTargets
        .filter((target) => forwardModal.targetIds.some((targetId) => String(target.id) === String(targetId)))
        .map((target) => ({
          id: String(target.id),
          channelId: String(target.directChannelId || ""),
        }))
        .filter((target) => target.channelId);

      if (!targetChannels.length) {
        throw new Error("Не удалось определить чаты получателей.");
      }

      for (const target of targetChannels) {
        const payload = await buildForwardPayloadForTargetChannel(target.channelId, forwardableMessages);
        if (!payload.length) {
          throw new Error("Нет данных для пересылки.");
        }

        await sendMessagesCompat(target.channelId, avatar, payload, { allowBatch: false });
      }

      if (selectionMode) {
        clearSelectionMode();
      }

      closeForwardModal();
    } catch (error) {
      console.error("Forward messages error:", error);
      setErrorMessage(getChatErrorMessage(error, "Не удалось переслать сообщения."));
      setForwardModal((previous) => ({ ...previous, submitting: false }));
    }
  };

  const contextMenuActions = [
    { id: "edit", label: "Редактировать", icon: "✎", disabled: !messageContextMenu?.canEdit, hidden: false, onClick: handleStartEditingMessage },
    { id: "reply", label: "Ответить", icon: "?", disabled: true, hidden: false, onClick: () => {} },
    {
      id: "pin",
      label: messageContextMenu?.isPinned ? "Открепить" : "Закрепить",
      icon: "📌",
      disabled: false,
      hidden: false,
      onClick: () => {
        const messageItem = messages.find((item) => String(item.id) === String(messageContextMenu?.messageId));
        if (messageItem) {
          togglePinnedMessage(messageItem);
        }
      },
    },
    {
      id: "download",
      label: getDownloadLabel(messageContextMenu?.attachmentKind),
      icon: "v",
      disabled: !messageContextMenu?.hasAttachment,
      hidden: !messageContextMenu?.hasAttachment,
      onClick: () => handleDownloadAttachment(),
    },
    { id: "copy", label: "Копировать текст", icon: "?", disabled: !messageContextMenu?.hasText, hidden: false, onClick: handleCopyMessageText },
    { id: "forward", label: "Переслать", icon: "?", disabled: !directTargets.length, hidden: false, onClick: () => openForwardModal([messageContextMenu?.messageId]) },
    { id: "delete", label: "Удалить", icon: "🗑", disabled: !messageContextMenu?.canDelete, hidden: false, danger: true, onClick: handleDeleteMessage },
    { id: "select", label: "Выбрать", icon: "?", disabled: false, hidden: false, onClick: () => openSelectionMode(messageContextMenu?.messageId) },
  ].filter((action) => !action.hidden);

  return (
    <div className="textchat-container">
      {normalizedSearchQuery.length >= 2 ? (
        <div className="message-search-panel">
          <div className="message-search-panel__header">
            <strong>Найденные сообщения</strong>
            <span>{searchResults.length ? `${searchResults.length} совпадений` : "Совпадений нет"}</span>
          </div>
          {searchResults.length ? (
            <div className="message-search-panel__list">
              {searchResults.slice(0, 8).map((result) => (
                <button key={result.id} type="button" className="message-search-panel__item" onClick={() => scrollToMessage(result.id)}>
                  <strong>{result.username || "User"}</strong>
                  <span>{result.preview || "Сообщение без текста"}</span>
                  <small>{formatTimestamp(result.timestamp)}</small>
                </button>
              ))}
            </div>
          ) : (
            <div className="message-search-panel__empty">В текущем чате ничего не найдено.</div>
          )}
        </div>
      ) : null}

      {pinnedMessages.length ? (
        <div className="chat-pins">
          <div className="chat-pins__header">
            <strong>Закреплённые сообщения</strong>
            <span>{pinnedMessages.length}</span>
          </div>
          <div className="chat-pins__list">
            {pinnedMessages.map((pinnedMessage) => (
              <div
                key={pinnedMessage.id}
                className="chat-pins__item"
              >
                <button type="button" className="chat-pins__link" onClick={() => scrollToMessage(pinnedMessage.id)}>
                  <span className="chat-pins__meta">
                    <strong>{pinnedMessage.username}</strong>
                    <small>{formatTimestamp(pinnedMessage.timestamp)}</small>
                  </span>
                  <span className="chat-pins__preview">{pinnedMessage.preview}</span>
                </button>
                <button
                  type="button"
                  className="chat-pins__remove"
                  onClick={(event) => {
                    event.stopPropagation();
                    setPinnedMessages((previous) => previous.filter((item) => String(item.id) !== String(pinnedMessage.id)));
                  }}
                  aria-label="Открепить сообщение"
                >
                  ?
                </button>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {selectionMode ? (
        <div className="chat-selection-bar">
          <div className="chat-selection-bar__copy">
            <strong>{selectedMessageIds.length || 0}</strong>
            <span>Выбрано сообщений</span>
          </div>
          <div className="chat-selection-bar__actions">
            <button
              type="button"
              className="chat-selection-bar__button"
              disabled={!selectedMessageIds.length || !directTargets.length}
              onClick={() => openForwardModal(selectedMessageIds)}
            >
              Переслать
            </button>
            <button type="button" className="chat-selection-bar__button chat-selection-bar__button--ghost" onClick={clearSelectionMode}>
              Отмена
            </button>
          </div>
        </div>
      ) : null}

      <div className="messages-list-shell">
        {floatingDateLabel ? <div className="messages-floating-date">{floatingDateLabel}</div> : null}

        <div ref={messagesListRef} className="messages-list">
          {messages.map((messageItem) => {
            const attachments = resolveRenderedAttachments(messageItem);
            const hasRenderableAttachments = attachments.length > 0;
            const primaryAttachment = attachments[0] || null;
            const attachmentView = primaryAttachment?.attachmentView || null;
            const attachmentUnavailable = Boolean(primaryAttachment?.attachmentUnavailable);
            const attachmentUrl = primaryAttachment?.attachmentUrl || "";
            const attachmentName = primaryAttachment?.attachmentName || "";
            const attachmentContentType = primaryAttachment?.attachmentContentType || "";
            const attachmentSize = primaryAttachment?.attachmentSize || null;
            const isResolvedImageAttachment = Boolean(primaryAttachment?.isImage);
            const isResolvedVideoAttachment = Boolean(primaryAttachment?.isVideo);
            const resolvedVoiceMessage = primaryAttachment?.voiceMessage || normalizeVoiceMessageMetadata(messageItem.voiceMessage);
            const hasVoiceAttachment = Boolean(primaryAttachment?.isVoice);
            const canRenderVoiceAttachment = hasVoiceAttachment && !attachmentUnavailable;
            const reactions = normalizeReactions(messageItem.reactions);
            const messageText = String(messageItem.message || "");
            const messageMentions = Array.isArray(messageItem.mentions) ? messageItem.mentions : [];
            const isOwnMessage =
              String(messageItem.authorUserId || "") === currentUserId ||
              (!messageItem.authorUserId && messageItem.username?.toLowerCase() === getUserName(user).toLowerCase());
            const isSelectedMessage = selectedMessageIdSet.has(String(messageItem.id));
            const useInlineFooter = isDirectChat
              && Boolean(messageText.trim())
              && !hasRenderableAttachments
              && !reactions.length
              && !messageItem.forwardedFromUsername
              && !messageText.includes("\n")
              && messageText.trim().length <= 14;

            return (
              <div
                key={messageItem.id}
                ref={(node) => {
                  if (node) {
                    messageRefs.current.set(messageItem.id, node);
                  } else {
                    messageRefs.current.delete(messageItem.id);
                  }
                }}
                className={`message-item ${isDirectChat ? "message-item--dm" : ""} ${isDirectChat && isOwnMessage ? "message-item--dm-own" : ""} ${isDirectChat && !isOwnMessage ? "message-item--dm-incoming" : ""} ${String(messageItem.id) === highlightedMessageId ? "message-item--highlighted" : ""} ${isSelectedMessage ? "message-item--selected" : ""} ${selectionMode ? "message-item--selectable" : ""}`}
                onContextMenu={(event) => openMessageContextMenu(event, messageItem, isOwnMessage)}
                onClick={selectionMode ? () => toggleMessageSelection(messageItem.id) : undefined}
              >
                {selectionMode ? (
                  <button
                    type="button"
                    className={`message-select-toggle ${isSelectedMessage ? "message-select-toggle--active" : ""}`}
                    onClick={(event) => {
                      event.stopPropagation();
                      toggleMessageSelection(messageItem.id);
                    }}
                    aria-label={isSelectedMessage ? "Снять выделение" : "Выбрать сообщение"}
                  >
                    <span className="message-select-toggle__mark" aria-hidden="true" />
                  </button>
                ) : null}
                <AnimatedAvatar src={messageItem.photoUrl} alt="avatar" className="msg-avatar" />

                <div className={`msg-content ${isDirectChat ? "msg-content--dm" : ""} ${isDirectChat && isOwnMessage ? "msg-content--dm-own" : ""}`}>
                  {!isDirectChat ? (
                    <div className="message-author">
                      <span>{messageItem.username}</span>
                      <span className="message-meta">
                        <span className="message-time">{formatTime(messageItem.timestamp)}</span>
                        {renderEditedBadge(messageItem)}
                      </span>
                    </div>
                  ) : null}

                  {messageItem.forwardedFromUsername ? (
                    <div className="message-forwarded">
                      <span className="message-forwarded__label">Переслано от</span>
                      <strong>{messageItem.forwardedFromUsername}</strong>
                    </div>
                  ) : null}

                  {messageText ? (
                    useInlineFooter ? (
                      <div className="message-text-row">
                        <div className="message-text">{renderMessageText(messageText, messageMentions)}</div>
                        <div className={`message-footer message-footer--inline ${isOwnMessage ? "message-footer--own" : ""}`}>
                          <span className="message-time">{formatTime(messageItem.timestamp)}</span>
                          {renderEditedBadge(messageItem)}
                          {isOwnMessage ? (
                            <span className={`message-read-status ${messageItem.isRead ? "message-read-status--read" : ""}`}>
                              <span className="message-read-status__check" />
                              <span className="message-read-status__check" />
                            </span>
                          ) : null}
                        </div>
                      </div>
                    ) : (
                      <div className="message-text">{renderMessageText(messageText, messageMentions)}</div>
                    )
                  ) : null}

                  {canRenderVoiceAttachment ? (
                    <VoiceMessageBubble
                      src={attachmentUrl}
                      pending={!attachmentUrl}
                      waveform={resolvedVoiceMessage?.waveform || []}
                      durationMs={resolvedVoiceMessage?.durationMs || 0}
                      fileName={resolvedVoiceMessage?.fileName || attachmentName}
                    />
                  ) : attachmentUrl ? (
                    isResolvedImageAttachment ? (
                      <button
                        type="button"
                        className="message-media message-media--button"
                        onClick={(event) => {
                          if (selectionMode) {
                            event.preventDefault();
                            event.stopPropagation();
                            toggleMessageSelection(messageItem.id);
                            return;
                          }

                          openMediaPreview(
                            "image",
                            attachmentUrl,
                            attachmentName,
                            attachmentContentType,
                            messageItem.id,
                            messageItem.attachmentEncryption,
                            messageItem.attachmentUrl ? resolveMediaUrl(messageItem.attachmentUrl, messageItem.attachmentUrl) : attachmentUrl
                          );
                        }}
                        aria-label={`Открыть изображение ${attachmentName || ""}`.trim()}
                      >
                        <img className="message-media__image" src={attachmentUrl} alt={attachmentName || "image"} />
                      </button>
                    ) : isResolvedVideoAttachment ? (
                      <button
                        type="button"
                        className="message-media message-media--video message-media--button"
                        onClick={(event) => {
                          if (selectionMode) {
                            event.preventDefault();
                            event.stopPropagation();
                            toggleMessageSelection(messageItem.id);
                            return;
                          }

                          openMediaPreview(
                            "video",
                            attachmentUrl,
                            attachmentName,
                            attachmentContentType,
                            messageItem.id,
                            messageItem.attachmentEncryption,
                            messageItem.attachmentUrl ? resolveMediaUrl(messageItem.attachmentUrl, messageItem.attachmentUrl) : attachmentUrl
                          );
                        }}
                        aria-label={`Открыть видео ${attachmentName || ""}`.trim()}
                      >
                        <video className="message-media__video" src={attachmentUrl} preload="metadata" playsInline muted />
                        <span className="message-media__play" aria-hidden="true" />
                      </button>
                    ) : (
                      <a
                        className="message-attachment"
                        href={attachmentUrl}
                        target="_blank"
                        rel="noreferrer"
                        onClick={(event) => {
                          if (!selectionMode) {
                            return;
                          }

                          event.preventDefault();
                          event.stopPropagation();
                          toggleMessageSelection(messageItem.id);
                        }}
                      >
                        <span className="message-attachment__icon" aria-hidden="true" />
                        <span className="message-attachment__meta">
                          <span className="message-attachment__name">{attachmentName || "Файл"}</span>
                          <span className="message-attachment__size">{formatFileSize(attachmentSize)}</span>
                        </span>
                      </a>
                    )
                  ) : messageItem.attachmentEncryption ? (
                    <div className={`message-attachment ${attachmentUnavailable ? "message-attachment--unavailable" : "message-attachment--pending"}`}>
                      <span className="message-attachment__icon" aria-hidden="true" />
                      <span className="message-attachment__meta">
                        <span className="message-attachment__name">
                          {attachmentUnavailable ? "Зашифрованное вложение недоступно" : "Зашифрованный файл"}
                        </span>
                        <span className="message-attachment__size">
                          {attachmentUnavailable ? "На этом устройстве нет ключа для расшифровки" : "Расшифровывается автоматически"}
                        </span>
                      </span>
                    </div>
                  ) : null}

                  {attachments.length > 1 ? renderResolvedAttachmentCollection(messageItem, attachments.slice(1)) : null}

                  {((isDirectChat && !useInlineFooter) || reactions.length) ? (
                    <div className="message-bottom-row">
                      {reactions.length ? (
                        <div className="message-reactions-wrap">
                          <div className="message-reactions">
                            {reactions.map((reaction) => {
                              const reactedByCurrentUser = reaction.reactorUserIds.some((userId) => String(userId) === currentUserId);
                              return (
                                <button
                                  key={`${messageItem.id}-${reaction.key}`}
                                  type="button"
                                  className={`message-reaction ${reactedByCurrentUser ? "message-reaction--active" : ""}`}
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    handleToggleReaction(messageItem.id, reaction);
                                  }}
                                  aria-label={`${reaction.glyph} ${reaction.count}`}
                                >
                                  <span className="message-reaction__glyph" aria-hidden="true">{reaction.glyph}</span>
                                  <span className="message-reaction__count">{reaction.count}</span>
                                  <span className="message-reaction__avatars" aria-hidden="true">
                                    {reaction.users.slice(0, 2).map((reactor) => (
                                      <AnimatedAvatar
                                        key={`${reaction.key}-${reactor.userId}`}
                                        className="message-reaction__avatar"
                                        src={reactor.avatarUrl}
                                        alt={reactor.displayName}
                                      />
                                    ))}
                                  </span>
                                </button>
                              );
                            })}
                          </div>

                        </div>
                      ) : (
                        <span />
                      )}

                      {isDirectChat && !useInlineFooter ? (
                        <div className={`message-footer ${isOwnMessage ? "message-footer--own" : ""}`}>
                          <span className="message-time">{formatTime(messageItem.timestamp)}</span>
                          {renderEditedBadge(messageItem)}
                          {isOwnMessage ? (
                            <span className={`message-read-status ${messageItem.isRead ? "message-read-status--read" : ""}`}>
                              <span className="message-read-status__check" />
                              <span className="message-read-status__check" />
                            </span>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              </div>
            );
          })}
          <div ref={messagesEndRef} />
        </div>
      </div>

      <div className="input-area">
        <div className="input-area__editor">
          {selectedFiles.length ? (
            <div className="chat-file-list">
              {selectedFiles.map((selectedFile, index) => (
                <div key={`${selectedFile.name}-${selectedFile.size}-${selectedFile.lastModified}-${index}`} className="chat-file-pill">
                  <span className="chat-file-pill__name">{selectedFile.name}</span>
                  <span className="chat-file-pill__size">{formatFileSize(selectedFile.size)}</span>
                  <button
                    type="button"
                    className="chat-file-pill__remove"
                    onClick={() => setSelectedFiles((previous) => previous.filter((_, fileIndex) => fileIndex !== index))}
                    disabled={uploadingFile}
                  >
                    x
                  </button>
                </div>
              ))}
            </div>
          ) : null}

          {messageEditState || (ENABLE_VOICE_MESSAGE_BUTTON && voiceRecordingState !== "idle") || speechRecognitionActive ? (
            <div className="composer-status-strip">
              {messageEditState ? (
                <div className="composer-status composer-status--edit">
                  <span className="composer-status__dot" aria-hidden="true" />
                  <div className="composer-status__copy">
                    <strong>Редактирование сообщения</strong>
                    <span>PgUp редактирует последнее ваше сообщение. Enter сохраняет, Esc отменяет.</span>
                  </div>
                  <button type="button" className="composer-status__action" onClick={() => stopEditingMessage()}>
                    Отмена
                  </button>
                </div>
              ) : null}
              {ENABLE_VOICE_MESSAGE_BUTTON && voiceRecordingState !== "idle" ? (
                <div className={`composer-status composer-status--voice composer-status--${voiceRecordingState}`}>
                  <span className="composer-status__dot" aria-hidden="true" />
                  <div className="composer-status__copy">
                    <strong>{buildVoiceMessageLabel(voiceRecordingDurationMs)}</strong>
                    <span>
                      {voiceRecordingState === "locked"
                        ? "Запись зафиксирована. Нажмите на кнопку микрофона ещё раз, чтобы отправить."
                        : voiceRecordingState === "sending"
                          ? "Отправляем голосовое сообщение..."
                          : "Удерживайте кнопку и отпустите для отправки или потяните вверх для фиксации."}
                    </span>
                  </div>
                  {voiceRecordingState === "holding" || voiceRecordingState === "locked" ? (
                    <button type="button" className="composer-status__action" onClick={() => void handleCancelVoiceRecording()}>
                      Отмена
                    </button>
                  ) : null}
                </div>
              ) : null}
              {speechRecognitionActive ? (
                <div className="composer-status composer-status--speech">
                  <span className="composer-status__dot" aria-hidden="true" />
                  <div className="composer-status__copy">
                    <strong>Голосовой ввод</strong>
                    <span>Слушаем речь на русском и вставляем её в поле сообщения.</span>
                  </div>
                  <button type="button" className="composer-status__action" onClick={handleSpeechRecognitionToggle}>
                    Стоп
                  </button>
                </div>
              ) : null}
            </div>
          ) : null}

          <div className="input-area__controls">
            <div className="message-composer">
              <label className="attach-button" aria-label="Прикрепить файл" title="Прикрепить файл">
                <input type="file" className="attach-button__input" onChange={handleFileChange} disabled={uploadingFile} multiple />
                <span className="attach-button__icon" aria-hidden="true" />
              </label>
              <button
                ref={composerEmojiButtonRef}
                type="button"
                className={`composer-tool composer-tool--emoji ${composerEmojiPickerOpen ? "composer-tool--active" : ""}`}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => {
                  syncComposerSelection();
                  setComposerEmojiPickerOpen((previous) => !previous);
                }}
                disabled={uploadingFile || voiceRecordingState === "sending"}
                title="Смайлики"
                aria-label="Открыть смайлики"
                aria-expanded={composerEmojiPickerOpen}
              >
                <span className="composer-tool__emoji" aria-hidden="true">🙂</span>
              </button>
              {ENABLE_SPEECH_INPUT_BUTTON ? (
              <button
                type="button"
                className={`composer-tool composer-tool--speech ${speechRecognitionActive ? "composer-tool--active" : ""}`}
                onClick={handleSpeechRecognitionToggle}
                disabled={uploadingFile || voiceRecordingState !== "idle"}
                title={speechRecognitionSupported ? "Голосовой ввод текста" : "Голосовой ввод недоступен"}
                aria-label="Голосовой ввод текста"
              >
                <span className="composer-tool__mic" aria-hidden="true" />
                <span className="composer-tool__badge" aria-hidden="true">a</span>
              </button>
              ) : null}
              {composerEmojiPickerOpen ? (
                <div ref={composerEmojiPickerRef} className="composer-emoji-picker" role="dialog" aria-label="Выбор смайлика">
                  <div className="composer-emoji-picker__grid">
                    {COMPOSER_EMOJI_OPTIONS.map((emojiOption) => (
                      <button
                        key={emojiOption.key}
                        type="button"
                        className="composer-emoji-picker__item"
                        onMouseDown={(event) => event.preventDefault()}
                        onClick={() => insertComposerEmoji(emojiOption.glyph)}
                        title={emojiOption.label}
                        aria-label={emojiOption.label}
                      >
                        <span aria-hidden="true">{emojiOption.glyph}</span>
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}
              {mentionSuggestionsOpen && mentionSuggestions.length ? (
                <div ref={mentionSuggestionsRef} className="mention-suggestions" role="listbox" aria-label="Server mention suggestions">
                  {mentionSuggestions.map((suggestion, index) => (
                    <button
                      key={`${suggestion.userId}-${suggestion.handle}`}
                      type="button"
                      className={`mention-suggestions__item ${index === selectedMentionSuggestionIndex ? "mention-suggestions__item--active" : ""}`}
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => applyMentionSuggestion(suggestion)}
                      role="option"
                      aria-selected={index === selectedMentionSuggestionIndex}
                    >
                      <AnimatedAvatar
                        className="mention-suggestions__avatar"
                        src={suggestion.avatar || ""}
                        alt={suggestion.displayName}
                      />
                      <span className="mention-suggestions__content">
                        <span className="mention-suggestions__name">{suggestion.displayName}</span>
                        <span className="mention-suggestions__handle">@{suggestion.handle}</span>
                      </span>
                    </button>
                  ))}
                </div>
              ) : null}
              <textarea
                ref={textareaRef}
                value={message}
                disabled={uploadingFile || voiceRecordingState === "sending"}
                onChange={(event) => {
                  setMessage(event.target.value);
                  syncComposerSelection();
                }}
                onSelect={syncComposerSelection}
                onClick={syncComposerSelection}
                onKeyUp={syncComposerSelection}
                data-editing={messageEditState ? "true" : "false"}
                placeholder={uploadingFile ? "Загружаем вложения..." : "Введите сообщение..."}
                onKeyDown={(event) => {
                  if (mentionSuggestionsOpen && mentionSuggestions.length) {
                    if (event.key === "ArrowDown") {
                      event.preventDefault();
                      setSelectedMentionSuggestionIndex((previous) => (previous + 1) % mentionSuggestions.length);
                      return;
                    }

                    if (event.key === "ArrowUp" && String(message || "").trim()) {
                      event.preventDefault();
                      setSelectedMentionSuggestionIndex((previous) => (previous - 1 + mentionSuggestions.length) % mentionSuggestions.length);
                      return;
                    }

                    if (event.key === "Enter" || event.key === "Tab") {
                      event.preventDefault();
                      applyMentionSuggestion(mentionSuggestions[selectedMentionSuggestionIndex] || mentionSuggestions[0]);
                      return;
                    }
                  }

                  if (event.key === "Escape") {
                    if (composerEmojiPickerOpen) {
                      event.preventDefault();
                      setComposerEmojiPickerOpen(false);
                      return;
                    }

                    if (mentionSuggestionsOpen) {
                      event.preventDefault();
                      setMentionSuggestionsOpen(false);
                      return;
                    }

                    if (speechRecognitionActive) {
                      stopSpeechRecognition(false);
                    }

                    if (voiceRecordingState === "holding" || voiceRecordingState === "locked") {
                      event.preventDefault();
                      void handleCancelVoiceRecording();
                      return;
                    }

                    if (messageEditState) {
                      event.preventDefault();
                      stopEditingMessage();
                      return;
                    }
                  }

                  if (event.key === "PageUp") {
                    event.preventDefault();
                    startEditingLatestOwnMessage();
                    return;
                  }

                  if (
                    event.key === "ArrowUp"
                    && !event.shiftKey
                    && !event.altKey
                    && !event.ctrlKey
                    && !event.metaKey
                    && textareaRef.current
                    && textareaRef.current.selectionStart === 0
                    && textareaRef.current.selectionEnd === 0
                    && !String(message || "").trim()
                    && !messageEditState
                  ) {
                    event.preventDefault();
                    startEditingLatestOwnMessage();
                    return;
                  }

                  if (event.key === "Enter" && !event.shiftKey && !preferExplicitSend) {
                    event.preventDefault();
                    send();
                  }
                }}
              />

              <div className="composer-tools-end">
                <button
                  type="button"
                  className="composer-send-button"
                  onClick={() => void send()}
                  disabled={
                    uploadingFile
                    || voiceRecordingState === "holding"
                    || voiceRecordingState === "locked"
                    || voiceRecordingState === "sending"
                    || (!String(message || "").trim() && !selectedFiles.length)
                  }
                  aria-label="Отправить сообщение"
                  title="Отправить сообщение"
                >
                  <span className="composer-send-button__icon" aria-hidden="true" />
                </button>
              </div>

              {/* <button
                type="button"
                className={`composer-tool composer-tool--voice composer-tool--recording-${voiceRecordingState}`}
                hidden={!ENABLE_VOICE_MESSAGE_BUTTON}
                aria-hidden={!ENABLE_VOICE_MESSAGE_BUTTON}
                onPointerDown={(event) => void handleVoiceRecordPointerDown(event)}
                onPointerMove={handleVoiceRecordPointerMove}
                onPointerUp={(event) => void handleVoiceRecordPointerUp(event)}
                onPointerCancel={(event) => void handleVoiceRecordPointerCancel(event)}
                disabled={uploadingFile || voiceRecordingState === "sending"}
                title="Голосовое сообщение"
                aria-label="Записать голосовое сообщение"
              >
                <span
                  className="composer-tool__ring"
                  aria-hidden="true"
                  style={{ "--voice-level-scale": `${1 + voiceMicLevel * 0.9}` }}
                />
                <span className="composer-tool__mic" aria-hidden="true" />
                {voiceRecordingState === "locked" ? (
                  <span className="composer-tool__lock" aria-hidden="true">⇡</span>
                ) : null}
              </button> */}
            </div>
          </div>
        </div>
      </div>

      {/*
        <div className="chat-error">Чат инициализируется. Если это не пройдёт, попробуйте переподключиться или ещё раз открыть диалог.</div>
      */}
      {errorMessage ? <div className="chat-error">{errorMessage}</div> : null}

      {mediaPreview ? (
        <div className="media-preview" onClick={() => setMediaPreview(null)} role="presentation">
          <div className="media-preview__dialog" onClick={(event) => event.stopPropagation()} role="dialog" aria-modal="true" aria-label={mediaPreview.name}>
            <div className="media-preview__header">
              <div className="media-preview__meta">
                <strong>{mediaPreview.name}</strong>
                <span>{mediaPreview.type === "image" ? "Изображение" : "Видео"}</span>
              </div>
              <div className="media-preview__actions">
                <button
                  type="button"
                  className="media-preview__action"
                  onClick={() =>
                    handleDownloadAttachment({
                      attachmentKind: mediaPreview.type,
                      attachmentUrl: mediaPreview.url,
                      attachmentSourceUrl: mediaPreview.sourceUrl || mediaPreview.url,
                      attachmentName: mediaPreview.name,
                      attachmentContentType: mediaPreview.contentType || "",
                      attachmentEncryption: mediaPreview.attachmentEncryption || null,
                      messageId: mediaPreview.messageId || "",
                      attachmentIndex: mediaPreview.attachmentIndex || 0,
                    })
                  }
                >
                  Скачать
                </button>
                {mediaPreview.type === "video" ? (
                  <button type="button" className="media-preview__action" onClick={handleOpenMediaPreviewFullscreen}>
                    На весь экран
                  </button>
                ) : null}
                <button
                  type="button"
                  className="media-preview__close"
                  onClick={() => setMediaPreview(null)}
                  aria-label="Закрыть предпросмотр"
                >
                  <span className="media-preview__close-icon" aria-hidden="true" />
                </button>
              </div>
            </div>
            <div className="media-preview__content">
              {mediaPreview.type === "image" ? (
                <img className="media-preview__image" src={mediaPreview.url} alt={mediaPreview.name} />
              ) : (
                <video
                  ref={mediaPreviewVideoRef}
                  className="media-preview__video"
                  src={mediaPreview.url}
                  controls
                  autoPlay
                  playsInline
                  preload="metadata"
                />
              )}
            </div>
            <div className="media-preview__caption">{mediaPreview.name}</div>
          </div>
        </div>
      ) : null}

      {messageContextMenu ? (
        <div
          ref={contextMenuRef}
          className="message-context-menu-stack"
          style={{ left: `${messageContextMenu.x}px`, top: `${messageContextMenu.y}px` }}
          onClick={(event) => event.stopPropagation()}
        >
          <div className="message-reaction-picker" aria-label="Быстрые реакции">
            {(() => {
              const contextMessage = messages.find((item) => String(item.id) === String(messageContextMenu.messageId));
              const contextReactions = normalizeReactions(contextMessage?.reactions);
              const isReactionActive = (reactionOption) => contextReactions.some((reaction) =>
                reaction.key === reactionOption.key
                && reaction.reactorUserIds.some((userId) => String(userId) === currentUserId));

              return (
                <>
                  <div className="message-reaction-picker__row">
                    {PRIMARY_MESSAGE_REACTION_OPTIONS.map((reactionOption) => (
                      <button
                        key={reactionOption.key}
                        type="button"
                        className={`message-reaction-picker__item ${isReactionActive(reactionOption) ? "message-reaction-picker__item--active" : ""}`}
                        onClick={() => handleToggleReaction(messageContextMenu.messageId, reactionOption)}
                        aria-label={reactionOption.label}
                        title={reactionOption.label}
                      >
                        <span aria-hidden="true">{reactionOption.glyph}</span>
                      </button>
                    ))}
                    <button
                      type="button"
                      className={`message-reaction-picker__stickers-toggle ${reactionStickerPanelOpen ? "message-reaction-picker__stickers-toggle--active" : ""}`}
                      onClick={() => setReactionStickerPanelOpen((previous) => !previous)}
                      aria-expanded={reactionStickerPanelOpen}
                      aria-label="Открыть список стикеров"
                    >
                      <span className="message-reaction-picker__stickers-label">Стикеры</span>
                      <span className="message-reaction-picker__stickers-arrow" aria-hidden="true">›</span>
                    </button>
                  </div>
                  {reactionStickerPanelOpen ? (
                    <div className="message-reaction-picker__stickers" role="menu" aria-label="Стикеры">
                      {STICKER_MESSAGE_REACTION_OPTIONS.map((reactionOption) => (
                        <button
                          key={reactionOption.key}
                          type="button"
                          className={`message-reaction-picker__sticker ${isReactionActive(reactionOption) ? "message-reaction-picker__sticker--active" : ""}`}
                          onClick={() => handleToggleReaction(messageContextMenu.messageId, reactionOption)}
                          aria-label={reactionOption.label}
                          title={reactionOption.label}
                        >
                          <span className="message-reaction-picker__sticker-glyph" aria-hidden="true">{reactionOption.glyph}</span>
                          <span className="message-reaction-picker__sticker-label">{reactionOption.label}</span>
                        </button>
                      ))}
                    </div>
                  ) : null}
                </>
              );
            })()}
          </div>
          <div className="message-context-menu" role="menu">
            {contextMenuActions.map((action) => (
              <button
                key={action.id}
                type="button"
                className={`message-context-menu__item ${action.danger ? "message-context-menu__item--danger" : ""}`}
                disabled={action.disabled}
                onClick={action.onClick}
              >
                <span className="message-context-menu__icon" aria-hidden="true">{action.icon}</span>
                <span className="message-context-menu__label">{action.label}</span>
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {forwardModal.open ? (
        <div className="forward-modal__backdrop" onClick={closeForwardModal} role="presentation">
          <div className="forward-modal" onClick={(event) => event.stopPropagation()} role="dialog" aria-modal="true" aria-label="Переслать сообщения">
            <div className="forward-modal__header">
              <div>
                <h3>Переслать сообщения</h3>
                <p>{forwardableMessages.length} {forwardableMessages.length === 1 ? "сообщение" : "сообщения"} можно переслать выбранным друзьям</p>
              </div>
              <button type="button" className="forward-modal__close" onClick={closeForwardModal} aria-label="Закрыть">
                ?
              </button>
            </div>

            <input
              className="forward-modal__search"
              type="text"
              value={forwardModal.query}
              onChange={(event) => setForwardModal((previous) => ({ ...previous, query: event.target.value }))}
              placeholder="Поиск друзей"
            />

            <div className="forward-modal__list">
              {availableForwardTargets.length ? (
                availableForwardTargets.map((target) => {
                  const isSelectedTarget = forwardModal.targetIds.some((targetId) => String(targetId) === String(target.id));
                  return (
                    <button
                      key={target.id}
                      type="button"
                      className={`forward-modal__target ${isSelectedTarget ? "forward-modal__target--active" : ""}`}
                      onClick={() => toggleForwardTarget(target.id)}
                    >
                      <AnimatedAvatar className="forward-modal__target-avatar" src={target.avatar || ""} alt={getTargetDisplayName(target)} />
                      <span className="forward-modal__target-copy">
                        <strong>{getTargetDisplayName(target)}</strong>
                        <small>{target.email || "Без email"}</small>
                      </span>
                    </button>
                  );
                })
              ) : (
                <div className="forward-modal__empty">Подходящие друзья не найдены.</div>
              )}
            </div>

            <div className="forward-modal__actions">
              <button type="button" className="forward-modal__button forward-modal__button--ghost" onClick={closeForwardModal} disabled={forwardModal.submitting}>
                Отмена
              </button>
              <button type="button" className="forward-modal__button" onClick={handleForwardSubmit} disabled={!forwardModal.targetIds.length || !forwardableMessages.length || forwardModal.submitting}>
                {forwardModal.submitting ? "Отправляем..." : "Переслать"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}



