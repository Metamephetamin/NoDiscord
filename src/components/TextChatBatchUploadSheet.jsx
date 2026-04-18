import { memo, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import PendingUploadPreview from "./PendingUploadPreview";
import { formatFileSize } from "../utils/textChatHelpers";
import { finishPerfTraceOnNextFrame } from "../utils/perf";

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

function getSelectedItemsLabel(fileCount, sendAsDocuments) {
  const mod10 = fileCount % 10;
  const mod100 = fileCount % 100;

  if (sendAsDocuments) {
    if (mod10 === 1 && mod100 !== 11) {
      return `Выбрано ${fileCount} файл`;
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
}) {
  const fileCount = selectedFiles.length;
  const [activeFileId, setActiveFileId] = useState(() => String(selectedFiles?.[0]?.id || ""));
  const activeFile = selectedFiles.find((item) => String(item?.id || "") === String(activeFileId || "")) || selectedFiles[0] || null;
  const resolvedActiveFileId = String(activeFile?.id || "");
  const sendAsDocumentsEnabled = Boolean(batchOptions?.sendAsDocuments);

  useEffect(() => {
    const traceId = typeof window !== "undefined"
      ? window.__TEND_PENDING_UPLOAD_SHEET_TRACE_ID__
      : "";
    if (!traceId) {
      return;
    }

    window.__TEND_PENDING_UPLOAD_SHEET_TRACE_ID__ = "";
    finishPerfTraceOnNextFrame(traceId, {
      selectedFileCount: fileCount,
      sendAsDocuments: sendAsDocumentsEnabled,
    }, 1);
  }, [fileCount, sendAsDocumentsEnabled]);

  if (fileCount < 1 || typeof document === "undefined") {
    return null;
  }

  return createPortal(
    <div className="batch-upload-sheet-backdrop" role="presentation">
      <div className="batch-upload-sheet" role="dialog" aria-modal="true" aria-label="Подготовка фотографий">
        <div className="batch-upload-sheet__header">
          <div className="batch-upload-sheet__header-copy">
            <strong>{getSelectedItemsLabel(fileCount, sendAsDocumentsEnabled)}</strong>
            {activeFile?.name ? <span className="batch-upload-sheet__header-meta">{activeFile.name}</span> : null}
          </div>

        </div>

        {sendAsDocumentsEnabled ? (
          <div className="batch-upload-sheet__document-list">
            {selectedFiles.map((selectedFile) => (
              <BatchUploadDocumentRow
                key={selectedFile.id || `${selectedFile.name}-${selectedFile.size}`}
                file={selectedFile}
                uploadingFile={uploadingFile}
                isActive={String(selectedFile?.id || "") === resolvedActiveFileId}
                onSelect={(nextFileId) => setActiveFileId(String(nextFileId || ""))}
                onRemove={(nextFileId) => {
                  onRemovePendingUpload(nextFileId);
                }}
              />
            ))}
          </div>
        ) : (
          <div className={`batch-upload-sheet__grid batch-upload-sheet__grid--count-${Math.min(fileCount, 6)}`}>
            {selectedFiles.map((selectedFile, index) => (
              <BatchUploadTile
                key={selectedFile.id || `${selectedFile.name}-${selectedFile.size}`}
                file={selectedFile}
                fileCount={fileCount}
                index={index}
                uploadingFile={uploadingFile}
                isActive={String(selectedFile?.id || "") === resolvedActiveFileId}
                onSelect={(nextFileId) => setActiveFileId(String(nextFileId || ""))}
                onRemove={onRemovePendingUpload}
              />
            ))}
          </div>
        )}

        <div className={`batch-upload-sheet__options ${fileCount === 1 ? "batch-upload-sheet__options--single" : ""}`}>
          <BatchUploadToggle
            checked={!sendAsDocumentsEnabled && Boolean(batchOptions.groupItems)}
            onChange={onToggleGroupItems}
            disabled={uploadingFile || sendAsDocumentsEnabled}
          >
            Сгруппировать
          </BatchUploadToggle>

          <BatchUploadToggle
            checked={sendAsDocumentsEnabled}
            onChange={onToggleSendAsDocuments}
            disabled={uploadingFile}
          >
            Отправить как файлы
          </BatchUploadToggle>

          <BatchUploadToggle
            checked={Boolean(batchOptions.rememberChoice)}
            onChange={onToggleRememberChoice}
            disabled={uploadingFile}
          >
            Запомнить выбор
          </BatchUploadToggle>
        </div>

        <label className="batch-upload-sheet__caption">
          <span>Подпись</span>
          <textarea
            value={message}
            onChange={(event) => onMessageChange(event.target.value)}
            disabled={uploadingFile}
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
              disabled={uploadingFile}
              multiple
            />
            <span>Добавить</span>
          </label>

          <div className="batch-upload-sheet__actions-group">
            <button type="button" className="batch-upload-sheet__action" onClick={onClearPendingUploads} disabled={uploadingFile}>
              Отмена
            </button>
            <button
              type="button"
              className="batch-upload-sheet__action batch-upload-sheet__action--primary"
              onClick={() => void onSend()}
              disabled={uploadingFile || (!String(message || "").trim() && !fileCount)}
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
