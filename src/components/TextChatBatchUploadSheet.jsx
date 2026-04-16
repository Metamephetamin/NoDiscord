import { memo } from "react";
import { createPortal } from "react-dom";
import { formatFileSize } from "../utils/textChatHelpers";

function BatchUploadItem({ file, uploadingFile, onRemove, showPreview }) {
  return (
    <div className="batch-upload-sheet__item">
      <div className="batch-upload-sheet__thumb">
        {showPreview && file.previewUrl && file.kind === "image" ? (
          <img src={file.previewUrl} alt={file.name} loading="lazy" decoding="async" />
        ) : showPreview && file.previewUrl && file.kind === "video" ? (
          <video src={file.previewUrl} muted playsInline preload="metadata" />
        ) : (
          <span className="batch-upload-sheet__thumb-fallback" aria-hidden="true">
            {file.kind === "video" ? "VID" : file.kind === "image" ? "IMG" : "FILE"}
          </span>
        )}
      </div>

      <div className="batch-upload-sheet__meta">
        <strong title={file.name}>{file.name}</strong>
        <span>{formatFileSize(file.size)}</span>
      </div>

      <button
        type="button"
        className="batch-upload-sheet__remove"
        onClick={() => onRemove(file.id)}
        disabled={uploadingFile && file.status === "uploading"}
        aria-label={`Убрать ${file.name}`}
        title="Убрать"
      >
        x
      </button>
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
}) {
  const fileCount = selectedFiles.length;

  if (fileCount <= 1 || typeof document === "undefined") {
    return null;
  }

  return createPortal(
    <div className="batch-upload-sheet-backdrop" role="presentation">
      <div className="batch-upload-sheet" role="dialog" aria-modal="true" aria-label="Подготовка фотографий">
        <div className="batch-upload-sheet__header">
          <strong>{`${fileCount} фото выбрано`}</strong>
        </div>

        <div className="batch-upload-sheet__list">
          {selectedFiles.map((selectedFile) => (
            <BatchUploadItem
              key={selectedFile.id || `${selectedFile.name}-${selectedFile.size}`}
              file={selectedFile}
              uploadingFile={uploadingFile}
              onRemove={onRemovePendingUpload}
              showPreview
            />
          ))}
        </div>

        <div className="batch-upload-sheet__hint">
          Можно отправить все фото одной галереей или раздельными сообщениями без лишнего сжатия.
        </div>

        <label className="batch-upload-sheet__option">
          <input
            type="checkbox"
            checked={Boolean(batchOptions.groupItems)}
            onChange={(event) => onToggleGroupItems(event.target.checked)}
            disabled={uploadingFile}
          />
          <span>Группировать элементы</span>
        </label>

        <label className="batch-upload-sheet__option">
          <input
            type="checkbox"
            checked={Boolean(batchOptions.sendAsDocuments)}
            onChange={(event) => onToggleSendAsDocuments(event.target.checked)}
            disabled={uploadingFile}
          />
          <span>Отправить как файлы</span>
        </label>

        <label className="batch-upload-sheet__option">
          <input
            type="checkbox"
            checked={Boolean(batchOptions.rememberChoice)}
            onChange={(event) => onToggleRememberChoice(event.target.checked)}
            disabled={uploadingFile}
          />
          <span>Запомнить выбор</span>
        </label>

        <label className="batch-upload-sheet__caption">
          <span>Подпись</span>
          <textarea
            value={message}
            onChange={(event) => onMessageChange(event.target.value)}
            disabled={uploadingFile}
            placeholder="Добавьте подпись к отправке"
            rows={2}
          />
        </label>

        <div className="batch-upload-sheet__actions">
          <label className="batch-upload-sheet__action batch-upload-sheet__action--attach">
            <input type="file" className="attach-button__input" onChange={onFileChange} disabled={uploadingFile} multiple />
            <span>Добавить</span>
          </label>
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
    </div>,
    document.body
  );
}

TextChatBatchUploadSheet.displayName = "TextChatBatchUploadSheet";

export default memo(TextChatBatchUploadSheet);
