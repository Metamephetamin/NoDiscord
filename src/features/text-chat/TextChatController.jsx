import { useEffect, useMemo, useRef, useState } from "react";
import TextChatView from "./TextChatView";
import chatConnection, { startChatConnection } from "../../SignalR/ChatConnect";
import "../../css/TextChat.css";
import { readIncomingMessageText } from "../../security/chatPayloadCrypto";
import { uploadChatAttachment } from "../../utils/chatAttachmentUpload";
import { clearChatDraft, readChatDraft, writeChatDraft } from "../../utils/chatDrafts";
import { isDirectMessageChannelId } from "../../utils/directMessageChannels";
import { resolveDirectMessageSoundPath } from "../../utils/directMessageSounds";
import {
  getMentionHandleForMember,
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

export default function TextChat({
  serverId,
  channelId,
  user,
  resolvedChannelId = "",
  searchQuery = "",
  directTargets = [],
  serverMembers = [],
  navigationRequest = null,
  onNavigationIndexChange = null,
}) {
  const [message, setMessage] = useState("");
  const [messageEditState, setMessageEditState] = useState(null);
  const [messagesByChannel, setMessagesByChannel] = useState({});
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [mediaPreview, setMediaPreview] = useState(null);
  const [uploadingFile, setUploadingFile] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [isChannelReady, setIsChannelReady] = useState(false);
  const [composerEmojiPickerOpen, setComposerEmojiPickerOpen] = useState(false);
  const [mentionSuggestionsOpen, setMentionSuggestionsOpen] = useState(false);
  const [selectedMentionSuggestionIndex, setSelectedMentionSuggestionIndex] = useState(0);
  const [composerSelection, setComposerSelection] = useState({ start: 0, end: 0 });
  const [highlightedMessageId, setHighlightedMessageId] = useState("");
  const [messageContextMenu, setMessageContextMenu] = useState(null);
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
  const mediaPreviewVideoRef = useRef(null);
  const joinedChannelRef = useRef("");
  const messageRefs = useRef(new Map());
  const lastSendAtRef = useRef(0);
  const editDraftBackupRef = useRef("");
  const forceScrollToBottomRef = useRef(false);
  const hasInitializedVisibleChannelRef = useRef(false);
  const scopedChannelId = resolvedChannelId || getScopedChatChannelId(serverId, channelId);
  const currentUserId = String(user?.id || "");
  const isDirectChat = isDirectMessageChannelId(scopedChannelId);
  const messages = messagesByChannel[scopedChannelId] || [];
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
    () => (!isDirectChat ? getMentionQueryContext(message, composerSelection.start) : null),
    [composerSelection.start, isDirectChat, message]
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
    const decrypted = await readIncomingMessageText(messageItem);
    const attachments = normalizeAttachmentItems(messageItem);
    const primaryAttachment = attachments[0] || null;
    return {
      ...messageItem,
      message: decrypted.text,
      encryption: null,
      attachments,
      attachmentEncryption: null,
      attachmentUrl: primaryAttachment?.attachmentUrl || messageItem?.attachmentUrl || messageItem?.AttachmentUrl || "",
      attachmentName: primaryAttachment?.attachmentName || messageItem?.attachmentName || messageItem?.AttachmentName || "",
      attachmentSize: primaryAttachment?.attachmentSize ?? messageItem?.attachmentSize ?? messageItem?.AttachmentSize ?? null,
      attachmentContentType: primaryAttachment?.attachmentContentType || messageItem?.attachmentContentType || messageItem?.AttachmentContentType || "",
      voiceMessage: primaryAttachment?.voiceMessage || normalizeVoiceMessageMetadata(messageItem?.voiceMessage || messageItem?.VoiceMessage),
      editedAt: messageItem?.editedAt || messageItem?.EditedAt || null,
      replyToMessageId: String(messageItem?.replyToMessageId || messageItem?.ReplyToMessageId || "").trim(),
      replyToUsername: String(messageItem?.replyToUsername || messageItem?.ReplyToUsername || "").trim(),
      replyPreview: String(messageItem?.replyPreview || messageItem?.ReplyPreview || "").trim(),
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
      setComposerSelection({ start: nextLength, end: nextLength });
    });
  };

  const stopReplyingToMessage = () => {
    setReplyState(null);
  };

  const syncComposerSelection = () => {
    const textarea = textareaRef.current;
    if (!textarea) {
      return;
    }

    const nextSelection = {
      start: Number(textarea.selectionStart || 0),
      end: Number(textarea.selectionEnd || 0),
    };
    composerSelectionRef.current = nextSelection;
    setComposerSelection(nextSelection);
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
      setComposerSelection({ start: nextCaretPosition, end: nextCaretPosition });
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
      setComposerSelection({ start: nextCaretPosition, end: nextCaretPosition });
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
    handleFileChange,
  } = useTextChatSendActions({
    message,
    setMessage,
    selectedFiles,
    setSelectedFiles,
    messageEditState,
    setMessageEditState,
    editDraftBackupRef,
    scopedChannelId,
    user,
    serverMembers,
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
    resetMediaPreviewZoom,
    openMessageContextMenu,
    handleDownloadAttachment,
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
    () => messages.filter((messageItem) => Array.isArray(messageItem.mentions) && messageItem.mentions.some((mention) => String(mention?.userId || "") === currentUserId)),
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
      scrollToMessage(navigationRequest.messageId, { behavior: "smooth", block: "center", rememberCurrent: true });
      return;
    }

    if (navigationRequest.type === "firstUnread") {
      jumpToFirstUnread();
      return;
    }

    if (navigationRequest.type === "latest") {
      scrollToLatest("smooth");
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

  useMediaPreviewKeyboardControls({
    mediaPreview,
    setMediaPreview,
    updateMediaPreviewIndex,
    updateMediaPreviewZoom,
    resetMediaPreviewZoom,
  });

  useEffect(() => {
    if (!messageContextMenu) {
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

    const handleViewportScroll = (event) => {
      if (contextMenuRef.current?.contains(event.target)) {
        return;
      }

      setMessageContextMenu(null);
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
  }, [messageContextMenu, speechRecognitionActive, voiceRecordingState]);

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
      openMediaPreview={openMediaPreview}
      handleToggleReaction={handleToggleReaction}
      selectedFiles={selectedFiles}
      setSelectedFiles={setSelectedFiles}
      uploadingFile={uploadingFile}
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
      preferExplicitSend={preferExplicitSend}
      handleFileChange={handleFileChange}
      stopReplyingToMessage={stopReplyingToMessage}
      stopEditingMessage={stopEditingMessage}
      handleCancelVoiceRecording={handleCancelVoiceRecording}
      handleSpeechRecognitionToggle={handleSpeechRecognitionToggle}
      syncComposerSelection={syncComposerSelection}
      setComposerEmojiPickerOpen={setComposerEmojiPickerOpen}
      insertComposerEmoji={insertComposerEmoji}
      sendAnimatedEmoji={sendAnimatedEmoji}
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
      handleOpenMediaPreviewFullscreen={handleOpenMediaPreviewFullscreen}
      updateMediaPreviewIndex={updateMediaPreviewIndex}
      updateMediaPreviewZoom={updateMediaPreviewZoom}
      resetMediaPreviewZoom={resetMediaPreviewZoom}
      contextMenuRef={contextMenuRef}
      messageContextMenu={messageContextMenu}
      contextMenuActions={contextMenuActions}
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
