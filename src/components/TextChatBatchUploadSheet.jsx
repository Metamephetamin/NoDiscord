import { memo, useEffect, useLayoutEffect, useState } from "react";
import { createPortal } from "react-dom";
import PendingUploadPreview from "./PendingUploadPreview";
import { formatFileSize } from "../utils/textChatHelpers";
import { finishPerfTraceOnNextFrame, recordPerfEvent } from "../utils/perf";

const INITIAL_VISIBLE_BATCH_ITEMS = 12;
const BATCH_RENDER_CHUNK_SIZE = 18;

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

function getBatchTileClassName(fileCount, index) {
  if (fileCount === 2) {
    return "batch-upload-sheet__tile--half";
  }

  if (fileCount === 3) {
    return index === 0 ? "batch-upload-sheet__tile--large-left" : "batch-upload-sheet__tile--stack";
  }

  if (fileCount === 4) {
    return "batch-upload-sheet__tile--quad";
  }

  if (fileCount === 5) {
    return index < 2 ? "batch-upload-sheet__tile--top" : "batch-upload-sheet__tile--bottom";
  }

  return fileCount >= 6 ? "batch-upload-sheet__tile--six" : "batch-upload-sheet__tile--default";
}

function getPendingMediaShellLayout(fileCount, waitingForPicker = false) {
  const normalizedCount = Math.max(0, Number(fileCount) || 0);

  if (waitingForPicker) {
    return {
      fileCount: 6,
      placeholderCount: 6,
    };
  }

  if (normalizedCount >= 6) {
    return {
      fileCount: 6,
      placeholderCount: 6,
    };
  }

  if (normalizedCount >= 1) {
    return {
      fileCount: normalizedCount,
      placeholderCount: normalizedCount,
    };
  }

  return {
    fileCount: 1,
    placeholderCount: 1,
  };
}

function getSelectedItemsLabel(fileCount, { layoutMode = "media", sendAsDocuments = false } = {}) {
  const mod10 = fileCount % 10;
  const mod100 = fileCount % 100;

  if (sendAsDocuments || layoutMode === "document") {
    if (mod10 === 1 && mod100 !== 11) {
      return `Выбран ${fileCount} файл`;
    }

    if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) {
      return `Выбрано ${fileCount} файла`;
    }

    return `Выбрано ${fileCount} файлов`;
  }

  if (mod10 === 1 && mod100 !== 11) {
    return `Выбрано ${fileCount} фото`;
  }

  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) {
    return `Выбрано ${fileCount} фотографии`;
  }

  return `Выбрано ${fileCount} фотографий`;
}

function BatchUploadTile({
  file,
  fileCount,
  index,
  uploadingFile,
  isActive,
  previewEnabled,
  onSelect,
  onRemove,
}) {
  return (
    <div
      className={`batch-upload-sheet__tile ${getBatchTileClassName(fileCount, index)} ${isActive ? "batch-upload-sheet__tile--active" : ""}`}
    >
      <button
        type="button"
        className="batch-upload-sheet__tile-button"
        onClick={() => onSelect(file?.id)}
        aria-pressed={isActive}
        title={file?.name || "preview"}
      >
        <PendingUploadPreview
          file={file}
          className="batch-upload-sheet__preview"
          fallbackClassName="batch-upload-sheet__thumb-fallback"
          preferThumbnailOnly
          previewEnabled={previewEnabled}
        />
        <div className="batch-upload-sheet__tile-scrim" aria-hidden="true" />
      </button>

      <button
        type="button"
        className="batch-upload-sheet__remove"
        onClick={(event) => {
          event.stopPropagation();
          onRemove(file.id);
        }}
        disabled={uploadingFile && file.status === "uploading"}
        aria-label={`Убрать ${file.name}`}
        title="Убрать"
      >
        x
      </button>
    </div>
  );
}

function BatchUploadDocumentRow({
  file,
  uploadingFile,
  isActive,
  previewEnabled,
  onSelect,
  onRemove,
}) {
  return (
    <div className={`batch-upload-sheet__document-row ${isActive ? "batch-upload-sheet__document-row--active" : ""}`}>
      <button
        type="button"
        className="batch-upload-sheet__document-main"
        onClick={() => onSelect(file?.id)}
        aria-pressed={isActive}
        title={file?.name || "Файл"}
      >
        <span className="batch-upload-sheet__document-preview">
          <PendingUploadPreview
            file={file}
            className="batch-upload-sheet__document-preview-media"
            fallbackClassName="batch-upload-sheet__document-fallback"
            preferThumbnailOnly
            previewEnabled={previewEnabled}
          />
        </span>

        <span className="batch-upload-sheet__document-copy">
          <span className="batch-upload-sheet__document-name">{file?.name || "Файл"}</span>
          <span className="batch-upload-sheet__document-meta">
            <span>{formatFileSize(file?.size)}</span>
          </span>
        </span>
      </button>

      <div className="batch-upload-sheet__document-actions">
        <button
          type="button"
          className="batch-upload-sheet__document-action batch-upload-sheet__document-action--remove"
          onClick={(event) => {
            event.stopPropagation();
            onRemove(file?.id);
          }}
          disabled={uploadingFile && file?.status === "uploading"}
          aria-label={`Убрать ${file?.name || "файл"}`}
          title="Убрать"
        >
          x
        </button>
      </div>
    </div>
  );
}

function BatchUploadToggle({
  checked,
  disabled,
  onChange,
  children,
}) {
  return (
    <label className="batch-upload-sheet__option">
      <span className="batch-upload-sheet__checkbox">
        <input
          type="checkbox"
          checked={checked}
          onChange={(event) => onChange(event.target.checked)}
          disabled={disabled}
        />
        <span className="batch-upload-sheet__checkbox-mark" aria-hidden="true" />
      </span>
      <span>{children}</span>
    </label>
  );
}

function PendingBatchUploadMediaShell({ fileCount, waitingForPicker = false }) {
  const layout = getPendingMediaShellLayout(fileCount, waitingForPicker);
  const effectiveFileCount = layout.fileCount;
  const placeholderCount = layout.placeholderCount;

  return (
    <div className={`batch-upload-sheet__grid batch-upload-sheet__grid--count-${Math.min(effectiveFileCount, 6)}`}>
      {Array.from({ length: placeholderCount }, (_, index) => (
        <div
          key={`pending-media-shell-${index}`}
          className={`batch-upload-sheet__tile ${getBatchTileClassName(effectiveFileCount, index)} batch-upload-sheet__tile--pending-shell ${waitingForPicker ? "batch-upload-sheet__tile--pending-shell-waiting" : ""}`}
          aria-hidden="true"
        >
          <span className="batch-upload-sheet__tile-pending-shimmer" />
        </div>
      ))}
    </div>
  );
}

function PendingBatchUploadDocumentShell({ fileCount }) {
  const placeholderCount = Math.min(Math.max(fileCount, 1), 4);

  return (
    <div className="batch-upload-sheet__document-list">
      {Array.from({ length: placeholderCount }, (_, index) => (
        <div
          key={`pending-document-shell-${index}`}
          className="batch-upload-sheet__document-row batch-upload-sheet__document-row--pending-shell"
          aria-hidden="true"
        >
          <span className="batch-upload-sheet__document-preview batch-upload-sheet__document-preview--pending-shell">
            <span className="batch-upload-sheet__tile-pending-shimmer" />
          </span>
          <span className="batch-upload-sheet__document-copy batch-upload-sheet__document-copy--pending-shell">
            <span className="batch-upload-sheet__document-line batch-upload-sheet__document-line--title" />
            <span className="batch-upload-sheet__document-line batch-upload-sheet__document-line--meta" />
          </span>
        </div>
      ))}
    </div>
  );
}

function PendingBatchUploadMediaPreviewGrid({ items, fileCount }) {
  const previewItems = Array.isArray(items) ? items.slice(0, 6) : [];
  const resolvedCount = Math.min(Math.max(fileCount, previewItems.length, 1), 6);

  return (
    <div className={`batch-upload-sheet__grid batch-upload-sheet__grid--count-${resolvedCount}`}>
      {previewItems.map((item, index) => (
        <div
          key={item?.id || `pending-preview-${index}`}
          className={`batch-upload-sheet__tile ${getBatchTileClassName(resolvedCount, index)} batch-upload-sheet__tile--pending-preview`}
        >
          <PendingUploadPreview
            file={item}
            className="batch-upload-sheet__preview"
            fallbackClassName="batch-upload-sheet__thumb-fallback"
            preferThumbnailOnly
          />
        </div>
      ))}
      {Array.from({ length: Math.max(0, resolvedCount - previewItems.length) }, (_, index) => {
        const tileIndex = previewItems.length + index;
        return (
          <div
            key={`pending-media-shell-${tileIndex}`}
            className={`batch-upload-sheet__tile ${getBatchTileClassName(resolvedCount, tileIndex)} batch-upload-sheet__tile--pending-shell`}
            aria-hidden="true"
          >
            <span className="batch-upload-sheet__tile-pending-shimmer" />
          </div>
        );
      })}
    </div>
  );
}

function PendingBatchUploadDocumentPreviewList({ items, fileCount }) {
  const previewItems = Array.isArray(items) ? items.slice(0, 4) : [];
  const resolvedCount = Math.min(Math.max(fileCount, previewItems.length, 1), 4);

  return (
    <div className="batch-upload-sheet__document-list">
      {previewItems.map((item, index) => (
        <div
          key={item?.id || `pending-document-preview-${index}`}
          className="batch-upload-sheet__document-row batch-upload-sheet__document-row--pending-preview"
        >
          <span className="batch-upload-sheet__document-preview">
            <PendingUploadPreview
              file={item}
              className="batch-upload-sheet__document-preview-media"
              fallbackClassName="batch-upload-sheet__document-fallback"
              preferThumbnailOnly
            />
          </span>
          <span className="batch-upload-sheet__document-copy">
            <span className="batch-upload-sheet__document-name">{item?.name || "Файл"}</span>
            <span className="batch-upload-sheet__document-meta">{formatFileSize(item?.size)}</span>
          </span>
        </div>
      ))}
      {Array.from({ length: Math.max(0, resolvedCount - previewItems.length) }, (_, index) => (
        <div
          key={`pending-document-shell-${previewItems.length + index}`}
          className="batch-upload-sheet__document-row batch-upload-sheet__document-row--pending-shell"
          aria-hidden="true"
        >
          <span className="batch-upload-sheet__document-preview batch-upload-sheet__document-preview--pending-shell">
            <span className="batch-upload-sheet__tile-pending-shimmer" />
          </span>
          <span className="batch-upload-sheet__document-copy batch-upload-sheet__document-copy--pending-shell">
            <span className="batch-upload-sheet__document-line batch-upload-sheet__document-line--title" />
            <span className="batch-upload-sheet__document-line batch-upload-sheet__document-line--meta" />
          </span>
        </div>
      ))}
    </div>
  );
}

function TextChatBatchUploadSheet({
  selectedFiles,
  uploadingFile,
  message,
  onMessageChange,
  batchOptions,
  onToggleGroupItems,
  onToggleSendAsDocuments,
  onToggleRememberChoice,
  onRemovePendingUpload,
  onClearPendingUploads,
  onFileChange,
  onSend,
  pendingSelection = null,
  onDismissPendingSelection,
}) {
  const fileCount = selectedFiles.length;
  const pendingFileCount = Math.max(0, Number(pendingSelection?.fileCount) || 0);
  const resolvedFileCount = Math.max(fileCount, pendingFileCount);
  const pendingHeaderName = String(pendingSelection?.firstFileName || "").trim();
  const pendingLayoutMode = String(pendingSelection?.layout || "").trim() === "document" ? "document" : "media";
  const pendingPreviewItems = Array.isArray(pendingSelection?.previewItems) ? pendingSelection.previewItems : [];
  const waitingForPicker = Boolean(pendingSelection?.waitingForPicker);
  const [activeFileId, setActiveFileId] = useState(() => String(selectedFiles?.[0]?.id || ""));
  const [visibleItemCount, setVisibleItemCount] = useState(() => Math.min(fileCount, INITIAL_VISIBLE_BATCH_ITEMS));
  const activeFile = selectedFiles.find((item) => String(item?.id || "") === String(activeFileId || "")) || selectedFiles[0] || null;
  const resolvedActiveFileId = String(activeFile?.id || "");
  const sendAsDocumentsEnabled = Boolean(batchOptions?.sendAsDocuments);
  const hasImageOnlySelection = fileCount > 0 && selectedFiles.every((item) => item?.kind === "image");
  const showPendingShell = fileCount < 1 && pendingFileCount > 0;
  const layoutMode = showPendingShell
    ? pendingLayoutMode
    : (sendAsDocumentsEnabled || !hasImageOnlySelection ? "document" : "media");
  const useDocumentLayout = layoutMode === "document";
  const controlsDisabled = uploadingFile || showPendingShell;
  const visibleFiles = selectedFiles.slice(0, visibleItemCount);
  const resolvedGridCount = Math.min(resolvedFileCount, 6);
  const displayTileCount = Math.max(visibleFiles.length, resolvedGridCount || fileCount);
  const unresolvedVisibleTileCount = useDocumentLayout
    ? 0
    : Math.max(0, Math.min(resolvedGridCount, resolvedFileCount) - visibleFiles.length);
  const previewEnabled = !showPendingShell && fileCount > 0;

  useLayoutEffect(() => {
    const pickerOpenedAt = typeof window !== "undefined"
      ? Number(window.__TEND_FILE_PICKER_OPENED_AT__ || 0)
      : 0;
    recordPerfEvent("text-chat", "batch-upload-sheet:layout-commit", {
      fileCount,
      pendingFileCount,
      resolvedFileCount,
      showPendingShell,
      layoutMode,
      visibleItemCount,
      sendAsDocuments: sendAsDocumentsEnabled,
    });
    logUploadDiagnostic("batch-sheet-layout-commit", {
      fileCount,
      pendingFileCount,
      resolvedFileCount,
      showPendingShell,
      layoutMode,
      visibleItemCount,
      sendAsDocuments: sendAsDocumentsEnabled,
      msSincePickerOpen: pickerOpenedAt ? performance.now() - pickerOpenedAt : 0,
    });
  });

  useLayoutEffect(() => {
    const traceId = typeof window !== "undefined"
            ? window.__TEND_PENDING_UPLOAD_SHELL_TRACE_ID__
      : "";
    if (!traceId || !showPendingShell || resolvedFileCount < 1 || waitingForPicker) {
      return;
    }

    window.__TEND_PENDING_UPLOAD_SHELL_TRACE_ID__ = "";
    recordPerfEvent("text-chat", "batch-upload-sheet:pending-shell-committed", {
      layoutMode,
      pendingFileCount,
      resolvedFileCount,
    });
    logUploadDiagnostic("pending-shell-committed", {
      layoutMode,
      pendingFileCount,
      resolvedFileCount,
    });
    finishPerfTraceOnNextFrame(traceId, {
      layoutMode,
      pendingShell: true,
      selectedFileCount: pendingFileCount,
    }, 1);
  }, [layoutMode, pendingFileCount, resolvedFileCount, showPendingShell]);

  useEffect(() => {
    const traceId = typeof window !== "undefined"
      ? window.__TEND_PENDING_UPLOAD_SHEET_TRACE_ID__
      : "";
    if (!traceId || resolvedFileCount < 1) {
      return;
    }

    window.__TEND_PENDING_UPLOAD_SHEET_TRACE_ID__ = "";
    recordPerfEvent("text-chat", "batch-upload-sheet:real-sheet-committed", {
      layoutMode,
      pendingShell: showPendingShell,
      selectedFileCount: fileCount,
      visibleItemCount,
      sendAsDocuments: sendAsDocumentsEnabled,
    });
    logUploadDiagnostic("real-sheet-committed", {
      layoutMode,
      pendingShell: showPendingShell,
      selectedFileCount: fileCount,
      visibleItemCount,
      sendAsDocuments: sendAsDocumentsEnabled,
    });
    finishPerfTraceOnNextFrame(traceId, {
      layoutMode,
      pendingShell: showPendingShell,
      selectedFileCount: fileCount,
      sendAsDocuments: sendAsDocumentsEnabled,
    }, 1);
  }, [fileCount, layoutMode, resolvedFileCount, sendAsDocumentsEnabled, showPendingShell]);

  useEffect(() => {
    setVisibleItemCount(Math.min(fileCount, INITIAL_VISIBLE_BATCH_ITEMS));
  }, [fileCount]);

  useEffect(() => {
    if (visibleItemCount >= fileCount) {
      return undefined;
    }

    let cancelled = false;
    const scheduleFrame =
      typeof window !== "undefined" && typeof window.requestAnimationFrame === "function"
        ? window.requestAnimationFrame.bind(window)
        : (callback) => setTimeout(callback, 16);
    const cancelFrame =
      typeof window !== "undefined" && typeof window.cancelAnimationFrame === "function"
        ? window.cancelAnimationFrame.bind(window)
        : clearTimeout;

    const frameId = scheduleFrame(() => {
      if (cancelled) {
        return;
      }

      setVisibleItemCount((previous) => Math.min(fileCount, previous + BATCH_RENDER_CHUNK_SIZE));
    });

    return () => {
      cancelled = true;
      cancelFrame(frameId);
    };
  }, [fileCount, visibleItemCount]);

  if (resolvedFileCount < 1 || typeof document === "undefined") {
    return null;
  }

  return createPortal(
    <div className="batch-upload-sheet-backdrop" role="presentation">
      <div className="batch-upload-sheet" role="dialog" aria-modal="true" aria-label="Подготовка вложений">
        <div className="batch-upload-sheet__header">
          <div className="batch-upload-sheet__header-copy">
            <strong>
              {waitingForPicker
                ? "Получаем выбранные файлы"
                : getSelectedItemsLabel(resolvedFileCount, { layoutMode, sendAsDocuments: sendAsDocumentsEnabled })}
            </strong>
            {waitingForPicker ? (
              <span className="batch-upload-sheet__header-meta">Ждем ответ проводника</span>
            ) : activeFile?.name || pendingHeaderName ? (
              <span className="batch-upload-sheet__header-meta">{activeFile?.name || pendingHeaderName}</span>
            ) : null}
          </div>
        </div>

        {showPendingShell ? (
          useDocumentLayout ? (
            pendingPreviewItems.length ? (
              <PendingBatchUploadDocumentPreviewList items={pendingPreviewItems} fileCount={resolvedFileCount} />
            ) : (
              <PendingBatchUploadDocumentShell fileCount={resolvedFileCount} />
            )
          ) : (
            pendingPreviewItems.length ? (
              <PendingBatchUploadMediaPreviewGrid items={pendingPreviewItems} fileCount={resolvedFileCount} />
            ) : (
              <PendingBatchUploadMediaShell fileCount={resolvedFileCount} waitingForPicker={waitingForPicker} />
            )
          )
        ) : useDocumentLayout ? (
          <div className="batch-upload-sheet__document-list">
            {visibleFiles.map((selectedFile) => (
              <BatchUploadDocumentRow
                key={selectedFile.id || `${selectedFile.name}-${selectedFile.size}`}
                file={selectedFile}
                uploadingFile={uploadingFile}
                isActive={String(selectedFile?.id || "") === resolvedActiveFileId}
                previewEnabled={previewEnabled}
                onSelect={(nextFileId) => setActiveFileId(String(nextFileId || ""))}
                onRemove={onRemovePendingUpload}
              />
            ))}
          </div>
        ) : (
          <div className={`batch-upload-sheet__grid batch-upload-sheet__grid--count-${resolvedGridCount}`}>
            {visibleFiles.map((selectedFile, index) => (
              <BatchUploadTile
                key={selectedFile.id || `${selectedFile.name}-${selectedFile.size}`}
                file={selectedFile}
                fileCount={displayTileCount}
                index={index}
                uploadingFile={uploadingFile}
                isActive={String(selectedFile?.id || "") === resolvedActiveFileId}
                previewEnabled={previewEnabled}
                onSelect={(nextFileId) => setActiveFileId(String(nextFileId || ""))}
                onRemove={onRemovePendingUpload}
              />
            ))}
            {Array.from({ length: unresolvedVisibleTileCount }, (_, placeholderIndex) => {
              const tileIndex = visibleFiles.length + placeholderIndex;
              return (
                <div
                  key={`pending-batch-tile-${tileIndex}`}
                  className={`batch-upload-sheet__tile ${getBatchTileClassName(displayTileCount, tileIndex)} batch-upload-sheet__tile--pending-shell`}
                  aria-hidden="true"
                >
                  <span className="batch-upload-sheet__tile-pending-shimmer" />
                </div>
              );
            })}
            {visibleItemCount < fileCount ? (
              <div className="batch-upload-sheet__tile batch-upload-sheet__tile--loading-more" aria-hidden="true">
                <span className="batch-upload-sheet__loading-more-label">+{fileCount - visibleItemCount}</span>
              </div>
            ) : null}
          </div>
        )}

        <div className={`batch-upload-sheet__options ${resolvedFileCount === 1 ? "batch-upload-sheet__options--single" : ""}`}>
          <BatchUploadToggle
            checked={Boolean(batchOptions.groupItems)}
            onChange={onToggleGroupItems}
            disabled={controlsDisabled}
          >
            Сгруппировать
          </BatchUploadToggle>

          <BatchUploadToggle
            checked={sendAsDocumentsEnabled}
            onChange={onToggleSendAsDocuments}
            disabled={controlsDisabled}
          >
            {resolvedFileCount === 1 ? "Отправить как файл" : "Отправить как файлы"}
          </BatchUploadToggle>

          <BatchUploadToggle
            checked={Boolean(batchOptions.rememberChoice)}
            onChange={onToggleRememberChoice}
            disabled={controlsDisabled}
          >
            Запомнить выбор
          </BatchUploadToggle>
        </div>

        <label className="batch-upload-sheet__caption">
          <span>Подпись</span>
          <textarea
            value={message}
            onChange={(event) => onMessageChange(event.target.value)}
            disabled={controlsDisabled}
            placeholder=""
            rows={1}
          />
        </label>

        <div className="batch-upload-sheet__actions">
          <label className="batch-upload-sheet__action batch-upload-sheet__action--attach">
            <input
              type="file"
              className="attach-button__input"
              onChange={onFileChange}
              disabled={controlsDisabled}
              multiple
            />
            <span>Добавить</span>
          </label>

          <div className="batch-upload-sheet__actions-group">
            <button
              type="button"
              className="batch-upload-sheet__action"
              onClick={showPendingShell ? onDismissPendingSelection : onClearPendingUploads}
              disabled={uploadingFile}
            >
              Отмена
            </button>
            <button
              type="button"
              className="batch-upload-sheet__action batch-upload-sheet__action--primary"
              onClick={() => void onSend()}
              disabled={controlsDisabled || (!String(message || "").trim() && !fileCount)}
            >
              Отправить
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}

TextChatBatchUploadSheet.displayName = "TextChatBatchUploadSheet";

export default memo(TextChatBatchUploadSheet);
