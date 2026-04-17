import { memo, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import PendingUploadPreview from "./PendingUploadPreview";
import { formatFileSize } from "../utils/textChatHelpers";

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
  const isHighQuality = String(file?.compressionMode || "original") !== "compressed";
  const isSpoiler = Boolean(file?.hideWithSpoiler);

  return (
    <div
      className={`batch-upload-sheet__tile ${getBatchTileClassName(fileCount, index)} ${isActive ? "batch-upload-sheet__tile--active" : ""} ${isSpoiler ? "batch-upload-sheet__tile--spoiler" : ""}`}
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
        />

        <div className="batch-upload-sheet__tile-scrim" aria-hidden="true" />

        {isSpoiler ? (
          <span className="batch-upload-sheet__spoiler-layer" aria-hidden="true">
            <span className="batch-upload-sheet__spoiler-noise" />
          </span>
        ) : null}

        <span className="batch-upload-sheet__tile-badges" aria-hidden="true">
          {isHighQuality ? <span className="batch-upload-sheet__tile-badge">HD</span> : null}
        </span>
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
  onOpenMenu,
  onRemove,
}) {
  const isHighQuality = String(file?.compressionMode || "original") !== "compressed";
  const isSpoiler = Boolean(file?.hideWithSpoiler);

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
          />

          {isSpoiler ? (
            <span className="batch-upload-sheet__document-spoiler" aria-hidden="true">
              <span className="batch-upload-sheet__document-spoiler-noise" />
            </span>
          ) : null}
        </span>

        <span className="batch-upload-sheet__document-copy">
          <span className="batch-upload-sheet__document-name">{file?.name || "Файл"}</span>
          <span className="batch-upload-sheet__document-meta">
            <span>{formatFileSize(file?.size)}</span>
            {file?.kind === "image" && isHighQuality ? <span>HD</span> : null}
            {isSpoiler ? <span>Спойлер</span> : null}
          </span>
        </span>
      </button>

      <div className="batch-upload-sheet__document-actions">
        <button
          type="button"
          className="batch-upload-sheet__document-action"
          onClick={(event) => onOpenMenu(event, file?.id)}
          disabled={uploadingFile || !file?.id}
          aria-label={`Параметры ${file?.name || "файла"}`}
          title="Параметры"
          data-batch-upload-menu-trigger="true"
        >
          ...
        </button>

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

function BatchUploadAssetMenu({
  activeFile,
  spoilerEnabled,
  disabled,
  sendAsDocuments,
  onToggleHighQuality,
  onToggleSpoiler,
}) {
  if (!activeFile) {
    return null;
  }

  const isHighQuality = String(activeFile?.compressionMode || "original") !== "compressed";
  const isSpoiler = Boolean(spoilerEnabled);

  return (
    <div className="batch-upload-sheet__asset-menu" role="menu" aria-label="Attachment options">
      <button
        type="button"
        className={`batch-upload-sheet__asset-menu-item ${isHighQuality ? "batch-upload-sheet__asset-menu-item--checked" : ""}`}
        onClick={() => onToggleHighQuality(!isHighQuality)}
        disabled={disabled || sendAsDocuments}
        role="menuitemcheckbox"
        aria-checked={isHighQuality}
        title={sendAsDocuments ? "Unavailable while Send as Files is enabled" : "High Quality"}
      >
        <span className="batch-upload-sheet__asset-menu-icon" aria-hidden="true">HD</span>
        <span className="batch-upload-sheet__asset-menu-label">High Quality</span>
        <span className="batch-upload-sheet__asset-menu-check" aria-hidden="true">{isHighQuality ? "✓" : ""}</span>
      </button>

      <button
        type="button"
        className={`batch-upload-sheet__asset-menu-item ${isSpoiler ? "batch-upload-sheet__asset-menu-item--checked" : ""}`}
        onClick={() => onToggleSpoiler(!isSpoiler)}
        disabled={disabled}
        role="menuitemcheckbox"
        aria-checked={isSpoiler}
      >
        <span className="batch-upload-sheet__asset-menu-icon batch-upload-sheet__asset-menu-icon--spoiler" aria-hidden="true" />
        <span className="batch-upload-sheet__asset-menu-label">Hide with Spoiler</span>
        <span className="batch-upload-sheet__asset-menu-check" aria-hidden="true">{isSpoiler ? "✓" : ""}</span>
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
  onUpdatePendingUploadCompressionMode,
  onUpdatePendingUploadSpoilerMode,
  onSend,
}) {
  const fileCount = selectedFiles.length;
  const [activeFileId, setActiveFileId] = useState(() => String(selectedFiles?.[0]?.id || ""));
  const [assetMenuPosition, setAssetMenuPosition] = useState(null);
  const assetMenuRef = useRef(null);

  const activeFile = useMemo(
    () => selectedFiles.find((item) => String(item?.id || "") === String(activeFileId || "")) || selectedFiles[0] || null,
    [activeFileId, selectedFiles]
  );
  const resolvedActiveFileId = String(activeFile?.id || "");
  const allFilesHaveSpoiler = fileCount > 0 && selectedFiles.every((item) => Boolean(item?.hideWithSpoiler));
  const sendAsDocumentsEnabled = Boolean(batchOptions?.sendAsDocuments);
  const assetMenuOpen = Boolean(assetMenuPosition);

  useEffect(() => {
    if (!assetMenuOpen) {
      return undefined;
    }

    const handlePointerDown = (event) => {
      const target = event.target;
      if (
        assetMenuRef.current?.contains(target)
        || target?.closest?.("[data-batch-upload-menu-trigger='true']")
      ) {
        return;
      }

      setAssetMenuPosition(null);
    };

    document.addEventListener("pointerdown", handlePointerDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
    };
  }, [assetMenuOpen]);

  const toggleAssetMenu = (event, nextFileId) => {
    const anchorButton = event?.currentTarget;
    if (!anchorButton?.getBoundingClientRect) {
      return;
    }

    const nextResolvedFileId = String(nextFileId || "");
    const anchorRect = anchorButton.getBoundingClientRect();
    const nextPosition = {
      top: Math.max(12, Math.min(anchorRect.bottom + 8, window.innerHeight - 160)),
      left: Math.max(12, Math.min(anchorRect.right - 224, window.innerWidth - 236)),
      fileId: nextResolvedFileId,
    };

    setActiveFileId(nextResolvedFileId);
    setAssetMenuPosition((previous) => (
      previous
      && previous.fileId === nextPosition.fileId
      && Math.abs(previous.top - nextPosition.top) < 1
      && Math.abs(previous.left - nextPosition.left) < 1
        ? null
        : nextPosition
    ));
  };

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

          <div className="batch-upload-sheet__menu-shell">
            <button
              type="button"
              className="batch-upload-sheet__menu-button"
              onClick={(event) => toggleAssetMenu(event, resolvedActiveFileId)}
              disabled={uploadingFile || !activeFile}
              aria-expanded={assetMenuOpen}
              aria-haspopup="menu"
              aria-label="Attachment options"
              title="Attachment options"
              data-batch-upload-menu-trigger="true"
            >
              ...
            </button>

            {assetMenuOpen ? (
              <div
                ref={assetMenuRef}
                className="batch-upload-sheet__menu-popover"
                style={{
                  top: `${assetMenuPosition?.top || 0}px`,
                  left: `${assetMenuPosition?.left || 0}px`,
                }}
              >
                <BatchUploadAssetMenu
                  activeFile={activeFile}
                  spoilerEnabled={allFilesHaveSpoiler}
                  disabled={uploadingFile}
                  sendAsDocuments={sendAsDocumentsEnabled}
                  onToggleHighQuality={(enabled) => {
                    if (!activeFile?.id) {
                      return;
                    }

                    onUpdatePendingUploadCompressionMode(
                      activeFile.id,
                      enabled ? "original" : "compressed"
                    );
                  }}
                  onToggleSpoiler={(enabled) => {
                    if (!selectedFiles.length) {
                      return;
                    }

                    selectedFiles.forEach((selectedFile) => {
                      if (selectedFile?.id) {
                        onUpdatePendingUploadSpoilerMode(selectedFile.id, enabled);
                      }
                    });
                  }}
                />
              </div>
            ) : null}
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
                onSelect={(nextFileId) => {
                  setActiveFileId(String(nextFileId || ""));
                  setAssetMenuPosition(null);
                }}
                onOpenMenu={toggleAssetMenu}
                onRemove={(nextFileId) => {
                  if (String(nextFileId || "") === resolvedActiveFileId) {
                    setAssetMenuPosition(null);
                  }

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
                onSelect={(nextFileId) => {
                  setActiveFileId(String(nextFileId || ""));
                  setAssetMenuPosition(null);
                }}
                onRemove={(nextFileId) => {
                  if (String(nextFileId || "") === resolvedActiveFileId) {
                    setAssetMenuPosition(null);
                  }

                  onRemovePendingUpload(nextFileId);
                }}
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
            <input type="file" className="attach-button__input" onChange={onFileChange} disabled={uploadingFile} multiple />
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
