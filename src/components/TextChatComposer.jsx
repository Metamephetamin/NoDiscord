import AnimatedEmojiGlyph from "./AnimatedEmojiGlyph";
import AnimatedAvatar from "./AnimatedAvatar";
import {
  buildVoiceMessageLabel,
  COMPOSER_EMOJI_OPTIONS,
  ENABLE_SPEECH_INPUT_BUTTON,
  ENABLE_VOICE_MESSAGE_BUTTON,
} from "../utils/textChatModel";
import { formatFileSize } from "../utils/textChatHelpers";

export default function TextChatComposer({
  selectedFiles,
  setSelectedFiles,
  uploadingFile,
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
  preferExplicitSend,
  onFileChange,
  onStopEditing,
  onCancelVoiceRecording,
  onSpeechRecognitionToggle,
  onSyncComposerSelection,
  onToggleEmojiPicker,
  onInsertEmoji,
  onApplyMentionSuggestion,
  onSelectMentionSuggestionIndex,
  onCloseMentionSuggestions,
  onMessageChange,
  onStopSpeechRecognition,
  onStartEditingLatestOwnMessage,
  onSend,
}) {
  return (
    <div className="input-area">
      <div className="input-area__editor">
        {selectedFiles.length ? (
          <div className="chat-file-list">
            {selectedFiles.map((selectedFile, index) => (
              <div key={`${selectedFile.name}-${selectedFile.size}-${selectedFile.lastModified}-${index}`} className="chat-file-pill">
                <span className="chat-file-pill__name">{selectedFile.name}</span>
                <span className="chat-file-pill__size">{formatFileSize(selectedFile.size)}</span>
                <button
                  type="button"
                  className="chat-file-pill__remove"
                  onClick={() => setSelectedFiles((previous) => previous.filter((_, fileIndex) => fileIndex !== index))}
                  disabled={uploadingFile}
                >
                  x
                </button>
              </div>
            ))}
          </div>
        ) : null}

        {messageEditState || (ENABLE_VOICE_MESSAGE_BUTTON && voiceRecordingState !== "idle") || speechRecognitionActive ? (
          <div className="composer-status-strip">
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

        <div className="input-area__controls">
          <div className="message-composer">
            <label className="attach-button" aria-label="Прикрепить файл" title="Прикрепить файл">
              <input type="file" className="attach-button__input" onChange={onFileChange} disabled={uploadingFile} multiple />
              <span className="attach-button__icon" aria-hidden="true" />
            </label>

            <button
              ref={composerEmojiButtonRef}
              type="button"
              className={`composer-tool composer-tool--emoji ${composerEmojiPickerOpen ? "composer-tool--active" : ""}`}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => {
                onSyncComposerSelection();
                onToggleEmojiPicker();
              }}
              disabled={uploadingFile || voiceRecordingState === "sending"}
              title="Смайлики"
              aria-label="Открыть смайлики"
              aria-expanded={composerEmojiPickerOpen}
            >
              <AnimatedEmojiGlyph emoji={COMPOSER_EMOJI_OPTIONS[0]} className="composer-tool__emoji" />
            </button>

            {ENABLE_SPEECH_INPUT_BUTTON ? (
              <button
                type="button"
                className={`composer-tool composer-tool--speech ${speechRecognitionActive ? "composer-tool--active" : ""}`}
                onClick={onSpeechRecognitionToggle}
                disabled={uploadingFile || voiceRecordingState !== "idle"}
                title="Голосовой ввод текста"
                aria-label="Голосовой ввод текста"
              >
                <span className="composer-tool__mic" aria-hidden="true" />
                <span className="composer-tool__badge" aria-hidden="true">a</span>
              </button>
            ) : null}

            {composerEmojiPickerOpen ? (
              <div ref={composerEmojiPickerRef} className="composer-emoji-picker" role="dialog" aria-label="Выбор смайлика">
                <div className="composer-emoji-picker__grid">
                  {COMPOSER_EMOJI_OPTIONS.map((emojiOption) => (
                    <button
                      key={emojiOption.key}
                      type="button"
                      className="composer-emoji-picker__item"
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => onInsertEmoji(emojiOption.glyph)}
                      title={emojiOption.label}
                      aria-label={emojiOption.label}
                    >
                      <AnimatedEmojiGlyph emoji={emojiOption} />
                    </button>
                  ))}
                </div>
              </div>
            ) : null}

            {mentionSuggestionsOpen && mentionSuggestions.length ? (
              <div ref={mentionSuggestionsRef} className="mention-suggestions" role="listbox" aria-label="Server mention suggestions">
                {mentionSuggestions.map((suggestion, index) => (
                  <button
                    key={`${suggestion.userId}-${suggestion.handle}`}
                    type="button"
                    className={`mention-suggestions__item ${index === selectedMentionSuggestionIndex ? "mention-suggestions__item--active" : ""}`}
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => onApplyMentionSuggestion(suggestion)}
                    role="option"
                    aria-selected={index === selectedMentionSuggestionIndex}
                  >
                    <AnimatedAvatar className="mention-suggestions__avatar" src={suggestion.avatar || ""} alt={suggestion.displayName} />
                    <span className="mention-suggestions__content">
                      <span className="mention-suggestions__name">{suggestion.displayName}</span>
                      <span className="mention-suggestions__handle">@{suggestion.handle}</span>
                    </span>
                  </button>
                ))}
              </div>
            ) : null}

            <textarea
              ref={textareaRef}
              value={message}
              disabled={uploadingFile || voiceRecordingState === "sending"}
              onChange={(event) => {
                onMessageChange(event.target.value);
                onSyncComposerSelection();
              }}
              onSelect={onSyncComposerSelection}
              onClick={onSyncComposerSelection}
              onKeyUp={onSyncComposerSelection}
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
                  onSend();
                }
              }}
            />

            <div className="composer-tools-end">
              <button
                type="button"
                className="composer-send-button"
                onClick={() => void onSend()}
                disabled={
                  uploadingFile
                  || voiceRecordingState === "holding"
                  || voiceRecordingState === "locked"
                  || voiceRecordingState === "sending"
                  || (!String(message || "").trim() && !selectedFiles.length)
                }
                aria-label="Отправить сообщение"
                title="Отправить сообщение"
              >
                <span className="composer-send-button__icon" aria-hidden="true" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
