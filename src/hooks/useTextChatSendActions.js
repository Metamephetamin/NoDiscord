import { startTransition, useEffect, useRef } from "react";
import chatConnection from "../SignalR/ChatConnect";
import {
  prepareOutgoingAttachmentPayload,
  prepareOutgoingTextPayload,
} from "../security/chatPayloadCrypto";
import { clearChatDraft } from "../utils/chatDrafts";
import {
  createPendingUpload,
  createPendingUploadPreview,
  createPendingUploadThumbnail,
  preparePendingUploadForSend,
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

const ATTACHMENT_UPLOAD_CONCURRENCY = 2;
const THUMBNAIL_PREVIEW_CONCURRENCY = 2;
const FULL_PREVIEW_CONCURRENCY = 1;
const PREPARE_UPLOAD_CONCURRENCY = 1;
const PROGRESS_UPDATE_MIN_DELTA = 0.04;

function createTaskQueueState() {
  return {
    pending: [],
    running: 0,
  };
}

function drainTaskQueue(queueState, concurrency) {
  while (queueState.running < concurrency && queueState.pending.length) {
    const nextTask = queueState.pending.shift();
    queueState.running += 1;
    Promise.resolve()
      .then(nextTask)
      .catch(() => {
        // Individual queue tasks handle their own state/fallbacks.
      })
      .finally(() => {
        queueState.running = Math.max(0, queueState.running - 1);
        drainTaskQueue(queueState, concurrency);
      });
  }
}

function enqueueTask(queueState, concurrency, task) {
  queueState.pending.push(task);
  drainTaskQueue(queueState, concurrency);
}

function yieldToMainThread() {
  return new Promise((resolve) => {
    if (typeof window !== "undefined" && typeof window.requestAnimationFrame === "function") {
      window.requestAnimationFrame(() => resolve());
      return;
    }

    setTimeout(resolve, 16);
  });
}

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
}) {
  const pendingUploadPatchQueueRef = useRef(new Map());
  const pendingUploadPatchFrameRef = useRef(0);
  const uploadProgressSnapshotRef = useRef(new Map());
  const preparedUploadFileCacheRef = useRef(new Map());
  const preparedUploadModeRef = useRef(new Map());
  const uploadPreparationVersionRef = useRef(new Map());
  const previewHydrationVersionRef = useRef(new Map());
  const thumbnailPreviewQueueRef = useRef(createTaskQueueState());
  const fullPreviewQueueRef = useRef(createTaskQueueState());
  const prepareUploadQueueRef = useRef(createTaskQueueState());

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
    uploadProgressSnapshotRef.current.clear();
    preparedUploadFileCacheRef.current.clear();
    preparedUploadModeRef.current.clear();
    uploadPreparationVersionRef.current.clear();
    previewHydrationVersionRef.current.clear();
    thumbnailPreviewQueueRef.current.pending = [];
    fullPreviewQueueRef.current.pending = [];
    prepareUploadQueueRef.current.pending = [];
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
        uploadPreparationVersionRef.current.delete(uploadId);
      }
    });

    nextSelectedFiles.forEach((upload, index) => {
      const uploadId = String(upload?.id || "");
      const compressionMode = String(upload?.compressionMode || "original");
      if (!uploadId) {
        return;
      }

      if (compressionMode === "original") {
        preparedUploadFileCacheRef.current.delete(uploadId);
        preparedUploadModeRef.current.delete(uploadId);
        uploadPreparationVersionRef.current.delete(uploadId);
        return;
      }

      const cachedMode = preparedUploadModeRef.current.get(uploadId);
      if (cachedMode === compressionMode) {
        return;
      }

      const versionToken = Symbol(uploadId);
      uploadPreparationVersionRef.current.set(uploadId, versionToken);
      preparedUploadModeRef.current.set(uploadId, compressionMode);

      enqueueTask(prepareUploadQueueRef.current, PREPARE_UPLOAD_CONCURRENCY, async () => {
        if (uploadPreparationVersionRef.current.get(uploadId) !== versionToken) {
          return;
        }

        try {
          await yieldToMainThread();
          const preparedFile = await preparePendingUploadForSend(upload);
          if (uploadPreparationVersionRef.current.get(uploadId) !== versionToken) {
            return;
          }

          preparedUploadFileCacheRef.current.set(uploadId, preparedFile);
        } catch {
          if (uploadPreparationVersionRef.current.get(uploadId) !== versionToken) {
            return;
          }

          preparedUploadFileCacheRef.current.delete(uploadId);
          preparedUploadModeRef.current.delete(uploadId);
        }
      });
    });
  }, [selectedFiles]);

  const invalidatePreviewHydration = (uploadId) => {
    const normalizedId = String(uploadId || "");
    if (!normalizedId) {
      return;
    }

    previewHydrationVersionRef.current.set(normalizedId, Symbol(normalizedId));
  };

  const queueFullPreviewHydration = (upload, versionToken) => {
    const uploadId = String(upload?.id || "");
    if (!uploadId || (upload?.kind !== "image" && upload?.kind !== "video")) {
      return;
    }

    enqueueTask(fullPreviewQueueRef.current, FULL_PREVIEW_CONCURRENCY, async () => {
      if (previewHydrationVersionRef.current.get(uploadId) !== versionToken) {
        return;
      }

      await yieldToMainThread();

      if (previewHydrationVersionRef.current.get(uploadId) !== versionToken) {
        return;
      }

      if (!upload.previewUrl) {
        const previewUrl = createPendingUploadPreview(upload);
        if (previewHydrationVersionRef.current.get(uploadId) !== versionToken) {
          if (previewUrl) {
            URL.revokeObjectURL(previewUrl);
          }
          return;
        }

        if (previewUrl) {
          schedulePendingUploadPatch(uploadId, { previewUrl });
        }
      }
    });
  };

  const hydratePendingUploadPreviews = (uploads) => {
    (Array.isArray(uploads) ? uploads : []).forEach((upload, index) => {
      const uploadId = String(upload?.id || "");
      if (!uploadId || (upload?.kind !== "image" && upload?.kind !== "video")) {
        return;
      }

      const versionToken = Symbol(uploadId);
      previewHydrationVersionRef.current.set(uploadId, versionToken);

      if (upload.kind !== "image" || upload.thumbnailUrl) {
        queueFullPreviewHydration(upload, versionToken);
        return;
      }

      enqueueTask(thumbnailPreviewQueueRef.current, THUMBNAIL_PREVIEW_CONCURRENCY, async () => {
        if (previewHydrationVersionRef.current.get(uploadId) !== versionToken) {
          return;
        }

        try {
          await yieldToMainThread();
          const thumbnailUrl = await createPendingUploadThumbnail(upload);
          if (previewHydrationVersionRef.current.get(uploadId) !== versionToken) {
            if (thumbnailUrl) {
              URL.revokeObjectURL(thumbnailUrl);
            }
            return;
          }

          if (thumbnailUrl) {
            schedulePendingUploadPatch(uploadId, { thumbnailUrl });
          }
        } catch {
          // Keep the fallback visible if thumbnail generation fails.
        }

        queueFullPreviewHydration(upload, versionToken);
      });
    });
  };

  const appendPendingFiles = (files, { replace = false } = {}) => {
    const validFiles = Array.isArray(files) ? files.filter((file) => file instanceof File) : [];
    if (!validFiles.length) {
      return false;
    }

    const shouldSendAsDocuments = Boolean(batchUploadOptions?.sendAsDocuments);
    const nextUploads = validFiles.map((file) => {
      const nextUpload = createPendingUpload(file);
      if (shouldSendAsDocuments && nextUpload.kind === "image") {
        return {
          ...nextUpload,
          compressionMode: "file",
        };
      }

      return nextUpload;
    });
    startTransition(() => {
      setSelectedFiles((previous) => {
        if (replace) {
          previous.forEach((item) => invalidatePreviewHydration(item?.id));
          revokePendingUploadPreviews(previous);
          return nextUploads;
        }

        return [...previous, ...nextUploads];
      });
    });

    hydratePendingUploadPreviews(nextUploads);
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
    uploadPreparationVersionRef.current.set(normalizedId, Symbol(normalizedId));
    invalidatePreviewHydration(normalizedId);

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
    Array.from(uploadPreparationVersionRef.current.keys()).forEach((uploadId) => {
      uploadPreparationVersionRef.current.set(uploadId, Symbol(uploadId));
    });
    uploadPreparationVersionRef.current.clear();
    Array.from(previewHydrationVersionRef.current.keys()).forEach((uploadId) => {
      invalidatePreviewHydration(uploadId);
    });
    previewHydrationVersionRef.current.clear();

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
    uploadPreparationVersionRef.current.set(normalizedId, Symbol(normalizedId));
    updatePendingUpload(uploadId, {
      status: "queued",
      progress: 0,
      error: "",
      retryable: false,
    });
  };

  const updatePendingUploadCompressionMode = (uploadId, compressionMode) => {
    const normalizedMode = ["compressed", "original", "file"].includes(String(compressionMode || ""))
      ? compressionMode
      : "original";
    const normalizedId = String(uploadId || "");
    preparedUploadFileCacheRef.current.delete(normalizedId);
    preparedUploadModeRef.current.delete(normalizedId);
    uploadPreparationVersionRef.current.set(normalizedId, Symbol(normalizedId));
    updatePendingUpload(uploadId, { compressionMode: normalizedMode });
  };

  const updatePendingUploadSpoilerMode = (uploadId, enabled) => {
    updatePendingUpload(uploadId, {
      hideWithSpoiler: Boolean(enabled),
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
        uploadPreparationVersionRef.current.set(uploadId, Symbol(uploadId));
        return { ...item, compressionMode: enabled ? "file" : "original" };
      })
    );
  };

  const buildUploadedAttachmentPayload = (attachment) => ({
    attachmentUrl: attachment.fileUrl || "",
    attachmentName: attachment.fileName || "",
    attachmentSize: attachment.size || null,
    attachmentContentType: attachment.contentType || "",
    attachmentSpoiler: Boolean(attachment.attachmentSpoiler),
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

  const send = async () => {
    const rawMessageText = message.trim();
    const messageText = await punctuateTypedMessageText(rawMessageText);
    const filesToSend = selectedFiles.filter((item) => item?.status !== "cancelled");

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
    const outgoingMentions = !isDirectChat ? extractMentionsFromText(messageText, serverMembers, serverRoles) : [];
    let activeUploadId = "";
    let sendSucceeded = false;
    const sendTraceId = startPerfTrace("text-chat", "send-message", {
      attachmentCount: filesToSend.length,
      hasText: Boolean(messageText),
      isDirectChat,
      isEditing: Boolean(messageEditState?.messageId),
    });
    const postSendResetUiState = () => {
      forceScrollToBottomRef.current = true;
      lastSendAtRef.current = Date.now();
      clearChatDraft(user, scopedChannelId);

      startTransition(() => {
        setMessage("");
        setReplyState(null);
        clearPendingUploads();
        setIsChannelReady(true);
        setActionFeedback(null);
      });
    };

    try {
      setErrorMessage("");
      const joinTraceId = startPerfTrace("text-chat", "send-message:ensure-channel-joined", {
        isEditing: Boolean(messageEditState?.messageId),
      });
      try {
        await ensureChannelJoined();
      } finally {
        finishPerfTrace(joinTraceId, {
          isEditing: Boolean(messageEditState?.messageId),
        });
      }

      if (messageEditState?.messageId) {
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

      let attachments = [];
      const hasDocumentUploads = filesToSend.some((item) => String(item?.compressionMode || "original") === "file");
      if (filesToSend.length) {
        const uploadTraceId = startPerfTrace("text-chat", "send-message:upload-attachments", {
          attachmentCount: filesToSend.length,
          concurrency: Math.min(ATTACHMENT_UPLOAD_CONCURRENCY, filesToSend.length),
        });
        setUploadingFile(true);
        try {
          const uploadAbortControllers = filesToSend.map(() => new AbortController());
          const attachmentResults = new Array(filesToSend.length);
          let nextUploadIndex = 0;
          let capturedUploadFailure = null;

          const processSingleUpload = async (pendingUpload, index) => {
            const uploadId = String(pendingUpload?.id || "");
            if (uploadId) {
              activeUploadId = uploadId;
              uploadProgressSnapshotRef.current.set(uploadId, 0.1);
              schedulePendingUploadPatch(uploadId, {
                status: "preparing",
                progress: 0.1,
                error: "",
                retryable: false,
              });
            }

            await yieldToMainThread();

            const normalizedCompressionMode = String(pendingUpload?.compressionMode || "original");
            const cachedCompressionMode = uploadId ? preparedUploadModeRef.current.get(uploadId) : "";
            let fileForUpload =
              uploadId && cachedCompressionMode === normalizedCompressionMode
                ? preparedUploadFileCacheRef.current.get(uploadId)
                : null;
            if (!(fileForUpload instanceof File)) {
              fileForUpload = await preparePendingUploadForSend(pendingUpload);
              if (uploadId) {
                preparedUploadFileCacheRef.current.set(uploadId, fileForUpload);
                preparedUploadModeRef.current.set(uploadId, normalizedCompressionMode);
              }
            }

            await yieldToMainThread();

            const preparedAttachment = await prepareOutgoingAttachmentPayload({
              file: fileForUpload,
            });

            if (uploadId) {
              uploadProgressSnapshotRef.current.set(uploadId, 0.28);
              schedulePendingUploadPatch(uploadId, {
                status: "uploading",
                progress: 0.28,
              });
            }

            const uploaded = await uploadAttachment({
              blob: preparedAttachment.uploadBlob,
              fileName: preparedAttachment.uploadFileName || fileForUpload.name || pendingUpload.name || `attachment-${Date.now()}-${index}`,
              signal: uploadAbortControllers[index]?.signal,
              onProgress: (progressValue) => {
                if (!uploadId) {
                  return;
                }

                const normalizedProgress = 0.28 + (Math.max(0, Math.min(1, Number(progressValue) || 0)) * 0.68);
                const previousProgress = uploadProgressSnapshotRef.current.get(uploadId) || 0;
                if (normalizedProgress < 0.96 && normalizedProgress - previousProgress < PROGRESS_UPDATE_MIN_DELTA) {
                  return;
                }

                uploadProgressSnapshotRef.current.set(uploadId, normalizedProgress);
                schedulePendingUploadPatch(uploadId, {
                  status: "uploading",
                  progress: normalizedProgress,
                });
              },
            });

            if (uploadId) {
              uploadProgressSnapshotRef.current.delete(uploadId);
              preparedUploadFileCacheRef.current.delete(uploadId);
              preparedUploadModeRef.current.delete(uploadId);
              uploadPreparationVersionRef.current.delete(uploadId);
              schedulePendingUploadPatch(uploadId, {
                status: "done",
                progress: 1,
                retryable: false,
              });
            }

            const shouldTreatAsFile = pendingUpload?.kind === "image"
              && (normalizedCompressionMode === "file" || Boolean(batchUploadOptions?.sendAsDocuments));

            attachmentResults[index] = {
              fileUrl: uploaded?.fileUrl || null,
              fileName: uploaded?.fileName || fileForUpload.name || pendingUpload.name || "attachment",
              size: uploaded?.size || preparedAttachment.uploadBlob.size || null,
              contentType: uploaded?.contentType || fileForUpload.type || pendingUpload.type || "application/octet-stream",
              attachmentSpoiler: Boolean(pendingUpload?.hideWithSpoiler),
              attachmentAsFile: shouldTreatAsFile,
              attachmentEncryption: null,
            };
          };

          const workerCount = Math.min(ATTACHMENT_UPLOAD_CONCURRENCY, filesToSend.length);
          await Promise.all(Array.from({ length: workerCount }, async () => {
            while (nextUploadIndex < filesToSend.length && !capturedUploadFailure) {
              const currentIndex = nextUploadIndex;
              nextUploadIndex += 1;

              try {
                await processSingleUpload(filesToSend[currentIndex], currentIndex);
              } catch (error) {
                capturedUploadFailure = {
                  error,
                  uploadId: String(filesToSend[currentIndex]?.id || ""),
                  failedIndex: currentIndex,
                };
                uploadAbortControllers.forEach((controller, controllerIndex) => {
                  if (controllerIndex !== currentIndex) {
                    controller.abort();
                  }
                });
                break;
              }
            }
          }));

          flushPendingUploadPatches();

          if (capturedUploadFailure) {
            const { error, uploadId, failedIndex } = capturedUploadFailure;
            activeUploadId = uploadId;

            if (uploadId) {
              schedulePendingUploadPatch(uploadId, {
                status: "error",
                progress: 0,
                error: getChatErrorMessage(error, "Не удалось загрузить вложение."),
                retryable: true,
              });
            }

            filesToSend.forEach((item, itemIndex) => {
              const itemId = String(item?.id || "");
              if (!itemId || itemIndex === failedIndex || itemIndex > failedIndex) {
                return;
              }

              schedulePendingUploadPatch(itemId, (current) => (
                current?.status === "done"
                  ? { ...current, status: "queued", progress: 0 }
                  : current
              ));
            });

            flushPendingUploadPatches();
            throw error;
          }

          attachments = attachmentResults.filter(Boolean);
        } finally {
          finishPerfTrace(uploadTraceId, {
            attachmentCount: filesToSend.length,
            uploadedCount: attachments.length,
            concurrency: Math.min(ATTACHMENT_UPLOAD_CONCURRENCY, filesToSend.length),
          });
        }
      }

      const shouldGroupItems = !hasDocumentUploads && batchUploadOptions?.groupItems !== false;
      const payload = shouldGroupItems
        ? [{
            message: messageText,
            mentions: outgoingMentions,
            replyToMessageId: replyState?.messageId || "",
            replyToUsername: replyState?.username || "",
            replyPreview: replyState?.preview || "",
            attachments: attachments.map(buildUploadedAttachmentPayload),
            attachmentUrl: attachments[0]?.fileUrl || "",
            attachmentName: attachments[0]?.fileName || "",
            attachmentSize: attachments[0]?.size || null,
            attachmentContentType: attachments[0]?.contentType || "",
            attachmentSpoiler: Boolean(attachments[0]?.attachmentSpoiler),
            attachmentAsFile: Boolean(attachments[0]?.attachmentAsFile),
            attachmentEncryption: attachments[0]?.attachmentEncryption || null,
            voiceMessage: null,
          }]
        : attachments.map((attachment, index) => ({
            message: index === 0 ? messageText : "",
            mentions: index === 0 ? outgoingMentions : [],
            replyToMessageId: index === 0 ? (replyState?.messageId || "") : "",
            replyToUsername: index === 0 ? (replyState?.username || "") : "",
            replyPreview: index === 0 ? (replyState?.preview || "") : "",
            attachments: [buildUploadedAttachmentPayload(attachment)],
            attachmentUrl: attachment.fileUrl || "",
            attachmentName: attachment.fileName || "",
            attachmentSize: attachment.size || null,
            attachmentContentType: attachment.contentType || "",
            attachmentSpoiler: Boolean(attachment.attachmentSpoiler),
            attachmentAsFile: Boolean(attachment.attachmentAsFile),
            attachmentEncryption: attachment.attachmentEncryption || null,
            voiceMessage: null,
          }));

      const invokeTraceId = startPerfTrace("text-chat", "send-message:invoke-send-message", {
        payloadCount: payload.length,
        attachmentCount: attachments.length,
      });
      try {
        await sendMessagesCompat(scopedChannelId, avatar, payload);
      } finally {
        finishPerfTrace(invokeTraceId, {
          payloadCount: payload.length,
          attachmentCount: attachments.length,
        });
      }

      const resetTraceId = startPerfTrace("text-chat", "send-message:post-send-ui-reset", {
        attachmentCount: attachments.length,
      });
      try {
        postSendResetUiState();
      } finally {
        finishPerfTraceOnNextFrame(resetTraceId, {
          attachmentCount: attachments.length,
        });
      }
      sendSucceeded = true;
      if (isDirectChat) {
        playDirectMessageSound("send");
      }
    } catch (error) {
      console.error(messageEditState ? "EditMessage error:" : "SendMessage error:", error, {
        scopedChannelId,
        isDirectChat,
        messageLength: messageText.length,
        attachmentCount: filesToSend.length,
        attachments: filesToSend.map((item) => ({
          id: String(item?.id || ""),
          kind: String(item?.kind || ""),
          name: String(item?.name || ""),
          compressionMode: String(item?.compressionMode || "original"),
          hideWithSpoiler: Boolean(item?.hideWithSpoiler),
          size: Number(item?.size || 0),
        })),
      });

      if (!messageEditState) {
        if (activeUploadId) {
          flushPendingUploadPatches();
          schedulePendingUploadPatch(activeUploadId, {
            status: "error",
            progress: 0,
            error: getChatErrorMessage(error, "Не удалось загрузить вложение."),
            retryable: true,
          });
        }

        filesToSend
          .filter((item) => String(item?.id || "") !== activeUploadId)
          .forEach((item) => {
            schedulePendingUploadPatch(item.id, (current) => (
              current?.status === "done"
                ? { ...current, status: "queued", progress: 0 }
                : current
            ));
          });

        flushPendingUploadPatches();
        joinedChannelRef.current = "";
        setIsChannelReady(false);
      }

      setErrorMessage(getChatErrorMessage(
        error,
        messageEditState
          ? "Не удалось сохранить изменения сообщения."
          : "Не удалось отправить сообщение."
      ));
    } finally {
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

      forceScrollToBottomRef.current = true;
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

      forceScrollToBottomRef.current = true;
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

  const queueFiles = (files, { source = "unknown" } = {}) => {
    const queueTraceId = startPerfTrace("text-chat", "queue-files", {
      requestedFileCount: Array.isArray(files) ? files.length : 0,
      source,
    });
    const validFiles = [];
    let hasOversizedFile = false;

    for (const file of Array.isArray(files) ? files : []) {
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

    appendPendingFiles(validFiles);
    finishPerfTraceOnNextFrame(queueTraceId, {
      hasOversizedFile,
      source,
      success: true,
      validFileCount: validFiles.length,
    });
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
    handleFileChange,
    queueFiles,
    appendPendingFiles,
    removePendingUpload,
    retryPendingUpload,
    clearPendingUploads,
    updatePendingUploadCompressionMode,
    updatePendingUploadSpoilerMode,
    setPendingUploadsDocumentMode,
  };
}
