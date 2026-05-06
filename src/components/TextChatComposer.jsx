import { memo, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import AnimatedAvatar from "./AnimatedAvatar";
import AnimatedEmojiGlyph from "./AnimatedEmojiGlyph";
import PendingUploadPreview from "./PendingUploadPreview";
import TextChatBatchUploadSheet from "./TextChatBatchUploadSheet";
import TextChatLocationPickerModal from "./TextChatLocationPickerModal";
import TextChatPollComposerModal from "./TextChatPollComposerModal";
import useTextChatAttachmentPickerFlow from "../hooks/useTextChatAttachmentPickerFlow";
import { extractMentionsFromText, segmentMessageTextByMentions } from "../utils/messageMentions";
import {
  COMPOSER_EMOJI_OPTIONS,
  ENABLE_SPEECH_INPUT_BUTTON,
  ENABLE_VOICE_MESSAGE_BUTTON,
  resolveAnimatedEmojiFallbackGlyph,
} from "../utils/textChatModel";
import { formatFileSize } from "../utils/textChatHelpers";
import { COMPOSER_TRANSLATION_LANGUAGES, translateComposerText } from "../utils/textTranslation";
import { punctuateComposerText } from "../utils/speechPunctuation";
import { copyTextToClipboard } from "../utils/clipboard";

const LOCATION_DESIRED_ACCURACY_METERS = 25;
const LOCATION_ACCURACY_TIMEOUT_MS = 9000;
const LOCATION_HIGH_ACCURACY_OPTIONS = {
  enableHighAccuracy: true,
  timeout: 15000,
  maximumAge: 0,
};

function clampLocationLatitude(value) {
  return Math.max(-85.05112878, Math.min(85.05112878, Number(value) || 0));
}

function normalizeLocationLongitude(value) {
  let longitude = Number(value) || 0;
  while (longitude > 180) {
    longitude -= 360;
  }
  while (longitude < -180) {
    longitude += 360;
  }
  return longitude;
}

function normalizeGeolocationPosition(position) {
  return {
    latitude: clampLocationLatitude(position?.coords?.latitude),
    longitude: normalizeLocationLongitude(position?.coords?.longitude),
    accuracy: Number(position?.coords?.accuracy) || null,
  };
}

function isMoreAccurateLocation(candidate, currentBest) {
  if (!currentBest) {
    return true;
  }

  const candidateAccuracy = Number(candidate?.accuracy) || Number.POSITIVE_INFINITY;
  const bestAccuracy = Number(currentBest?.accuracy) || Number.POSITIVE_INFINITY;
  return candidateAccuracy < bestAccuracy;
}

function getBestAvailableGeolocation(geolocation) {
  return new Promise((resolve, reject) => {
    let bestPosition = null;
    let lastError = null;
    let watchId = null;
    let settled = false;

    const finish = (position, error) => {
      if (settled) {
        return;
      }

      settled = true;
      clearTimeout(timeoutId);
      if (watchId !== null && typeof geolocation.clearWatch === "function") {
        geolocation.clearWatch(watchId);
      }

      if (position) {
        resolve(position);
        return;
      }

      reject(error || new Error("Geolocation unavailable"));
    };

    const handlePosition = (position) => {
      const normalizedPosition = normalizeGeolocationPosition(position);
      if (isMoreAccurateLocation(normalizedPosition, bestPosition)) {
        bestPosition = normalizedPosition;
      }

      const accuracy = Number(normalizedPosition.accuracy) || Number.POSITIVE_INFINITY;
      if (accuracy <= LOCATION_DESIRED_ACCURACY_METERS) {
        finish(normalizedPosition, null);
      }
    };

    const handleError = (error) => {
      lastError = error;
    };

    const timeoutId = setTimeout(() => {
      finish(bestPosition, lastError);
    }, LOCATION_ACCURACY_TIMEOUT_MS);

    try {
      if (typeof geolocation.watchPosition === "function") {
        watchId = geolocation.watchPosition(handlePosition, handleError, LOCATION_HIGH_ACCURACY_OPTIONS);
      }
      geolocation.getCurrentPosition(handlePosition, handleError, LOCATION_HIGH_ACCURACY_OPTIONS);
    } catch (error) {
      finish(bestPosition, error);
    }
  });
}

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

function TextChatComposer({
  selectedFiles,
  uploadingFile,
  composerDropActive,
  replyState,
  messageEditState,
  voiceRecordingState,
  voiceMicLevel = 0,
  speechRecognitionActive,
  speechMicLevel = 0,
  speechCaptureState = "idle",
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
  instantAttachmentSend = false,
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
  onSendLocation,
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
  onSpeechRecognitionPointerDown,
  onSpeechRecognitionPointerMove,
  onSpeechRecognitionPointerUp,
  onSpeechRecognitionPointerCancel,
  onRequestScrollToLatest,
  onSend,
}) {
  const [emojiPreviewCount, setEmojiPreviewCount] = useState(8);
  const [emojiSearchQuery, setEmojiSearchQuery] = useState("");
  const [pollComposerOpen, setPollComposerOpen] = useState(false);
  const [locationPickerOpen, setLocationPickerOpen] = useState(false);
  const [locationPickerLocating, setLocationPickerLocating] = useState(false);
  const [locationPickerError, setLocationPickerError] = useState("");
  const [locationPickerCurrentPosition, setLocationPickerCurrentPosition] = useState(null);
  const [translatorMenuOpen, setTranslatorMenuOpen] = useState(false);
  const [translationPending, setTranslationPending] = useState(false);
  const [punctuationPending, setPunctuationPending] = useState(false);
  const [translationError, setTranslationError] = useState("");
  const [punctuationReview, setPunctuationReview] = useState(null);
  const [punctuationCopyStatus, setPunctuationCopyStatus] = useState("");
  const composerHighlightRef = useRef(null);
  const messageComposerRef = useRef(null);
  const translatorButtonRef = useRef(null);
  const translatorMenuRef = useRef(null);
  const attachMenuCloseTimeoutRef = useRef(0);
  const suppressSpeechClickRef = useRef(false);
  const deferredMessage = useDeferredValue(message);
  const deferredEmojiSearchQuery = useDeferredValue(emojiSearchQuery);
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
  const shouldRenderComposerHighlight = composerMentionSegments.some((segment) => segment?.isMention);
  const normalizedComposerText = String(message || "").trim();
  const composerWordCount = normalizedComposerText ? normalizedComposerText.split(/\s+/).filter(Boolean).length : 0;
  const canUsePunctuationTool = composerWordCount >= 2 || normalizedComposerText.length >= 12;
  const {
    mediaFileInputRef,
    documentFileInputRef,
    pendingBatchSelection,
    shouldShowPendingBatchSheet,
    handleAttachFileChange,
    openMediaAttachFilePicker,
    openDocumentAttachFilePicker,
    dismissPendingBatchSelection,
  } = useTextChatAttachmentPickerFlow({
    messageComposerRef,
    selectedFiles,
    uploadingFile,
    instantAttachmentSend,
    messageEditState,
    onFileChange,
    onQueueFiles,
    onToggleBatchUploadSendAsDocuments,
  });

  const filteredComposerEmojiOptions = useMemo(() => {
    const normalizedQuery = String(deferredEmojiSearchQuery || "").trim().toLowerCase();
    if (!normalizedQuery) {
      return COMPOSER_EMOJI_OPTIONS;
    }

    return COMPOSER_EMOJI_OPTIONS.filter((emojiOption) => {
      const glyph = String(emojiOption?.glyph || "").trim();
      const label = String(emojiOption?.label || "").toLowerCase();
      const key = String(emojiOption?.key || "").toLowerCase().replace(/^symbl_/, "").replace(/_/g, " ");
      return glyph.includes(normalizedQuery) || label.includes(normalizedQuery) || key.includes(normalizedQuery);
    });
  }, [deferredEmojiSearchQuery]);

  useEffect(() => {
    if (!composerEmojiPickerOpen) {
      setEmojiSearchQuery("");
      setEmojiPreviewCount(8);
    }
  }, [composerEmojiPickerOpen]);

  useEffect(() => {
    if (!translatorMenuOpen || typeof window === "undefined") {
      return undefined;
    }

    const handlePointerDown = (event) => {
      if (translatorMenuRef.current?.contains(event.target) || translatorButtonRef.current?.contains(event.target)) {
        return;
      }

      setTranslatorMenuOpen(false);
    };
    const handleEscape = (event) => {
      if (event.key === "Escape") {
        setTranslatorMenuOpen(false);
      }
    };

    window.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("keydown", handleEscape);
    return () => {
      window.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("keydown", handleEscape);
    };
  }, [translatorMenuOpen]);

  useEffect(() => {
    if (!punctuationReview) {
      return;
    }

    if (String(message || "").trim() !== punctuationReview.sourceText) {
      setPunctuationReview(null);
      setPunctuationCopyStatus("");
    }
  }, [message, punctuationReview]);

  const clearAttachMenuCloseTimeout = () => {
    if (!attachMenuCloseTimeoutRef.current || typeof window === "undefined") {
      return;
    }

    window.clearTimeout(attachMenuCloseTimeoutRef.current);
    attachMenuCloseTimeoutRef.current = 0;
  };

  const openAttachMenu = () => {
    if (uploadingFile) {
      return;
    }

    clearAttachMenuCloseTimeout();
    messageComposerRef.current?.classList.add("message-composer--attach-menu-open");
  };

  const closeAttachMenu = () => {
    clearAttachMenuCloseTimeout();
    messageComposerRef.current?.classList.remove("message-composer--attach-menu-open");
  };

  const scheduleCloseAttachMenu = () => {
    if (uploadingFile || typeof window === "undefined") {
      closeAttachMenu();
      return;
    }

    clearAttachMenuCloseTimeout();
    attachMenuCloseTimeoutRef.current = window.setTimeout(() => {
      attachMenuCloseTimeoutRef.current = 0;
      messageComposerRef.current?.classList.remove("message-composer--attach-menu-open");
    }, 140);
  };

  const toggleAttachMenu = () => {
    if (uploadingFile) {
      return;
    }

    clearAttachMenuCloseTimeout();
    if (messageComposerRef.current?.classList.contains("message-composer--attach-menu-open")) {
      messageComposerRef.current.classList.remove("message-composer--attach-menu-open");
      return;
    }

    messageComposerRef.current?.classList.add("message-composer--attach-menu-open");
  };


  const loadMoreEmojiPreviews = () => {
    setEmojiPreviewCount((previous) => Math.min(previous + 8, filteredComposerEmojiOptions.length));
  };

  const handleEmojiPickerScroll = (event) => {
    const target = event.currentTarget;
    if (target.scrollHeight - target.scrollTop - target.clientHeight <= 72) {
      loadMoreEmojiPreviews();
    }
  };

  const hasBatchUploadSheet = selectedFiles.length >= 1;
  const hasSendPayload = Boolean(String(message || "").trim()) || selectedFiles.length > 0;
  const shouldShowSendButton = hasSendPayload && voiceRecordingState === "idle";
  const voiceButtonStateClass = voiceRecordingState !== "idle" ? `composer-tool--recording-${voiceRecordingState}` : "";
  const normalizedVoiceMicLevel = Math.max(0, Math.min(1, Number(voiceMicLevel) || 0));
  const normalizedSpeechMicLevel = Math.max(0, Math.min(1, Number(speechMicLevel) || 0));
  const activeMicLevel = voiceRecordingState !== "idle" ? normalizedVoiceMicLevel : normalizedSpeechMicLevel;
  const speechMicStyle = (speechRecognitionActive || voiceRecordingState !== "idle")
    ? {
      "--speech-level-scale": (1.08 + activeMicLevel * 1.32).toFixed(3),
      "--speech-level-opacity": (0.58 + activeMicLevel * 0.34).toFixed(3),
    }
    : undefined;
  const speechIsHolding = speechCaptureState === "holding";
  const speechIsLocked = speechCaptureState === "locked";
  const speechIsCanceling = speechCaptureState === "canceling" || voiceRecordingState === "canceling";
  const hybridMicStateClass = voiceRecordingState !== "idle"
    ? `composer-tool--gesture-${voiceRecordingState}`
    : speechIsLocked
      ? "composer-tool--gesture-locked"
      : speechIsCanceling
        ? "composer-tool--gesture-canceling"
      : speechIsHolding
        ? "composer-tool--gesture-holding"
        : "";
  const handleClearPendingUploads = () => {
    onClearPendingUploads();
  };
  const handleSendMessage = async () => {
    if (speechRecognitionActive) {
      onStopSpeechRecognition(false);
    }
    if (!messageEditState && (String(message || "").trim() || selectedFiles.length > 0)) {
      onRequestScrollToLatest?.();
    }
    return onSend();
  };

  const requestCurrentLocation = async () => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setLocationPickerError("Браузер не поддерживает геолокацию. Выберите точку на карте вручную.");
      return null;
    }

    setLocationPickerLocating(true);
    setLocationPickerError("");

    try {
      const resolvedPosition = await getBestAvailableGeolocation(navigator.geolocation);

      setLocationPickerCurrentPosition(resolvedPosition);
      return resolvedPosition;
    } catch (error) {
      const errorCode = Number(error?.code) || 0;
      setLocationPickerError(
        errorCode === 1
          ? "Разрешение на геолокацию отклонено. Выберите точку на карте вручную."
          : "Не удалось определить ваше местоположение. Выберите точку на карте вручную."
      );
      return null;
    } finally {
      setLocationPickerLocating(false);
    }
  };

  const handleOpenLocationPicker = async () => {
    if (uploadingFile || voiceRecordingState === "sending" || typeof onSendLocation !== "function") {
      return;
    }

    closeAttachMenu();
    setLocationPickerOpen(true);
    void requestCurrentLocation();
  };

  const handleCloseLocationPicker = () => {
    setLocationPickerOpen(false);
  };

  const handleSubmitLocation = async (locationPayload) => {
    if (typeof onSendLocation !== "function") {
      return false;
    }

    return onSendLocation(locationPayload);
  };

  const applyComposerText = (nextText) => {
    const normalizedNextText = String(nextText || "").trim();
    if (!normalizedNextText) {
      return;
    }

    onMessageChange(normalizedNextText);
    requestAnimationFrame(() => {
      textareaRef.current?.focus?.();
      const nextPosition = normalizedNextText.length;
      textareaRef.current?.setSelectionRange?.(nextPosition, nextPosition);
      onSyncComposerSelection(textareaRef.current);
    });
  };

  const handleTranslateComposerText = async (targetLanguage) => {
    const sourceText = String(message || "").trim();
    if (!sourceText || translationPending || punctuationPending) {
      return;
    }

    setTranslationPending(true);
    setTranslationError("");

    try {
      const result = await translateComposerText(sourceText, targetLanguage);
      if (result.text) {
        applyComposerText(result.text);
      }
      setTranslatorMenuOpen(false);
    } catch (error) {
      setTranslationError(error?.message || "Не удалось перевести текст.");
    } finally {
      setTranslationPending(false);
    }
  };

  const handlePunctuateComposerText = async () => {
    const sourceText = String(message || "").trim();
    if (!sourceText || translationPending || punctuationPending) {
      return;
    }

    if (!canUsePunctuationTool) {
      setTranslationError("Для исправления нужен текст хотя бы из пары слов.");
      return;
    }

    setPunctuationPending(true);
    setTranslationError("");
    setPunctuationReview(null);
    setPunctuationCopyStatus("");

    try {
      const result = await punctuateComposerText(sourceText);
      if (result) {
        if (result === sourceText) {
          setTranslationError("Ollama не предложила изменений для этого текста.");
          return;
        }

        setPunctuationReview({
          sourceText,
          resultText: result,
        });
        setTranslatorMenuOpen(false);
      }
    } catch (error) {
      setTranslationError(error?.message || "Не удалось исправить текст.");
    } finally {
      setPunctuationPending(false);
    }
  };

  const handleApplyPunctuationReview = () => {
    if (!punctuationReview?.resultText) {
      return;
    }

    applyComposerText(punctuationReview.resultText);
    setPunctuationReview(null);
    setPunctuationCopyStatus("");
  };

  const handleCopyPunctuationReview = async () => {
    const resultText = String(punctuationReview?.resultText || "").trim();
    if (!resultText) {
      return;
    }

    try {
      await copyTextToClipboard(resultText);
      setPunctuationCopyStatus("Скопировано");
    } catch {
      setPunctuationCopyStatus("Не удалось скопировать");
    }
  };

  const handleCancelPunctuationReview = () => {
    setPunctuationReview(null);
    setPunctuationCopyStatus("");
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
            onDismissPendingSelection={dismissPendingBatchSelection}
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

        {replyState || messageEditState ? (
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
          </div>
        ) : null}

        <div className={`input-area__controls ${hasBatchUploadSheet ? "input-area__controls--batch" : ""}`}>
          <div ref={messageComposerRef} className="message-composer">
            {punctuationReview ? (
              <div className="composer-ai-review" role="dialog" aria-label="Предложение исправленного текста">
                <div className="composer-ai-review__header">
                  <div>
                    <strong>Исправленный текст</strong>
                    <span>Проверьте вариант перед заменой сообщения.</span>
                  </div>
                  <button type="button" className="composer-ai-review__close" onClick={handleCancelPunctuationReview} aria-label="Закрыть" />
                </div>
                <div className="composer-ai-review__body">
                  <div className="composer-ai-review__text composer-ai-review__text--source">
                    <span>Было</span>
                    <p>{punctuationReview.sourceText}</p>
                  </div>
                  <div className="composer-ai-review__text composer-ai-review__text--result">
                    <span>Стало</span>
                    <p>{punctuationReview.resultText}</p>
                  </div>
                </div>
                <div className="composer-ai-review__actions">
                  {punctuationCopyStatus ? <span className="composer-ai-review__status">{punctuationCopyStatus}</span> : null}
                  <button type="button" className="composer-ai-review__button composer-ai-review__button--ghost" onClick={handleCopyPunctuationReview}>
                    Скопировать
                  </button>
                  <button type="button" className="composer-ai-review__button composer-ai-review__button--ghost" onClick={handleCancelPunctuationReview}>
                    Отмена
                  </button>
                  <button type="button" className="composer-ai-review__button composer-ai-review__button--primary" onClick={handleApplyPunctuationReview}>
                    Заменить
                  </button>
                </div>
              </div>
            ) : null}
            <div
              className="attach-menu-anchor"
              onPointerEnter={openAttachMenu}
              onPointerLeave={scheduleCloseAttachMenu}
            >
            <button
              type="button"
              className="attach-button"
              aria-label="Добавить фото или видео"
              title="Добавить фото или видео"
              onClick={openMediaAttachFilePicker}
              onFocus={openAttachMenu}
            >
              <span className="attach-button__icon" aria-hidden="true" />
            </button>

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
              <button
                type="button"
                className="attach-menu__item"
                onClick={() => void handleOpenLocationPicker()}
                disabled={uploadingFile || voiceRecordingState === "sending" || typeof onSendLocation !== "function"}
                role="menuitem"
              >
                <span className="attach-menu__item-icon attach-menu__item-icon--location" aria-hidden="true" />
                <span>Локация</span>
              </button>
            </div>
            </div>

            <button
              ref={translatorButtonRef}
              type="button"
              className={`composer-tool composer-tool--text-tools ${translatorMenuOpen ? "composer-tool--active" : ""}`}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => {
                onSyncComposerSelection();
                onToggleEmojiPicker(false);
                setTranslationError("");
                setTranslatorMenuOpen((previous) => !previous);
              }}
              disabled={uploadingFile || voiceRecordingState === "sending" || translationPending || punctuationPending}
              title="Текстовые инструменты"
              aria-label="Текстовые инструменты"
              aria-expanded={translatorMenuOpen}
            >
              <span className="composer-tool__text-tools-icon" aria-hidden="true" />
            </button>

            {translatorMenuOpen ? (
              <div ref={translatorMenuRef} className="composer-text-tools-menu" role="menu" aria-label="Текстовые инструменты">
                <button
                  type="button"
                  className="composer-text-tools-menu__action"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => void handlePunctuateComposerText()}
                  disabled={translationPending || punctuationPending || !String(message || "").trim() || !canUsePunctuationTool}
                  role="menuitem"
                >
                  <span className="composer-text-tools-menu__action-icon composer-text-tools-menu__action-icon--punctuation" aria-hidden="true" />
                  <span>
                    <b>{punctuationPending ? "Исправляем..." : "Исправить текст"}</b>
                    <small>Пунктуация, пробелы и легкие опечатки перед отправкой</small>
                  </span>
                </button>

                <div className="composer-text-tools-menu__header">
                  <strong>{translationPending ? "Переводим..." : "Переводчик"}</strong>
                  <span>Исходный язык определится автоматически</span>
                </div>
                <div className="composer-text-tools-menu__list">
                  {COMPOSER_TRANSLATION_LANGUAGES.map((language) => (
                    <button
                      key={language.value}
                      type="button"
                      className="composer-text-tools-menu__item"
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => void handleTranslateComposerText(language.value)}
                      disabled={translationPending || punctuationPending || !String(message || "").trim()}
                      role="menuitem"
                    >
                      {language.label}
                    </button>
                  ))}
                </div>
                {translationError ? <div className="composer-text-tools-menu__error">{translationError}</div> : null}
              </div>
            ) : null}

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
                  setTranslatorMenuOpen(false);
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
                aria-label="Выбор смайлика"
                onScroll={handleEmojiPickerScroll}
              >
                <label className="composer-emoji-picker__search">
                  <span className="composer-emoji-picker__search-icon" aria-hidden="true" />
                  <input
                    type="search"
                    value={emojiSearchQuery}
                    onChange={(event) => {
                      setEmojiSearchQuery(event.target.value);
                      setEmojiPreviewCount(8);
                    }}
                    placeholder="Поиск"
                    autoComplete="off"
                    spellCheck={false}
                  />
                </label>
                <div className="composer-emoji-picker__grid">
                  {filteredComposerEmojiOptions.map((emojiOption, index) => (
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
                      onClick={() => {
                        const fallbackGlyph = resolveAnimatedEmojiFallbackGlyph(emojiOption);
                        const emojiGlyph = String(emojiOption.glyph || fallbackGlyph || "").trim();
                        if (!emojiGlyph) {
                          return;
                        }

                        onInsertEmoji(emojiGlyph);
                        setEmojiSearchQuery("");
                        onToggleEmojiPicker(false);
                      }}
                      title={String(emojiOption.label || resolveAnimatedEmojiFallbackGlyph(emojiOption) || "Эмодзи")}
                      aria-label={String(emojiOption.label || resolveAnimatedEmojiFallbackGlyph(emojiOption) || "Эмодзи")}
                    >
                      <AnimatedEmojiGlyph
                        emoji={emojiOption}
                        showAsset={index < emojiPreviewCount}
                        fallbackText={resolveAnimatedEmojiFallbackGlyph(emojiOption)}
                      />
                    </button>
                  ))}
                </div>
                {!filteredComposerEmojiOptions.length ? (
                  <div className="composer-emoji-picker__empty">Ничего не найдено</div>
                ) : null}
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
              placeholder={uploadingFile ? "Загружаем вложения..." : "Сообщение..."}
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

                  if (voiceRecordingState === "holding" || voiceRecordingState === "locked" || voiceRecordingState === "canceling") {
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
                  void handleSendMessage();
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
                    || voiceRecordingState === "canceling"
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
                  className={`composer-tool composer-tool--speech composer-tool--action-slot ${speechRecognitionActive || voiceRecordingState !== "idle" ? "composer-tool--active" : ""} ${hybridMicStateClass}`}
                  onClick={() => {
                    if (suppressSpeechClickRef.current) {
                      suppressSpeechClickRef.current = false;
                      return;
                    }
                    onSpeechRecognitionToggle();
                  }}
                  onPointerDown={async (event) => {
                    suppressSpeechClickRef.current = true;
                    event.currentTarget.setPointerCapture?.(event.pointerId);
                    await onSpeechRecognitionPointerDown?.(event);
                  }}
                  onPointerMove={onSpeechRecognitionPointerMove}
                  onPointerUp={async (event) => {
                    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
                      event.currentTarget.releasePointerCapture?.(event.pointerId);
                    }
                    await onSpeechRecognitionPointerUp?.(event);
                  }}
                  onPointerCancel={async (event) => {
                    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
                      event.currentTarget.releasePointerCapture?.(event.pointerId);
                    }
                    await onSpeechRecognitionPointerCancel?.(event);
                  }}
                  disabled={uploadingFile || voiceRecordingState === "sending"}
                  style={speechMicStyle}
                  title={speechRecognitionActive ? "Завершить голосовой ввод текста" : "Нажмите для диктовки. Удерживайте для голосового сообщения, свайп вверх для диктовки, влево для отмены"}
                  aria-label={speechRecognitionActive ? "Завершить голосовой ввод текста" : "Микрофон: нажмите для диктовки, удерживайте для голосового сообщения, свайп вверх для диктовки, влево для отмены"}
                >
                  <span className="composer-tool__speech-ring composer-tool__speech-ring--outer" aria-hidden="true" />
                  <span className="composer-tool__speech-ring composer-tool__speech-ring--inner" aria-hidden="true" />
                  <span className="composer-tool__speech-ring composer-tool__speech-ring--pulse" aria-hidden="true" />
                  <span className="composer-tool__mic" aria-hidden="true" />
                  {speechIsCanceling ? (
                    <span className="composer-tool__speech-hint composer-tool__speech-hint--cancel" aria-hidden="true">←</span>
                  ) : voiceRecordingState === "holding" || speechIsHolding ? (
                    <span className="composer-tool__speech-hint" aria-hidden="true">↑</span>
                  ) : null}
                  {speechIsLocked || voiceRecordingState === "locked" ? (
                    <span className="composer-tool__lock composer-tool__lock--speech" aria-hidden="true">●</span>
                  ) : null}
                </button>
              ) : ENABLE_VOICE_MESSAGE_BUTTON ? (
                <button
                  type="button"
                  className={`composer-tool composer-tool--voice composer-tool--voice-slot ${voiceButtonStateClass}`}
                  style={voiceRecordingState !== "idle" ? { "--voice-level-scale": (1.08 + normalizedVoiceMicLevel * 1.24).toFixed(3) } : undefined}
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
                        : voiceRecordingState === "canceling"
                          ? "Отменить запись голосового сообщения"
                        : "Записать голосовое сообщение"
                  }
                  title={
                    voiceRecordingState === "locked"
                      ? "Нажмите, чтобы отправить голосовое сообщение"
                      : voiceRecordingState === "holding"
                        ? "Потяните вверх для фиксации, влево для отмены или отпустите для отправки"
                        : voiceRecordingState === "canceling"
                          ? "Отпустите, чтобы отменить запись"
                        : "Удерживайте для записи голосового сообщения"
                  }
                >
                  <span className="composer-tool__voice-wave composer-tool__voice-wave--outer" aria-hidden="true" />
                  <span className="composer-tool__voice-wave composer-tool__voice-wave--inner" aria-hidden="true" />
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
      <TextChatLocationPickerModal
        key={`${Number(locationPickerOpen)}-${locationPickerCurrentPosition?.latitude || ""}-${locationPickerCurrentPosition?.longitude || ""}`}
        open={locationPickerOpen}
        currentLocation={locationPickerCurrentPosition}
        locationError={locationPickerError}
        isLocating={locationPickerLocating}
        onClose={handleCloseLocationPicker}
        onLocateCurrent={requestCurrentLocation}
        onSubmit={handleSubmitLocation}
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
    && previousProps.voiceMicLevel === nextProps.voiceMicLevel
    && previousProps.speechRecognitionActive === nextProps.speechRecognitionActive
    && previousProps.speechMicLevel === nextProps.speechMicLevel
    && previousProps.speechCaptureState === nextProps.speechCaptureState
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
    && previousProps.preferExplicitSend === nextProps.preferExplicitSend
    && previousProps.instantAttachmentSend === nextProps.instantAttachmentSend;
}

TextChatComposer.displayName = "TextChatComposer";

export default memo(TextChatComposer, areTextChatComposerPropsEqual);


