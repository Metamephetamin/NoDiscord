import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import TextChatView from "./TextChatView";
import chatConnection, { startChatConnection } from "../../SignalR/ChatConnect";
import "../../css/TextChat.css";
import { readIncomingMessageText } from "../../security/chatPayloadCrypto";
import { uploadChatAttachment } from "../../utils/chatAttachmentUpload";
import { revokePendingUploadPreviews } from "../../utils/chatPendingUploads";
import { clearChatDraft, readChatDraft, writeChatDraft } from "../../utils/chatDrafts";
import { isDirectMessageChannelId, normalizeDirectMessageChannelId } from "../../utils/directMessageChannels";
import { resolveDirectMessageSoundPath } from "../../utils/directMessageSounds";
import { API_BASE_URL } from "../../config/runtime";
import { authFetch, getApiErrorMessage, parseApiResponse } from "../../utils/auth";
import { copyTextToClipboard } from "../../utils/clipboard";
import {
  readCachedTextChatMessages,
  readHiddenTextChatMessageIds,
  readTextChatChannelClearedAt,
  writeHiddenTextChatMessageIds,
  writeCachedTextChatMessages,
} from "../../utils/textChatMessageCache";
import {
  extractMentionsFromText,
  getMentionHandleForMember,
  getMentionHandleForRole,
  normalizeMentionAlias,
} from "../../utils/messageMentions";
import {
  getPinnedStorageKey,
  readPinnedMessages,
  writePinnedMessages,
} from "../../utils/textChatHelpers";
import { normalizeVoiceMessageMetadata } from "../../utils/voiceMessages";

import {
  createPinnedSnapshot,
  getChatErrorMessage,
  getMentionQueryContext,
  getScopedChatChannelId,
  getSpeechRecognitionConstructor,
  getUserName,
  normalizeAttachmentItems,
  normalizeReactions,
} from "../../utils/textChatModel";
import { buildForwardPayloadForTargetChannel as buildForwardPayloadForTargetChannelCore } from "../../utils/textChatForwardPayload";
import { TEXT_CHAT_INSERT_MENTION_EVENT } from "../../utils/textChatMentionInterop";
import { sendMessagesCompat as sendMessagesCompatCore } from "../../utils/textChatSendCompat";
import { finishPerfTrace, startPerfTrace } from "../../utils/perf";
import useMediaPreviewKeyboardControls from "../../hooks/useMediaPreviewKeyboardControls";
import useTextChatComposerPopovers from "../../hooks/useTextChatComposerPopovers";
import useTextChatMessageActions from "../../hooks/useTextChatMessageActions";
import useTextChatOptimisticUploadQueue from "../../hooks/useTextChatOptimisticUploadQueue";
import useTextChatSendActions from "../../hooks/useTextChatSendActions";
import useTextChatVirtualizer from "../../hooks/useTextChatVirtualizer";
import useTextChatVoiceSpeech from "../../hooks/useTextChatVoiceSpeech";

const deferEffectState = (callback) => {
  if (typeof queueMicrotask === "function") {
    queueMicrotask(callback);
    return;
  }

  setTimeout(callback, 0);
};

const clampMenuPosition = (x, y, menuWidth = 260, menuHeight = 320, padding = 12) => ({
  x: Math.max(padding, Math.min(Number(x || 0), window.innerWidth - menuWidth - padding)),
  y: Math.max(padding, Math.min(Number(y || 0), window.innerHeight - menuHeight - padding)),
});

const BATCH_UPLOAD_PREFERENCES_KEY = "textchat-batch-upload-preferences";
const EMPTY_DECRYPTED_ATTACHMENTS_BY_MESSAGE_ID = Object.freeze({});
const TEXT_CHAT_DEBUG_FLAG_PREFIX = "nodiscord.debug.textchat.";
const LOCAL_ECHO_ID_PREFIX = "local-echo:";
const TEXT_CHAT_HISTORY_PAGE_SIZE = 50;
const MAX_ACTIVE_CHANNEL_MESSAGES = 1600;
const MAX_BACKGROUND_CHANNEL_MESSAGES = 160;
const SLOW_MODE_DURATIONS_MS = Object.freeze({
  "5s": 5_000,
  "10s": 10_000,
  "30s": 30_000,
  "1m": 60_000,
  "5m": 5 * 60_000,
  "15m": 15 * 60_000,
  "1h": 60 * 60_000,
});

function shouldUseRestTextChatHistoryEndpoint() {
  return Boolean(String(API_BASE_URL || "").trim());
}

function getSlowModeDurationMs(value) {
  return SLOW_MODE_DURATIONS_MS[String(value || "").trim()] || 0;
}

function formatSlowModeRemainingMessage(remainingMs) {
  const remainingSeconds = Math.max(1, Math.ceil(Number(remainingMs || 0) / 1000));
  if (remainingSeconds < 60) {
    return `Включен медленный режим. Подождите ${remainingSeconds} сек.`;
  }

  return `Включен медленный режим. Подождите ${Math.ceil(remainingSeconds / 60)} мин.`;
}

function isUnrecoverableLegacyEncryptedMessage(messageItem) {
  const encryptionState = String(messageItem?.encryptionState || messageItem?.EncryptionState || "").trim();
  if (encryptionState === "legacy-client-encrypted") {
    return true;
  }

  const legacyEncryption = messageItem?.encryption || messageItem?.Encryption;
  if (legacyEncryption?.ciphertext || legacyEncryption?.Ciphertext) {
    return true;
  }

  const messageText = String(messageItem?.message || messageItem?.Message || "");
  return messageText.includes("старым клиентским форматом") && messageText.includes("больше недоступно");
}

function readTextChatDebugFlag(name) {
  if (!import.meta.env.DEV || typeof window === "undefined") {
    return false;
  }

  try {
    const rawValue = window.localStorage.getItem(`${TEXT_CHAT_DEBUG_FLAG_PREFIX}${name}`);
    return rawValue === "1" || rawValue === "true";
  } catch {
    return false;
  }
}

function readBatchUploadPreferences() {
  if (typeof window === "undefined") {
    return { groupItems: true, sendAsDocuments: false, rememberChoice: false };
  }

  try {
    const rawValue = window.localStorage.getItem(BATCH_UPLOAD_PREFERENCES_KEY);
    if (!rawValue) {
      return { groupItems: true, sendAsDocuments: false, rememberChoice: false };
    }

    const parsedValue = JSON.parse(rawValue);
    return {
      groupItems: parsedValue?.groupItems !== false,
      sendAsDocuments: Boolean(parsedValue?.sendAsDocuments),
      rememberChoice: true,
    };
  } catch {
    return { groupItems: true, sendAsDocuments: false, rememberChoice: false };
  }
}

function updateChannelMessagesState(previousState, channelId, updater) {
  const normalizedChannelId = String(channelId || "");
  if (!normalizedChannelId) {
    return previousState;
  }

  const currentChannelMessages = Array.isArray(previousState?.[normalizedChannelId])
    ? previousState[normalizedChannelId]
    : [];
  const nextChannelMessages = typeof updater === "function"
    ? updater(currentChannelMessages)
    : currentChannelMessages;

  if (nextChannelMessages === currentChannelMessages) {
    return previousState;
  }

  return {
    ...previousState,
    [normalizedChannelId]: nextChannelMessages,
  };
}

function getMessageSortTimestamp(messageItem, fallbackIndex = 0) {
  const rawTimestamp = messageItem?.timestamp || messageItem?.Timestamp || messageItem?.createdAt || messageItem?.CreatedAt || "";
  const parsedTimestamp = rawTimestamp ? new Date(rawTimestamp).getTime() : Number.NaN;
  return Number.isFinite(parsedTimestamp) ? parsedTimestamp : fallbackIndex;
}

function compareMessagesByTimeline(leftMessage, rightMessage) {
  const timestampDelta = getMessageSortTimestamp(leftMessage) - getMessageSortTimestamp(rightMessage);
  if (timestampDelta !== 0) {
    return timestampDelta;
  }

  return String(leftMessage?.id || "").localeCompare(String(rightMessage?.id || ""));
}

function trimChannelMessageWindow(messages, { maxMessages = 0, keep = "latest" } = {}) {
  const messageList = Array.isArray(messages) ? messages : [];
  const normalizedMaxMessages = Number(maxMessages) || 0;
  if (normalizedMaxMessages <= 0 || messageList.length <= normalizedMaxMessages) {
    return messageList;
  }

  return keep === "oldest"
    ? messageList.slice(0, normalizedMaxMessages)
    : messageList.slice(-normalizedMaxMessages);
}

function mergeChannelMessages(existingMessages, incomingMessages, options = {}) {
  const existingList = Array.isArray(existingMessages) ? existingMessages : [];
  const incomingList = Array.isArray(incomingMessages) ? incomingMessages : [];
  if (!incomingList.length) {
    return trimChannelMessageWindow(existingList, options);
  }

  const indexById = new Map();
  existingList.forEach((messageItem, index) => {
    const normalizedId = String(messageItem?.id || "").trim();
    if (normalizedId) {
      indexById.set(normalizedId, index);
    }
  });

  let didChange = false;
  let needsSort = false;
  const mergedMessages = [...existingList];
  const previousLastMessage = existingList[existingList.length - 1] || null;
  const currentUserId = String(options.currentUserId || "").trim();
  const onLocalEchoReplaced = typeof options.onLocalEchoReplaced === "function"
    ? options.onLocalEchoReplaced
    : null;

  incomingList.forEach((messageItem) => {
    const normalizedId = String(messageItem?.id || "").trim();
    if (!normalizedId) {
      mergedMessages.push(messageItem);
      needsSort = true;
      didChange = true;
      return;
    }

    const existingIndex = indexById.get(normalizedId);
    if (Number.isInteger(existingIndex)) {
      if (mergedMessages[existingIndex] !== messageItem) {
        mergedMessages[existingIndex] = messageItem;
        needsSort = true;
        didChange = true;
      }
      return;
    }

    const matchingLocalEchoIndex = currentUserId
      ? findMatchingLocalEchoMessageIndex(mergedMessages, messageItem, currentUserId)
      : -1;
    if (matchingLocalEchoIndex >= 0) {
      const replacedMessage = mergedMessages[matchingLocalEchoIndex];
      onLocalEchoReplaced?.(replacedMessage, messageItem);
      mergedMessages[matchingLocalEchoIndex] = messageItem;
      if (normalizedId) {
        indexById.set(normalizedId, matchingLocalEchoIndex);
      }
      needsSort = true;
      didChange = true;
      return;
    }

    indexById.set(normalizedId, mergedMessages.length);
    mergedMessages.push(messageItem);
    didChange = true;
    if (previousLastMessage && compareMessagesByTimeline(previousLastMessage, messageItem) > 0) {
      needsSort = true;
    }
  });

  if (!didChange) {
    return trimChannelMessageWindow(existingList, options);
  }

  const sortedMessages = needsSort
    ? mergedMessages.sort(compareMessagesByTimeline)
    : mergedMessages;

  return trimChannelMessageWindow(sortedMessages, options);
}

function parseTextChatClearCutoffMs(value) {
  const normalizedValue = String(value || "").trim();
  if (!normalizedValue) {
    return 0;
  }

  const parsedValue = Date.parse(normalizedValue);
  return Number.isFinite(parsedValue) ? parsedValue : 0;
}

function isMessageVisibleAfterLocalClear(messageItem, localClearCutoffMs = 0) {
  if (!localClearCutoffMs) {
    return true;
  }

  const rawTimestamp = messageItem?.timestamp || messageItem?.Timestamp || messageItem?.createdAt || messageItem?.CreatedAt || "";
  const parsedTimestamp = rawTimestamp ? Date.parse(rawTimestamp) : Number.NaN;
  if (Number.isFinite(parsedTimestamp)) {
    return parsedTimestamp > localClearCutoffMs;
  }

  return Boolean(messageItem?.isLocalEcho);
}

function filterMessagesAfterLocalClear(messages, localClearCutoffMs = 0) {
  const messageList = Array.isArray(messages) ? messages : [];
  if (!localClearCutoffMs) {
    return messageList;
  }

  return messageList.filter((messageItem) => isMessageVisibleAfterLocalClear(messageItem, localClearCutoffMs));
}

function buildLocalEchoAttachmentKey(attachmentItem, index = 0) {
  return [
    String(attachmentItem?.attachmentName || "").trim(),
    String(attachmentItem?.attachmentContentType || "").trim().toLowerCase(),
    Number(attachmentItem?.attachmentSize) || 0,
    Boolean(attachmentItem?.attachmentAsFile) ? 1 : 0,
    Number(attachmentItem?.voiceMessage?.durationMs || 0),
    index,
  ].join("::");
}

function buildLocalEchoSignatureFromParts({ message = "", replyToMessageId = "", attachments = [] } = {}) {
  return JSON.stringify({
    message: String(message || ""),
    replyToMessageId: String(replyToMessageId || "").trim(),
    attachments: (Array.isArray(attachments) ? attachments : []).map((attachmentItem, index) =>
      buildLocalEchoAttachmentKey(attachmentItem, index)
    ),
  });
}

function buildLocalEchoSignature(messageItem) {
  return buildLocalEchoSignatureFromParts({
    message: messageItem?.message || "",
    replyToMessageId: messageItem?.replyToMessageId || "",
    attachments: normalizeAttachmentItems(messageItem),
  });
}

function normalizeChatSystemEvent(rawEvent) {
  if (!rawEvent || typeof rawEvent !== "object") {
    return null;
  }

  const type = String(rawEvent.type || rawEvent.Type || "").trim();
  if (!type) {
    return null;
  }

  return {
    type,
    actorUserId: String(rawEvent.actorUserId || rawEvent.ActorUserId || "").trim(),
    actorDisplayName: String(rawEvent.actorDisplayName || rawEvent.ActorDisplayName || "").trim(),
    targetUserId: String(rawEvent.targetUserId || rawEvent.TargetUserId || "").trim(),
    targetDisplayName: String(rawEvent.targetDisplayName || rawEvent.TargetDisplayName || "").trim(),
    conversationTitle: String(rawEvent.conversationTitle || rawEvent.ConversationTitle || "").trim(),
    avatarUrl: String(rawEvent.avatarUrl || rawEvent.AvatarUrl || "").trim(),
  };
}

function findMatchingLocalEchoMessageIndex(channelMessages, incomingMessage, currentUserId) {
  const normalizedCurrentUserId = String(currentUserId || "");
  if (!normalizedCurrentUserId || String(incomingMessage?.authorUserId || "") !== normalizedCurrentUserId) {
    return -1;
  }

  const incomingClientTempId = String(incomingMessage?.clientTempId || "").trim();
  if (incomingClientTempId) {
    const clientTempMatchIndex = (Array.isArray(channelMessages) ? channelMessages : []).findIndex((messageItem) => (
      Boolean(messageItem?.isLocalEcho)
      && String(messageItem?.authorUserId || "") === normalizedCurrentUserId
      && String(messageItem?.clientTempId || "").trim() === incomingClientTempId
    ));
    if (clientTempMatchIndex >= 0) {
      return clientTempMatchIndex;
    }
  }

  const incomingSignature = buildLocalEchoSignature(incomingMessage);
  const messageList = Array.isArray(channelMessages) ? channelMessages : [];
  const exactMatchIndex = messageList.findIndex((messageItem) => (
    Boolean(messageItem?.isLocalEcho)
    && String(messageItem?.authorUserId || "") === normalizedCurrentUserId
    && String(messageItem?.localEchoSignature || buildLocalEchoSignature(messageItem)) === incomingSignature
  ));

  if (exactMatchIndex >= 0) {
    return exactMatchIndex;
  }

  const incomingAttachments = normalizeAttachmentItems(incomingMessage);
  const incomingMessageText = String(incomingMessage?.message || "");
  const incomingReplyId = String(incomingMessage?.replyToMessageId || "").trim();

  return messageList.findIndex((messageItem) => {
    if (!messageItem?.isLocalEcho || String(messageItem?.authorUserId || "") !== normalizedCurrentUserId) {
      return false;
    }

    const localAttachments = normalizeAttachmentItems(messageItem);
    return String(messageItem?.message || "") === incomingMessageText
      && String(messageItem?.replyToMessageId || "").trim() === incomingReplyId
      && localAttachments.length === incomingAttachments.length;
  });
}

function areReactionUsersEqual(leftUsers, rightUsers) {
  if (leftUsers === rightUsers) {
    return true;
  }

  if (!Array.isArray(leftUsers) || !Array.isArray(rightUsers) || leftUsers.length !== rightUsers.length) {
    return false;
  }

  for (let index = 0; index < leftUsers.length; index += 1) {
    const leftUser = leftUsers[index];
    const rightUser = rightUsers[index];
    if (
      String(leftUser?.userId || "") !== String(rightUser?.userId || "")
      || String(leftUser?.displayName || "") !== String(rightUser?.displayName || "")
      || String(leftUser?.avatarUrl || "") !== String(rightUser?.avatarUrl || "")
    ) {
      return false;
    }
  }

  return true;
}

function areNormalizedReactionsEqual(leftReactions, rightReactions) {
  if (leftReactions === rightReactions) {
    return true;
  }

  if (!Array.isArray(leftReactions) || !Array.isArray(rightReactions) || leftReactions.length !== rightReactions.length) {
    return false;
  }

  for (let index = 0; index < leftReactions.length; index += 1) {
    const leftReaction = leftReactions[index];
    const rightReaction = rightReactions[index];
    const leftReactorUserIds = Array.isArray(leftReaction?.reactorUserIds) ? leftReaction.reactorUserIds : [];
    const rightReactorUserIds = Array.isArray(rightReaction?.reactorUserIds) ? rightReaction.reactorUserIds : [];

    if (
      String(leftReaction?.key || "") !== String(rightReaction?.key || "")
      || String(leftReaction?.glyph || "") !== String(rightReaction?.glyph || "")
      || String(leftReaction?.label || "") !== String(rightReaction?.label || "")
      || String(leftReaction?.assetUrl || "") !== String(rightReaction?.assetUrl || "")
      || Number(leftReaction?.count || 0) !== Number(rightReaction?.count || 0)
      || leftReactorUserIds.length !== rightReactorUserIds.length
      || !leftReactorUserIds.every((userId, userIndex) => String(userId || "") === String(rightReactorUserIds[userIndex] || ""))
      || !areReactionUsersEqual(leftReaction?.users, rightReaction?.users)
    ) {
      return false;
    }
  }

  return true;
}

export default function TextChat({
  serverId,
  channelId,
  channelSlowMode = "off",
  user,
  resolvedChannelId = "",
  localMessageStateVersion = 0,
  searchQuery = "",
  directTargets = [],
  serverMembers = [],
  serverRoles = [],
  navigationRequest = null,
  onNavigationIndexChange = null,
  onOpenDirectChat = null,
  onStartDirectCall = null,
  onClearSearchQuery = null,
}) {
  const [message, setMessage] = useState("");
  const [messageEditState, setMessageEditState] = useState(null);
  const [messagesByChannel, setMessagesByChannel] = useState({});
  const [historyStateByChannel, setHistoryStateByChannel] = useState({});
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [batchUploadOptions, setBatchUploadOptions] = useState(() => readBatchUploadPreferences());
  const [mediaPreview, setMediaPreview] = useState(null);
  const [uploadingFile, setUploadingFile] = useState(false);
  const [composerDropActive, setComposerDropActive] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [isChannelReady, setIsChannelReady] = useState(false);
  const [localClearCutoffMs, setLocalClearCutoffMs] = useState(0);
  const [hiddenMessageIds, setHiddenMessageIds] = useState([]);
  const [composerEmojiPickerOpen, setComposerEmojiPickerOpen] = useState(false);
  const [mentionSuggestionsOpen, setMentionSuggestionsOpen] = useState(false);
  const [selectedMentionSuggestionIndex, setSelectedMentionSuggestionIndex] = useState(0);
  const [composerCaretPosition, setComposerCaretPosition] = useState(0);
  const [highlightedMessageId, setHighlightedMessageId] = useState("");
  const [messageContextMenu, setMessageContextMenu] = useState(null);
  const [userContextMenu, setUserContextMenu] = useState(null);
  const [profileModal, setProfileModal] = useState(null);
  const [reactionStickerPanelOpen, setReactionStickerPanelOpen] = useState(false);
  const [pinnedMessages, setPinnedMessages] = useState([]);
  const [replyState, setReplyState] = useState(null);
  const [actionFeedback, setActionFeedback] = useState(null);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedMessageIds, setSelectedMessageIds] = useState([]);
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
  const userContextMenuRef = useRef(null);
  const mediaPreviewVideoRef = useRef(null);
  const joinedChannelRef = useRef("");
  const activeChannelRef = useRef("");
  const messageRefs = useRef(new Map());
  const lastSendAtRef = useRef(0);
  const slowModeLastSendAtByChannelRef = useRef(new Map());
  const editDraftBackupRef = useRef("");
  const hasInitializedVisibleChannelRef = useRef(false);
  const composerDropDepthRef = useRef(0);
  const selectedFilesRef = useRef([]);
  const localEchoObjectUrlsByMessageIdRef = useRef(new Map());
  const markLocalEchoReconciledRef = useRef(null);
  const scopedChannelId = useMemo(() => {
    const normalizedResolvedChannelId = normalizeDirectMessageChannelId(resolvedChannelId);
    if (normalizedResolvedChannelId) {
      return normalizedResolvedChannelId;
    }

    return getScopedChatChannelId(serverId, channelId);
  }, [channelId, resolvedChannelId, serverId]);
  const currentUserId = String(user?.id || "");
  const isDirectChat = isDirectMessageChannelId(scopedChannelId);
  const channelSlowModeMs = getSlowModeDurationMs(channelSlowMode);
  const getSlowModeRemainingMs = useCallback((targetChannelId = scopedChannelId) => {
    if (isDirectChat || channelSlowModeMs <= 0 || String(targetChannelId || "") !== scopedChannelId) {
      return 0;
    }

    const lastSentAt = Number(slowModeLastSendAtByChannelRef.current.get(scopedChannelId) || 0);
    if (!lastSentAt) {
      return 0;
    }

    return Math.max(0, channelSlowModeMs - (Date.now() - lastSentAt));
  }, [channelSlowModeMs, isDirectChat, scopedChannelId]);
  const markSlowModeMessageSent = useCallback((targetChannelId = scopedChannelId) => {
    if (!isDirectChat && channelSlowModeMs > 0 && String(targetChannelId || "") === scopedChannelId) {
      slowModeLastSendAtByChannelRef.current.set(scopedChannelId, Date.now());
    }
  }, [channelSlowModeMs, isDirectChat, scopedChannelId]);
  const rawChannelMessages = messagesByChannel[scopedChannelId] || [];
  const hiddenMessageIdSet = useMemo(
    () => new Set((hiddenMessageIds || []).map((messageId) => String(messageId || ""))),
    [hiddenMessageIds]
  );
  const historyState = historyStateByChannel[scopedChannelId] || {
    hasMore: false,
    nextCursor: null,
    loading: false,
  };
  const messages = useMemo(
    () => filterMessagesAfterLocalClear(
      rawChannelMessages
        .filter((messageItem) => !isUnrecoverableLegacyEncryptedMessage(messageItem))
        .filter((messageItem) => !hiddenMessageIdSet.has(String(messageItem?.id || ""))),
      localClearCutoffMs
    ),
    [hiddenMessageIdSet, localClearCutoffMs, rawChannelMessages]
  );
  const disableCacheHydration = useMemo(
    () => readTextChatDebugFlag("disableCacheHydration"),
    []
  );

  useEffect(() => {
    activeChannelRef.current = scopedChannelId;
  }, [scopedChannelId]);

  useEffect(() => {
    setMessagesByChannel((previous) => {
      let didChange = false;
      const nextState = Object.fromEntries(
        Object.entries(previous || {}).map(([channelKey, channelMessages]) => {
          if (channelKey === scopedChannelId) {
            return [channelKey, channelMessages];
          }

          const nextChannelMessages = trimChannelMessageWindow(channelMessages, {
            maxMessages: MAX_BACKGROUND_CHANNEL_MESSAGES,
            keep: "latest",
          });
          if (nextChannelMessages !== channelMessages) {
            didChange = true;
          }

          return [channelKey, nextChannelMessages];
        })
      );

      return didChange ? nextState : previous;
    });
  }, [scopedChannelId]);

  useEffect(() => {
    if (!import.meta.env.DEV || !disableCacheHydration) {
      return;
    }

    console.info("[text-chat debug] cache hydration disabled");
  }, [disableCacheHydration]);

  useEffect(() => {
    if (!currentUserId || !scopedChannelId) {
      setLocalClearCutoffMs(0);
      setHiddenMessageIds([]);
      return;
    }

    const nextLocalClearCutoffMs = parseTextChatClearCutoffMs(
      readTextChatChannelClearedAt(currentUserId, scopedChannelId)
    );
    const nextHiddenMessageIds = readHiddenTextChatMessageIds(currentUserId, scopedChannelId);
    setLocalClearCutoffMs(nextLocalClearCutoffMs);
    setHiddenMessageIds(nextHiddenMessageIds);
    const hiddenMessageIdSet = new Set(nextHiddenMessageIds);

    if (!nextLocalClearCutoffMs && !hiddenMessageIdSet.size) {
      return;
    }

    setMessagesByChannel((previous) => updateChannelMessagesState(
      previous,
      scopedChannelId,
      (channelMessages) => filterMessagesAfterLocalClear(
        channelMessages.filter((messageItem) => !hiddenMessageIdSet.has(String(messageItem?.id || ""))),
        nextLocalClearCutoffMs
      )
    ));
    setPinnedMessages((previous) =>
      previous.filter((messageItem) =>
        !hiddenMessageIdSet.has(String(messageItem?.id || ""))
        && isMessageVisibleAfterLocalClear(messageItem, nextLocalClearCutoffMs)
      )
    );
    setSelectedMessageIds((previous) => previous.filter((messageId) => !hiddenMessageIdSet.has(String(messageId || ""))));
    setReplyState((current) =>
      hiddenMessageIdSet.has(String(current?.messageId || ""))
        ? null
        : current
    );
    setMessageEditState((current) =>
      hiddenMessageIdSet.has(String(current?.messageId || ""))
        ? null
        : current
    );
    setMessageContextMenu((current) =>
      hiddenMessageIdSet.has(String(current?.messageId || ""))
        ? null
        : current
    );
    setForwardModal((previous) => (
      previous.open
        ? {
          open: false,
            messageIds: [],
            targetIds: [],
            query: "",
            submitting: false,
        }
        : previous
    ));
  }, [currentUserId, localMessageStateVersion, scopedChannelId]);

  useEffect(() => {
    if (!currentUserId || !scopedChannelId || disableCacheHydration) {
      return;
    }

    const cacheTraceId = startPerfTrace("text-chat", "hydrate-channel-from-cache", {
      channelId: scopedChannelId,
    });
    const cachedMessages = readCachedTextChatMessages(currentUserId, scopedChannelId)
      .filter((messageItem) => !isUnrecoverableLegacyEncryptedMessage(messageItem))
      .filter((messageItem) => !hiddenMessageIdSet.has(String(messageItem?.id || "")))
      .filter((messageItem) => isMessageVisibleAfterLocalClear(messageItem, localClearCutoffMs));
    if (!cachedMessages.length) {
      finishPerfTrace(cacheTraceId, {
        channelId: scopedChannelId,
        cachedMessageCount: 0,
      });
      return;
    }

    setMessagesByChannel((previous) => updateChannelMessagesState(
      previous,
      scopedChannelId,
      (currentChannelMessages) => currentChannelMessages.length
        ? currentChannelMessages
        : cachedMessages
    ));
    finishPerfTrace(cacheTraceId, {
      channelId: scopedChannelId,
      cachedMessageCount: cachedMessages.length,
    });
  }, [currentUserId, disableCacheHydration, hiddenMessageIdSet, localClearCutoffMs, scopedChannelId]);

  useEffect(() => {
    if (!currentUserId || !scopedChannelId || disableCacheHydration) {
      return undefined;
    }

    const cacheableMessages = messages.filter((messageItem) => !messageItem?.isLocalEcho);
    if (!rawChannelMessages.length && !cacheableMessages.length) {
      return undefined;
    }

    const timeoutId = window.setTimeout(() => {
      writeCachedTextChatMessages(currentUserId, scopedChannelId, cacheableMessages);
    }, 250);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [currentUserId, disableCacheHydration, messages, rawChannelMessages.length, scopedChannelId]);

  useEffect(() => {
    selectedFilesRef.current = selectedFiles;
  }, [selectedFiles]);

  const revokeLocalEchoObjectUrls = useCallback((messageId) => {
    const normalizedMessageId = String(messageId || "");
    if (!normalizedMessageId) {
      return;
    }

    const objectUrls = localEchoObjectUrlsByMessageIdRef.current.get(normalizedMessageId) || [];
    objectUrls.forEach((objectUrl) => {
      if (!String(objectUrl || "").startsWith("blob:")) {
        return;
      }

      try {
        URL.revokeObjectURL(objectUrl);
      } catch {
        // Ignore local preview revocation failures.
      }
    });
    localEchoObjectUrlsByMessageIdRef.current.delete(normalizedMessageId);
  }, []);

  useEffect(() => () => {
    Array.from(localEchoObjectUrlsByMessageIdRef.current.keys()).forEach((messageId) => {
      revokeLocalEchoObjectUrls(messageId);
    });
  }, [revokeLocalEchoObjectUrls]);

  const patchLocalEchoMessage = useCallback((channelId, messageId, patchOrUpdater) => {
    const normalizedChannelId = String(channelId || "").trim();
    const normalizedMessageId = String(messageId || "").trim();
    if (!normalizedChannelId || !normalizedMessageId) {
      return;
    }

    setMessagesByChannel((previous) => updateChannelMessagesState(
      previous,
      normalizedChannelId,
      (channelMessages) => {
        let didChange = false;
        const nextChannelMessages = channelMessages.map((messageItem) => {
          if (String(messageItem?.id || "") !== normalizedMessageId) {
            return messageItem;
          }

          const nextMessage = typeof patchOrUpdater === "function"
            ? patchOrUpdater(messageItem)
            : { ...messageItem, ...(patchOrUpdater || {}) };
          if (nextMessage !== messageItem) {
            didChange = true;
          }
          return nextMessage;
        });

        return didChange ? nextChannelMessages : channelMessages;
      }
    ));
  }, []);

  const patchLocalEchoAttachment = useCallback((channelId, messageId, pendingUploadId, patchOrUpdater) => {
    const normalizedChannelId = String(channelId || "").trim();
    const normalizedMessageId = String(messageId || "").trim();
    const normalizedPendingUploadId = String(pendingUploadId || "").trim();
    if (!normalizedChannelId || !normalizedMessageId || !normalizedPendingUploadId) {
      return;
    }

    setMessagesByChannel((previous) => updateChannelMessagesState(
      previous,
      normalizedChannelId,
      (channelMessages) => {
        let didChange = false;
        const nextChannelMessages = channelMessages.map((messageItem) => {
          if (String(messageItem?.id || "") !== normalizedMessageId || !Array.isArray(messageItem?.attachments)) {
            return messageItem;
          }

          let attachmentsChanged = false;
          const nextAttachments = messageItem.attachments.map((attachmentItem) => {
            if (String(attachmentItem?.sourcePendingUploadId || "") !== normalizedPendingUploadId) {
              return attachmentItem;
            }

            const nextAttachment = typeof patchOrUpdater === "function"
              ? patchOrUpdater(attachmentItem)
              : { ...attachmentItem, ...(patchOrUpdater || {}) };
            if (nextAttachment !== attachmentItem) {
              attachmentsChanged = true;
            }
            return nextAttachment;
          });

          if (!attachmentsChanged) {
            return messageItem;
          }

          didChange = true;
          return {
            ...messageItem,
            attachments: nextAttachments,
          };
        });

        return didChange ? nextChannelMessages : channelMessages;
      }
    ));
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    if (batchUploadOptions.rememberChoice) {
      window.localStorage.setItem(
        BATCH_UPLOAD_PREFERENCES_KEY,
        JSON.stringify({
          groupItems: batchUploadOptions.groupItems !== false,
          sendAsDocuments: Boolean(batchUploadOptions.sendAsDocuments),
        })
      );
      return;
    }

    window.localStorage.removeItem(BATCH_UPLOAD_PREFERENCES_KEY);
  }, [batchUploadOptions]);
  const {
    virtualizationEnabled,
    visibleMessages,
    visibleStartIndex,
    topSpacerHeight,
    bottomSpacerHeight,
    registerMeasuredNode,
    estimateOffsetForMessageId,
  } = useTextChatVirtualizer({
    messages,
    messagesListRef,
  });

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

  useEffect(() => {
    if (!actionFeedback?.message) {
      return undefined;
    }

    const timeoutId = window.setTimeout(() => {
      setActionFeedback(null);
    }, 2200);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [actionFeedback]);

  const pinnedStorageKey = useMemo(() => getPinnedStorageKey(currentUserId, scopedChannelId), [currentUserId, scopedChannelId]);
  const selectedMessageIdSet = useMemo(() => new Set(selectedMessageIds.map((id) => String(id))), [selectedMessageIds]);
  const pinnedMessageIdSet = useMemo(() => new Set(pinnedMessages.map((item) => String(item.id))), [pinnedMessages]);
  const speechRecognitionSupported = useMemo(() => Boolean(getSpeechRecognitionConstructor()), []);
  const mentionQueryContext = useMemo(
    () => (!isDirectChat ? getMentionQueryContext(message, composerCaretPosition) : null),
    [composerCaretPosition, isDirectChat, message]
  );
  const deferredMentionQueryContext = useDeferredValue(mentionQueryContext);
  const mentionSuggestions = useMemo(() => {
    if (isDirectChat || !deferredMentionQueryContext) {
      return [];
    }

    const normalizedQuery = normalizeMentionAlias(deferredMentionQueryContext.query);
    const scoreMentionSuggestion = (normalizedHandle, normalizedName) => {
      if (!normalizedQuery) {
        return 0;
      }

      if (normalizedHandle === normalizedQuery || normalizedName === normalizedQuery) {
        return 0;
      }

      if (normalizedHandle.startsWith(normalizedQuery)) {
        return 1;
      }

      if (normalizedName.startsWith(normalizedQuery)) {
        return 2;
      }

      if (normalizedHandle.includes(normalizedQuery)) {
        return 3;
      }

      if (normalizedName.includes(normalizedQuery)) {
        return 4;
      }

      return -1;
    };

    const memberSuggestions = (serverMembers || [])
      .map((member) => {
        const handle = getMentionHandleForMember(member);
        const displayName = String(member?.name || "User").trim() || "User";
        const userId = String(member?.userId || member?.id || "").trim();
        const avatar = String(member?.avatar || member?.avatarUrl || "").trim();
        if (!handle || !userId) {
          return null;
        }

        const normalizedHandle = normalizeMentionAlias(handle);
        const normalizedName = normalizeMentionAlias(displayName);
        const score = scoreMentionSuggestion(normalizedHandle, normalizedName);
        if (score < 0) {
          return null;
        }

        return {
          type: "user",
          userId,
          handle,
          displayName,
          avatar,
          color: "",
          score,
        };
      })
      .filter(Boolean);

    const roleSuggestions = (serverRoles || [])
      .map((role) => {
        const roleId = String(role?.id || role?.roleId || role?.role_id || "").trim();
        const displayName = String(role?.name || role?.displayName || "Role").trim() || "Role";
        const handle = getMentionHandleForRole(role);
        const color = String(role?.color || role?.Color || role?.roleColor || role?.role_color || "").trim();
        if (!roleId || !handle) {
          return null;
        }

        const normalizedHandle = normalizeMentionAlias(handle);
        const normalizedName = normalizeMentionAlias(displayName);
        const score = scoreMentionSuggestion(normalizedHandle, normalizedName);
        if (score < 0) {
          return null;
        }

        return {
          type: "role",
          roleId,
          handle,
          displayName,
          avatar: "",
          color,
          score,
        };
      })
      .filter(Boolean);

    return [...memberSuggestions, ...roleSuggestions]
      .sort((left, right) =>
        left.score - right.score
        || Number(left.type === "role") - Number(right.type === "role")
        || left.displayName.localeCompare(right.displayName, "ru", { sensitivity: "base" })
      )
      .slice(0, 8);
  }, [deferredMentionQueryContext, isDirectChat, serverMembers, serverRoles]);

  const normalizeIncomingMessage = async (messageItem) => {
    const decrypted = await readIncomingMessageText(messageItem);
    const attachments = normalizeAttachmentItems(messageItem);
    const primaryAttachment = attachments[0] || null;
    const normalizedMentions = Array.isArray(messageItem?.mentions)
      ? messageItem.mentions
        .map((mention) => ({
          type: String(mention?.type || (mention?.roleId ? "role" : "user")).trim().toLowerCase() === "role" ? "role" : "user",
          userId: String(mention?.userId || ""),
          roleId: String(mention?.roleId || ""),
          handle: String(mention?.handle || ""),
          displayName: String(mention?.displayName || mention?.handle || "User"),
          color: String(mention?.color || ""),
        }))
        .filter((mention) => (mention.type === "role" ? mention.roleId : mention.userId) && mention.handle)
      : [];

    return {
      ...messageItem,
      clientTempId: String(messageItem?.clientTempId || messageItem?.ClientTempId || "").trim(),
      username: String(messageItem?.username || messageItem?.Username || messageItem?.name || messageItem?.Name || "User").trim() || "User",
      message: decrypted.text,
      systemEvent: normalizeChatSystemEvent(messageItem?.systemEvent || messageItem?.SystemEvent),
      encryption: null,
      attachments,
      attachmentEncryption: null,
      attachmentUrl: primaryAttachment?.attachmentUrl || messageItem?.attachmentUrl || messageItem?.AttachmentUrl || "",
      attachmentName: primaryAttachment?.attachmentName || messageItem?.attachmentName || messageItem?.AttachmentName || "",
      attachmentSize: primaryAttachment?.attachmentSize ?? messageItem?.attachmentSize ?? messageItem?.AttachmentSize ?? null,
      attachmentContentType: primaryAttachment?.attachmentContentType || messageItem?.attachmentContentType || messageItem?.AttachmentContentType || "",
      attachmentAsFile: Boolean(primaryAttachment?.attachmentAsFile || messageItem?.attachmentAsFile || messageItem?.AttachmentAsFile),
      voiceMessage: primaryAttachment?.voiceMessage || normalizeVoiceMessageMetadata(messageItem?.voiceMessage || messageItem?.VoiceMessage),
      editedAt: messageItem?.editedAt || messageItem?.EditedAt || null,
      replyToMessageId: String(messageItem?.replyToMessageId || messageItem?.ReplyToMessageId || "").trim(),
      replyToUsername: String(messageItem?.replyToUsername || messageItem?.ReplyToUsername || "").trim(),
      replyPreview: String(messageItem?.replyPreview || messageItem?.ReplyPreview || "").trim(),
      encryptionState: decrypted.encryptionState,
      reactions: normalizeReactions(messageItem?.reactions),
      mentions: normalizedMentions.length
        ? normalizedMentions
        : extractMentionsFromText(decrypted.text, serverMembers, serverRoles),
    };
  };

  const fetchMessageHistoryPage = useCallback(async (
    requestChannelId,
    { beforeMessageId = null, limit = TEXT_CHAT_HISTORY_PAGE_SIZE } = {}
  ) => {
    const normalizedChannelId = String(requestChannelId || "").trim();
    if (!normalizedChannelId) {
      return { items: [], hasMore: false, nextCursor: null };
    }

    if (!shouldUseRestTextChatHistoryEndpoint()) {
      return { items: [], hasMore: false, nextCursor: null, historyUnavailable: true };
    }

    const params = new URLSearchParams({
      limit: String(limit),
    });
    const numericBeforeMessageId = Number(beforeMessageId) || 0;
    if (numericBeforeMessageId > 0) {
      params.set("beforeMessageId", String(numericBeforeMessageId));
    }

    const response = await authFetch(`${API_BASE_URL}/chats/${encodeURIComponent(normalizedChannelId)}/messages?${params.toString()}`);
    const data = await parseApiResponse(response);

    if (response.status === 404) {
      return { items: [], hasMore: false, nextCursor: null, historyUnavailable: true };
    }

    if (!response.ok) {
      throw new Error(getApiErrorMessage(response, data, "Не удалось загрузить историю сообщений."));
    }

    const normalizedMessages = Array.isArray(data?.items)
      ? (await Promise.all(data.items.map((messageItem) => normalizeIncomingMessage(messageItem))))
        .filter((messageItem) => !isUnrecoverableLegacyEncryptedMessage(messageItem))
        .filter((messageItem) => isMessageVisibleAfterLocalClear(messageItem, localClearCutoffMs))
      : [];

    return {
      items: normalizedMessages,
      hasMore: Boolean(data?.hasMore) && !localClearCutoffMs,
      nextCursor: data?.nextCursor || null,
    };
  }, [localClearCutoffMs, serverMembers, serverRoles]);

  const updateHistoryState = useCallback((channelId, updater) => {
    const normalizedChannelId = String(channelId || "").trim();
    if (!normalizedChannelId) {
      return;
    }

    setHistoryStateByChannel((previous) => {
      const current = previous[normalizedChannelId] || {
        hasMore: false,
        nextCursor: null,
        loading: false,
      };
      const next = typeof updater === "function" ? updater(current) : updater;
      if (
        current.hasMore === next.hasMore
        && current.nextCursor === next.nextCursor
        && current.loading === next.loading
      ) {
        return previous;
      }

      return {
        ...previous,
        [normalizedChannelId]: next,
      };
    });
  }, []);

  const loadOlderMessages = useCallback(async () => {
    if (!scopedChannelId || localClearCutoffMs) {
      return;
    }

    const requestChannelId = scopedChannelId;
    const currentHistoryState = historyStateByChannel[requestChannelId] || {
      hasMore: false,
      nextCursor: null,
      loading: false,
    };
    if (!currentHistoryState.hasMore || currentHistoryState.loading) {
      return;
    }

    const fallbackCursor = messages
      .map((messageItem) => Number(messageItem?.id))
      .filter((messageId) => Number.isFinite(messageId) && messageId > 0)
      .sort((left, right) => left - right)[0] || null;
    const beforeMessageId = Number(currentHistoryState.nextCursor || fallbackCursor) || 0;
    if (!beforeMessageId) {
      updateHistoryState(requestChannelId, (current) => ({
        ...current,
        hasMore: false,
        loading: false,
      }));
      return;
    }

    updateHistoryState(requestChannelId, (current) => ({
      ...current,
      loading: true,
    }));

    try {
      const page = await fetchMessageHistoryPage(requestChannelId, {
        beforeMessageId,
        limit: TEXT_CHAT_HISTORY_PAGE_SIZE,
      });

      if (activeChannelRef.current !== requestChannelId) {
        updateHistoryState(requestChannelId, (current) => ({
          ...current,
          loading: false,
        }));
        return;
      }

      setMessagesByChannel((previous) => updateChannelMessagesState(
        previous,
        requestChannelId,
        (channelMessages) => mergeChannelMessages(channelMessages, page.items, {
          currentUserId,
          onLocalEchoReplaced: (localEchoMessage, serverMessage) => {
            revokeLocalEchoObjectUrls(localEchoMessage?.id);
            markLocalEchoReconciledRef.current?.(localEchoMessage, serverMessage);
          },
        })
      ));
      updateHistoryState(requestChannelId, () => ({
        hasMore: page.hasMore,
        nextCursor: page.nextCursor,
        loading: false,
      }));
    } catch (error) {
      updateHistoryState(requestChannelId, (current) => ({
        ...current,
        loading: false,
      }));
      if (activeChannelRef.current === requestChannelId) {
        setErrorMessage(error?.message || "Не удалось загрузить историю сообщений.");
      }
    }
  }, [fetchMessageHistoryPage, historyStateByChannel, localClearCutoffMs, messages, scopedChannelId, updateHistoryState]);

  const openUserContextMenu = (event, messageItem) => {
    event.preventDefault();
    event.stopPropagation();

    const userId = String(messageItem?.authorUserId || messageItem?.userId || "").trim();
    if (!userId) {
      return;
    }

    const matchedDirectTarget = directTargets.find((target) => String(target?.id || "") === userId) || null;
    const username = String(messageItem?.username || getUserName(matchedDirectTarget) || "User").trim() || "User";
    const avatarUrl = String(messageItem?.photoUrl || matchedDirectTarget?.avatar || matchedDirectTarget?.avatarUrl || "").trim();
    const avatarFrame = matchedDirectTarget?.avatarFrame || null;
    const backgroundUrl = String(matchedDirectTarget?.profileBackgroundUrl || matchedDirectTarget?.profile_background_url || "").trim();
    const backgroundFrame = matchedDirectTarget?.profileBackgroundFrame || matchedDirectTarget?.profile_background_frame || null;
    const isOnline = Boolean(matchedDirectTarget?.isOnline ?? matchedDirectTarget?.is_online ?? matchedDirectTarget?.online ?? false);
    const lastSeenAt = String(matchedDirectTarget?.lastSeenAt || matchedDirectTarget?.last_seen_at || matchedDirectTarget?.lastSeen || matchedDirectTarget?.last_seen || "").trim();
    const { x, y } = clampMenuPosition(event.clientX, event.clientY);

    setMessageContextMenu(null);
    setReactionStickerPanelOpen(false);
    setUserContextMenu({
      x,
      y,
      userId,
      username,
      avatarUrl,
      avatarFrame,
      backgroundUrl,
      backgroundFrame,
      isOnline,
      lastSeenAt,
      presence: matchedDirectTarget?.presence || matchedDirectTarget?.presenceStatus || matchedDirectTarget?.presence_status || "",
      isSelf: userId === currentUserId,
      isFriend: Boolean(matchedDirectTarget && !matchedDirectTarget?.isSelf),
      canOpenDirectChat: typeof onOpenDirectChat === "function" && userId !== currentUserId,
      canInviteToServer: Boolean(serverId),
    });
  };

  const closeUserContextMenu = () => {
    setUserContextMenu(null);
  };

  const closeProfileModal = () => {
    setProfileModal(null);
  };

  const handleCopyUserId = async () => {
    if (!userContextMenu?.userId) {
      return;
    }

    try {
      await copyTextToClipboard(userContextMenu.userId);
      setActionFeedback({ tone: "success", message: "ID пользователя скопирован" });
      setUserContextMenu(null);
    } catch {
      setErrorMessage("Не удалось скопировать ID пользователя.");
    }
  };

  const handleOpenDirectChatFromUserMenu = () => {
    if (!userContextMenu?.userId || typeof onOpenDirectChat !== "function" || userContextMenu.isSelf) {
      return;
    }

    onOpenDirectChat(userContextMenu.userId);
    setActionFeedback({ tone: "info", message: `Открываем чат с ${userContextMenu.username}` });
    setUserContextMenu(null);
  };

  const handleStartDirectCallFromUserMenu = () => {
    if (!userContextMenu?.userId || typeof onStartDirectCall !== "function" || userContextMenu.isSelf) {
      return;
    }

    onStartDirectCall(userContextMenu.userId);
    setActionFeedback({ tone: "info", message: `Запускаем звонок с ${userContextMenu.username}` });
    setUserContextMenu(null);
  };

  const handleOpenDirectChatFromProfileModal = () => {
    if (!profileModal?.userId || typeof onOpenDirectChat !== "function" || profileModal.isSelf) {
      return;
    }

    onOpenDirectChat(profileModal.userId);
    setActionFeedback({ tone: "info", message: `Открываем чат с ${profileModal.username}` });
    setProfileModal(null);
  };

  const handleStartDirectCallFromProfileModal = () => {
    if (!profileModal?.userId || typeof onStartDirectCall !== "function" || profileModal.isSelf) {
      return;
    }

    onStartDirectCall(profileModal.userId);
    setActionFeedback({ tone: "info", message: `Запускаем звонок с ${profileModal.username}` });
    setProfileModal(null);
  };

  const handleAddFriendFromUserMenu = async () => {
    if (!userContextMenu?.userId || userContextMenu.isSelf || userContextMenu.isFriend) {
      return;
    }

    try {
      const response = await authFetch(`${API_BASE_URL}/friends/add`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: Number(userContextMenu.userId) }),
      });
      const data = await parseApiResponse(response);

      if (!response.ok) {
        throw new Error(getApiErrorMessage(response, data, "Не удалось отправить заявку в друзья."));
      }

      const status = String(data?.status || "").trim().toLowerCase();
      const nextMessage =
        status === "already_friends"
          ? "Этот пользователь уже у вас в друзьях"
          : status === "already_requested"
            ? "Заявка уже отправлена"
            : status === "auto_accepted"
              ? "Друг добавлен автоматически"
              : "Заявка в друзья отправлена";

      setActionFeedback({ tone: "success", message: nextMessage });
      setUserContextMenu(null);
    } catch (error) {
      setErrorMessage(error?.message || "Не удалось отправить заявку в друзья.");
    }
  };

  const handleAddFriendFromProfileModal = async () => {
    if (!profileModal?.userId || profileModal.isSelf || profileModal.isFriend) {
      return;
    }

    try {
      const response = await authFetch(`${API_BASE_URL}/friends/add`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: Number(profileModal.userId) }),
      });
      const data = await parseApiResponse(response);

      if (!response.ok) {
        throw new Error(getApiErrorMessage(response, data, "Не удалось отправить заявку в друзья."));
      }

      const status = String(data?.status || "").trim().toLowerCase();
      const nextMessage =
        status === "already_friends"
          ? "Этот пользователь уже у вас в друзьях"
          : status === "already_requested"
            ? "Заявка уже отправлена"
            : status === "auto_accepted"
              ? "Друг добавлен автоматически"
              : "Заявка в друзья отправлена";

      setActionFeedback({ tone: "success", message: nextMessage });
      setProfileModal((current) => (current ? { ...current, isFriend: true } : current));
    } catch (error) {
      setErrorMessage(error?.message || "Не удалось отправить заявку в друзья.");
    }
  };

  const handleCopyUserIdFromProfileModal = async () => {
    if (!profileModal?.userId) {
      return;
    }

    try {
      await copyTextToClipboard(profileModal.userId);
      setActionFeedback({ tone: "success", message: "ID пользователя скопирован" });
    } catch {
      setErrorMessage("Не удалось скопировать ID пользователя.");
    }
  };

  const handleOpenProfileFromUserMenu = () => {
    if (!userContextMenu) {
      return;
    }

    setProfileModal({
      userId: userContextMenu.userId,
      username: userContextMenu.username,
      avatarUrl: userContextMenu.avatarUrl,
      avatarFrame: userContextMenu.avatarFrame || null,
      backgroundUrl: userContextMenu.backgroundUrl || "",
      backgroundFrame: userContextMenu.backgroundFrame || null,
      isOnline: userContextMenu.isOnline,
      lastSeenAt: userContextMenu.lastSeenAt || "",
      presence: userContextMenu.presence || "",
      isSelf: userContextMenu.isSelf,
      isFriend: userContextMenu.isFriend,
      canOpenDirectChat: userContextMenu.canOpenDirectChat,
    });
    setUserContextMenu(null);
  };

  const handleUserMenuPlaceholder = (message) => {
    setActionFeedback({ tone: "info", message });
    setUserContextMenu(null);
  };

  let userContextMenuSections = [
    [
      {
        id: "profile",
        label: "Профиль",
        icon: "◧",
        disabled: false,
        onClick: () => handleUserMenuPlaceholder("Полный профиль пользователя добьём следующим шагом."),
      },
      {
        id: "direct-chat",
        label: "Начать чат",
        icon: "✉",
        disabled: !userContextMenu?.canOpenDirectChat,
        onClick: handleOpenDirectChatFromUserMenu,
      },
      {
        id: "direct-call",
        label: "Позвонить",
        icon: "☎",
        disabled: Boolean(userContextMenu?.isSelf || typeof onStartDirectCall !== "function"),
        onClick: handleStartDirectCallFromUserMenu,
      },
    ],
    [
      {
        id: "invite",
        label: "Пригласить на сервер",
        icon: "↗",
        disabled: !userContextMenu?.canInviteToServer,
        onClick: () => handleUserMenuPlaceholder("Приглашение с этого меню подключу следующим проходом."),
      },
      {
        id: "friend",
        label: userContextMenu?.isFriend ? "Уже в друзьях" : "Добавить в друзья",
        icon: "＋",
        disabled: Boolean(userContextMenu?.isSelf || userContextMenu?.isFriend),
        onClick: handleAddFriendFromUserMenu,
      },
      {
        id: "ignore",
        label: "Игнорировать",
        icon: "◌",
        disabled: false,
        onClick: () => handleUserMenuPlaceholder("Игнор-лист добавим отдельным серверным действием."),
      },
      {
        id: "block",
        label: "Заблокировать",
        icon: "⛔",
        danger: true,
        disabled: false,
        onClick: () => handleUserMenuPlaceholder("Блокировку пользователя тоже подключу отдельным серверным действием."),
      },
    ],
    [
      {
        id: "copy-id",
        label: "Копировать ID пользователя",
        icon: "ID",
        disabled: false,
        onClick: handleCopyUserId,
      },
    ],
  ];
  if (userContextMenuSections[0]?.[0]) {
    userContextMenuSections[0][0].onClick = handleOpenProfileFromUserMenu;
  }
  if (userContextMenu?.isSelf) {
    userContextMenuSections[1] = [];
  } else if (userContextMenu?.isFriend) {
    userContextMenuSections[1] = userContextMenuSections[1].filter((action) => action.id !== "friend");
  }
  userContextMenuSections = userContextMenuSections.filter((section) => section.length > 0);

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
      setComposerCaretPosition(nextLength);
    });
  };

  const stopReplyingToMessage = () => {
    setReplyState(null);
  };

  const syncComposerSelection = useCallback((textareaLike = null) => {
    const textarea = textareaLike?.selectionStart != null ? textareaLike : textareaRef.current;
    if (!textarea) {
      return;
    }

    const nextSelection = {
      start: Number(textarea.selectionStart || 0),
      end: Number(textarea.selectionEnd || 0),
    };
    composerSelectionRef.current = nextSelection;
    setComposerCaretPosition((current) => (current === nextSelection.start ? current : nextSelection.start));
  }, []);

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
      setComposerCaretPosition(nextCaretPosition);
    });
  };

  const insertMentionSuggestion = (suggestion, explicitQueryContext = null) => {
    if (!suggestion?.handle) {
      return;
    }

    const currentValue = String(textareaRef.current?.value || message || "");
    const fallbackStart = Number(textareaRef.current?.selectionStart ?? composerSelectionRef.current.start ?? currentValue.length);
    const fallbackEnd = Number(textareaRef.current?.selectionEnd ?? composerSelectionRef.current.end ?? currentValue.length);
    const activeQueryContext = explicitQueryContext || getMentionQueryContext(currentValue, fallbackStart);
    const mentionText = `@${suggestion.handle} `;
    const replaceStart = activeQueryContext ? activeQueryContext.triggerIndex : fallbackStart;
    const replaceEnd = activeQueryContext ? activeQueryContext.tokenEnd : fallbackEnd;
    const nextValue = `${currentValue.slice(0, replaceStart)}${mentionText}${currentValue.slice(replaceEnd)}`;
    const nextCaretPosition = replaceStart + mentionText.length;
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
      setComposerCaretPosition(nextCaretPosition);
    });
  };

  const applyMentionSuggestion = useCallback((suggestion) => {
    insertMentionSuggestion(suggestion, mentionQueryContext);
  }, [mentionQueryContext]);

  const handleInsertMentionByUserId = useCallback((userId, displayName = "") => {
    if (isDirectChat) {
      return;
    }

    const normalizedUserId = String(userId || "").trim();
    if (!normalizedUserId) {
      return;
    }

    const matchedMember = (serverMembers || []).find((member) => String(member?.userId || member?.id || "") === normalizedUserId);
    const handle = getMentionHandleForMember(matchedMember || { name: displayName });
    if (!handle) {
      return;
    }

    insertMentionSuggestion({
      type: "user",
      userId: normalizedUserId,
      handle,
      displayName: String(displayName || matchedMember?.name || "User").trim() || "User",
      avatar: String(matchedMember?.avatar || matchedMember?.avatarUrl || "").trim(),
    });
  }, [isDirectChat, serverMembers]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return undefined;
    }

    const handleExternalMentionInsert = (event) => {
      const detail = event?.detail || {};
      if (String(detail?.type || "user") !== "user") {
        return;
      }

      handleInsertMentionByUserId(detail?.userId, detail?.displayName || "");
    };

    window.addEventListener(TEXT_CHAT_INSERT_MENTION_EVENT, handleExternalMentionInsert);
    return () => {
      window.removeEventListener(TEXT_CHAT_INSERT_MENTION_EVENT, handleExternalMentionInsert);
    };
  }, [handleInsertMentionByUserId]);

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

  useTextChatComposerPopovers({
    composerEmojiPickerOpen,
    setComposerEmojiPickerOpen,
    composerEmojiPickerRef,
    composerEmojiButtonRef,
    mentionSuggestionsOpen,
    setMentionSuggestionsOpen,
    mentionSuggestionsRef,
    textareaRef,
    mentionSuggestions,
    mentionQueryContext,
    setSelectedMentionSuggestionIndex,
    scopedChannelId,
  });

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
    editDraftBackupRef.current = "";
    let cancelled = false;

    deferEffectState(() => {
      if (cancelled) {
        return;
      }

      setPinnedMessages(readPinnedMessages(pinnedStorageKey));
      setActionFeedback(null);
      setReplyState(null);
      setSelectionMode(false);
      setSelectedMessageIds([]);
      setMessageEditState(null);
      setForwardModal({
        open: false,
        messageIds: [],
        targetIds: [],
        query: "",
        submitting: false,
      });
    });

    return () => {
      cancelled = true;
    };
  }, [pinnedStorageKey]);

  useEffect(() => {
    writePinnedMessages(pinnedStorageKey, pinnedMessages);
  }, [pinnedMessages, pinnedStorageKey]);

  useEffect(() => {
    let cancelled = false;

    const applyDraft = (nextMessage) => {
      deferEffectState(() => {
        if (cancelled) {
          return;
        }

        setMessageEditState(null);
        setMessage(nextMessage);
      });
    };

    if (!user || !scopedChannelId) {
      editDraftBackupRef.current = "";
      applyDraft("");
      return () => {
        cancelled = true;
      };
    }

    editDraftBackupRef.current = "";
    applyDraft(readChatDraft(user, scopedChannelId));

    return () => {
      cancelled = true;
    };
  }, [scopedChannelId, user]);

  useEffect(() => {
    if (!user || !scopedChannelId || messageEditState) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      writeChatDraft(user, scopedChannelId, message);
    }, 180);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [message, messageEditState, scopedChannelId, user]);

  const ensureChannelJoined = async () => {
    const joinTraceId = startPerfTrace("text-chat", "join-channel", {
      channelId: scopedChannelId,
    });
    const connection = await startChatConnection();
    if (!connection) {
      throw new Error("Сессия недействительна. Войдите снова.");
    }

    if (joinedChannelRef.current === scopedChannelId) {
      finishPerfTrace(joinTraceId, {
        channelId: scopedChannelId,
        success: true,
        reused: true,
      });
      return;
    }

    const requestChannelId = scopedChannelId;
    const latestPagePromise = fetchMessageHistoryPage(requestChannelId, { limit: TEXT_CHAT_HISTORY_PAGE_SIZE });
    await chatConnection.invoke("JoinChannel", requestChannelId);
    joinedChannelRef.current = requestChannelId;
    const latestPage = await latestPagePromise;

    if (activeChannelRef.current !== requestChannelId) {
      chatConnection.invoke("LeaveChannel", requestChannelId).catch(() => {});
      if (joinedChannelRef.current === requestChannelId) {
        joinedChannelRef.current = "";
      }
      finishPerfTrace(joinTraceId, {
        channelId: requestChannelId,
        success: false,
        stale: true,
      });
      return;
    }

    joinedChannelRef.current = requestChannelId;
    setIsChannelReady(true);
    hasInitializedVisibleChannelRef.current = true;
    setMessagesByChannel((previous) => updateChannelMessagesState(
      previous,
      requestChannelId,
      (currentChannelMessages) => mergeChannelMessages(
        currentChannelMessages,
        latestPage.items,
        {
          maxMessages: MAX_ACTIVE_CHANNEL_MESSAGES,
          keep: "latest",
          currentUserId,
          onLocalEchoReplaced: (localEchoMessage, serverMessage) => {
            revokeLocalEchoObjectUrls(localEchoMessage?.id);
            markLocalEchoReconciledRef.current?.(localEchoMessage, serverMessage);
          },
        }
      )
    ));
    updateHistoryState(requestChannelId, () => ({
      hasMore: latestPage.hasMore,
      nextCursor: latestPage.nextCursor,
      loading: false,
    }));
    finishPerfTrace(joinTraceId, {
      channelId: requestChannelId,
      success: true,
      messageCount: latestPage.items.length,
    });

    if (isDirectChat) {
      chatConnection.invoke("MarkChannelRead", requestChannelId).catch(() => {});
    }
  };

  useEffect(() => {
    if (!scopedChannelId) {
      joinedChannelRef.current = "";
      hasInitializedVisibleChannelRef.current = false;
      let cancelled = false;
      deferEffectState(() => {
        if (!cancelled) {
          setIsChannelReady(false);
        }
      });
      return () => {
        cancelled = true;
      };
    }

    let isMounted = true;

    const handleReceiveMessage = (nextMessage) => {
      if (String(nextMessage?.channelId || scopedChannelId) !== String(scopedChannelId)) {
        return;
      }

      void (async () => {
        const normalizedMessage = await normalizeIncomingMessage(nextMessage);
        if (!isMounted) {
          return;
        }
        if (isUnrecoverableLegacyEncryptedMessage(normalizedMessage)) {
          return;
        }

        setMessagesByChannel((previous) => updateChannelMessagesState(previous, scopedChannelId, (channelMessages) => {
          if (channelMessages.some((messageItem) => String(messageItem.id) === String(normalizedMessage.id))) {
            return channelMessages;
          }

          const matchingLocalEchoIndex = findMatchingLocalEchoMessageIndex(channelMessages, normalizedMessage, currentUserId);
          if (matchingLocalEchoIndex >= 0) {
            const nextChannelMessages = [...channelMessages];
            const replacedMessage = nextChannelMessages[matchingLocalEchoIndex];
            revokeLocalEchoObjectUrls(replacedMessage?.id);
            markLocalEchoReconciledRef.current?.(replacedMessage, normalizedMessage);
            nextChannelMessages[matchingLocalEchoIndex] = normalizedMessage;
            return trimChannelMessageWindow(nextChannelMessages, {
              maxMessages: MAX_ACTIVE_CHANNEL_MESSAGES,
              keep: "latest",
            });
          }

          return trimChannelMessageWindow([...channelMessages, normalizedMessage], {
            maxMessages: MAX_ACTIVE_CHANNEL_MESSAGES,
            keep: "latest",
          });
        }));

        if (isDirectChat && String(nextMessage?.authorUserId || "") !== String(currentUserId)) {
          playDirectMessageSound("receive");
          chatConnection.invoke("MarkChannelRead", scopedChannelId).catch(() => {});
        }
      })();
    };

    const handleMessageDeleted = (deletedId) => {
      const normalizedDeletedId = String(deletedId || "");
      if (String(messageEditState?.messageId || "") === String(deletedId)) {
        stopEditingMessage();
      }

      setReplyState((current) => (String(current?.messageId || "") === String(deletedId) ? null : current));

      setMessageContextMenu((current) => (String(current?.messageId || "") === String(deletedId) ? null : current));
      setPinnedMessages((previous) => previous.filter((item) => String(item.id) !== String(deletedId)));
      setSelectedMessageIds((previous) => previous.filter((itemId) => String(itemId) !== String(deletedId)));
      setHiddenMessageIds((previous) => {
        if (!previous.includes(normalizedDeletedId)) {
          return previous;
        }

        const nextMessageIds = previous.filter((messageId) => String(messageId || "") !== normalizedDeletedId);
        writeHiddenTextChatMessageIds(currentUserId, scopedChannelId, nextMessageIds);
        return nextMessageIds;
      });
      setForwardModal((previous) =>
        previous.open
          ? {
              ...previous,
              messageIds: previous.messageIds.filter((itemId) => String(itemId) !== String(deletedId)),
            }
          : previous
      );
      setMessagesByChannel((previous) => updateChannelMessagesState(previous, scopedChannelId, (channelMessages) => {
        const nextChannelMessages = channelMessages.filter((item) => item.id !== deletedId);
        return nextChannelMessages.length === channelMessages.length ? channelMessages : nextChannelMessages;
      }));
    };

    const handleMessageUpdated = (updatedMessage) => {
      if (String(updatedMessage?.channelId || scopedChannelId) !== String(scopedChannelId)) {
        return;
      }

      void (async () => {
        const normalizedMessage = await normalizeIncomingMessage(updatedMessage);
        if (!isMounted) {
          return;
        }
        if (isUnrecoverableLegacyEncryptedMessage(normalizedMessage)) {
          setMessagesByChannel((previous) => updateChannelMessagesState(previous, scopedChannelId, (channelMessages) =>
            channelMessages.filter((messageItem) => String(messageItem.id) !== String(updatedMessage?.id || updatedMessage?.Id || ""))
          ));
          return;
        }

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

        setMessagesByChannel((previous) => updateChannelMessagesState(previous, scopedChannelId, (channelMessages) => {
          let didChange = false;
          const nextChannelMessages = channelMessages.map((messageItem) => {
            if (String(messageItem.id) !== String(normalizedMessage.id)) {
              return messageItem;
            }

            if (messageItem === normalizedMessage) {
              return messageItem;
            }

            didChange = true;
            return normalizedMessage;
          });

          return didChange ? nextChannelMessages : channelMessages;
        }));
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

      setMessagesByChannel((previous) => updateChannelMessagesState(previous, scopedChannelId, (channelMessages) => {
        let didChange = false;
        const nextChannelMessages = channelMessages.map((messageItem) => {
          if (!readMessageIds.has(String(messageItem.id))) {
            return messageItem;
          }

          const nextReadAt = payload?.readAt || messageItem.readAt || null;
          const nextReadByUserId = payload?.readerUserId || messageItem.readByUserId || null;
          if (messageItem.isRead && messageItem.readAt === nextReadAt && messageItem.readByUserId === nextReadByUserId) {
            return messageItem;
          }

          didChange = true;
          return {
            ...messageItem,
            isRead: true,
            readAt: nextReadAt,
            readByUserId: nextReadByUserId,
          };
        });

        return didChange ? nextChannelMessages : channelMessages;
      }));
    };

    const handleMessageReactionsUpdated = (payload) => {
      const messageId = String(payload?.messageId || "");
      if (!messageId) {
        return;
      }

      setMessagesByChannel((previous) => updateChannelMessagesState(previous, scopedChannelId, (channelMessages) => {
        const nextReactions = normalizeReactions(payload?.reactions);
        let didChange = false;
        const nextChannelMessages = channelMessages.map((messageItem) => {
          if (String(messageItem.id) !== messageId) {
            return messageItem;
          }

          if (areNormalizedReactionsEqual(messageItem.reactions, nextReactions)) {
            return messageItem;
          }

          didChange = true;
          return {
            ...messageItem,
            reactions: nextReactions,
          };
        });

        return didChange ? nextChannelMessages : channelMessages;
      }));
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

        if (joinedChannelRef.current === scopedChannelId) {
          chatConnection.invoke("LeaveChannel", scopedChannelId).catch(() => {});
          joinedChannelRef.current = "";
        }
        setIsChannelReady(false);
        setMessagesByChannel((previous) => updateChannelMessagesState(previous, scopedChannelId, previous[scopedChannelId] || []));
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
  }, [currentUserId, isDirectChat, messageEditState?.messageId, revokeLocalEchoObjectUrls, scopedChannelId]);

  useEffect(() => {
    const handleProfileUpdated = (payload) => {
      const updatedUserId = String(payload?.userId || "");
      if (!updatedUserId) {
        return;
      }

      const nextFirstName = String(payload?.first_name || payload?.firstName || "").trim();
      const nextLastName = String(payload?.last_name || payload?.lastName || "").trim();
      const nextNickname = String(payload?.nickname || payload?.nick_name || "").trim();
      const nextAvatar = String(payload?.avatar_url || payload?.avatarUrl || payload?.avatar || "").trim();
      const nextUsername = nextNickname || `${nextFirstName} ${nextLastName}`.trim();

      setMessagesByChannel((previous) => {
        const nextState = Object.entries(previous || {}).reduce((accumulator, [channelKey, channelMessages]) => {
          if (!Array.isArray(channelMessages)) {
            accumulator[channelKey] = channelMessages;
            return accumulator;
          }

          let didChange = false;
          const nextChannelMessages = channelMessages.map((messageItem) => {
            if (String(messageItem?.authorUserId || "") !== updatedUserId) {
              return messageItem;
            }

            const resolvedUsername = nextUsername || messageItem.username || "User";
            const resolvedPhotoUrl = nextAvatar || messageItem.photoUrl || "";
            if (messageItem.username === resolvedUsername && String(messageItem.photoUrl || "") === resolvedPhotoUrl) {
              return messageItem;
            }

            didChange = true;
            return {
              ...messageItem,
              username: resolvedUsername,
              photoUrl: resolvedPhotoUrl,
            };
          });

          accumulator[channelKey] = didChange ? nextChannelMessages : channelMessages;
          return accumulator;
        }, {});

        const previousEntries = Object.entries(previous || {});
        const hasAnyChange = previousEntries.some(([channelKey]) => nextState[channelKey] !== previous[channelKey]);
        return hasAnyChange ? nextState : previous;
      });
    };

    chatConnection.on("ProfileUpdated", handleProfileUpdated);

    return () => {
      chatConnection.off("ProfileUpdated", handleProfileUpdated);
    };
  }, []);

  const uploadAttachment = uploadChatAttachment;
  const sendMessagesCompat = async (targetChannelId, avatar, payload, { allowBatch = true } = {}) => {
    const slowModeRemainingMs = getSlowModeRemainingMs(targetChannelId);
    if (slowModeRemainingMs > 0) {
      throw new Error(formatSlowModeRemainingMessage(slowModeRemainingMs));
    }

    await sendMessagesCompatCore({
      targetChannelId,
      avatar,
      payload,
      user,
      allowBatch,
    });
    markSlowModeMessageSent(targetChannelId);
  };

  const {
    voiceRecordingState,
    voiceRecordingDurationMs,
    voiceMicLevel,
    speechRecognitionActive,
    speechMicLevel,
    speechCaptureState,
    stopSpeechRecognition,
    handleVoiceRecordPointerDown,
    handleVoiceRecordPointerMove,
    handleVoiceRecordPointerUp,
    handleVoiceRecordPointerCancel,
    handleSpeechRecognitionPointerDown,
    handleSpeechRecognitionPointerMove,
    handleSpeechRecognitionPointerUp,
    handleSpeechRecognitionPointerCancel,
    handleCancelVoiceRecording,
    handleSpeechRecognitionToggle,
  } = useTextChatVoiceSpeech({
    user,
    scopedChannelId,
    message,
    setMessage,
    textareaRef,
    uploadingFile,
    setUploadingFile,
    setErrorMessage,
    setActionFeedback,
    setIsChannelReady,
    lastSendAtRef,
    ensureChannelJoined,
    uploadAttachment,
    sendMessagesCompat,
    isDirectChat,
    playDirectMessageSound,
  });

  const appendLocalEchoMessages = useCallback(({
    channelId = "",
    descriptors = [],
  } = {}) => {
    const normalizedChannelId = String(channelId || scopedChannelId || "").trim();
    if (!normalizedChannelId || !currentUserId) {
      return [];
    }

    const startedAt = Date.now();
    const username = String(getUserName(user) || "User").trim() || "User";
    const photoUrl = String(user?.avatarUrl || user?.avatar || "").trim();
    const createLocalEchoAttachment = (attachmentDraft, attachmentIndex = 0) => {
      const file = attachmentDraft?.file instanceof File ? attachmentDraft.file : null;
      let attachmentUrl = "";

      if (file instanceof File) {
        try {
          attachmentUrl = URL.createObjectURL(file);
        } catch {
          attachmentUrl = "";
        }
      }

      return {
        id: `${String(attachmentDraft?.id || attachmentDraft?.uploadId || "attachment")}:${attachmentIndex}`,
        attachmentUrl,
        attachmentName: String(attachmentDraft?.name || file?.name || "attachment").trim() || "attachment",
        attachmentSize: Number(attachmentDraft?.size || file?.size || 0) || null,
        attachmentContentType: String(attachmentDraft?.type || file?.type || "application/octet-stream").trim(),
        attachmentAsFile: Boolean(attachmentDraft?.attachmentAsFile),
        attachmentEncryption: null,
        voiceMessage: null,
        sourcePendingUploadId: String(attachmentDraft?.uploadId || ""),
        localEchoProgress: 0,
        localEchoUploadedBytes: 0,
        localEchoTotalBytes: Number(attachmentDraft?.size || file?.size || 0) || 0,
        localEchoStatus: "pending",
        localEchoRetryable: false,
        localEchoError: "",
      };
    };
    const optimisticMessages = (Array.isArray(descriptors) ? descriptors : []).map((descriptor, index) => {
      const localAttachments = Array.isArray(descriptor?.attachments)
        ? descriptor.attachments.map((attachmentDraft, attachmentIndex) =>
            createLocalEchoAttachment(attachmentDraft, attachmentIndex)
          )
        : [];
      const messageId = `${LOCAL_ECHO_ID_PREFIX}${normalizedChannelId}:${startedAt}:${index}:${Math.random().toString(16).slice(2, 8)}`;
      const descriptorForSignature = {
        ...descriptor,
        attachments: localAttachments,
      };
      const objectUrls = localAttachments
        .map((attachmentItem) => attachmentItem.attachmentUrl)
        .filter((attachmentUrl) => String(attachmentUrl || "").startsWith("blob:"));

      if (objectUrls.length) {
        localEchoObjectUrlsByMessageIdRef.current.set(messageId, objectUrls);
      }

      const primaryAttachment = localAttachments[0] || null;
      return {
        id: messageId,
        channelId: normalizedChannelId,
        clientTempId: String(descriptor?.clientTempId || "").trim(),
        authorUserId: currentUserId,
        username,
        photoUrl,
        timestamp: new Date(startedAt + index).toISOString(),
        message: descriptor.message,
        encryption: null,
        attachments: localAttachments,
        attachmentEncryption: null,
        attachmentUrl: primaryAttachment?.attachmentUrl || "",
        attachmentName: primaryAttachment?.attachmentName || "",
        attachmentSize: primaryAttachment?.attachmentSize ?? null,
        attachmentContentType: primaryAttachment?.attachmentContentType || "",
        attachmentAsFile: Boolean(primaryAttachment?.attachmentAsFile),
        voiceMessage: null,
        editedAt: null,
        replyToMessageId: descriptor.replyToMessageId,
        replyToUsername: descriptor.replyToUsername,
        replyPreview: descriptor.replyPreview,
        encryptionState: "plain",
        reactions: [],
        mentions: descriptor.mentions,
        isRead: false,
        isLocalEcho: true,
        localEchoUploadState: "pending",
        localEchoRetryable: false,
        localEchoError: "",
        localEchoSignature: buildLocalEchoSignatureFromParts(descriptorForSignature),
      };
    });

    if (!optimisticMessages.length) {
      return [];
    }

    setMessagesByChannel((previous) => updateChannelMessagesState(
      previous,
      normalizedChannelId,
      (channelMessages) => mergeChannelMessages(
        channelMessages,
        optimisticMessages,
        { maxMessages: MAX_ACTIVE_CHANNEL_MESSAGES, keep: "latest" }
      )
    ));

    return optimisticMessages;
  }, [currentUserId, scopedChannelId, user]);

  const removeLocalEchoMessages = useCallback((messageIds) => {
    const normalizedIds = Array.from(new Set((messageIds || []).map((messageId) => String(messageId || "")).filter(Boolean)));
    if (!normalizedIds.length) {
      return;
    }

    normalizedIds.forEach((messageId) => revokeLocalEchoObjectUrls(messageId));
    const localEchoIdSet = new Set(normalizedIds);

    setMessagesByChannel((previous) => {
      let didChange = false;
      const nextState = Object.fromEntries(
        Object.entries(previous || {}).map(([channelKey, channelMessages]) => {
          const nextChannelMessages = (Array.isArray(channelMessages) ? channelMessages : [])
            .filter((messageItem) => !localEchoIdSet.has(String(messageItem?.id || "")));
          if (nextChannelMessages.length !== (Array.isArray(channelMessages) ? channelMessages.length : 0)) {
            didChange = true;
          }

          return [channelKey, nextChannelMessages];
        })
      );

      return didChange ? nextState : previous;
    });
  }, [revokeLocalEchoObjectUrls]);

  const deleteMessageLocally = useCallback((messageId) => {
    const normalizedMessageId = String(messageId || "").trim();
    if (!normalizedMessageId || !currentUserId || !scopedChannelId) {
      return;
    }

    setHiddenMessageIds((previous) => {
      const nextMessageIds = previous.includes(normalizedMessageId)
        ? previous
        : [...previous, normalizedMessageId];
      writeHiddenTextChatMessageIds(currentUserId, scopedChannelId, nextMessageIds);
      return nextMessageIds;
    });

    setMessagesByChannel((previous) => updateChannelMessagesState(
      previous,
      scopedChannelId,
      (channelMessages) => channelMessages.filter((messageItem) => String(messageItem?.id || "") !== normalizedMessageId)
    ));
    setPinnedMessages((previous) => previous.filter((messageItem) => String(messageItem?.id || "") !== normalizedMessageId));
    setSelectedMessageIds((previous) => previous.filter((selectedMessageId) => String(selectedMessageId || "") !== normalizedMessageId));
    setReplyState((current) => (String(current?.messageId || "") === normalizedMessageId ? null : current));
    setMessageEditState((current) => (String(current?.messageId || "") === normalizedMessageId ? null : current));
    setMessageContextMenu((current) => (String(current?.messageId || "") === normalizedMessageId ? null : current));
    setForwardModal((previous) =>
      previous.open
        ? {
          ...previous,
          messageIds: previous.messageIds.filter((itemId) => String(itemId || "") !== normalizedMessageId),
        }
        : previous
    );
    setActionFeedback({ tone: "success", message: "Сообщение удалено" });
  }, [currentUserId, scopedChannelId]);

  const updateLocalEchoUploadProgress = useCallback((pendingUploadId, { progress = null, status = "" } = {}) => {
    const normalizedPendingUploadId = String(pendingUploadId || "").trim();
    if (!normalizedPendingUploadId) {
      return;
    }

    const normalizedStatus = String(status || "").trim();
    const normalizedProgress = Number.isFinite(Number(progress))
      ? Math.max(0, Math.min(100, Math.round(Number(progress))))
      : null;

    setMessagesByChannel((previous) => updateChannelMessagesState(
      previous,
      scopedChannelId,
      (channelMessages) => {
        let didChange = false;
        const nextChannelMessages = channelMessages.map((messageItem) => {
          if (!messageItem?.isLocalEcho || !Array.isArray(messageItem.attachments) || !messageItem.attachments.length) {
            return messageItem;
          }

          let attachmentsChanged = false;
          const nextAttachments = messageItem.attachments.map((attachmentItem) => {
            if (String(attachmentItem?.sourcePendingUploadId || "") !== normalizedPendingUploadId) {
              return attachmentItem;
            }

            const nextAttachment = {
              ...attachmentItem,
              ...(normalizedProgress == null ? null : { localEchoProgress: normalizedProgress }),
              ...(normalizedStatus ? { localEchoStatus: normalizedStatus } : null),
            };
            attachmentsChanged = true;
            return nextAttachment;
          });

          if (!attachmentsChanged) {
            return messageItem;
          }

          didChange = true;
          return {
            ...messageItem,
            attachments: nextAttachments,
          };
        });

        return didChange ? nextChannelMessages : channelMessages;
      }
    ));
  }, [scopedChannelId]);

  const {
    startOptimisticAttachmentSend,
    retryLocalEchoUpload,
    cancelLocalEchoUpload,
    removeLocalEchoUpload,
    markLocalEchoReconciled: reconcileLocalEchoUpload,
  } = useTextChatOptimisticUploadQueue({
    ensureChannelJoined,
    uploadAttachment,
    sendMessagesCompat,
    playDirectMessageSound,
    isDirectChat,
    onCreateLocalEchoMessages: appendLocalEchoMessages,
    onPatchLocalEchoMessage: patchLocalEchoMessage,
    onPatchLocalEchoAttachment: patchLocalEchoAttachment,
    onRemoveLocalEchoMessages: removeLocalEchoMessages,
  });
  markLocalEchoReconciledRef.current = reconcileLocalEchoUpload;

  const {
    send,
    sendAnimatedEmoji,
    sendPoll,
    sendLocation,
    handleFileChange,
    queueFiles,
    removePendingUpload,
    retryPendingUpload,
    clearPendingUploads,
    setPendingUploadsDocumentMode,
  } = useTextChatSendActions({
    message,
    setMessage,
    selectedFiles,
    setSelectedFiles,
    batchUploadOptions,
    messageEditState,
    setMessageEditState,
    editDraftBackupRef,
    scopedChannelId,
    user,
    serverMembers,
    serverRoles,
    isDirectChat,
    getSlowModeRemainingMs,
    uploadingFile,
    setUploadingFile,
    setErrorMessage,
    setActionFeedback,
    setIsChannelReady,
    replyState,
    setReplyState,
    voiceRecordingState,
    ensureChannelJoined,
    focusComposerToEnd,
    lastSendAtRef,
    joinedChannelRef,
    uploadAttachment,
    sendMessagesCompat,
    playDirectMessageSound,
    onCreateLocalEchoMessages: appendLocalEchoMessages,
    onRemoveLocalEchoMessages: removeLocalEchoMessages,
    onUpdateLocalEchoUploads: updateLocalEchoUploadProgress,
    startOptimisticAttachmentSend,
  });

  const toggleBatchUploadGrouping = (value) => {
    setBatchUploadOptions((previous) => ({
      ...previous,
      groupItems: Boolean(value),
    }));
  };

  const toggleBatchUploadSendAsDocuments = (value) => {
    const enabled = Boolean(value);
    setBatchUploadOptions((previous) => ({
      ...previous,
      sendAsDocuments: enabled,
    }));
    setPendingUploadsDocumentMode(enabled);
  };

  const toggleBatchUploadRememberChoice = (value) => {
    setBatchUploadOptions((previous) => ({
      ...previous,
      rememberChoice: Boolean(value),
    }));
  };

  useEffect(() => () => {
    revokePendingUploadPreviews(selectedFilesRef.current);
  }, []);

  useEffect(() => {
    composerDropDepthRef.current = 0;
    setComposerDropActive(false);
  }, [scopedChannelId]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return undefined;
    }

    const resetDragState = () => {
      composerDropDepthRef.current = 0;
      setComposerDropActive(false);
    };

    window.addEventListener("dragend", resetDragState);
    window.addEventListener("drop", resetDragState);

    return () => {
      window.removeEventListener("dragend", resetDragState);
      window.removeEventListener("drop", resetDragState);
    };
  }, []);

  const isFileDragEvent = (event) => Array.from(event?.dataTransfer?.types || []).includes("Files");

  const handleComposerDragEnter = (event) => {
    if (!isFileDragEvent(event)) {
      return;
    }

    event.preventDefault();
    composerDropDepthRef.current += 1;
    setComposerDropActive(true);
  };

  const handleComposerDragOver = (event) => {
    if (!isFileDragEvent(event)) {
      return;
    }

    event.preventDefault();
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = "copy";
    }
  };

  const handleComposerDragLeave = (event) => {
    if (!isFileDragEvent(event)) {
      return;
    }

    event.preventDefault();
    const currentTarget = event.currentTarget;
    const relatedTarget = event.relatedTarget;
    if (currentTarget instanceof Element && relatedTarget instanceof Node && currentTarget.contains(relatedTarget)) {
      return;
    }

    composerDropDepthRef.current = Math.max(0, composerDropDepthRef.current - 1);
    const bounds = currentTarget instanceof Element ? currentTarget.getBoundingClientRect() : null;
    const pointerInsideCurrentTarget = bounds
      ? event.clientX >= bounds.left
        && event.clientX <= bounds.right
        && event.clientY >= bounds.top
        && event.clientY <= bounds.bottom
      : false;

    if (composerDropDepthRef.current === 0 && !pointerInsideCurrentTarget) {
      setComposerDropActive(false);
    }
  };

  const handleComposerDrop = (event) => {
    const droppedFiles = Array.from(event.dataTransfer?.files || []);
    if (!droppedFiles.length) {
      return;
    }

    event.preventDefault();
    composerDropDepthRef.current = 0;
    setComposerDropActive(false);
    queueFiles(droppedFiles, { source: "drag-drop" });
  };

  const handleComposerPaste = useCallback((event) => {
    const clipboardItems = Array.from(event.clipboardData?.items || []);
    if (!clipboardItems.length) {
      return;
    }

    const clipboardFiles = clipboardItems
      .filter((item) => String(item?.kind || "") === "file")
      .map((item) => item.getAsFile?.())
      .filter((file) => file instanceof File);

    if (!clipboardFiles.length) {
      return;
    }

    event.preventDefault();
    queueFiles(clipboardFiles, { source: "clipboard-file" });
  }, [queueFiles]);

  const buildForwardPayloadForTargetChannel = (targetChannelId, sourceMessages) => buildForwardPayloadForTargetChannelCore({
    targetChannelId,
    sourceMessages,
    uploadAttachment,
  });

  const {
    searchResults,
    availableForwardTargets,
    forwardableMessages,
    toggleMessageSelection,
    openForwardModal,
    clearSelectionMode,
    closeForwardModal,
    toggleForwardTarget,
    openMediaPreview,
    updateMediaPreviewIndex,
    updateMediaPreviewZoom,
    updateMediaPreviewPan,
    resetMediaPreviewZoom,
    openMessageContextMenu,
    handleDownloadAttachment,
    handleDownloadAllMediaPreviewItems,
    handleToggleReaction,
    handleOpenMediaPreviewFullscreen,
    handleForwardSubmit,
    contextMenuActions,
    isContextReactionActive,
    primaryReactions,
    stickerReactions,
  } = useTextChatMessageActions({
    searchQuery,
    messages,
    messageRefs,
    setHighlightedMessageId,
    selectedMessageIds,
    setSelectedMessageIds,
    selectionMode,
    setSelectionMode,
    pinnedMessages,
    setPinnedMessages,
    forwardModal,
    setForwardModal,
    directTargets,
    setMessageContextMenu,
    setReactionStickerPanelOpen,
    setMediaPreview,
    mediaPreview,
    mediaPreviewVideoRef,
    messageContextMenu,
    pinnedMessageIdSet,
    setErrorMessage,
    setActionFeedback,
    user,
    scopedChannelId,
    buildForwardPayloadForTargetChannel,
    startEditingMessage,
    setReplyState,
    currentUserId,
    onDeleteMessageLocally: deleteMessageLocally,
  });

  const mentionMessages = useMemo(
    () => messages.filter((messageItem) =>
      Array.isArray(messageItem.mentions)
      && messageItem.mentions.some((mention) =>
        String(mention?.type || (mention?.roleId ? "role" : "user")) !== "role"
        && String(mention?.userId || "") === currentUserId
      )
    ),
    [currentUserId, messages]
  );
  const replyMessages = useMemo(
    () => messages.filter((messageItem) => String(messageItem.replyToMessageId || "").trim()),
    [messages]
  );

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
    if (!profileModal) {
      return undefined;
    }

    const handleEscape = (event) => {
      if (event.key === "Escape") {
        setProfileModal(null);
      }
    };

    window.addEventListener("keydown", handleEscape);
    return () => {
      window.removeEventListener("keydown", handleEscape);
    };
  }, [profileModal]);

  useMediaPreviewKeyboardControls({
    mediaPreview,
    setMediaPreview,
    updateMediaPreviewIndex,
    updateMediaPreviewZoom,
    resetMediaPreviewZoom,
  });

  useEffect(() => {
    if (!messageContextMenu && !userContextMenu) {
      let cancelled = false;
      deferEffectState(() => {
        if (!cancelled) {
          setReactionStickerPanelOpen(false);
        }
      });
      return () => {
        cancelled = true;
      };
    }

    const handlePointerDown = (event) => {
      if (contextMenuRef.current?.contains(event.target)) {
        return;
      }

      if (userContextMenuRef.current?.contains(event.target)) {
        return;
      }

      setMessageContextMenu(null);
      setUserContextMenu(null);
    };

    const handleEscape = (event) => {
      if (event.key === "Escape") {
        setMessageContextMenu(null);
        setUserContextMenu(null);
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
      setUserContextMenu(null);
    };

    const handleViewportScroll = (event) => {
      if (contextMenuRef.current?.contains(event.target)) {
        return;
      }

      if (userContextMenuRef.current?.contains(event.target)) {
        return;
      }

      setMessageContextMenu(null);
      setUserContextMenu(null);
    };

    window.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("keydown", handleEscape);
    window.addEventListener("resize", handleViewportChange);
    window.addEventListener("scroll", handleViewportScroll, true);

    return () => {
      window.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("keydown", handleEscape);
      window.removeEventListener("resize", handleViewportChange);
      window.removeEventListener("scroll", handleViewportScroll, true);
    };
  }, [messageContextMenu, speechRecognitionActive, userContextMenu, voiceRecordingState]);

  return (
    <TextChatView
      searchQuery={searchQuery}
      searchResults={searchResults}
      onClearSearchQuery={onClearSearchQuery}
      scopedChannelId={scopedChannelId}
      navigationRequest={navigationRequest}
      onNavigationIndexChange={onNavigationIndexChange}
      mentionMessages={mentionMessages}
      replyMessages={replyMessages}
      actionFeedback={actionFeedback}
      pinnedMessages={pinnedMessages}
      setPinnedMessages={setPinnedMessages}
      selectionMode={selectionMode}
      selectedMessageIds={selectedMessageIds}
      directTargets={directTargets}
      serverMembers={serverMembers}
      serverRoles={serverRoles}
      openForwardModal={openForwardModal}
      clearSelectionMode={clearSelectionMode}
      messages={messages}
      hasMoreHistory={historyState.hasMore}
      isLoadingOlderHistory={historyState.loading}
      onLoadOlderHistory={loadOlderMessages}
      visibleMessages={visibleMessages}
      visibleStartIndex={visibleStartIndex}
      messagesListRef={messagesListRef}
      messagesEndRef={messagesEndRef}
      messageRefs={messageRefs}
      virtualizationEnabled={virtualizationEnabled}
      topSpacerHeight={topSpacerHeight}
      bottomSpacerHeight={bottomSpacerHeight}
      registerMeasuredNode={registerMeasuredNode}
      estimateMessageOffsetById={estimateOffsetForMessageId}
      decryptedAttachmentsByMessageId={EMPTY_DECRYPTED_ATTACHMENTS_BY_MESSAGE_ID}
      selectedMessageIdSet={selectedMessageIdSet}
      highlightedMessageId={highlightedMessageId}
      setHighlightedMessageId={setHighlightedMessageId}
      isDirectChat={isDirectChat}
      currentUserId={currentUserId}
      user={user}
      toggleMessageSelection={toggleMessageSelection}
      openMessageContextMenu={openMessageContextMenu}
      openUserContextMenu={openUserContextMenu}
      openMediaPreview={openMediaPreview}
      handleToggleReaction={handleToggleReaction}
      handleComposerPaste={handleComposerPaste}
      selectedFiles={selectedFiles}
      uploadingFile={uploadingFile}
      composerDropActive={composerDropActive}
      replyState={replyState}
      messageEditState={messageEditState}
      voiceRecordingState={voiceRecordingState}
      voiceRecordingDurationMs={voiceRecordingDurationMs}
      speechRecognitionActive={speechRecognitionActive}
      speechMicLevel={speechMicLevel}
      speechCaptureState={speechCaptureState}
      composerEmojiButtonRef={composerEmojiButtonRef}
      composerEmojiPickerOpen={composerEmojiPickerOpen}
      composerEmojiPickerRef={composerEmojiPickerRef}
      mentionSuggestionsOpen={mentionSuggestionsOpen}
      mentionSuggestions={mentionSuggestions}
      mentionSuggestionsRef={mentionSuggestionsRef}
      selectedMentionSuggestionIndex={selectedMentionSuggestionIndex}
      textareaRef={textareaRef}
      message={message}
      batchUploadOptions={batchUploadOptions}
      preferExplicitSend={preferExplicitSend}
      handleFileChange={handleFileChange}
      queueFiles={queueFiles}
      removePendingUpload={removePendingUpload}
      cancelLocalEchoUpload={cancelLocalEchoUpload}
      retryLocalEchoUpload={retryLocalEchoUpload}
      removeLocalEchoUpload={removeLocalEchoUpload}
      retryPendingUpload={retryPendingUpload}
      clearPendingUploads={clearPendingUploads}
      toggleBatchUploadGrouping={toggleBatchUploadGrouping}
      toggleBatchUploadSendAsDocuments={toggleBatchUploadSendAsDocuments}
      toggleBatchUploadRememberChoice={toggleBatchUploadRememberChoice}
      onComposerDragEnter={handleComposerDragEnter}
      onComposerDragOver={handleComposerDragOver}
      onComposerDragLeave={handleComposerDragLeave}
      onComposerDrop={handleComposerDrop}
      stopReplyingToMessage={stopReplyingToMessage}
      stopEditingMessage={stopEditingMessage}
      handleCancelVoiceRecording={handleCancelVoiceRecording}
      handleVoiceRecordPointerDown={handleVoiceRecordPointerDown}
      handleVoiceRecordPointerMove={handleVoiceRecordPointerMove}
      handleVoiceRecordPointerUp={handleVoiceRecordPointerUp}
      handleVoiceRecordPointerCancel={handleVoiceRecordPointerCancel}
      handleSpeechRecognitionPointerDown={handleSpeechRecognitionPointerDown}
      handleSpeechRecognitionPointerMove={handleSpeechRecognitionPointerMove}
      handleSpeechRecognitionPointerUp={handleSpeechRecognitionPointerUp}
      handleSpeechRecognitionPointerCancel={handleSpeechRecognitionPointerCancel}
      handleSpeechRecognitionToggle={handleSpeechRecognitionToggle}
      syncComposerSelection={syncComposerSelection}
      setComposerEmojiPickerOpen={setComposerEmojiPickerOpen}
      insertComposerEmoji={insertComposerEmoji}
      sendAnimatedEmoji={sendAnimatedEmoji}
      sendPoll={sendPoll}
      sendLocation={sendLocation}
      handleInsertMentionByUserId={handleInsertMentionByUserId}
      applyMentionSuggestion={applyMentionSuggestion}
      setSelectedMentionSuggestionIndex={setSelectedMentionSuggestionIndex}
      setMentionSuggestionsOpen={setMentionSuggestionsOpen}
      setMessage={setMessage}
      stopSpeechRecognition={stopSpeechRecognition}
      startEditingLatestOwnMessage={startEditingLatestOwnMessage}
      send={send}
      errorMessage={errorMessage}
      mediaPreview={mediaPreview}
      mediaPreviewVideoRef={mediaPreviewVideoRef}
      setMediaPreview={setMediaPreview}
      handleDownloadAttachment={handleDownloadAttachment}
      handleDownloadAllMediaPreviewItems={handleDownloadAllMediaPreviewItems}
      handleOpenMediaPreviewFullscreen={handleOpenMediaPreviewFullscreen}
      updateMediaPreviewIndex={updateMediaPreviewIndex}
      updateMediaPreviewZoom={updateMediaPreviewZoom}
      updateMediaPreviewPan={updateMediaPreviewPan}
      resetMediaPreviewZoom={resetMediaPreviewZoom}
      contextMenuRef={contextMenuRef}
      messageContextMenu={messageContextMenu}
      contextMenuActions={contextMenuActions}
      userContextMenuRef={userContextMenuRef}
      userContextMenu={userContextMenu}
      userContextMenuSections={userContextMenuSections}
      closeUserContextMenu={closeUserContextMenu}
      profileModal={profileModal}
      closeProfileModal={closeProfileModal}
      handleProfileModalDirectChat={handleOpenDirectChatFromProfileModal}
      handleProfileModalStartCall={handleStartDirectCallFromProfileModal}
      handleProfileModalAddFriend={handleAddFriendFromProfileModal}
      handleProfileModalCopyUserId={handleCopyUserIdFromProfileModal}
      primaryReactions={primaryReactions}
      stickerReactions={stickerReactions}
      reactionStickerPanelOpen={reactionStickerPanelOpen}
      setReactionStickerPanelOpen={setReactionStickerPanelOpen}
      isContextReactionActive={isContextReactionActive}
      forwardModal={forwardModal}
      forwardableMessages={forwardableMessages}
      availableForwardTargets={availableForwardTargets}
      closeForwardModal={closeForwardModal}
      setForwardModal={setForwardModal}
      toggleForwardTarget={toggleForwardTarget}
      handleForwardSubmit={handleForwardSubmit}
    />
  );
}
