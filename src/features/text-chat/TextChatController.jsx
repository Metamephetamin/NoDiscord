import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import useMediaPreviewKeyboardControls from "../../hooks/useMediaPreviewKeyboardControls";
import useTextChatComposerPopovers from "../../hooks/useTextChatComposerPopovers";
import useTextChatMessageActions from "../../hooks/useTextChatMessageActions";
import useTextChatSendActions from "../../hooks/useTextChatSendActions";
import useTextChatScrollManager from "../../hooks/useTextChatScrollManager";
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
  user,
  resolvedChannelId = "",
  searchQuery = "",
  directTargets = [],
  serverMembers = [],
  serverRoles = [],
  navigationRequest = null,
  onNavigationIndexChange = null,
  onOpenDirectChat = null,
  onStartDirectCall = null,
}) {
  const [message, setMessage] = useState("");
  const [messageEditState, setMessageEditState] = useState(null);
  const [messagesByChannel, setMessagesByChannel] = useState({});
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [batchUploadOptions, setBatchUploadOptions] = useState(() => readBatchUploadPreferences());
  const [mediaPreview, setMediaPreview] = useState(null);
  const [uploadingFile, setUploadingFile] = useState(false);
  const [composerDropActive, setComposerDropActive] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [isChannelReady, setIsChannelReady] = useState(false);
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
  const messageRefs = useRef(new Map());
  const lastSendAtRef = useRef(0);
  const editDraftBackupRef = useRef("");
  const forceScrollToBottomRef = useRef(false);
  const hasInitializedVisibleChannelRef = useRef(false);
  const composerDropDepthRef = useRef(0);
  const selectedFilesRef = useRef([]);
  const scopedChannelId = useMemo(() => {
    const normalizedResolvedChannelId = normalizeDirectMessageChannelId(resolvedChannelId);
    if (normalizedResolvedChannelId) {
      return normalizedResolvedChannelId;
    }

    return getScopedChatChannelId(serverId, channelId);
  }, [channelId, resolvedChannelId, serverId]);
  const currentUserId = String(user?.id || "");
  const isDirectChat = isDirectMessageChannelId(scopedChannelId);
  const messages = messagesByChannel[scopedChannelId] || [];

  useEffect(() => {
    selectedFilesRef.current = selectedFiles;
  }, [selectedFiles]);

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
  const mentionSuggestions = useMemo(() => {
    if (isDirectChat || !mentionQueryContext) {
      return [];
    }

    const normalizedQuery = normalizeMentionAlias(mentionQueryContext.query);
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
        const userId = String(member?.userId || "").trim();
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
  }, [isDirectChat, mentionQueryContext, serverMembers, serverRoles]);

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
      username: String(messageItem?.username || messageItem?.Username || messageItem?.name || messageItem?.Name || "User").trim() || "User",
      message: decrypted.text,
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

  const userContextMenuSections = [
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

  const {
    floatingDateLabel,
    pendingNewMessagesCount,
    firstUnreadMessageId,
    canReturnToJumpPoint,
    scrollToLatest,
    scrollToMessage,
    jumpToFirstUnread,
    returnToJumpPoint,
  } = useTextChatScrollManager({
    messages,
    scopedChannelId,
    messagesListRef,
    messagesEndRef,
    messageRefs,
    setHighlightedMessageId,
    forceScrollToBottomRef,
    estimateMessageOffsetById: estimateOffsetForMessageId,
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
    setMessagesByChannel((previous) => updateChannelMessagesState(previous, scopedChannelId, normalizedInitialMessages));

    if (isDirectChat) {
      chatConnection.invoke("MarkChannelRead", scopedChannelId).catch(() => {});
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

        setMessagesByChannel((previous) => updateChannelMessagesState(previous, scopedChannelId, (channelMessages) => {
          if (channelMessages.some((messageItem) => String(messageItem.id) === String(normalizedMessage.id))) {
            return channelMessages;
          }

          return [...channelMessages, normalizedMessage];
        }));

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

      setReplyState((current) => (String(current?.messageId || "") === String(deletedId) ? null : current));

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

        joinedChannelRef.current = "";
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
  }, [currentUserId, isDirectChat, messageEditState?.messageId, scopedChannelId]);

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
  const sendMessagesCompat = (targetChannelId, avatar, payload, { allowBatch = true } = {}) => sendMessagesCompatCore({
    targetChannelId,
    avatar,
    payload,
    user,
    allowBatch,
  });

  const {
    voiceRecordingState,
    voiceRecordingDurationMs,
    speechRecognitionActive,
    stopSpeechRecognition,
    handleVoiceRecordPointerDown,
    handleVoiceRecordPointerMove,
    handleVoiceRecordPointerUp,
    handleVoiceRecordPointerCancel,
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
    forceScrollToBottomRef,
    lastSendAtRef,
    ensureChannelJoined,
    uploadAttachment,
    sendMessagesCompat,
    isDirectChat,
    playDirectMessageSound,
  });

  const {
    send,
    sendAnimatedEmoji,
    sendPoll,
    handleFileChange,
    queueFiles,
    removePendingUpload,
    retryPendingUpload,
    clearPendingUploads,
    updatePendingUploadCompressionMode,
    updatePendingUploadSpoilerMode,
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
    forceScrollToBottomRef,
    lastSendAtRef,
    joinedChannelRef,
    uploadAttachment,
    sendMessagesCompat,
    playDirectMessageSound,
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
      groupItems: enabled ? false : previous.groupItems,
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

  const handleComposerDragEnter = (event) => {
    const transferTypes = Array.from(event.dataTransfer?.types || []);
    if (!transferTypes.includes("Files")) {
      return;
    }

    event.preventDefault();
    composerDropDepthRef.current += 1;
    setComposerDropActive(true);
  };

  const handleComposerDragOver = (event) => {
    const transferTypes = Array.from(event.dataTransfer?.types || []);
    if (!transferTypes.includes("Files")) {
      return;
    }

    event.preventDefault();
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = "copy";
    }
  };

  const handleComposerDragLeave = (event) => {
    const transferTypes = Array.from(event.dataTransfer?.types || []);
    if (!transferTypes.includes("Files")) {
      return;
    }

    event.preventDefault();
    composerDropDepthRef.current = Math.max(0, composerDropDepthRef.current - 1);
    if (composerDropDepthRef.current === 0) {
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
      .filter((item) => String(item?.kind || "") === "file" && String(item?.type || "").startsWith("image/"))
      .map((item) => item.getAsFile?.())
      .filter((file) => file instanceof File);

    if (!clipboardFiles.length) {
      return;
    }

    event.preventDefault();
    queueFiles(clipboardFiles, { source: "clipboard-image" });
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
    if (typeof onNavigationIndexChange !== "function") {
      return;
    }

    onNavigationIndexChange({
      channelId: scopedChannelId,
      pinnedMessages,
      searchResults,
      mentionMessages,
      replyMessages,
      firstUnreadMessageId,
      canReturnToJumpPoint,
    });
  }, [
    canReturnToJumpPoint,
    firstUnreadMessageId,
    mentionMessages,
    onNavigationIndexChange,
    pinnedMessages,
    replyMessages,
    scopedChannelId,
    searchResults,
  ]);

  useEffect(() => {
    if (!navigationRequest || String(navigationRequest?.channelId || "") !== String(scopedChannelId)) {
      return;
    }

    if (navigationRequest.type === "message" && navigationRequest.messageId) {
      scrollToMessage(navigationRequest.messageId, { behavior: "auto", block: "center", rememberCurrent: true });
      return;
    }

    if (navigationRequest.type === "firstUnread") {
      jumpToFirstUnread();
      return;
    }

    if (navigationRequest.type === "latest") {
      scrollToLatest("auto");
      return;
    }

    if (navigationRequest.type === "jumpBack") {
      returnToJumpPoint();
    }
  }, [jumpToFirstUnread, navigationRequest, returnToJumpPoint, scopedChannelId, scrollToLatest, scrollToMessage]);
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
      scrollToMessage={scrollToMessage}
      scrollToLatest={scrollToLatest}
      pendingNewMessagesCount={pendingNewMessagesCount}
      firstUnreadMessageId={firstUnreadMessageId}
      canReturnToJumpPoint={canReturnToJumpPoint}
      onJumpToFirstUnread={jumpToFirstUnread}
      onReturnToJumpPoint={returnToJumpPoint}
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
      visibleMessages={visibleMessages}
      messagesListRef={messagesListRef}
      messagesEndRef={messagesEndRef}
      messageRefs={messageRefs}
      virtualizationEnabled={virtualizationEnabled}
      topSpacerHeight={topSpacerHeight}
      bottomSpacerHeight={bottomSpacerHeight}
      registerMeasuredNode={registerMeasuredNode}
      floatingDateLabel={floatingDateLabel}
      decryptedAttachmentsByMessageId={{}}
      selectedMessageIdSet={selectedMessageIdSet}
      highlightedMessageId={highlightedMessageId}
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
      retryPendingUpload={retryPendingUpload}
      clearPendingUploads={clearPendingUploads}
      updatePendingUploadCompressionMode={updatePendingUploadCompressionMode}
      updatePendingUploadSpoilerMode={updatePendingUploadSpoilerMode}
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
      handleSpeechRecognitionToggle={handleSpeechRecognitionToggle}
      syncComposerSelection={syncComposerSelection}
      setComposerEmojiPickerOpen={setComposerEmojiPickerOpen}
      insertComposerEmoji={insertComposerEmoji}
      sendAnimatedEmoji={sendAnimatedEmoji}
      sendPoll={sendPoll}
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
