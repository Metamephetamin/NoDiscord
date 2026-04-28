import { startTransition, useEffect, useRef } from "react";
import chatConnection from "../SignalR/ChatConnect";
import { flushSync } from "react-dom";
import { prepareOutgoingTextPayload } from "../security/chatPayloadCrypto";
import { clearChatDraft } from "../utils/chatDrafts";
import {
  createPendingUpload,
  isAllowedChatAttachmentFile,
  revokePendingUploadPreviews,
} from "../utils/chatPendingUploads";
import { extractMentionsFromText } from "../utils/messageMentions";
import { createPollMessagePayload } from "../utils/pollMessages";
import { punctuateTypedMessageText } from "../utils/speechPunctuation";
import {
  getChatErrorMessage,
  MAX_FILE_SIZE_BYTES,
  MESSAGE_SEND_COOLDOWN_MS,
} from "../utils/textChatModel";
import { finishPerfTrace, finishPerfTraceOnNextFrame, startPerfTrace } from "../utils/perf";

const LOCATION_MESSAGE_DEFAULT_ZOOM = 15;

export default function useTextChatSendActions({
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
  startOptimisticAttachmentSend,
}) {
  const pendingUploadPatchQueueRef = useRef(new Map());
  const pendingUploadPatchFrameRef = useRef(0);
  const activeUploadAbortControllersRef = useRef(new Map());
  const cancelledPendingUploadIdsRef = useRef(new Set());
  const uploadProgressSnapshotRef = useRef(new Map());
  const preparedUploadFileCacheRef = useRef(new Map());
  const preparedUploadModeRef = useRef(new Map());

  const isCancelledPendingUploadError = (uploadId, error) => {
    const normalizedUploadId = String(uploadId || "").trim();
    const errorName = String(error?.name || "").trim();
    const errorMessage = String(error?.message || "").trim();

    return Boolean(
      (normalizedUploadId && cancelledPendingUploadIdsRef.current.has(normalizedUploadId))
      || error?.code === "PENDING_UPLOAD_CANCELLED"
      || errorName === "AbortError"
      || errorMessage === "pending-upload-cancelled"
    );
  };

  const cancelActiveUpload = (uploadId) => {
    const normalizedUploadId = String(uploadId || "").trim();
    if (!normalizedUploadId) {
      return false;
    }

    cancelledPendingUploadIdsRef.current.add(normalizedUploadId);
    preparedUploadFileCacheRef.current.delete(normalizedUploadId);
    preparedUploadModeRef.current.delete(normalizedUploadId);
    uploadProgressSnapshotRef.current.delete(normalizedUploadId);

    const abortController = activeUploadAbortControllersRef.current.get(normalizedUploadId);
    if (!abortController) {
      return false;
    }

    try {
      abortController.abort();
    } catch {
      // Ignore cancellation failures for already-settled uploads.
    }

    return true;
  };

  const flushPendingUploadPatches = () => {
    pendingUploadPatchFrameRef.current = 0;
    const queuedEntries = Array.from(pendingUploadPatchQueueRef.current.entries());
    if (!queuedEntries.length) {
      return;
    }

    pendingUploadPatchQueueRef.current.clear();
    setSelectedFiles((previous) => {
      let didChange = false;
      const patchMap = new Map(queuedEntries);
      const nextUploads = previous.map((item) => {
        const uploadId = String(item?.id || "");
        if (!patchMap.has(uploadId)) {
          return item;
        }

        const patch = patchMap.get(uploadId);
        const nextItem = typeof patch === "function" ? patch(item) : { ...item, ...patch };
        if (nextItem !== item) {
          didChange = true;
        }
        return nextItem;
      });

      return didChange ? nextUploads : previous;
    });
  };

  const schedulePendingUploadPatch = (uploadId, patch) => {
    const normalizedId = String(uploadId || "");
    if (!normalizedId) {
      return;
    }

    const previousPatch = pendingUploadPatchQueueRef.current.get(normalizedId);
    if (typeof previousPatch === "function" || typeof patch === "function") {
      pendingUploadPatchQueueRef.current.set(normalizedId, (current) => {
        const baseValue = typeof previousPatch === "function"
          ? previousPatch(current)
          : previousPatch
            ? { ...current, ...previousPatch }
            : current;

        return typeof patch === "function"
          ? patch(baseValue)
          : { ...baseValue, ...patch };
      });
    } else {
      pendingUploadPatchQueueRef.current.set(normalizedId, {
        ...(previousPatch || {}),
        ...(patch || {}),
      });
    }

    if (pendingUploadPatchFrameRef.current) {
      return;
    }

    const scheduleFrame =
      typeof window !== "undefined" && typeof window.requestAnimationFrame === "function"
        ? window.requestAnimationFrame.bind(window)
        : (callback) => window.setTimeout(callback, 16);
    pendingUploadPatchFrameRef.current = scheduleFrame(() => flushPendingUploadPatches());
  };

  useEffect(() => () => {
    if (pendingUploadPatchFrameRef.current) {
      const cancelFrame =
        typeof window !== "undefined" && typeof window.cancelAnimationFrame === "function"
          ? window.cancelAnimationFrame.bind(window)
          : window.clearTimeout.bind(window);
      cancelFrame(pendingUploadPatchFrameRef.current);
      pendingUploadPatchFrameRef.current = 0;
    }
    pendingUploadPatchQueueRef.current.clear();
    activeUploadAbortControllersRef.current.clear();
    cancelledPendingUploadIdsRef.current.clear();
    uploadProgressSnapshotRef.current.clear();
    preparedUploadFileCacheRef.current.clear();
    preparedUploadModeRef.current.clear();
  }, []);

  useEffect(() => {
    const nextSelectedFiles = Array.isArray(selectedFiles) ? selectedFiles : [];
    const activeUploadIds = new Set(
      nextSelectedFiles.map((item) => String(item?.id || "")).filter(Boolean)
    );

    Array.from(preparedUploadFileCacheRef.current.keys()).forEach((uploadId) => {
      if (!activeUploadIds.has(uploadId)) {
        preparedUploadFileCacheRef.current.delete(uploadId);
        preparedUploadModeRef.current.delete(uploadId);
      }
    });
  }, [selectedFiles]);

  const appendPendingFiles = (files, { replace = false, preferSendAsDocuments = false } = {}) => {
    const validFiles = Array.isArray(files) ? files.filter((file) => file instanceof File) : [];
    if (!validFiles.length) {
      return false;
    }

    const shouldSendAsDocuments = preferSendAsDocuments || Boolean(batchUploadOptions?.sendAsDocuments);
    const nextUploads = validFiles.map((file) => createPendingUpload(file));

    flushSync(() => {
      setSelectedFiles((previous) => {
        if (replace) {
          revokePendingUploadPreviews(previous);
          return nextUploads;
        }

        return [...previous, ...nextUploads];
      });
    });
    return true;
  };

  const updatePendingUpload = (uploadId, updater) => {
    const normalizedId = String(uploadId || "");
    if (!normalizedId) {
      return;
    }

    setSelectedFiles((previous) => {
      let didChange = false;
      const nextUploads = previous.map((item) => {
        if (String(item?.id || "") !== normalizedId) {
          return item;
        }

        const nextItem = typeof updater === "function" ? updater(item) : { ...item, ...updater };
        if (nextItem !== item) {
          didChange = true;
        }
        return nextItem;
      });

      return didChange ? nextUploads : previous;
    });
  };

  const removePendingUpload = (uploadId) => {
    const normalizedId = String(uploadId || "");
    if (!normalizedId) {
      return;
    }

    preparedUploadFileCacheRef.current.delete(normalizedId);
    preparedUploadModeRef.current.delete(normalizedId);

    setSelectedFiles((previous) => {
      const nextUploads = [];
      previous.forEach((item) => {
        if (String(item?.id || "") === normalizedId) {
          revokePendingUploadPreviews([item]);
          return;
        }

        nextUploads.push(item);
      });
      return nextUploads;
    });
  };

  const clearPendingUploads = () => {
    pendingUploadPatchQueueRef.current.clear();
    uploadProgressSnapshotRef.current.clear();
    preparedUploadFileCacheRef.current.clear();
    preparedUploadModeRef.current.clear();
    setSelectedFiles((previous) => {
      if (!previous.length) {
        return previous;
      }
      revokePendingUploadPreviews(previous);
      return [];
    });
  };

  const retryPendingUpload = (uploadId) => {
    const normalizedId = String(uploadId || "");
    preparedUploadFileCacheRef.current.delete(normalizedId);
    preparedUploadModeRef.current.delete(normalizedId);
    updatePendingUpload(uploadId, {
      status: "queued",
      progress: 0,
      error: "",
      retryable: false,
    });
  };

  const setPendingUploadsDocumentMode = (enabled) => {
    setSelectedFiles((previous) =>
      previous.map((item) => {
        if (item?.kind !== "image") {
          return item;
        }

        const uploadId = String(item?.id || "");
        preparedUploadFileCacheRef.current.delete(uploadId);
        preparedUploadModeRef.current.delete(uploadId);
        return item;
      })
    );
  };

  const buildUploadedAttachmentPayload = (attachment) => ({
    attachmentUrl: attachment.fileUrl || "",
    attachmentName: attachment.fileName || "",
    attachmentSize: attachment.size || null,
    attachmentContentType: attachment.contentType || "",
    attachmentAsFile: Boolean(attachment.attachmentAsFile),
    attachmentEncryption: attachment.attachmentEncryption || null,
    voiceMessage: null,
  });

  const fetchAnimatedEmojiFile = async (emojiOption) => {
    const assetUrl = String(emojiOption?.assetUrl || "").trim();
    if (!assetUrl) {
      throw new Error("У этого смайлика нет доступного анимированного файла.");
    }

    const response = await fetch(assetUrl, { cache: "force-cache" });
    if (!response.ok) {
      throw new Error("Не удалось загрузить анимированный смайлик.");
    }

    const blob = await response.blob();
    const normalizedUrl = assetUrl.split(/[?#]/, 1)[0];
    const rawFileName = normalizedUrl.split("/").filter(Boolean).pop() || `${String(emojiOption?.key || "emoji").trim() || "emoji"}.gif`;
    const fileType = blob.type || "image/gif";

    return new File([blob], rawFileName, { type: fileType });
  };

  const blockBySlowModeIfNeeded = () => {
    const remainingMs = typeof getSlowModeRemainingMs === "function" ? getSlowModeRemainingMs(scopedChannelId) : 0;
    if (remainingMs <= 0) {
      return false;
    }

    const remainingSeconds = Math.max(1, Math.ceil(remainingMs / 1000));
    const remainingLabel = remainingSeconds < 60
      ? `${remainingSeconds} сек.`
      : `${Math.ceil(remainingSeconds / 60)} мин.`;
    setErrorMessage(`Включен медленный режим. Подождите ${remainingLabel}`);
    return true;
  };

  const send = async () => {
    const rawMessageText = message.trim();
    const filesToSend = selectedFiles.filter((item) => item?.status !== "cancelled");

    if (messageEditState && filesToSend.length) {
      setErrorMessage("Во время редактирования нельзя добавлять новые вложения.");
      return;
    }

    if ((!rawMessageText && !filesToSend.length) || !scopedChannelId || uploadingFile || voiceRecordingState === "holding" || voiceRecordingState === "locked" || voiceRecordingState === "sending") {
      return;
    }

    const now = Date.now();
    const cooldownLeft = MESSAGE_SEND_COOLDOWN_MS - (now - lastSendAtRef.current);
    if (!messageEditState && cooldownLeft > 0) {
      setErrorMessage("Подождите 1.5 секунды перед повторной отправкой.");
      return;
    }

    if (!messageEditState && blockBySlowModeIfNeeded()) {
      return;
    }

    const messageText = await punctuateTypedMessageText(rawMessageText);
    if (!messageText && !filesToSend.length) {
      return;
    }

    const avatar = user?.avatarUrl || user?.avatar || "";
    const outgoingMentions = !isDirectChat ? extractMentionsFromText(messageText, serverMembers, serverRoles) : [];
    let activeUploadId = "";
    let sendSucceeded = false;
    let didResetUiState = false;
    const sendTraceId = startPerfTrace("text-chat", "send-message", {
      attachmentCount: filesToSend.length,
      hasText: Boolean(messageText),
      isDirectChat,
      isEditing: Boolean(messageEditState?.messageId),
    });
    const postSendResetUiState = () => {
      lastSendAtRef.current = Date.now();
      clearChatDraft(user, scopedChannelId);

      flushSync(() => {
        setMessage("");
        setReplyState(null);
        clearPendingUploads();
      });

      startTransition(() => {
        setIsChannelReady(true);
        setActionFeedback(null);
      });
    };

    try {
      setErrorMessage("");

      if (messageEditState?.messageId) {
        const joinTraceId = startPerfTrace("text-chat", "send-message:ensure-channel-joined", {
          isEditing: true,
        });
        try {
          await ensureChannelJoined();
        } finally {
          finishPerfTrace(joinTraceId, {
            isEditing: true,
          });
        }

        const preparedTextPayload = await prepareOutgoingTextPayload({
          text: messageText,
        });

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
        setActionFeedback({ tone: "success", message: "Изменения сохранены" });
        setIsChannelReady(true);
        focusComposerToEnd();
        return;
      }

      const shouldGroupItems = batchUploadOptions?.groupItems !== false;
      if (filesToSend.length) {
        const startSucceeded = startOptimisticAttachmentSend?.({
          channelId: scopedChannelId,
          avatar,
          messageText,
          filesToSend,
          outgoingMentions,
          replyState,
          shouldGroupItems,
          sendAsDocuments: Boolean(batchUploadOptions?.sendAsDocuments),
        });
        if (!startSucceeded) {
          throw new Error("Не удалось запустить отправку вложений.");
        }
      } else {
        const joinTraceId = startPerfTrace("text-chat", "send-message:ensure-channel-joined", {
          isEditing: false,
        });
        try {
          await ensureChannelJoined();
        } finally {
          finishPerfTrace(joinTraceId, {
            isEditing: false,
          });
        }

        const payload = [{
          message: messageText,
          mentions: outgoingMentions,
          replyToMessageId: replyState?.messageId || "",
          replyToUsername: replyState?.username || "",
          replyPreview: replyState?.preview || "",
          attachments: [],
          attachmentUrl: "",
          attachmentName: "",
          attachmentSize: null,
          attachmentContentType: "",
          attachmentAsFile: false,
          attachmentEncryption: null,
          voiceMessage: null,
        }];

        const invokeTraceId = startPerfTrace("text-chat", "send-message:invoke-send-message", {
          payloadCount: payload.length,
          attachmentCount: 0,
        });
        try {
          await sendMessagesCompat(scopedChannelId, avatar, payload);
        } finally {
          finishPerfTrace(invokeTraceId, {
            payloadCount: payload.length,
            attachmentCount: 0,
          });
        }
      }

      if (!didResetUiState) {
        const resetTraceId = startPerfTrace("text-chat", "send-message:post-send-ui-reset", {
          attachmentCount: filesToSend.length,
        });
        try {
          postSendResetUiState();
        } finally {
          finishPerfTraceOnNextFrame(resetTraceId, {
            attachmentCount: filesToSend.length,
          });
        }
      }
      sendSucceeded = true;
      if (isDirectChat && !filesToSend.length) {
        playDirectMessageSound("send");
      }
    } catch (error) {
      const wasCancelled = isCancelledPendingUploadError(activeUploadId, error);
      if (!wasCancelled) {
        console.error(messageEditState ? "EditMessage error:" : "SendMessage error:", error, {
          scopedChannelId,
          isDirectChat,
          messageLength: messageText.length,
          attachmentCount: filesToSend.length,
          attachments: filesToSend.map((item) => ({
            id: String(item?.id || ""),
            kind: String(item?.kind || ""),
            name: String(item?.name || ""),
            size: Number(item?.size || 0),
          })),
        });
      }

      if (!messageEditState) {
        if (!wasCancelled) {
          joinedChannelRef.current = "";
          setIsChannelReady(false);
        }
      }

      if (!wasCancelled) {
        setErrorMessage(getChatErrorMessage(
          error,
          messageEditState
            ? "Не удалось сохранить изменения сообщения."
            : "Не удалось отправить сообщение."
        ));
      }
    } finally {
      activeUploadAbortControllersRef.current.clear();
      cancelledPendingUploadIdsRef.current.clear();
      setUploadingFile(false);
      finishPerfTrace(sendTraceId, {
        attachmentCount: filesToSend.length,
        success: sendSucceeded,
      });
    }
  };

  const sendAnimatedEmoji = async (emojiOption) => {
    if (!emojiOption?.assetUrl || !scopedChannelId || uploadingFile || voiceRecordingState === "holding" || voiceRecordingState === "locked" || voiceRecordingState === "sending") {
      return false;
    }

    if (messageEditState) {
      setErrorMessage("Во время редактирования нельзя отправлять анимированные смайлики.");
      return false;
    }

    const now = Date.now();
    const cooldownLeft = MESSAGE_SEND_COOLDOWN_MS - (now - lastSendAtRef.current);
    if (!message.trim() && !selectedFiles.length && cooldownLeft > 0) {
      setErrorMessage("Подождите 1.5 секунды перед повторной отправкой.");
      return false;
    }

    if (!message.trim() && !selectedFiles.length && blockBySlowModeIfNeeded()) {
      return false;
    }

    try {
      setErrorMessage("");
      const emojiFile = await fetchAnimatedEmojiFile(emojiOption);

      if (message.trim() || selectedFiles.length) {
        appendPendingFiles([emojiFile]);
        focusComposerToEnd();
        return true;
      }

      setUploadingFile(true);
      await ensureChannelJoined();

      const uploaded = await uploadAttachment({
        blob: emojiFile,
        fileName: emojiFile.name,
      });

      const attachment = {
        fileUrl: uploaded?.fileUrl || "",
        fileName: uploaded?.fileName || emojiFile.name,
        size: uploaded?.size || emojiFile.size || null,
        contentType: uploaded?.contentType || emojiFile.type || "image/gif",
        attachmentEncryption: null,
      };
      const avatar = user?.avatarUrl || user?.avatar || "";
      const payload = [{
        message: "",
        mentions: [],
        replyToMessageId: replyState?.messageId || "",
        replyToUsername: replyState?.username || "",
        replyPreview: replyState?.preview || "",
        attachments: [buildUploadedAttachmentPayload(attachment)],
        attachmentUrl: attachment.fileUrl || "",
        attachmentName: attachment.fileName || "",
        attachmentSize: attachment.size || null,
        attachmentContentType: attachment.contentType || "",
        attachmentEncryption: null,
        voiceMessage: null,
      }];

      await sendMessagesCompat(scopedChannelId, avatar, payload);

      lastSendAtRef.current = Date.now();
      setReplyState(null);
      setIsChannelReady(true);
      setActionFeedback(null);
      if (isDirectChat) {
        playDirectMessageSound("send");
      }
      return true;
    } catch (error) {
      console.error("Send animated emoji error:", error);
      joinedChannelRef.current = "";
      setIsChannelReady(false);
      setErrorMessage(getChatErrorMessage(error, "Не удалось отправить анимированный смайлик."));
      return false;
    } finally {
      setUploadingFile(false);
    }
  };

  const sendPoll = async (poll) => {
    if (!scopedChannelId || uploadingFile || voiceRecordingState === "holding" || voiceRecordingState === "locked" || voiceRecordingState === "sending") {
      return false;
    }

    if (messageEditState) {
      setErrorMessage("Во время редактирования нельзя отправлять опрос.");
      return false;
    }

    if (selectedFiles.length) {
      setErrorMessage("Сначала отправьте или очистите текущие вложения.");
      return false;
    }

    const now = Date.now();
    const cooldownLeft = MESSAGE_SEND_COOLDOWN_MS - (now - lastSendAtRef.current);
    if (cooldownLeft > 0) {
      setErrorMessage("Подождите 1.5 секунды перед повторной отправкой.");
      return false;
    }

    if (blockBySlowModeIfNeeded()) {
      return false;
    }

    const avatar = user?.avatarUrl || user?.avatar || "";
    let sendSucceeded = false;
    const sendTraceId = startPerfTrace("text-chat", "send-poll", {
      isDirectChat,
    });

    try {
      setErrorMessage("");
      await ensureChannelJoined();

      await sendMessagesCompat(scopedChannelId, avatar, [{
        message: createPollMessagePayload(poll),
        mentions: [],
        replyToMessageId: replyState?.messageId || "",
        replyToUsername: replyState?.username || "",
        replyPreview: replyState?.preview || "",
        attachments: [],
        attachmentUrl: "",
        attachmentName: "",
        attachmentSize: null,
        attachmentContentType: "",
        attachmentEncryption: null,
        voiceMessage: null,
      }]);

      lastSendAtRef.current = Date.now();
      clearChatDraft(user, scopedChannelId);

      startTransition(() => {
        setMessage("");
        setReplyState(null);
        clearPendingUploads();
        setIsChannelReady(true);
        setActionFeedback(null);
      });

      if (isDirectChat) {
        playDirectMessageSound("send");
      }

      sendSucceeded = true;
      return true;
    } catch (error) {
      console.error("Send poll error:", error);
      joinedChannelRef.current = "";
      setIsChannelReady(false);
      setErrorMessage(getChatErrorMessage(error, "Не удалось отправить опрос."));
      return false;
    } finally {
      finishPerfTrace(sendTraceId, {
        success: sendSucceeded,
        isDirectChat,
      });
    }
  };

  const sendLocation = async ({ latitude, longitude, zoom = LOCATION_MESSAGE_DEFAULT_ZOOM } = {}) => {
    if (!scopedChannelId || uploadingFile || voiceRecordingState === "holding" || voiceRecordingState === "locked" || voiceRecordingState === "sending") {
      return false;
    }

    if (messageEditState) {
      setErrorMessage("Во время редактирования нельзя отправлять локацию.");
      return false;
    }

    if (selectedFiles.length || String(message || "").trim()) {
      setErrorMessage("Сначала отправьте или очистите текущее сообщение и вложения.");
      return false;
    }

    const numericLatitude = Number(latitude);
    const numericLongitude = Number(longitude);
    if (!Number.isFinite(numericLatitude) || !Number.isFinite(numericLongitude)) {
      setErrorMessage("Не удалось определить координаты для отправки.");
      return false;
    }

    const now = Date.now();
    const cooldownLeft = MESSAGE_SEND_COOLDOWN_MS - (now - lastSendAtRef.current);
    if (cooldownLeft > 0) {
      setErrorMessage("Подождите 1.5 секунды перед повторной отправкой.");
      return false;
    }

    if (blockBySlowModeIfNeeded()) {
      return false;
    }

    const normalizedLatitude = Number(numericLatitude.toFixed(6));
    const normalizedLongitude = Number(numericLongitude.toFixed(6));
    const normalizedZoom = Math.max(3, Math.min(18, Math.round(Number(zoom) || LOCATION_MESSAGE_DEFAULT_ZOOM)));
    const locationUrl = `https://www.openstreetmap.org/?mlat=${normalizedLatitude}&mlon=${normalizedLongitude}#map=${normalizedZoom}/${normalizedLatitude}/${normalizedLongitude}`;
    const avatar = user?.avatarUrl || user?.avatar || "";
    let sendSucceeded = false;

    try {
      setErrorMessage("");
      await ensureChannelJoined();

      await sendMessagesCompat(scopedChannelId, avatar, [{
        message: `📍 ${normalizedLatitude}, ${normalizedLongitude}\n${locationUrl}`,
        mentions: [],
        replyToMessageId: replyState?.messageId || "",
        replyToUsername: replyState?.username || "",
        replyPreview: replyState?.preview || "",
        attachments: [],
        attachmentUrl: "",
        attachmentName: "",
        attachmentSize: null,
        attachmentContentType: "",
        attachmentEncryption: null,
        voiceMessage: null,
      }]);

      lastSendAtRef.current = Date.now();
      clearChatDraft(user, scopedChannelId);

      startTransition(() => {
        setMessage("");
        setReplyState(null);
        clearPendingUploads();
        setIsChannelReady(true);
        setActionFeedback(null);
      });

      if (isDirectChat) {
        playDirectMessageSound("send");
      }

      sendSucceeded = true;
      return true;
    } catch (error) {
      console.error("Send location error:", error);
      joinedChannelRef.current = "";
      setIsChannelReady(false);
      setErrorMessage(getChatErrorMessage(error, "Не удалось отправить локацию."));
      return false;
    } finally {
      if (!sendSucceeded) {
        setUploadingFile(false);
      }
    }
  };

  const queueFiles = (files, { source = "unknown", preferSendAsDocuments = false } = {}) => {
    const queueTraceId = startPerfTrace("text-chat", "queue-files", {
      preferSendAsDocuments,
      requestedFileCount: Array.isArray(files) ? files.length : 0,
      source,
    });
    const validFiles = [];
    let hasOversizedFile = false;
    let hasUnsupportedFile = false;

    for (const file of Array.isArray(files) ? files : []) {
      if (file.size > MAX_FILE_SIZE_BYTES) {
        hasOversizedFile = true;
        continue;
      }

      if (!isAllowedChatAttachmentFile(file)) {
        hasUnsupportedFile = true;
        continue;
      }

      validFiles.push(file);
    }

    if (!validFiles.length) {
      setErrorMessage(hasUnsupportedFile
        ? "Этот тип файла нельзя отправить."
        : "Размер файла не должен быть больше 100 МБ.");
      return;
    }

    if (hasOversizedFile && hasUnsupportedFile) {
      setErrorMessage("Некоторые файлы пропущены: неподдерживаемый тип или размер больше 100 МБ.");
    } else if (hasOversizedFile) {
      setErrorMessage("Некоторые файлы пропущены: размер файла не должен быть больше 100 МБ.");
    } else if (hasUnsupportedFile) {
      setErrorMessage("Некоторые файлы пропущены: неподдерживаемый тип файла.");
    } else {
      setErrorMessage("");
    }

    const shouldSendAsDocuments = preferSendAsDocuments || Boolean(batchUploadOptions?.sendAsDocuments);

    if (typeof window !== "undefined") {
      window.__TEND_PENDING_UPLOAD_SHEET_TRACE_ID__ = startPerfTrace("text-chat", "batch-upload-sheet:time-to-visible", {
        preferSendAsDocuments,
        selectedFileCount: validFiles.length,
        source,
      });
    }

    appendPendingFiles(validFiles, { preferSendAsDocuments });
    finishPerfTraceOnNextFrame(queueTraceId, {
      hasOversizedFile,
      instantOptimisticUpload: false,
      preferSendAsDocuments,
      source,
      success: true,
      validFileCount: validFiles.length,
    });
    return "queued-preview";
  };

  const handleFileChange = (event) => {
    const files = Array.from(event.target.files || []);
    event.target.value = "";

    if (!files.length) {
      return;
    }

    queueFiles(files, { source: "file-input" });
  };

  return {
    send,
    sendAnimatedEmoji,
    sendPoll,
    sendLocation,
    handleFileChange,
    queueFiles,
    appendPendingFiles,
    removePendingUpload,
    retryPendingUpload,
    clearPendingUploads,
    cancelActiveUpload,
    setPendingUploadsDocumentMode,
  };
}
