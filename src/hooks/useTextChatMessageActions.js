import { useMemo } from "react";
import chatConnection, { startChatConnection } from "../SignalR/ChatConnect";
import { API_URL } from "../config/runtime";
import { prepareOutgoingTextPayload } from "../security/chatPayloadCrypto";
import { authFetch, getStoredToken } from "../utils/auth";
import { copyTextToClipboard } from "../utils/clipboard";
import { resolveMediaUrl } from "../utils/media";
import {
  buildDownloadFileName,
  clampNumber,
  getTargetDisplayName,
  MAX_PINNED_MESSAGES,
  MEDIA_PREVIEW_MAX_ZOOM,
  MEDIA_PREVIEW_MIN_ZOOM,
  saveBlobWithBrowser,
  shouldUseAuthenticatedDownload,
} from "../utils/textChatHelpers";
import {
  buildReplySnapshot,
  COMPAT_FORWARD_DELAY_MS,
  createPinnedSnapshot,
  getChatErrorMessage,
  getDownloadLabel,
  getMessagePreview,
  getUserName,
  isMissingHubMethodError,
  normalizeAttachmentItems,
  normalizeReactions,
  PRIMARY_MESSAGE_REACTION_OPTIONS,
  sleep,
  STICKER_MESSAGE_REACTION_OPTIONS,
} from "../utils/textChatModel";

export default function useTextChatMessageActions({
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
}) {
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
      return exists ? previous.filter((itemId) => String(itemId) !== normalizedMessageId) : [...previous, messageId];
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
    const wasPinned = pinnedMessageIdSet.has(normalizedMessageId);
    setPinnedMessages((previous) => {
      const exists = previous.some((item) => String(item.id) === normalizedMessageId);
      return exists
        ? previous.filter((item) => String(item.id) !== normalizedMessageId)
        : [createPinnedSnapshot(messageItem), ...previous].slice(0, MAX_PINNED_MESSAGES);
    });
    setActionFeedback({
      tone: "success",
      message: wasPinned ? "Сообщение откреплено" : "Сообщение закреплено",
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

  const openMediaPreview = (type, url, name, contentType = "", messageId = "", attachmentEncryption = null, sourceUrl = "", attachmentIndex = 0, galleryItems = []) => {
    if (!url) {
      return;
    }

    const fallbackItem = {
      type,
      url,
      name: name || (type === "image" ? "Изображение" : "Видео"),
      contentType,
      messageId: String(messageId || ""),
      attachmentIndex: Number(attachmentIndex) || 0,
      attachmentEncryption,
      sourceUrl: sourceUrl || url,
    };
    const items = Array.isArray(galleryItems) && galleryItems.length ? galleryItems : [fallbackItem];
    const matchingIndex = items.findIndex((item) =>
      String(item.messageId || "") === String(messageId || "")
      && Number(item.attachmentIndex || 0) === Number(attachmentIndex || 0));
    const activeIndex = matchingIndex >= 0 ? matchingIndex : 0;
    const activeItem = items[activeIndex] || fallbackItem;

    setMediaPreview({
      ...activeItem,
      items,
      activeIndex,
      zoom: 1,
      panX: 0,
      panY: 0,
    });
  };

  const updateMediaPreviewIndex = (direction) => {
    setMediaPreview((current) => {
      if (!current?.items?.length || current.items.length < 2) {
        return current;
      }

      const itemCount = current.items.length;
      const nextIndex = (Number(current.activeIndex || 0) + direction + itemCount) % itemCount;
      const nextItem = current.items[nextIndex] || current.items[0];
      return {
        ...current,
        ...nextItem,
        activeIndex: nextIndex,
        zoom: 1,
        panX: 0,
        panY: 0,
      };
    });
  };

  const updateMediaPreviewZoom = (delta) => {
    setMediaPreview((current) => {
      if (!current) {
        return current;
      }

      const nextZoom = clampNumber((Number(current.zoom) || 1) + delta, MEDIA_PREVIEW_MIN_ZOOM, MEDIA_PREVIEW_MAX_ZOOM);
      return {
        ...current,
        zoom: nextZoom,
        panX: nextZoom <= 1 ? 0 : Number(current.panX) || 0,
        panY: nextZoom <= 1 ? 0 : Number(current.panY) || 0,
      };
    });
  };

  const resetMediaPreviewZoom = () => {
    setMediaPreview((current) => (current ? { ...current, zoom: 1, panX: 0, panY: 0 } : current));
  };

  const updateMediaPreviewPan = (deltaX, deltaY) => {
    setMediaPreview((current) => {
      if (!current || (Number(current.zoom) || 1) <= 1) {
        return current;
      }

      return {
        ...current,
        panX: (Number(current.panX) || 0) + Number(deltaX || 0),
        panY: (Number(current.panY) || 0) + Number(deltaY || 0),
      };
    });
  };

  const openMessageContextMenu = (event, messageItem, isOwnMessage) => {
    event.preventDefault();

    const resolvedAttachmentContentType = messageItem?.attachmentContentType || "";
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
    const nextX = Math.min(event.clientX, window.innerWidth - menuWidth - padding);
    const nextY = Math.min(event.clientY, window.innerHeight - menuHeight - padding);

    setReactionStickerPanelOpen(false);
    setMessageContextMenu({
      x: Math.max(padding, nextX),
      y: Math.max(padding, nextY),
      messageId: messageItem.id,
      text: String(messageItem.message || messageItem.attachmentName || "").trim(),
      attachmentKind,
      attachmentUrl: messageItem?.attachmentUrl ? resolveMediaUrl(messageItem.attachmentUrl, messageItem.attachmentUrl) : "",
      attachmentSourceUrl: messageItem?.attachmentUrl ? resolveMediaUrl(messageItem.attachmentUrl, messageItem.attachmentUrl) : "",
      attachmentName: messageItem?.attachmentName || "",
      attachmentContentType: resolvedAttachmentContentType,
      attachmentEncryption: null,
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
      setActionFeedback({ tone: "success", message: "Текст скопирован" });
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
      setActionFeedback({ tone: "success", message: "Сообщение удалено" });
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

  const handleReplyToMessage = () => {
    if (!messageContextMenu?.messageId) {
      return;
    }

    const messageItem = messages.find((item) => String(item.id) === String(messageContextMenu.messageId));
    if (!messageItem) {
      setMessageContextMenu(null);
      return;
    }

    const replySnapshot = buildReplySnapshot(messageItem);
    if (replySnapshot) {
      setReplyState(replySnapshot);
      setActionFeedback({ tone: "info", message: "Ответ привязан к сообщению" });
    }

    setMessageContextMenu(null);
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

      if (window?.electronDownloads?.fetchAndSave) {
        const headers = shouldUseAuthenticatedDownload(sourceAttachmentUrl, API_URL) && getStoredToken()
          ? { Authorization: `Bearer ${getStoredToken()}` }
          : {};
        const result = await window.electronDownloads.fetchAndSave({
          url: sourceAttachmentUrl,
          defaultFileName: fileName,
          headers,
        });

        if (!result?.canceled) {
          setMessageContextMenu(null);
        }
        return;
      } else {
        const response = shouldUseAuthenticatedDownload(sourceAttachmentUrl, API_URL)
          ? await authFetch(sourceAttachmentUrl)
          : await fetch(sourceAttachmentUrl);

        if (!response.ok) {
          throw new Error("Не удалось загрузить файл для скачивания.");
        }

        resolvedContentType = response.headers.get("content-type") || attachment.attachmentContentType || "";
        fileName = buildDownloadFileName({
          type: attachment.attachmentKind,
          url: sourceAttachmentUrl,
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

  const handleDownloadAllMediaPreviewItems = async () => {
    const previewItems = Array.isArray(mediaPreview?.items) ? mediaPreview.items : [];
    if (previewItems.length < 2) {
      return;
    }

    try {
      setErrorMessage("");

      if (window?.electronDownloads?.fetchAndSaveMany) {
        const items = previewItems
          .filter((item) => String(item?.url || "").trim())
          .map((item) => {
            const sourceAttachmentUrl = item.sourceUrl || item.url;
            const fileName = buildDownloadFileName({
              type: item.type,
              url: sourceAttachmentUrl,
              name: item.name,
              contentType: item.contentType || "",
            });

            return {
              url: sourceAttachmentUrl,
              defaultFileName: fileName,
              headers:
                shouldUseAuthenticatedDownload(sourceAttachmentUrl, API_URL) && getStoredToken()
                  ? { Authorization: `Bearer ${getStoredToken()}` }
                  : {},
            };
          });

        if (items.length) {
          const result = await window.electronDownloads.fetchAndSaveMany({ items });
          if (!result?.canceled) {
            setMessageContextMenu(null);
            setActionFeedback({
              tone: "success",
              message:
                result.savedFiles?.length > 0
                  ? `Скачано файлов: ${result.savedFiles.length}`
                  : "Файлы сохранены",
            });
          }
          return;
        }
      }

      for (const item of previewItems) {
        // eslint-disable-next-line no-await-in-loop
        await handleDownloadAttachment({
          attachmentKind: item.type,
          attachmentUrl: item.url,
          attachmentSourceUrl: item.sourceUrl || item.url,
          attachmentName: item.name,
          attachmentContentType: item.contentType || "",
          attachmentEncryption: item.attachmentEncryption || null,
          messageId: item.messageId || "",
          attachmentIndex: item.attachmentIndex || 0,
        });
      }
    } catch (error) {
      console.error("Download all media preview items error:", error);
      setErrorMessage(error?.message || "Не удалось скачать файлы.");
    }
  };

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
      const preparedTextPayload = await prepareOutgoingTextPayload({
        text: String(item.message || ""),
      });
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
        null,
        Array.isArray(item.mentions) ? item.mentions : [],
        primaryAttachment?.voiceMessage || item.voiceMessage || null,
        attachmentList,
        item.replyToMessageId || null,
        item.replyToUsername || null,
        item.replyPreview || null
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
      setActionFeedback({ tone: "success", message: "Сообщения пересланы" });
    } catch (error) {
      console.error("Forward messages error:", error);
      setErrorMessage(getChatErrorMessage(error, "Не удалось переслать сообщения."));
      setForwardModal((previous) => ({ ...previous, submitting: false }));
    }
  };

  const contextMenuActions = [
    { id: "edit", label: "Редактировать", icon: "✎", disabled: !messageContextMenu?.canEdit, hidden: false, onClick: handleStartEditingMessage },
    { id: "reply", label: "Ответить", icon: "↩", disabled: true, hidden: false, onClick: () => {} },
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
    { id: "copy", label: "Копировать текст", icon: "⧉", disabled: !messageContextMenu?.hasText, hidden: false, onClick: handleCopyMessageText },
    { id: "forward", label: "Переслать", icon: "↗", disabled: !directTargets.length, hidden: false, onClick: () => openForwardModal([messageContextMenu?.messageId]) },
    { id: "delete", label: "Удалить", icon: "🗑", disabled: !messageContextMenu?.canDelete, hidden: false, danger: true, onClick: handleDeleteMessage },
    { id: "select", label: "Выбрать", icon: "✓", disabled: false, hidden: false, onClick: () => openSelectionMode(messageContextMenu?.messageId) },
  ].filter((action) => !action.hidden);

  const contextMenuMessage = messageContextMenu
    ? messages.find((item) => String(item.id) === String(messageContextMenu.messageId))
    : null;
  const resolvedContextMenuActions = contextMenuActions.map((action) => (
    action.id === "reply"
      ? { ...action, disabled: false, onClick: handleReplyToMessage }
      : action
  ));
  const contextMenuReactions = normalizeReactions(contextMenuMessage?.reactions);
  const isContextReactionActive = (reactionOption) => contextMenuReactions.some((reaction) =>
    reaction.key === reactionOption.key
    && reaction.reactorUserIds.some((userId) => String(userId) === currentUserId));

  return {
    searchResults,
    availableForwardTargets,
    forwardableMessages,
    scrollToMessage,
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
    contextMenuActions: resolvedContextMenuActions,
    isContextReactionActive,
    primaryReactions: PRIMARY_MESSAGE_REACTION_OPTIONS,
    stickerReactions: STICKER_MESSAGE_REACTION_OPTIONS,
  };
}
