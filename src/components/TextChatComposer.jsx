import { useMemo, useRef, useState } from "react";
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

export default function TextChatComposer({
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
  onRemovePendingUpload,
  onRetryPendingUpload,
  onClearPendingUploads,
  onUpdatePendingUploadCompressionMode,
  onToggleBatchUploadGrouping,
  onToggleBatchUploadSendAsDocuments,
  onToggleBatchUploadRememberChoice,
  onDragEnter,
  onDragOver,
  onDragLeave,
  onDrop,
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
  const composerHighlightRef = useRef(null);
  const messageComposerRef = useRef(null);
  const mediaFileInputRef = useRef(null);
  const documentFileInputRef = useRef(null);
  const composerMentionSegments = useMemo(
    () => {
      const normalizedMessage = String(message || "");
      if (!normalizedMessage.includes("@")) {
        return [{ text: normalizedMessage, isMention: false }];
      }

      return segmentMessageTextByMentions(
        normalizedMessage,
        extractMentionsFromText(normalizedMessage, serverMembers, serverRoles)
      );
    },
    [message, serverMembers, serverRoles]
  );
  const handleAttachFileChange = (event) => {
    messageComposerRef.current?.classList.remove("message-composer--attach-menu-open");
    onFileChange(event);
    if (event?.target) {
      event.target.value = "";
      event.target.blur?.();
    }
  };

  const releaseAttachMenuFocusForFilePicker = () => {
    if (typeof document !== "undefined") {
      document.activeElement?.blur?.();
    }
  };

  const suppressAttachMenuForFilePicker = () => {
    releaseAttachMenuFocusForFilePicker();
    messageComposerRef.current?.classList.remove("message-composer--attach-menu-open");
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

  const openAttachFilePicker = (inputRef) => {
    if (uploadingFile) {
      return;
    }

    suppressAttachMenuForFilePicker();
    inputRef.current?.click();
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

  const hasBatchUploadSheet = selectedFiles.length >= 1 && selectedFiles.every((selectedFile) => selectedFile?.kind === "image");
  const hasSendPayload = Boolean(String(message || "").trim()) || selectedFiles.length > 0;
  const shouldShowSendButton = hasSendPayload && voiceRecordingState === "idle";
  const voiceButtonStateClass = voiceRecordingState !== "idle" ? `composer-tool--recording-${voiceRecordingState}` : "";
  const handleClearPendingUploads = () => {
    onClearPendingUploads();
  };
  const handleSendMessage = () => {
    return onSend();
  };

  const getPendingUploadStatusLabel = (selectedFile) => {
    if (selectedFile?.status === "uploading") {
      return `Загрузка ${Math.round((Number(selectedFile?.progress) || 0) * 100)}%`;
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

  return (
    <div
      className={`input-area ${composerDropActive ? "input-area--drag-active" : ""}`}
      onDragEnter={onDragEnter}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      <div className="input-area__editor">
        {hasBatchUploadSheet ? (
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
                      {selectedFile.kind === "image" ? (
                        <select
                          className="chat-file-pill__mode"
                          value={selectedFile.compressionMode || "original"}
                          onChange={(event) => onUpdatePendingUploadCompressionMode(selectedFile.id, event.target.value)}
                          disabled={uploadingFile}
                        >
                          <option value="compressed">Сжать</option>
                          <option value="original">Оригинал</option>
                          <option value="file">Как файл</option>
                        </select>
                      ) : null}
                    </div>
                    <div className="chat-file-pill__progress">
                      <span style={{ width: `${Math.max(6, Math.round((Number(selectedFile.progress) || 0) * 100))}%` }} />
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

        {composerDropActive ? (
          <div className="chat-drop-overlay" aria-hidden="true">
            <div className="chat-drop-overlay__panel">
              <strong>Перетащите файлы сюда</strong>
              <span>Изображения, видео и документы добавятся в очередь перед отправкой</span>
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
                onClick={() => openAttachFilePicker(mediaFileInputRef)}
                disabled={uploadingFile}
                role="menuitem"
              >
                <span className="attach-menu__item-icon attach-menu__item-icon--media" aria-hidden="true" />
                <span>Фото или видео</span>
              </button>

              <button
                type="button"
                className="attach-menu__item"
                onClick={() => openAttachFilePicker(documentFileInputRef)}
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
                      <AnimatedAvatar className="mention-suggestions__avatar" src={suggestion.avatar || ""} alt={suggestion.displayName} />
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
                if (!composerHighlightRef.current) {
                  return;
                }

                composerHighlightRef.current.scrollTop = event.currentTarget.scrollTop;
                composerHighlightRef.current.scrollLeft = event.currentTarget.scrollLeft;
              }}
              data-editing={messageEditState ? "true" : "false"}
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
