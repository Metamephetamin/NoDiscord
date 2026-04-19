import { memo, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import AnimatedAvatar from "./AnimatedAvatar";
import AnimatedEmojiGlyph from "./AnimatedEmojiGlyph";
import PendingUploadPreview from "./PendingUploadPreview";
import TextChatBatchUploadSheet from "./TextChatBatchUploadSheet";
import TextChatPollComposerModal from "./TextChatPollComposerModal";
import { extractMentionsFromText, segmentMessageTextByMentions } from "../utils/messageMentions";
import {
  buildVoiceMessageLabel,
  COMPOSER_EMOJI_OPTIONS,
  ENABLE_SPEECH_INPUT_BUTTON,
  ENABLE_VOICE_MESSAGE_BUTTON,
} from "../utils/textChatModel";
import { formatFileSize } from "../utils/textChatHelpers";
import { recordPerfEvent, startPerfTrace } from "../utils/perf";

function normalizePendingUploadProgress(progressValue) {
  const numericProgress = Number(progressValue);
  if (!Number.isFinite(numericProgress) || numericProgress <= 0) {
    return 0;
  }

  if (numericProgress <= 1) {
    return Math.max(0, Math.min(100, Math.round(numericProgress * 100)));
  }

  return Math.max(0, Math.min(100, Math.round(numericProgress)));
}

const SKIP_NEXT_WINDOW_FOCUS_REFRESH_FLAG = "__TEND_SKIP_NEXT_WINDOW_FOCUS_REFRESH__";
const NATIVE_ATTACHMENT_PICKER_DISABLED_FLAG = "__TEND_NATIVE_ATTACHMENT_PICKER_DISABLED__";

function getPerfNow() {
  return typeof performance !== "undefined" && typeof performance.now === "function"
    ? performance.now()
    : Date.now();
}

function logUploadDiagnostic(action, payload = {}, durationMs = 0) {
  if (!import.meta.env.DEV) {
    return;
  }

  try {
    console.warn("[upload-diagnostics]", JSON.stringify({
      action,
      durationMs: Number((Number(durationMs) || 0).toFixed(2)),
      at: new Date().toISOString(),
      ...payload,
    }));
  } catch {
    console.warn(`[upload-diagnostics] ${action}`);
  }
}

function createFileFromNativePickerPayload(payload) {
  const bytes = payload?.bytes;
  let fileBytes = null;

  if (bytes instanceof ArrayBuffer) {
    fileBytes = bytes;
  } else if (ArrayBuffer.isView(bytes)) {
    fileBytes = bytes.byteOffset === 0 && bytes.byteLength === bytes.buffer.byteLength
      ? bytes.buffer
      : bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  } else if (Array.isArray(bytes)) {
    fileBytes = new Uint8Array(bytes).buffer;
  }

  if (!fileBytes) {
    return null;
  }

  return new File([fileBytes], String(payload?.name || "attachment").trim() || "attachment", {
    type: String(payload?.type || "").trim() || "application/octet-stream",
    lastModified: Number(payload?.lastModified) || Date.now(),
  });
}

function buildNativePickerQueueSource(kind) {
  return kind === "document" ? "electron-document-picker" : "electron-media-picker";
}

function TextChatComposer({
  selectedFiles,
  uploadingFile,
  composerDropActive,
  replyState,
  messageEditState,
  voiceRecordingState,
  voiceRecordingDurationMs,
  speechRecognitionActive,
  composerEmojiButtonRef,
  composerEmojiPickerOpen,
  composerEmojiPickerRef,
  mentionSuggestionsOpen,
  mentionSuggestions,
  mentionSuggestionsRef,
  selectedMentionSuggestionIndex,
  textareaRef,
  message,
  serverMembers,
  serverRoles,
  batchUploadOptions,
  preferExplicitSend,
  onFileChange,
  onQueueFiles,
  onRemovePendingUpload,
  onRetryPendingUpload,
  onClearPendingUploads,
  onToggleBatchUploadGrouping,
  onToggleBatchUploadSendAsDocuments,
  onToggleBatchUploadRememberChoice,
  onStopReplying,
  onStopEditing,
  onCancelVoiceRecording,
  onSpeechRecognitionToggle,
  onPaste,
  onSyncComposerSelection,
  onToggleEmojiPicker,
  onInsertEmoji,
  onSendAnimatedEmoji,
  onSendPoll,
  onApplyMentionSuggestion,
  onSelectMentionSuggestionIndex,
  onCloseMentionSuggestions,
  onMessageChange,
  onStopSpeechRecognition,
  onStartEditingLatestOwnMessage,
  onVoiceRecordPointerDown,
  onVoiceRecordPointerMove,
  onVoiceRecordPointerUp,
  onVoiceRecordPointerCancel,
  onSend,
}) {
  const [emojiPreviewCount, setEmojiPreviewCount] = useState(8);
  const [pollComposerOpen, setPollComposerOpen] = useState(false);
  const [pendingBatchSelection, setPendingBatchSelection] = useState(null);
  const composerHighlightRef = useRef(null);
  const messageComposerRef = useRef(null);
  const mediaFileInputRef = useRef(null);
  const documentFileInputRef = useRef(null);
  const pendingBatchQueueFrameRef = useRef([]);
  const pendingPickerShellTimeoutRef = useRef(0);
  const pendingBatchSelectionRef = useRef(null);
  const selectedFilesLengthRef = useRef(0);
  const attachPickerKindRef = useRef("media");
  const pickerDiagnosticRef = useRef({
    active: false,
    openedAt: 0,
    kind: "media",
  });
  const deferredMessage = useDeferredValue(message);
  const composerMentionSegments = useMemo(
    () => {
      const normalizedMessage = String(deferredMessage || "");
      if (!normalizedMessage.includes("@")) {
        return [{ text: normalizedMessage, isMention: false }];
      }

      return segmentMessageTextByMentions(
        normalizedMessage,
        extractMentionsFromText(normalizedMessage, serverMembers, serverRoles)
      );
    },
    [deferredMessage, serverMembers, serverRoles]
  );
  pendingBatchSelectionRef.current = pendingBatchSelection;
  selectedFilesLengthRef.current = selectedFiles.length;
  const shouldRenderComposerHighlight = composerMentionSegments.some((segment) => segment?.isMention);
  const cancelPendingBatchQueue = () => {
    if (!pendingBatchQueueFrameRef.current.length || typeof window === "undefined") {
      return;
    }

    const cancelFrame =
      typeof window.cancelAnimationFrame === "function"
        ? window.cancelAnimationFrame.bind(window)
        : window.clearTimeout.bind(window);

    pendingBatchQueueFrameRef.current.forEach((handle) => {
      if (handle?.kind === "timeout") {
        window.clearTimeout(handle.id);
        return;
      }

      cancelFrame(handle?.id ?? handle);
    });
    pendingBatchQueueFrameRef.current = [];
  };

  const scheduleSelectedFilesQueue = (
    selectedInputFiles,
    {
      inputChangeStartedAt,
      shouldPreferSendAsDocuments,
      source,
    }
  ) => {
    if (typeof onQueueFiles !== "function" || typeof window === "undefined") {
      return;
    }

    const scheduleFrame =
      typeof window.requestAnimationFrame === "function"
        ? window.requestAnimationFrame.bind(window)
        : (callback) => window.setTimeout(callback, 16);

    cancelPendingBatchQueue();

    const firstFrameId = scheduleFrame(() => {
      const timeoutId = window.setTimeout(() => {
        pendingBatchQueueFrameRef.current = [];
        recordPerfEvent("text-chat", "file-picker:queue-files-callback", {
          selectedFileCount: selectedInputFiles.length,
          source,
        }, getPerfNow() - inputChangeStartedAt);
        logUploadDiagnostic("queue-files-callback-after-paint", {
          selectedFileCount: selectedInputFiles.length,
          source,
        }, getPerfNow() - inputChangeStartedAt);
        onQueueFiles(selectedInputFiles, {
          preferSendAsDocuments: shouldPreferSendAsDocuments,
          source,
        });
      });
      pendingBatchQueueFrameRef.current = [{ kind: "timeout", id: timeoutId }];
    });

    pendingBatchQueueFrameRef.current = [{ kind: "frame", id: firstFrameId }];
  };

  const clearPendingPickerShellTimeout = () => {
    if (!pendingPickerShellTimeoutRef.current || typeof window === "undefined") {
      return;
    }

    window.clearTimeout(pendingPickerShellTimeoutRef.current);
    pendingPickerShellTimeoutRef.current = 0;
  };

  const showPickerReturnShell = ({ kind = "media", source = "file-picker-focus" } = {}) => {
    if (typeof onQueueFiles !== "function") {
      return;
    }

    const normalizedKind = kind === "document" ? "document" : "media";
    if (pendingBatchSelectionRef.current || selectedFilesLengthRef.current > 0) {
      return;
    }

    flushSync(() => {
      setPendingBatchSelection({
        fileCount: 1,
        firstFileName: "",
        layout: normalizedKind === "document" ? "document" : "media",
        waitingForPicker: true,
      });
    });
    logUploadDiagnostic("picker-return-shell-shown", {
      kind: normalizedKind,
      source,
    });

    clearPendingPickerShellTimeout();
    if (typeof window !== "undefined") {
      pendingPickerShellTimeoutRef.current = window.setTimeout(() => {
        pendingPickerShellTimeoutRef.current = 0;
        setPendingBatchSelection((previous) => (previous?.waitingForPicker ? null : previous));
      }, 15000);
    }
  };

  const openPendingBatchSheetForFiles = (
    selectedInputFiles,
    {
      inputChangeStartedAt,
      shouldPreferSendAsDocuments,
      source,
      pendingLogAction = "pending-selection-flushed",
      skipQueue = false,
    }
  ) => {
    if (!selectedInputFiles.length || typeof onQueueFiles !== "function") {
      return false;
    }

    if (typeof window !== "undefined") {
      window.__TEND_PENDING_UPLOAD_SHELL_TRACE_ID__ = startPerfTrace("text-chat", "batch-upload-sheet:pending-shell-visible", {
        selectedFileCount: selectedInputFiles.length,
        source,
      });
    }

    flushSync(() => {
      setPendingBatchSelection({
        fileCount: selectedInputFiles.length,
        firstFileName: selectedInputFiles[0]?.name || "",
        layout: shouldPreferSendAsDocuments ? "document" : "media",
        waitingForPicker: false,
      });
    });
    recordPerfEvent("text-chat", "file-picker:pending-selection-flushed", {
      selectedFileCount: selectedInputFiles.length,
      source,
    }, getPerfNow() - inputChangeStartedAt);
    logUploadDiagnostic(pendingLogAction, {
      selectedFileCount: selectedInputFiles.length,
      source,
    }, getPerfNow() - inputChangeStartedAt);

    onToggleBatchUploadSendAsDocuments(shouldPreferSendAsDocuments);
    if (!skipQueue) {
      scheduleSelectedFilesQueue(selectedInputFiles, {
        inputChangeStartedAt,
        shouldPreferSendAsDocuments,
        source,
      });
    }
    return true;
  };

  const handleAttachFileChange = (event) => {
    const inputChangeStartedAt = getPerfNow();
    const pickerOpenedAt = typeof window !== "undefined"
      ? Number(window.__TEND_FILE_PICKER_OPENED_AT__ || 0)
      : 0;
    const pickerDiagnostic = pickerDiagnosticRef.current;
    messageComposerRef.current?.classList.remove("message-composer--attach-menu-open");
    const selectedInputFiles = Array.from(event?.target?.files || []);
    const selectedFromDocumentPicker = attachPickerKindRef.current === "document";
    const allSelectedAreImages = selectedInputFiles.length > 0
      && selectedInputFiles.every((file) => String(file?.type || "").startsWith("image/"));
    const shouldPreferSendAsDocuments = selectedFromDocumentPicker || !allSelectedAreImages;
    const shouldOpenPendingBatchSheet = selectedInputFiles.length > 0
      && typeof onQueueFiles === "function";
    logUploadDiagnostic("input-change-start", {
      selectedFileCount: selectedInputFiles.length,
      selectedFromDocumentPicker,
      allSelectedAreImages,
      shouldPreferSendAsDocuments,
      shouldOpenPendingBatchSheet,
      msSincePickerOpen: pickerOpenedAt ? inputChangeStartedAt - pickerOpenedAt : 0,
      pickerActive: Boolean(pickerDiagnostic.active),
      pickerKind: pickerDiagnostic.kind,
      fileSummary: selectedInputFiles.slice(0, 8).map((file) => ({
        name: String(file?.name || ""),
        type: String(file?.type || ""),
        size: Number(file?.size || 0),
      })),
    });
    recordPerfEvent("text-chat", "file-picker:input-change", {
      selectedFileCount: selectedInputFiles.length,
      selectedFromDocumentPicker,
      allSelectedAreImages,
      shouldPreferSendAsDocuments,
      shouldOpenPendingBatchSheet,
      fileSummary: selectedInputFiles.slice(0, 8).map((file) => ({
        name: String(file?.name || ""),
        type: String(file?.type || ""),
        size: Number(file?.size || 0),
      })),
    });

    if (!selectedInputFiles.length) {
      clearPendingPickerShellTimeout();
      setPendingBatchSelection(null);
    } else if (shouldOpenPendingBatchSheet) {
      clearPendingPickerShellTimeout();
      openPendingBatchSheetForFiles(selectedInputFiles, {
        inputChangeStartedAt,
        selectedFromDocumentPicker,
        shouldPreferSendAsDocuments,
        source: selectedFromDocumentPicker ? "document-input" : "file-input",
      });
    } else {
      onFileChange(event);
    }

    if (event?.target) {
      event.target.value = "";
      event.target.blur?.();
    }

    pickerDiagnosticRef.current = {
      active: false,
      openedAt: 0,
      kind: "media",
    };
    attachPickerKindRef.current = "media";
  };

  useEffect(() => {
    if (typeof window === "undefined") {
      return undefined;
    }

    const handleWindowBlur = () => {
      const pickerDiagnostic = pickerDiagnosticRef.current;
      if (!pickerDiagnostic.active) {
        return;
      }

      logUploadDiagnostic("picker-window-blur", {
        kind: pickerDiagnostic.kind,
      }, getPerfNow() - pickerDiagnostic.openedAt);
    };

    const handleWindowFocus = () => {
      const pickerDiagnostic = pickerDiagnosticRef.current;
      if (!pickerDiagnostic.active) {
        return;
      }

      logUploadDiagnostic("picker-window-focus", {
        kind: pickerDiagnostic.kind,
      }, getPerfNow() - pickerDiagnostic.openedAt);
      showPickerReturnShell({
        kind: pickerDiagnostic.kind,
        source: "window-focus",
      });
    };

    window.addEventListener("blur", handleWindowBlur);
    window.addEventListener("focus", handleWindowFocus);

    return () => {
      window.removeEventListener("blur", handleWindowBlur);
      window.removeEventListener("focus", handleWindowFocus);
    };
  }, []);

  const releaseAttachMenuFocusForFilePicker = () => {
    if (typeof document !== "undefined") {
      document.activeElement?.blur?.();
    }
  };

  const suppressAttachMenuForFilePicker = () => {
    releaseAttachMenuFocusForFilePicker();
    messageComposerRef.current?.classList.remove("message-composer--attach-menu-open");
  };

  const openNativeAttachFilePicker = async (kind) => {
    const pickerApi = typeof window !== "undefined" ? window.electronAttachmentPicker : null;
    if (
      (typeof window !== "undefined" && window[NATIVE_ATTACHMENT_PICKER_DISABLED_FLAG])
      || !pickerApi
      || typeof pickerApi.open !== "function"
      || typeof pickerApi.readFiles !== "function"
    ) {
      return false;
    }

    const normalizedKind = kind === "document" ? "document" : "media";
    const nativePickerStartedAt = getPerfNow();
    suppressAttachMenuForFilePicker();
    if (typeof window !== "undefined") {
      window[SKIP_NEXT_WINDOW_FOCUS_REFRESH_FLAG] = true;
      window.__TEND_FILE_PICKER_OPENED_AT__ = nativePickerStartedAt;
    }
    pickerDiagnosticRef.current = {
      active: true,
      openedAt: nativePickerStartedAt,
      kind: normalizedKind,
    };
    logUploadDiagnostic("native-picker-open", {
      kind: normalizedKind,
    });

    let descriptors = [];
    let preservePickerKindForFallback = false;
    try {
      const result = await pickerApi.open({ kind: normalizedKind });
      const pickerResolvedAt = getPerfNow();
      descriptors = Array.isArray(result?.files) ? result.files : [];
      const tokens = descriptors.map((item) => String(item?.token || "").trim()).filter(Boolean);
      logUploadDiagnostic("native-picker-result", {
        kind: normalizedKind,
        canceled: Boolean(result?.canceled) || descriptors.length < 1,
        selectedFileCount: descriptors.length,
      }, pickerResolvedAt - nativePickerStartedAt);

      if (result?.canceled || descriptors.length < 1 || tokens.length < 1) {
        clearPendingPickerShellTimeout();
        setPendingBatchSelection(null);
        pickerDiagnosticRef.current = {
          active: false,
          openedAt: 0,
          kind: "media",
        };
        attachPickerKindRef.current = "media";
        return true;
      }

      const selectedFromDocumentPicker = normalizedKind === "document";
      const allSelectedAreImages = descriptors.every((file) => String(file?.type || "").startsWith("image/"));
      const shouldPreferSendAsDocuments = selectedFromDocumentPicker || !allSelectedAreImages;
      clearPendingPickerShellTimeout();
      openPendingBatchSheetForFiles(descriptors, {
        inputChangeStartedAt: pickerResolvedAt,
        shouldPreferSendAsDocuments,
        source: buildNativePickerQueueSource(normalizedKind),
        pendingLogAction: "native-pending-selection-flushed",
        skipQueue: true,
      });

      const readStartedAt = getPerfNow();
      logUploadDiagnostic("native-picker-read-start", {
        kind: normalizedKind,
        selectedFileCount: descriptors.length,
      });
      const readyFilesByIndex = new Array(descriptors.length);
      const settledIndexes = new Set();
      let nextQueueIndex = 0;
      let queuedFileCount = 0;
      const queueSource = buildNativePickerQueueSource(normalizedKind);
      const flushReadyNativeFiles = () => {
        const readyFiles = [];
        while (nextQueueIndex < readyFilesByIndex.length && settledIndexes.has(nextQueueIndex)) {
          const nextReadyFile = readyFilesByIndex[nextQueueIndex];
          if (nextReadyFile instanceof File) {
            readyFiles.push(nextReadyFile);
          }
          nextQueueIndex += 1;
        }

        if (!readyFiles.length) {
          return;
        }

        queuedFileCount += readyFiles.length;
        logUploadDiagnostic("native-picker-files-queued", {
          kind: normalizedKind,
          queuedFileCount,
          selectedFileCount: descriptors.length,
          batchFileCount: readyFiles.length,
        }, getPerfNow() - readStartedAt);
        onQueueFiles(readyFiles, {
          preferSendAsDocuments: shouldPreferSendAsDocuments,
          source: queueSource,
        });
      };

      await Promise.all(descriptors.map(async (descriptor, index) => {
        const token = String(descriptor?.token || "").trim();
        if (!token) {
          settledIndexes.add(index);
          flushReadyNativeFiles();
          return;
        }

        const singleReadStartedAt = getPerfNow();
        try {
          const readResult = await pickerApi.readFiles({ tokens: [token] });
          const selectedFile = (Array.isArray(readResult?.files) ? readResult.files : [])
            .map(createFileFromNativePickerPayload)
            .find((file) => file instanceof File) || null;
          readyFilesByIndex[index] = selectedFile;
          logUploadDiagnostic("native-picker-read-file-finished", {
            kind: normalizedKind,
            index,
            fileReady: Boolean(selectedFile),
            name: String(descriptor?.name || ""),
          }, getPerfNow() - singleReadStartedAt);
        } catch (readError) {
          readyFilesByIndex[index] = null;
          logUploadDiagnostic("native-picker-read-file-error", {
            kind: normalizedKind,
            index,
            name: String(descriptor?.name || ""),
            reason: String(readError?.message || readError || "unknown"),
          }, getPerfNow() - singleReadStartedAt);
        } finally {
          settledIndexes.add(index);
          flushReadyNativeFiles();
        }
      }));
      logUploadDiagnostic("native-picker-read-finished", {
        kind: normalizedKind,
        selectedFileCount: queuedFileCount,
        requestedFileCount: descriptors.length,
      }, getPerfNow() - readStartedAt);

      if (!queuedFileCount) {
        setPendingBatchSelection(null);
      }
      return true;
    } catch (error) {
      console.error("Native attachment picker failed:", error);
      const tokens = descriptors.map((item) => String(item?.token || "").trim()).filter(Boolean);
      if (tokens.length && typeof pickerApi.releaseFiles === "function") {
        pickerApi.releaseFiles({ tokens }).catch(() => {});
      }
      preservePickerKindForFallback = descriptors.length < 1;
      if (String(error?.message || "").includes("No handler registered")) {
        window[NATIVE_ATTACHMENT_PICKER_DISABLED_FLAG] = true;
      }
      logUploadDiagnostic("native-picker-fallback-to-input", {
        kind: normalizedKind,
        reason: String(error?.message || error || "unknown"),
      });
      clearPendingPickerShellTimeout();
      setPendingBatchSelection(null);
      return descriptors.length > 0;
    } finally {
      pickerDiagnosticRef.current = {
        active: false,
        openedAt: 0,
        kind: "media",
      };
      attachPickerKindRef.current = preservePickerKindForFallback ? normalizedKind : "media";
    }
  };

  const openAttachMenu = () => {
    if (uploadingFile) {
      return;
    }

    messageComposerRef.current?.classList.add("message-composer--attach-menu-open");
  };

  const closeAttachMenu = () => {
    messageComposerRef.current?.classList.remove("message-composer--attach-menu-open");
  };

  const openAttachFilePicker = async (inputRef) => {
    if (uploadingFile) {
      return;
    }

    const nativePickerHandled = await openNativeAttachFilePicker(attachPickerKindRef.current);
    if (nativePickerHandled) {
      return;
    }

    suppressAttachMenuForFilePicker();
    if (typeof window !== "undefined") {
      window[SKIP_NEXT_WINDOW_FOCUS_REFRESH_FLAG] = true;
      window.__TEND_FILE_PICKER_OPENED_AT__ = getPerfNow();
    }
    pickerDiagnosticRef.current = {
      active: true,
      openedAt: getPerfNow(),
      kind: attachPickerKindRef.current,
    };
    logUploadDiagnostic("picker-open", {
      kind: attachPickerKindRef.current,
    });
    inputRef.current?.click();
  };

  const openMediaAttachFilePicker = () => {
    if (uploadingFile) {
      return;
    }

    attachPickerKindRef.current = "media";
    void openAttachFilePicker(mediaFileInputRef);
  };

  const openDocumentAttachFilePicker = () => {
    if (uploadingFile) {
      return;
    }

    attachPickerKindRef.current = "document";
    void openAttachFilePicker(documentFileInputRef);
  };


  const loadMoreEmojiPreviews = () => {
    setEmojiPreviewCount((previous) => Math.min(previous + 8, COMPOSER_EMOJI_OPTIONS.length));
  };

  const handleEmojiPickerScroll = (event) => {
    const target = event.currentTarget;
    if (target.scrollHeight - target.scrollTop - target.clientHeight <= 72) {
      loadMoreEmojiPreviews();
    }
  };

  const hasBatchUploadSheet = selectedFiles.length >= 1;
  const shouldShowPendingBatchSheet = Boolean(pendingBatchSelection) && selectedFiles.length < 1;
  const hasSendPayload = Boolean(String(message || "").trim()) || selectedFiles.length > 0;
  const shouldShowSendButton = hasSendPayload && voiceRecordingState === "idle";
  const voiceButtonStateClass = voiceRecordingState !== "idle" ? `composer-tool--recording-${voiceRecordingState}` : "";
  const handleClearPendingUploads = () => {
    onClearPendingUploads();
  };
  const handleSendMessage = () => {
    return onSend();
  };
  const handleDismissPendingBatchSelection = () => {
    if (pendingBatchQueueFrameRef.current.length) {
      const cancelFrame =
        typeof window !== "undefined" && typeof window.cancelAnimationFrame === "function"
          ? window.cancelAnimationFrame.bind(window)
          : window.clearTimeout.bind(window);
      pendingBatchQueueFrameRef.current.forEach((handle) => {
        if (handle?.kind === "timeout") {
          window.clearTimeout(handle.id);
          return;
        }

        cancelFrame(handle?.id ?? handle);
      });
      pendingBatchQueueFrameRef.current = [];
    }
    setPendingBatchSelection(null);
  };

  const getPendingUploadStatusLabel = (selectedFile) => {
    if (selectedFile?.status === "uploading") {
      return `Загрузка ${normalizePendingUploadProgress(selectedFile?.progress)}%`;
    }

    if (selectedFile?.status === "preparing") {
      return "Подготовка";
    }

    if (selectedFile?.status === "done") {
      return "Готово";
    }

    if (selectedFile?.status === "error") {
      return selectedFile?.error || "Ошибка";
    }

    return selectedFile?.kind === "image" ? "Изображение" : selectedFile?.kind === "video" ? "Видео" : "Файл";
  };

  useEffect(() => {
    if (!pendingBatchSelection || selectedFiles.length < 1) {
      return undefined;
    }

    const timeoutId = window.setTimeout(() => {
      setPendingBatchSelection(null);
    }, 0);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [pendingBatchSelection, selectedFiles.length]);

  useEffect(() => () => {
    clearPendingPickerShellTimeout();
    if (!pendingBatchQueueFrameRef.current.length) {
      return;
    }

    const cancelFrame =
      typeof window !== "undefined" && typeof window.cancelAnimationFrame === "function"
        ? window.cancelAnimationFrame.bind(window)
        : window.clearTimeout.bind(window);
    pendingBatchQueueFrameRef.current.forEach((handle) => {
      if (handle?.kind === "timeout") {
        window.clearTimeout(handle.id);
        return;
      }

      cancelFrame(handle?.id ?? handle);
    });
    pendingBatchQueueFrameRef.current = [];
  }, []);

  return (
    <div
      className={`input-area ${composerDropActive ? "input-area--drag-active" : ""}`}
    >
      <div className="input-area__editor">
        {hasBatchUploadSheet || shouldShowPendingBatchSheet ? (
          <TextChatBatchUploadSheet
            selectedFiles={selectedFiles}
            uploadingFile={uploadingFile}
            message={message}
            onMessageChange={onMessageChange}
            batchOptions={batchUploadOptions}
            onToggleGroupItems={onToggleBatchUploadGrouping}
            onToggleSendAsDocuments={onToggleBatchUploadSendAsDocuments}
            onToggleRememberChoice={onToggleBatchUploadRememberChoice}
            onRemovePendingUpload={onRemovePendingUpload}
            onClearPendingUploads={handleClearPendingUploads}
            onFileChange={onFileChange}
            onSend={handleSendMessage}
            pendingSelection={pendingBatchSelection}
            onDismissPendingSelection={handleDismissPendingBatchSelection}
          />
        ) : null}

        {selectedFiles.length && !hasBatchUploadSheet ? (
          <div className={`chat-file-list chat-file-list--rich ${hasBatchUploadSheet ? "chat-file-list--hidden" : ""}`}>
            <div className="chat-file-list__header">
              <strong>Вложения</strong>
              {selectedFiles.length > 1 ? (
                <button type="button" className="chat-file-list__clear" onClick={handleClearPendingUploads} disabled={uploadingFile}>
                  Очистить
                </button>
              ) : null}
            </div>
            <div className="chat-file-list__grid">
              {selectedFiles.map((selectedFile) => (
                <div
                  key={selectedFile.id || `${selectedFile.name}-${selectedFile.size}`}
                  className={`chat-file-pill chat-file-pill--${selectedFile.kind || "file"} chat-file-pill--${selectedFile.status || "queued"}`}
                >
                  <div className="chat-file-pill__preview">
                    <PendingUploadPreview
                      file={selectedFile}
                      className="chat-file-pill__preview-media"
                      fallbackClassName="chat-file-pill__fallback"
                      preferThumbnailOnly
                    />
                  </div>
                  <div className="chat-file-pill__body">
                    <div className="chat-file-pill__meta">
                      <span className="chat-file-pill__name">{selectedFile.name}</span>
                      <span className="chat-file-pill__size">{formatFileSize(selectedFile.size)}</span>
                    </div>
                    <div className="chat-file-pill__status-row">
                      <span className={`chat-file-pill__status chat-file-pill__status--${selectedFile.status || "queued"}`}>
                        {getPendingUploadStatusLabel(selectedFile)}
                      </span>
                    </div>
                    <div className="chat-file-pill__progress">
                      <span style={{ width: `${Math.max(6, normalizePendingUploadProgress(selectedFile?.progress))}%` }} />
                    </div>
                    <div className="chat-file-pill__actions">
                      {selectedFile.retryable ? (
                        <button type="button" className="chat-file-pill__action" onClick={() => onRetryPendingUpload(selectedFile.id)} disabled={uploadingFile}>
                          Повторить
                        </button>
                      ) : null}
                      <button
                        type="button"
                        className="chat-file-pill__remove"
                        onClick={() => onRemovePendingUpload(selectedFile.id)}
                        disabled={uploadingFile && selectedFile.status === "uploading"}
                      >
                        Убрать
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {replyState || messageEditState || (ENABLE_VOICE_MESSAGE_BUTTON && voiceRecordingState !== "idle") || speechRecognitionActive ? (
          <div className="composer-status-strip">
            {replyState ? (
              <div className="composer-status composer-status--reply">
                <span className="composer-status__dot" aria-hidden="true" />
                <div className="composer-status__copy">
                  <strong>{`Ответ ${replyState.username || "User"}`}</strong>
                  <span>{replyState.preview || "Сообщение без текста"}</span>
                </div>
                <button type="button" className="composer-status__action" onClick={onStopReplying}>
                  Отмена
                </button>
              </div>
            ) : null}

            {messageEditState ? (
              <div className="composer-status composer-status--edit">
                <span className="composer-status__dot" aria-hidden="true" />
                <div className="composer-status__copy">
                  <strong>Редактирование сообщения</strong>
                  <span>PgUp редактирует последнее ваше сообщение. Enter сохраняет, Esc отменяет.</span>
                </div>
                <button type="button" className="composer-status__action" onClick={onStopEditing}>
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
                  <button type="button" className="composer-status__action" onClick={() => void onCancelVoiceRecording()}>
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
                <button type="button" className="composer-status__action" onClick={onSpeechRecognitionToggle}>
                  Стоп
                </button>
              </div>
            ) : null}
          </div>
        ) : null}

        <div className={`input-area__controls ${hasBatchUploadSheet ? "input-area__controls--batch" : ""}`}>
          <div
            ref={messageComposerRef}
            className="message-composer"
            onPointerLeave={closeAttachMenu}
          >
            <div
              className="attach-button"
              aria-label="Меню вложений"
              title="Меню вложений"
              onPointerEnter={openAttachMenu}
            >
              <span className="attach-button__icon" aria-hidden="true" />
            </div>

            <div className="attach-menu__popover" role="menu" aria-label="Меню вложений" onPointerEnter={openAttachMenu}>
              <input
                ref={mediaFileInputRef}
                type="file"
                className="attach-menu__input attach-menu__input--hidden"
                accept="image/*,video/*"
                onChange={handleAttachFileChange}
                disabled={uploadingFile}
                multiple
                tabIndex={-1}
                aria-hidden="true"
              />
              <input
                ref={documentFileInputRef}
                type="file"
                className="attach-menu__input attach-menu__input--hidden"
                onChange={handleAttachFileChange}
                disabled={uploadingFile}
                multiple
                tabIndex={-1}
                aria-hidden="true"
              />
              <button
                type="button"
                className="attach-menu__item"
                onClick={openMediaAttachFilePicker}
                disabled={uploadingFile}
                role="menuitem"
              >
                <span className="attach-menu__item-icon attach-menu__item-icon--media" aria-hidden="true" />
                <span>Фото или видео</span>
              </button>

              <button
                type="button"
                className="attach-menu__item"
                onClick={openDocumentAttachFilePicker}
                disabled={uploadingFile}
                role="menuitem"
              >
                <span className="attach-menu__item-icon attach-menu__item-icon--file" aria-hidden="true" />
                <span>Документ</span>
              </button>

              <button
                type="button"
                className="attach-menu__item"
                onClick={() => {
                  closeAttachMenu();
                  setPollComposerOpen(true);
                }}
                disabled={uploadingFile || voiceRecordingState === "sending" || typeof onSendPoll !== "function"}
                role="menuitem"
              >
                <span className="attach-menu__item-icon attach-menu__item-icon--poll" aria-hidden="true" />
                <span>Опрос</span>
              </button>

              <button type="button" className="attach-menu__item attach-menu__item--disabled" disabled role="menuitem">
                <span className="attach-menu__item-icon attach-menu__item-icon--location" aria-hidden="true" />
                <span>Локация</span>
              </button>

              <button type="button" className="attach-menu__item attach-menu__item--disabled" disabled role="menuitem">
                <span className="attach-menu__item-icon attach-menu__item-icon--wallet" aria-hidden="true" />
                <span>Кошелёк</span>
              </button>
            </div>

            <button
              ref={composerEmojiButtonRef}
              type="button"
              className={`composer-tool composer-tool--emoji ${composerEmojiPickerOpen ? "composer-tool--active" : ""}`}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => {
                onSyncComposerSelection();
                const nextOpen = !composerEmojiPickerOpen;
                if (nextOpen) {
                  setEmojiPreviewCount(8);
                }
                onToggleEmojiPicker(nextOpen);
              }}
              disabled={uploadingFile || voiceRecordingState === "sending"}
              title="Смайлики"
              aria-label="Открыть смайлики"
              aria-expanded={composerEmojiPickerOpen}
            >
              <span className="composer-tool__emoji-icon" aria-hidden="true">
                <span className="composer-tool__emoji-face" />
              </span>
            </button>

            {composerEmojiPickerOpen ? (
              <div
                ref={composerEmojiPickerRef}
                className="composer-emoji-picker"
                role="dialog"
                aria-label="Выбор анимированного смайлика"
                onScroll={handleEmojiPickerScroll}
              >
                <div className="composer-emoji-picker__grid">
                  {COMPOSER_EMOJI_OPTIONS.map((emojiOption, index) => (
                    <button
                      key={emojiOption.key}
                      type="button"
                      className="composer-emoji-picker__item"
                      onMouseDown={(event) => event.preventDefault()}
                      onMouseEnter={() => {
                        if (index + 1 > emojiPreviewCount) {
                          loadMoreEmojiPreviews();
                        }
                      }}
                      onFocus={() => {
                        if (index + 1 > emojiPreviewCount) {
                          loadMoreEmojiPreviews();
                        }
                      }}
                      onClick={async () => {
                        if (emojiOption.assetUrl) {
                          const handled = await onSendAnimatedEmoji?.(emojiOption);
                          if (handled) {
                            onToggleEmojiPicker(false);
                          }
                          return;
                        }

                        onInsertEmoji(emojiOption.glyph);
                        onToggleEmojiPicker(false);
                      }}
                      title={emojiOption.label}
                      aria-label={emojiOption.label}
                    >
                      <AnimatedEmojiGlyph
                        emoji={emojiOption}
                        showAsset={index < emojiPreviewCount}
                        fallbackText={String(emojiOption.label || "").trim().slice(0, 1).toUpperCase()}
                      />
                    </button>
                  ))}
                </div>
              </div>
            ) : null}

            {mentionSuggestionsOpen && mentionSuggestions.length ? (
              <div ref={mentionSuggestionsRef} className="mention-suggestions" role="listbox" aria-label="Подсказки упоминаний">
                {mentionSuggestions.map((suggestion, index) => (
                  <button
                    key={`${suggestion.type || "user"}-${suggestion.userId || suggestion.roleId || suggestion.handle}-${suggestion.handle}`}
                    type="button"
                    className={`mention-suggestions__item ${index === selectedMentionSuggestionIndex ? "mention-suggestions__item--active" : ""}`}
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => onApplyMentionSuggestion(suggestion)}
                    role="option"
                    aria-selected={index === selectedMentionSuggestionIndex}
                  >
                    {suggestion.type === "role" ? (
                      <span
                        className="mention-suggestions__swatch"
                        style={{ backgroundColor: suggestion.color || "#7b89a8" }}
                        aria-hidden="true"
                      />
                    ) : (
                      <AnimatedAvatar
                        className="mention-suggestions__avatar"
                        src={suggestion.avatar || ""}
                        alt={suggestion.displayName}
                        loading="eager"
                        decoding="sync"
                      />
                    )}
                    <span className="mention-suggestions__content">
                      <span className="mention-suggestions__name">{suggestion.displayName}</span>
                      <span className="mention-suggestions__handle">
                        @{suggestion.handle}
                        <span className="mention-suggestions__meta">{suggestion.type === "role" ? "Роль" : "Участник"}</span>
                      </span>
                    </span>
                  </button>
                ))}
              </div>
            ) : null}

            <div className="composer-textarea-shell">
              {shouldRenderComposerHighlight ? (
                <div ref={composerHighlightRef} className="composer-textarea-highlight" aria-hidden="true">
                  {composerMentionSegments.map((segment, index) => {
                    if (segment.isMention) {
                      const mentionStyle = segment.color
                        ? { color: segment.color, background: `${segment.color}22` }
                        : undefined;

                      return (
                        <span
                          key={`composer-mention-${index}-${segment.roleId || segment.userId || segment.text}`}
                          className={`composer-textarea-highlight__mention ${segment.type === "role" ? "composer-textarea-highlight__mention--role" : ""}`}
                          style={mentionStyle}
                          title={segment.displayName || segment.text}
                        >
                          {segment.text}
                        </span>
                      );
                    }

                    if (!segment.text) {
                      return null;
                    }

                    return <span key={`composer-text-${index}`}>{segment.text}</span>;
                  })}
                </div>
              ) : null}

              <textarea
              ref={textareaRef}
              value={message}
              disabled={uploadingFile || voiceRecordingState === "sending"}
              onChange={(event) => {
                onMessageChange(event.target.value);
                onSyncComposerSelection(event.target);
              }}
              onPaste={onPaste}
              onSelect={(event) => onSyncComposerSelection(event.target)}
              onClick={(event) => onSyncComposerSelection(event.target)}
              onScroll={(event) => {
                if (!shouldRenderComposerHighlight || !composerHighlightRef.current) {
                  return;
                }

                composerHighlightRef.current.scrollTop = event.currentTarget.scrollTop;
                composerHighlightRef.current.scrollLeft = event.currentTarget.scrollLeft;
              }}
              data-editing={messageEditState ? "true" : "false"}
              data-highlight-active={shouldRenderComposerHighlight ? "true" : "false"}
              placeholder={uploadingFile ? "Загружаем вложения..." : "Введите сообщение..."}
              onKeyDown={(event) => {
                if (mentionSuggestionsOpen && mentionSuggestions.length) {
                  if (event.key === "ArrowDown") {
                    event.preventDefault();
                    onSelectMentionSuggestionIndex((selectedMentionSuggestionIndex + 1) % mentionSuggestions.length);
                    return;
                  }

                  if (event.key === "ArrowUp" && String(message || "").trim()) {
                    event.preventDefault();
                    onSelectMentionSuggestionIndex((selectedMentionSuggestionIndex - 1 + mentionSuggestions.length) % mentionSuggestions.length);
                    return;
                  }

                  if (event.key === "Enter" || event.key === "Tab") {
                    event.preventDefault();
                    onApplyMentionSuggestion(mentionSuggestions[selectedMentionSuggestionIndex] || mentionSuggestions[0]);
                    return;
                  }
                }

                if (event.key === "Escape") {
                  if (composerEmojiPickerOpen) {
                    event.preventDefault();
                    onToggleEmojiPicker(false);
                    return;
                  }

                  if (mentionSuggestionsOpen) {
                    event.preventDefault();
                    onCloseMentionSuggestions();
                    return;
                  }

                  if (speechRecognitionActive) {
                    onStopSpeechRecognition(false);
                  }

                  if (voiceRecordingState === "holding" || voiceRecordingState === "locked") {
                    event.preventDefault();
                    void onCancelVoiceRecording();
                    return;
                  }

                  if (messageEditState) {
                    event.preventDefault();
                    onStopEditing();
                    return;
                  }
                }

                if (event.key === "PageUp") {
                  event.preventDefault();
                  onStartEditingLatestOwnMessage();
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
                  onStartEditingLatestOwnMessage();
                  return;
                }

                if (event.key === "Enter" && !event.shiftKey && !preferExplicitSend) {
                  event.preventDefault();
                  handleSendMessage();
                }
              }}
              />
            </div>

            <div className="composer-tools-end">
              {shouldShowSendButton ? (
                <button
                  type="button"
                  className="composer-send-button"
                  onClick={() => void handleSendMessage()}
                  disabled={
                    uploadingFile
                    || voiceRecordingState === "holding"
                    || voiceRecordingState === "locked"
                    || voiceRecordingState === "sending"
                    || !hasSendPayload
                  }
                  aria-label="Отправить сообщение"
                  title="Отправить сообщение"
                >
                  <span className="composer-send-button__icon" aria-hidden="true" />
                </button>
              ) : ENABLE_SPEECH_INPUT_BUTTON ? (
                <button
                  type="button"
                  className={`composer-tool composer-tool--speech composer-tool--action-slot ${speechRecognitionActive ? "composer-tool--active" : ""}`}
                  onClick={onSpeechRecognitionToggle}
                  disabled={uploadingFile || voiceRecordingState !== "idle"}
                  title="Голосовой ввод текста"
                  aria-label="Голосовой ввод текста"
                >
                  <span className="composer-tool__mic" aria-hidden="true" />
                  <span className="composer-tool__badge" aria-hidden="true">a</span>
                </button>
              ) : ENABLE_VOICE_MESSAGE_BUTTON ? (
                <button
                  type="button"
                  className={`composer-tool composer-tool--voice composer-tool--voice-slot ${voiceButtonStateClass}`}
                  onPointerDown={async (event) => {
                    event.currentTarget.setPointerCapture?.(event.pointerId);
                    await onVoiceRecordPointerDown?.(event);
                  }}
                  onPointerMove={onVoiceRecordPointerMove}
                  onPointerUp={async (event) => {
                    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
                      event.currentTarget.releasePointerCapture?.(event.pointerId);
                    }
                    await onVoiceRecordPointerUp?.(event);
                  }}
                  onPointerCancel={async (event) => {
                    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
                      event.currentTarget.releasePointerCapture?.(event.pointerId);
                    }
                    await onVoiceRecordPointerCancel?.(event);
                  }}
                  disabled={uploadingFile || voiceRecordingState === "sending"}
                  aria-label={
                    voiceRecordingState === "locked"
                      ? "Отправить голосовое сообщение"
                      : voiceRecordingState === "holding"
                        ? "Запись голосового сообщения"
                        : "Записать голосовое сообщение"
                  }
                  title={
                    voiceRecordingState === "locked"
                      ? "Нажмите, чтобы отправить голосовое сообщение"
                      : voiceRecordingState === "holding"
                        ? "Потяните вверх для фиксации или отпустите для отправки"
                        : "Удерживайте для записи голосового сообщения"
                  }
                >
                  <span className="composer-tool__ring" aria-hidden="true" />
                  <span className="composer-tool__mic" aria-hidden="true" />
                  {voiceRecordingState === "locked" ? (
                    <span className="composer-tool__lock" aria-hidden="true">●</span>
                  ) : null}
                </button>
              ) : null}
            </div>
          </div>
        </div>
      </div>

      <TextChatPollComposerModal
        open={pollComposerOpen}
        onClose={() => setPollComposerOpen(false)}
        onSubmit={onSendPoll}
      />
    </div>
  );
}

function areReplyStatesEqual(previousReplyState, nextReplyState) {
  if (previousReplyState === nextReplyState) {
    return true;
  }

  if (!previousReplyState && !nextReplyState) {
    return true;
  }

  if (!previousReplyState || !nextReplyState) {
    return false;
  }

  return String(previousReplyState?.messageId || "") === String(nextReplyState?.messageId || "")
    && String(previousReplyState?.username || "") === String(nextReplyState?.username || "")
    && String(previousReplyState?.preview || "") === String(nextReplyState?.preview || "");
}

function areMessageEditStatesEqual(previousMessageEditState, nextMessageEditState) {
  if (previousMessageEditState === nextMessageEditState) {
    return true;
  }

  if (!previousMessageEditState && !nextMessageEditState) {
    return true;
  }

  if (!previousMessageEditState || !nextMessageEditState) {
    return false;
  }

  return String(previousMessageEditState?.messageId || "") === String(nextMessageEditState?.messageId || "")
    && String(previousMessageEditState?.originalText || "") === String(nextMessageEditState?.originalText || "");
}

function areBatchUploadOptionsEqual(previousBatchUploadOptions, nextBatchUploadOptions) {
  if (previousBatchUploadOptions === nextBatchUploadOptions) {
    return true;
  }

  return Boolean(previousBatchUploadOptions?.groupItems) === Boolean(nextBatchUploadOptions?.groupItems)
    && Boolean(previousBatchUploadOptions?.sendAsDocuments) === Boolean(nextBatchUploadOptions?.sendAsDocuments)
    && Boolean(previousBatchUploadOptions?.rememberChoice) === Boolean(nextBatchUploadOptions?.rememberChoice);
}

function areMentionSuggestionsEqual(previousMentionSuggestions, nextMentionSuggestions) {
  if (previousMentionSuggestions === nextMentionSuggestions) {
    return true;
  }

  if (!Array.isArray(previousMentionSuggestions) || !Array.isArray(nextMentionSuggestions) || previousMentionSuggestions.length !== nextMentionSuggestions.length) {
    return false;
  }

  for (let index = 0; index < previousMentionSuggestions.length; index += 1) {
    const previousSuggestion = previousMentionSuggestions[index];
    const nextSuggestion = nextMentionSuggestions[index];

    if (
      String(previousSuggestion?.type || "") !== String(nextSuggestion?.type || "")
      || String(previousSuggestion?.userId || "") !== String(nextSuggestion?.userId || "")
      || String(previousSuggestion?.roleId || "") !== String(nextSuggestion?.roleId || "")
      || String(previousSuggestion?.handle || "") !== String(nextSuggestion?.handle || "")
      || String(previousSuggestion?.displayName || "") !== String(nextSuggestion?.displayName || "")
      || String(previousSuggestion?.avatar || "") !== String(nextSuggestion?.avatar || "")
      || String(previousSuggestion?.color || "") !== String(nextSuggestion?.color || "")
    ) {
      return false;
    }
  }

  return true;
}

function areTextChatComposerPropsEqual(previousProps, nextProps) {
  return previousProps.selectedFiles === nextProps.selectedFiles
    && previousProps.uploadingFile === nextProps.uploadingFile
    && previousProps.composerDropActive === nextProps.composerDropActive
    && areReplyStatesEqual(previousProps.replyState, nextProps.replyState)
    && areMessageEditStatesEqual(previousProps.messageEditState, nextProps.messageEditState)
    && previousProps.voiceRecordingState === nextProps.voiceRecordingState
    && previousProps.voiceRecordingDurationMs === nextProps.voiceRecordingDurationMs
    && previousProps.speechRecognitionActive === nextProps.speechRecognitionActive
    && previousProps.composerEmojiButtonRef === nextProps.composerEmojiButtonRef
    && previousProps.composerEmojiPickerOpen === nextProps.composerEmojiPickerOpen
    && previousProps.composerEmojiPickerRef === nextProps.composerEmojiPickerRef
    && previousProps.mentionSuggestionsOpen === nextProps.mentionSuggestionsOpen
    && areMentionSuggestionsEqual(previousProps.mentionSuggestions, nextProps.mentionSuggestions)
    && previousProps.mentionSuggestionsRef === nextProps.mentionSuggestionsRef
    && previousProps.selectedMentionSuggestionIndex === nextProps.selectedMentionSuggestionIndex
    && previousProps.textareaRef === nextProps.textareaRef
    && previousProps.message === nextProps.message
    && previousProps.serverMembers === nextProps.serverMembers
    && previousProps.serverRoles === nextProps.serverRoles
    && areBatchUploadOptionsEqual(previousProps.batchUploadOptions, nextProps.batchUploadOptions)
    && previousProps.preferExplicitSend === nextProps.preferExplicitSend;
}

TextChatComposer.displayName = "TextChatComposer";

export default memo(TextChatComposer, areTextChatComposerPropsEqual);

