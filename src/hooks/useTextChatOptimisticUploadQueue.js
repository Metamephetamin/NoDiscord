import { useCallback, useEffect, useRef } from "react";
import { prepareOutgoingAttachmentPayload } from "../security/chatPayloadCrypto";
import { preparePendingUploadForSend } from "../utils/chatPendingUploads";
import { getChatErrorMessage } from "../utils/textChatModel";

const ATTACHMENT_UPLOAD_CONCURRENCY = 2;
const PROGRESS_UPDATE_MIN_DELTA = 0.04;

function buildClientTempId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return `client-temp-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function buildUploadDescriptors({
  messageText = "",
  filesToSend = [],
  outgoingMentions = [],
  replyState = null,
  shouldGroupItems = true,
  sendAsDocuments = false,
} = {}) {
  const normalizedReplyToMessageId = String(replyState?.messageId || "").trim();
  const normalizedReplyToUsername = String(replyState?.username || "").trim();
  const normalizedReplyPreview = String(replyState?.preview || "").trim();

  const normalizedFiles = Array.isArray(filesToSend)
    ? filesToSend.filter((item) => item?.file instanceof File)
    : [];

  const toDescriptorAttachment = (pendingUpload, attachmentIndex = 0) => ({
    id: `${String(pendingUpload?.id || "attachment")}:${attachmentIndex}`,
    uploadId: String(pendingUpload?.id || ""),
    file: pendingUpload.file,
    name: String(pendingUpload?.name || pendingUpload?.file?.name || "attachment").trim() || "attachment",
    size: Number(pendingUpload?.size || pendingUpload?.file?.size || 0) || 0,
    type: String(pendingUpload?.type || pendingUpload?.file?.type || "application/octet-stream").trim(),
    kind: String(pendingUpload?.kind || "").trim(),
    attachmentAsFile: pendingUpload?.kind === "image" && Boolean(sendAsDocuments),
  });

  if (!normalizedFiles.length) {
    return [{
      clientTempId: buildClientTempId(),
      message: messageText,
      mentions: outgoingMentions,
      replyToMessageId: normalizedReplyToMessageId,
      replyToUsername: normalizedReplyToUsername,
      replyPreview: normalizedReplyPreview,
      attachments: [],
    }];
  }

  if (shouldGroupItems) {
    return [{
      clientTempId: buildClientTempId(),
      message: messageText,
      mentions: outgoingMentions,
      replyToMessageId: normalizedReplyToMessageId,
      replyToUsername: normalizedReplyToUsername,
      replyPreview: normalizedReplyPreview,
      attachments: normalizedFiles.map((pendingUpload, attachmentIndex) =>
        toDescriptorAttachment(pendingUpload, attachmentIndex)
      ),
    }];
  }

  return normalizedFiles.map((pendingUpload, index) => ({
    clientTempId: buildClientTempId(),
    message: index === 0 ? messageText : "",
    mentions: index === 0 ? outgoingMentions : [],
    replyToMessageId: index === 0 ? normalizedReplyToMessageId : "",
    replyToUsername: index === 0 ? normalizedReplyToUsername : "",
    replyPreview: index === 0 ? normalizedReplyPreview : "",
    attachments: [toDescriptorAttachment(pendingUpload, 0)],
  }));
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

function buildUploadedAttachmentPayload(attachment) {
  return {
    attachmentUrl: attachment.fileUrl || "",
    attachmentName: attachment.fileName || "",
    attachmentSize: attachment.size || null,
    attachmentContentType: attachment.contentType || "",
    attachmentAsFile: Boolean(attachment.attachmentAsFile),
    attachmentEncryption: attachment.attachmentEncryption || null,
    voiceMessage: null,
  };
}

export default function useTextChatOptimisticUploadQueue({
  ensureChannelJoined,
  uploadAttachment,
  sendMessagesCompat,
  playDirectMessageSound,
  isDirectChat,
  onCreateLocalEchoMessages,
  onPatchLocalEchoMessage,
  onPatchLocalEchoAttachment,
  onRemoveLocalEchoMessages,
}) {
  const jobsRef = useRef(new Map());

  const cleanupJob = useCallback((jobId) => {
    const normalizedJobId = String(jobId || "").trim();
    if (!normalizedJobId) {
      return;
    }

    const currentJob = jobsRef.current.get(normalizedJobId);
    if (!currentJob) {
      return;
    }

    currentJob.abortControllers?.forEach((controller) => {
      try {
        controller.abort();
      } catch {
        // ignore cleanup abort failures
      }
    });
    jobsRef.current.delete(normalizedJobId);
  }, []);

  useEffect(() => () => {
    Array.from(jobsRef.current.keys()).forEach((jobId) => cleanupJob(jobId));
  }, [cleanupJob]);

  const patchJobMessage = useCallback((job, patch) => {
    onPatchLocalEchoMessage?.(job.channelId, job.localEchoMessageId, patch);
  }, [onPatchLocalEchoMessage]);

  const patchJobAttachment = useCallback((job, uploadId, patch) => {
    onPatchLocalEchoAttachment?.(job.channelId, job.localEchoMessageId, uploadId, patch);
  }, [onPatchLocalEchoAttachment]);

  const runJob = useCallback(async (jobId) => {
    const normalizedJobId = String(jobId || "").trim();
    if (!normalizedJobId) {
      return false;
    }

    const job = jobsRef.current.get(normalizedJobId);
    if (!job) {
      return false;
    }

    if (job.runningPromise) {
      return job.runningPromise;
    }

    const runningPromise = (async () => {
      const attachmentResults = new Array(job.attachments.length);
      const uploadProgressSnapshot = new Map();
      const abortControllers = job.attachments.map(() => new AbortController());
      let nextUploadIndex = 0;
      let capturedUploadFailure = null;

      job.abortControllers = abortControllers;
      job.cancelRequested = false;
      patchJobMessage(job, {
        localEchoUploadState: "uploading",
        localEchoRetryable: false,
        localEchoError: "",
      });

      try {
        await ensureChannelJoined?.();
        const workerCount = Math.min(ATTACHMENT_UPLOAD_CONCURRENCY, Math.max(job.attachments.length, 1));

        const processSingleAttachment = async (attachmentDraft, index) => {
          const uploadId = String(attachmentDraft?.uploadId || "");
          const uploadAbortController = abortControllers[index];
          uploadProgressSnapshot.set(uploadId, 0.04);
          patchJobAttachment(job, uploadId, {
            localEchoStatus: "preparing",
            localEchoProgress: 2,
            localEchoUploadedBytes: 0,
            localEchoTotalBytes: Number(attachmentDraft?.size || 0) || 0,
            localEchoError: "",
            localEchoRetryable: false,
          });

          await yieldToMainThread();

          const fileForUpload = await preparePendingUploadForSend({
            file: attachmentDraft.file,
          });
          const preparedAttachment = await prepareOutgoingAttachmentPayload({
            file: fileForUpload,
          });

          patchJobAttachment(job, uploadId, {
            localEchoStatus: "uploading",
            localEchoProgress: 6,
            localEchoUploadedBytes: 0,
            localEchoTotalBytes: Number(preparedAttachment?.uploadBlob?.size || attachmentDraft?.size || 0) || 0,
          });

          const uploaded = await uploadAttachment({
            blob: preparedAttachment.uploadBlob,
            fileName: preparedAttachment.uploadFileName || fileForUpload.name || attachmentDraft.name,
            signal: uploadAbortController.signal,
            onProgress: (progressValue) => {
              const normalizedProgressValue = Math.max(0, Math.min(1, Number(progressValue) || 0));
              const previousProgress = uploadProgressSnapshot.get(uploadId) || 0;
              if (normalizedProgressValue < 0.96 && normalizedProgressValue - previousProgress < PROGRESS_UPDATE_MIN_DELTA) {
                return;
              }

              uploadProgressSnapshot.set(uploadId, normalizedProgressValue);
              const totalBytes = Number(preparedAttachment?.uploadBlob?.size || attachmentDraft?.size || 0) || 0;
              patchJobAttachment(job, uploadId, {
                localEchoStatus: "uploading",
                localEchoProgress: Math.max(6, Math.round(normalizedProgressValue * 100)),
                localEchoUploadedBytes: totalBytes > 0 ? Math.round(totalBytes * normalizedProgressValue) : 0,
                localEchoTotalBytes: totalBytes,
              });
            },
          });

          patchJobAttachment(job, uploadId, {
            localEchoStatus: "processing",
            localEchoProgress: 100,
            localEchoUploadedBytes: Number(uploaded?.size || preparedAttachment?.uploadBlob?.size || attachmentDraft?.size || 0) || 0,
            localEchoTotalBytes: Number(uploaded?.size || preparedAttachment?.uploadBlob?.size || attachmentDraft?.size || 0) || 0,
            localEchoRetryable: false,
            localEchoError: "",
          });

          attachmentResults[index] = {
            fileUrl: uploaded?.fileUrl || null,
            fileName: uploaded?.fileName || fileForUpload.name || attachmentDraft.name || "attachment",
            size: uploaded?.size || preparedAttachment.uploadBlob.size || null,
            contentType: uploaded?.contentType || fileForUpload.type || attachmentDraft.type || "application/octet-stream",
            attachmentAsFile: Boolean(attachmentDraft?.attachmentAsFile),
            attachmentEncryption: null,
          };
        };

        await Promise.all(Array.from({ length: workerCount }, async () => {
          while (nextUploadIndex < job.attachments.length && !capturedUploadFailure) {
            const currentIndex = nextUploadIndex;
            nextUploadIndex += 1;

            try {
              await processSingleAttachment(job.attachments[currentIndex], currentIndex);
            } catch (error) {
              capturedUploadFailure = {
                error,
                failedAttachment: job.attachments[currentIndex],
              };
              abortControllers.forEach((controller, controllerIndex) => {
                if (controllerIndex !== currentIndex) {
                  try {
                    controller.abort();
                  } catch {
                    // ignore fan-out abort failures
                  }
                }
              });
              break;
            }
          }
        }));

        if (capturedUploadFailure) {
          throw capturedUploadFailure.error;
        }

        patchJobMessage(job, {
          localEchoUploadState: "processing",
          localEchoRetryable: false,
          localEchoError: "",
        });

        await sendMessagesCompat(job.channelId, job.avatar, [{
          clientTempId: job.clientTempId,
          message: job.message,
          mentions: job.mentions,
          replyToMessageId: job.replyToMessageId,
          replyToUsername: job.replyToUsername,
          replyPreview: job.replyPreview,
          attachments: attachmentResults.filter(Boolean).map(buildUploadedAttachmentPayload),
          attachmentUrl: attachmentResults[0]?.fileUrl || "",
          attachmentName: attachmentResults[0]?.fileName || "",
          attachmentSize: attachmentResults[0]?.size || null,
          attachmentContentType: attachmentResults[0]?.contentType || "",
          attachmentAsFile: Boolean(attachmentResults[0]?.attachmentAsFile),
          attachmentEncryption: attachmentResults[0]?.attachmentEncryption || null,
          voiceMessage: null,
        }], { allowBatch: false });

        patchJobMessage(job, {
          localEchoUploadState: "sent",
          localEchoRetryable: false,
          localEchoError: "",
        });
        job.attachments.forEach((attachmentDraft) => {
          patchJobAttachment(job, attachmentDraft.uploadId, {
            localEchoStatus: "sent",
            localEchoProgress: 100,
            localEchoRetryable: false,
            localEchoError: "",
          });
        });

        if (isDirectChat) {
          playDirectMessageSound?.("send");
        }

        return true;
      } catch (error) {
        const wasCancelled = job.cancelRequested || error?.name === "AbortError" || error?.message === "pending-upload-cancelled";
        const nextMessageState = wasCancelled ? "canceled" : "failed";
        const nextErrorMessage = wasCancelled ? "" : getChatErrorMessage(error, "Не удалось загрузить вложение.");

        patchJobMessage(job, {
          localEchoUploadState: nextMessageState,
          localEchoRetryable: !wasCancelled,
          localEchoError: nextErrorMessage,
        });
        job.attachments.forEach((attachmentDraft) => {
          patchJobAttachment(job, attachmentDraft.uploadId, {
            localEchoStatus: nextMessageState,
            localEchoRetryable: !wasCancelled,
            localEchoError: nextErrorMessage,
          });
        });

        return false;
      } finally {
        job.abortControllers = [];
        job.runningPromise = null;
      }
    })();

    job.runningPromise = runningPromise;
    return runningPromise;
  }, [
    ensureChannelJoined,
    isDirectChat,
    patchJobAttachment,
    patchJobMessage,
    playDirectMessageSound,
    sendMessagesCompat,
    uploadAttachment,
  ]);

  const startOptimisticAttachmentSend = useCallback(({
    channelId,
    avatar = "",
    messageText = "",
    filesToSend = [],
    outgoingMentions = [],
    replyState = null,
    shouldGroupItems = true,
    sendAsDocuments = false,
  } = {}) => {
    const descriptors = buildUploadDescriptors({
      messageText,
      filesToSend,
      outgoingMentions,
      replyState,
      shouldGroupItems,
      sendAsDocuments,
    });
    const optimisticMessages = onCreateLocalEchoMessages?.({
      channelId,
      descriptors,
    }) || [];

    if (!optimisticMessages.length) {
      return false;
    }

    optimisticMessages.forEach((optimisticMessage, index) => {
      const descriptor = descriptors[index];
      if (!descriptor) {
        return;
      }

      const jobId = String(optimisticMessage?.id || "");
      if (!jobId) {
        return;
      }

      jobsRef.current.set(jobId, {
        id: jobId,
        localEchoMessageId: jobId,
        clientTempId: String(descriptor.clientTempId || ""),
        channelId: String(channelId || ""),
        avatar: String(avatar || ""),
        message: String(descriptor.message || ""),
        mentions: Array.isArray(descriptor.mentions) ? descriptor.mentions : [],
        replyToMessageId: String(descriptor.replyToMessageId || ""),
        replyToUsername: String(descriptor.replyToUsername || ""),
        replyPreview: String(descriptor.replyPreview || ""),
        attachments: descriptor.attachments.map((attachment) => ({
          ...attachment,
        })),
        abortControllers: [],
        cancelRequested: false,
        runningPromise: null,
      });

      void runJob(jobId);
    });

    return true;
  }, [onCreateLocalEchoMessages, runJob]);

  const retryLocalEchoUpload = useCallback((messageId) => {
    const normalizedMessageId = String(messageId || "").trim();
    if (!normalizedMessageId) {
      return false;
    }

    const job = jobsRef.current.get(normalizedMessageId);
    if (!job) {
      return false;
    }

    job.cancelRequested = false;
    patchJobMessage(job, {
      localEchoUploadState: "pending",
      localEchoRetryable: false,
      localEchoError: "",
    });
    job.attachments.forEach((attachmentDraft) => {
      patchJobAttachment(job, attachmentDraft.uploadId, {
        localEchoStatus: "pending",
        localEchoProgress: 0,
        localEchoUploadedBytes: 0,
        localEchoTotalBytes: Number(attachmentDraft?.size || 0) || 0,
        localEchoRetryable: false,
        localEchoError: "",
      });
    });

    void runJob(normalizedMessageId);
    return true;
  }, [patchJobAttachment, patchJobMessage, runJob]);

  const cancelLocalEchoUpload = useCallback((messageId) => {
    const normalizedMessageId = String(messageId || "").trim();
    if (!normalizedMessageId) {
      return false;
    }

    const job = jobsRef.current.get(normalizedMessageId);
    if (!job) {
      return false;
    }

    job.cancelRequested = true;
    if (job.abortControllers?.length) {
      job.abortControllers.forEach((controller) => {
        try {
          controller.abort();
        } catch {
          // ignore cancellation failures
        }
      });
      return true;
    }

    patchJobMessage(job, {
      localEchoUploadState: "canceled",
      localEchoRetryable: true,
      localEchoError: "",
    });
    job.attachments.forEach((attachmentDraft) => {
      patchJobAttachment(job, attachmentDraft.uploadId, {
        localEchoStatus: "canceled",
        localEchoRetryable: true,
        localEchoError: "",
      });
    });
    return true;
  }, [patchJobAttachment, patchJobMessage]);

  const removeLocalEchoUpload = useCallback((messageId) => {
    const normalizedMessageId = String(messageId || "").trim();
    if (!normalizedMessageId) {
      return false;
    }

    cleanupJob(normalizedMessageId);
    onRemoveLocalEchoMessages?.([normalizedMessageId]);
    return true;
  }, [cleanupJob, onRemoveLocalEchoMessages]);

  const markLocalEchoReconciled = useCallback((localEchoMessage, serverMessage) => {
    const localEchoMessageId = String(localEchoMessage?.id || "").trim();
    const localClientTempId = String(localEchoMessage?.clientTempId || "").trim();
    if (localEchoMessageId) {
      cleanupJob(localEchoMessageId);
      return;
    }

    const serverClientTempId = String(serverMessage?.clientTempId || "").trim();
    if (!localClientTempId || !serverClientTempId || localClientTempId !== serverClientTempId) {
      return;
    }

    const matchedJobEntry = Array.from(jobsRef.current.entries()).find(([, job]) =>
      String(job?.clientTempId || "") === serverClientTempId
    );
    if (matchedJobEntry) {
      cleanupJob(matchedJobEntry[0]);
    }
  }, [cleanupJob]);

  return {
    startOptimisticAttachmentSend,
    retryLocalEchoUpload,
    cancelLocalEchoUpload,
    removeLocalEchoUpload,
    markLocalEchoReconciled,
  };
}
