import { useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { isAllowedChatAttachmentFile } from "../utils/chatAttachmentPolicy";
import { recordPerfEvent, startPerfTrace } from "../utils/perf";

const SKIP_NEXT_WINDOW_FOCUS_REFRESH_FLAG = "__TEND_SKIP_NEXT_WINDOW_FOCUS_REFRESH__";

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

function getDisplayFileName(value) {
  const normalizedValue = String(value || "").trim();
  if (!normalizedValue) {
    return "";
  }

  return normalizedValue.split(/[\\/]/).filter(Boolean).pop() || normalizedValue;
}

function revokeObjectUrls(urls) {
  (Array.isArray(urls) ? urls : []).forEach((url) => {
    const normalizedUrl = String(url || "").trim();
    if (!normalizedUrl.startsWith("blob:")) {
      return;
    }

    try {
      URL.revokeObjectURL(normalizedUrl);
    } catch {
      // Ignore object URL revocation failures.
    }
  });
}

function buildPendingSelectionPreviewItem(item, index, { onCreateObjectUrl } = {}) {
  if (item instanceof File) {
    const normalizedType = String(item?.type || "").trim();
    const kind = normalizedType.startsWith("image/")
      ? "image"
      : normalizedType.startsWith("video/")
        ? "video"
        : "file";
    let previewUrl = "";
    let thumbnailUrl = "";

    if (kind === "image" || kind === "video") {
      try {
        previewUrl = URL.createObjectURL(item);
        onCreateObjectUrl?.(previewUrl);
        if (kind === "image") {
          thumbnailUrl = previewUrl;
        }
      } catch {
        previewUrl = "";
        thumbnailUrl = "";
      }
    }

    return {
      id: String(item?.name || `pending-preview-${index}`),
      name: getDisplayFileName(item?.name) || "attachment",
      size: Number(item?.size || 0) || 0,
      kind,
      previewUrl,
      thumbnailUrl,
    };
  }

  const previewUrl = String(item?.previewUrl || "").trim();
  const kind = String(item?.kind || "").trim() || (
    String(item?.type || "").startsWith("image/")
      ? "image"
      : String(item?.type || "").startsWith("video/")
        ? "video"
        : "file"
  );

  return {
    id: String(item?.token || item?.id || `pending-preview-${index}`),
    name: getDisplayFileName(item?.name) || "attachment",
    size: Number(item?.size || 0) || 0,
    kind,
    previewUrl,
    thumbnailUrl: String(item?.thumbnailUrl || "").trim(),
  };
}

function buildPendingSelectionShellMetadata(items) {
  const selectedItems = Array.isArray(items) ? items : [];

  return {
    totalSize: selectedItems.reduce((sum, item) => sum + (Number(item?.size || 0) || 0), 0),
    fileNames: selectedItems.slice(0, 8).map((item) => getDisplayFileName(item?.name)).filter(Boolean),
  };
}

function scheduleAfterNextPaint(callback) {
  if (typeof window === "undefined") {
    callback();
    return { kind: "none", id: 0 };
  }

  const timeoutId = window.setTimeout(callback, 32);
  return { kind: "timeout", id: timeoutId };
}

function cancelScheduledHandle(handle) {
  if (!handle || typeof window === "undefined") {
    return;
  }

  if (handle.kind === "timeout") {
    window.clearTimeout(handle.id);
  }
}

export default function useTextChatAttachmentPickerFlow({
  messageComposerRef,
  selectedFiles,
  uploadingFile,
  instantAttachmentSend = false,
  messageEditState,
  onFileChange,
  onQueueFiles,
  onRejectedFiles,
  onToggleBatchUploadSendAsDocuments,
}) {
  const [pendingBatchSelection, setPendingBatchSelection] = useState(null);
  const mediaFileInputRef = useRef(null);
  const documentFileInputRef = useRef(null);
  const pendingBatchQueueFrameRef = useRef([]);
  const pendingPickerShellTimeoutRef = useRef(0);
  const pendingPickerFocusShellTimeoutRef = useRef(0);
  const pendingSelectionPreviewHydrationHandleRef = useRef(null);
  const pendingBatchSelectionRef = useRef(null);
  const pendingSelectionPreviewObjectUrlsRef = useRef([]);
  const selectedFilesLengthRef = useRef(0);
  const instantAttachmentSendRef = useRef(false);
  const messageEditStateRef = useRef(null);
  const attachPickerKindRef = useRef("media");
  const pickerDiagnosticRef = useRef({
    active: false,
    openedAt: 0,
    focusedAt: 0,
    kind: "media",
  });

  pendingBatchSelectionRef.current = pendingBatchSelection;
  selectedFilesLengthRef.current = selectedFiles.length;
  instantAttachmentSendRef.current = Boolean(instantAttachmentSend);
  messageEditStateRef.current = messageEditState;

  const cancelPendingBatchQueue = () => {
    if (!pendingBatchQueueFrameRef.current.length || typeof window === "undefined") {
      return;
    }

    const cancelFrame =
      typeof window.cancelAnimationFrame === "function"
        ? window.cancelAnimationFrame.bind(window)
        : window.clearTimeout.bind(window);

    pendingBatchQueueFrameRef.current.forEach((handle) => {
      if (handle?.kind) {
        cancelScheduledHandle(handle);
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

    cancelPendingBatchQueue();
    const queueHandle = scheduleAfterNextPaint(() => {
      pendingBatchQueueFrameRef.current = [];
      recordPerfEvent("text-chat", "file-picker:upload-queue-commit", {
        selectedFileCount: selectedInputFiles.length,
        source,
      }, getPerfNow() - inputChangeStartedAt);
      logUploadDiagnostic("queue-files-callback-after-paint", {
        selectedFileCount: selectedInputFiles.length,
        source,
      }, getPerfNow() - inputChangeStartedAt);
      const queueResult = onQueueFiles(selectedInputFiles, {
        preferSendAsDocuments: shouldPreferSendAsDocuments,
        source,
      });
      if (queueResult === "optimistic-send") {
        clearPendingPickerShellTimeout();
        clearPendingSelectionPreviewHydrationTimeout();
        resetPendingSelectionPreviewObjectUrls();
        setPendingBatchSelection(null);
      }
    });

    pendingBatchQueueFrameRef.current = [queueHandle];
  };

  const clearPendingPickerShellTimeout = () => {
    if (!pendingPickerShellTimeoutRef.current || typeof window === "undefined") {
      return;
    }

    window.clearTimeout(pendingPickerShellTimeoutRef.current);
    pendingPickerShellTimeoutRef.current = 0;
  };

  const clearPendingPickerFocusShellTimeout = () => {
    if (!pendingPickerFocusShellTimeoutRef.current || typeof window === "undefined") {
      return;
    }

    window.clearTimeout(pendingPickerFocusShellTimeoutRef.current);
    pendingPickerFocusShellTimeoutRef.current = 0;
  };

  const clearPendingSelectionPreviewHydrationTimeout = () => {
    cancelScheduledHandle(pendingSelectionPreviewHydrationHandleRef.current);
    pendingSelectionPreviewHydrationHandleRef.current = null;
  };

  const resetPendingSelectionPreviewObjectUrls = () => {
    revokeObjectUrls(pendingSelectionPreviewObjectUrlsRef.current);
    pendingSelectionPreviewObjectUrlsRef.current = [];
  };

  const schedulePendingSelectionPreviewHydration = (
    selectedInputFiles,
    {
      inputChangeStartedAt,
      maxItems,
      source,
    }
  ) => {
    const filesToHydrate = (Array.isArray(selectedInputFiles) ? selectedInputFiles : [])
      .slice(0, Math.max(0, Number(maxItems) || 0));
    if (!filesToHydrate.length) {
      return;
    }

    clearPendingSelectionPreviewHydrationTimeout();
    let nextIndex = 0;
    const hydratedItems = [];
    const hydrateNext = () => {
      pendingSelectionPreviewHydrationHandleRef.current = null;
      const nextItem = buildPendingSelectionPreviewItem(filesToHydrate[nextIndex], nextIndex, {
        onCreateObjectUrl: (objectUrl) => {
          pendingSelectionPreviewObjectUrlsRef.current.push(objectUrl);
        },
      });
      if (nextItem) {
        hydratedItems.push(nextItem);
      }

      if (nextIndex === 0) {
        recordPerfEvent("text-chat", "file-picker:first-preview-item-hydrated", {
          selectedFileCount: selectedInputFiles.length,
          source,
        }, getPerfNow() - inputChangeStartedAt);
      }

      setPendingBatchSelection((previous) => {
        if (!previous || previous.waitingForPicker) {
          return previous;
        }

        return {
          ...previous,
          previewItems: hydratedItems.slice(),
        };
      });

      nextIndex += 1;
      if (nextIndex < filesToHydrate.length) {
        pendingSelectionPreviewHydrationHandleRef.current = scheduleAfterNextPaint(hydrateNext);
      }
    };

    pendingSelectionPreviewHydrationHandleRef.current = scheduleAfterNextPaint(hydrateNext);
  };

  const getPickerInputNode = (kind = attachPickerKindRef.current) => (
    kind === "document" ? documentFileInputRef.current : mediaFileInputRef.current
  );

  const resetPickerDiagnostic = () => {
    pickerDiagnosticRef.current = {
      active: false,
      openedAt: 0,
      focusedAt: 0,
      kind: "media",
    };
    attachPickerKindRef.current = "media";
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
      clearPendingSelectionPreviewHydrationTimeout();
      resetPendingSelectionPreviewObjectUrls();
      setPendingBatchSelection({
        fileCount: 1,
        firstFileName: "",
        layout: normalizedKind,
        waitingForPicker: true,
        previewItems: [],
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

    const normalizedLayout = shouldPreferSendAsDocuments ? "document" : "media";
    const normalizedFirstFileName = getDisplayFileName(selectedInputFiles[0]?.name) || "";
    const shellMetadata = buildPendingSelectionShellMetadata(selectedInputFiles);
    const previewHydrationMaxItems = normalizedLayout === "document" ? 4 : 6;

    flushSync(() => {
      clearPendingSelectionPreviewHydrationTimeout();
      resetPendingSelectionPreviewObjectUrls();
      setPendingBatchSelection({
        fileCount: selectedInputFiles.length,
        firstFileName: normalizedFirstFileName,
        layout: normalizedLayout,
        totalSize: shellMetadata.totalSize,
        fileNames: shellMetadata.fileNames,
        waitingForPicker: false,
        previewItems: [],
      });
    });

    recordPerfEvent("text-chat", "file-picker:pending-modal-state-set", {
      selectedFileCount: selectedInputFiles.length,
      source,
    }, getPerfNow() - inputChangeStartedAt);
    logUploadDiagnostic("pending-selection-flushed", {
      selectedFileCount: selectedInputFiles.length,
      source,
    }, getPerfNow() - inputChangeStartedAt);

    onToggleBatchUploadSendAsDocuments(shouldPreferSendAsDocuments);
    schedulePendingSelectionPreviewHydration(selectedInputFiles, {
      inputChangeStartedAt,
      maxItems: previewHydrationMaxItems,
      source,
    });
    scheduleSelectedFilesQueue(selectedInputFiles, {
      inputChangeStartedAt,
      shouldPreferSendAsDocuments,
      source,
    });
    return true;
  };

  const handleAttachFileChange = (event) => {
    const inputChangeStartedAt = getPerfNow();
    recordPerfEvent("text-chat", "file-picker:selection-start", {}, 0);
    const pickerOpenedAt = typeof window !== "undefined"
      ? Number(window.__TEND_FILE_PICKER_OPENED_AT__ || 0)
      : 0;
    const pickerDiagnostic = pickerDiagnosticRef.current;
    messageComposerRef.current?.classList.remove("message-composer--attach-menu-open");
    const pickedInputFiles = Array.from(event?.target?.files || []);
    const rejectedInputFiles = pickedInputFiles.filter((file) => !isAllowedChatAttachmentFile(file));
    const selectedInputFiles = rejectedInputFiles.length
      ? pickedInputFiles.filter((file) => isAllowedChatAttachmentFile(file))
      : pickedInputFiles;
    const totalSelectedBytes = selectedInputFiles.reduce(
      (sum, file) => sum + (Number(file?.size || 0) || 0),
      0
    );
    const selectedFromDocumentPicker = attachPickerKindRef.current === "document";
    const allSelectedAreMedia = selectedInputFiles.length > 0
      && selectedInputFiles.every((file) => {
        const fileType = String(file?.type || "");
        return fileType.startsWith("image/") || fileType.startsWith("video/");
      });
    const shouldPreferSendAsDocuments = selectedFromDocumentPicker || !allSelectedAreMedia;
    const shouldOpenPendingBatchSheet = selectedInputFiles.length > 0
      && typeof onQueueFiles === "function";

    logUploadDiagnostic("input-change-start", {
      selectedFileCount: selectedInputFiles.length,
      rejectedFileCount: rejectedInputFiles.length,
      selectedFromDocumentPicker,
      allSelectedAreMedia,
      shouldPreferSendAsDocuments,
      shouldOpenPendingBatchSheet,
      msSincePickerOpen: pickerOpenedAt ? inputChangeStartedAt - pickerOpenedAt : 0,
      msSincePickerFocus: pickerDiagnostic.focusedAt ? inputChangeStartedAt - pickerDiagnostic.focusedAt : 0,
      pickerActive: Boolean(pickerDiagnostic.active),
      pickerKind: pickerDiagnostic.kind,
      totalSelectedBytes,
      fileSummary: selectedInputFiles.slice(0, 8).map((file) => ({
        name: String(file?.name || ""),
        type: String(file?.type || ""),
        size: Number(file?.size || 0),
      })),
    });

    recordPerfEvent("text-chat", "file-picker:input-change", {
      selectedFileCount: selectedInputFiles.length,
      rejectedFileCount: rejectedInputFiles.length,
      selectedFromDocumentPicker,
      allSelectedAreMedia,
      shouldPreferSendAsDocuments,
      shouldOpenPendingBatchSheet,
      msSincePickerOpen: pickerOpenedAt ? inputChangeStartedAt - pickerOpenedAt : 0,
      msSincePickerFocus: pickerDiagnostic.focusedAt ? inputChangeStartedAt - pickerDiagnostic.focusedAt : 0,
      totalSelectedBytes,
      fileSummary: selectedInputFiles.slice(0, 8).map((file) => ({
        name: String(file?.name || ""),
        type: String(file?.type || ""),
        size: Number(file?.size || 0),
      })),
    });

    if (!selectedInputFiles.length) {
      clearPendingPickerShellTimeout();
      clearPendingPickerFocusShellTimeout();
      clearPendingSelectionPreviewHydrationTimeout();
      resetPendingSelectionPreviewObjectUrls();
      setPendingBatchSelection(null);
    } else if (shouldOpenPendingBatchSheet) {
      clearPendingPickerShellTimeout();
      if (instantAttachmentSend && selectedFilesLengthRef.current < 1 && !messageEditState) {
        onToggleBatchUploadSendAsDocuments(shouldPreferSendAsDocuments);
        const queueResult = onQueueFiles(selectedInputFiles, {
          preferSendAsDocuments: shouldPreferSendAsDocuments,
          source: selectedFromDocumentPicker ? "document-input" : "file-input",
        });
        if (queueResult === "optimistic-send") {
          clearPendingPickerShellTimeout();
          clearPendingSelectionPreviewHydrationTimeout();
          resetPendingSelectionPreviewObjectUrls();
          setPendingBatchSelection(null);
        }
      } else {
        openPendingBatchSheetForFiles(selectedInputFiles, {
          inputChangeStartedAt,
          shouldPreferSendAsDocuments,
          source: selectedFromDocumentPicker ? "document-input" : "file-input",
        });
      }
    } else {
      onFileChange(event);
    }

    if (rejectedInputFiles.length) {
      onRejectedFiles?.(rejectedInputFiles);
    }

    if (event?.target) {
      event.target.value = "";
      event.target.blur?.();
    }

    resetPickerDiagnostic();
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

      clearPendingPickerFocusShellTimeout();
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
      pickerDiagnosticRef.current = {
        ...pickerDiagnostic,
        focusedAt: getPerfNow(),
      };
      if (instantAttachmentSendRef.current && selectedFilesLengthRef.current < 1 && !messageEditStateRef.current) {
        return;
      }

      clearPendingPickerFocusShellTimeout();
      pendingPickerFocusShellTimeoutRef.current = window.setTimeout(() => {
        pendingPickerFocusShellTimeoutRef.current = 0;
        const activePickerDiagnostic = pickerDiagnosticRef.current;
        if (!activePickerDiagnostic?.active) {
          return;
        }

        const inputNode = getPickerInputNode(activePickerDiagnostic.kind);
        if (!inputNode?.files?.length) {
          clearPendingPickerShellTimeout();
          clearPendingSelectionPreviewHydrationTimeout();
          resetPendingSelectionPreviewObjectUrls();
          setPendingBatchSelection(null);
          resetPickerDiagnostic();
          return;
        }

        showPickerReturnShell({
          kind: activePickerDiagnostic.kind,
          source: "window-focus-delayed",
        });
      }, 180);
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

  const openAttachFilePicker = (inputRef) => {
    if (uploadingFile) {
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
      focusedAt: 0,
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
    openAttachFilePicker(mediaFileInputRef);
  };

  const openDocumentAttachFilePicker = () => {
    if (uploadingFile) {
      return;
    }

    attachPickerKindRef.current = "document";
    openAttachFilePicker(documentFileInputRef);
  };

  const dismissPendingBatchSelection = () => {
    cancelPendingBatchQueue();
    resetPendingSelectionPreviewObjectUrls();
    setPendingBatchSelection(null);
  };

  const shouldShowPendingBatchSheet = Boolean(pendingBatchSelection) && selectedFiles.length < 1;

  useEffect(() => {
    if (!pendingBatchSelection || selectedFiles.length < 1) {
      return undefined;
    }

    const expectedFileCount = Math.max(0, Number(pendingBatchSelection?.fileCount) || 0);
    if (expectedFileCount > selectedFiles.length) {
      return undefined;
    }

    const timeoutId = window.setTimeout(() => {
      clearPendingSelectionPreviewHydrationTimeout();
      resetPendingSelectionPreviewObjectUrls();
      setPendingBatchSelection(null);
    }, 0);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [pendingBatchSelection, selectedFiles.length]);

  useEffect(() => () => {
    clearPendingPickerShellTimeout();
    clearPendingPickerFocusShellTimeout();
    clearPendingSelectionPreviewHydrationTimeout();
    cancelPendingBatchQueue();
    resetPendingSelectionPreviewObjectUrls();
  }, []);

  return {
    mediaFileInputRef,
    documentFileInputRef,
    pendingBatchSelection,
    shouldShowPendingBatchSheet,
    handleAttachFileChange,
    openMediaAttachFilePicker,
    openDocumentAttachFilePicker,
    dismissPendingBatchSelection,
  };
}
