import { useState } from "react";
import { formatTimestamp } from "../utils/textChatHelpers";
import { resolveMediaUrl } from "../utils/media";
import "../css/TextChatPanels.css";

export function MessageSearchPanel({ query, results, loading = false, error = "", onOpenMessage }) {
  const normalizedQuery = String(query || "").trim();
  const [collapsedQuery, setCollapsedQuery] = useState("");

  if (normalizedQuery.length < 2 || collapsedQuery === normalizedQuery) {
    return null;
  }

  const handleOpenMessage = (messageId) => {
    setCollapsedQuery(normalizedQuery);
    onOpenMessage?.(messageId, {
      behavior: "smooth",
      block: "center",
      highlight: true,
    });
  };

  return (
    <div className="message-search-panel">
      {loading ? <div className="message-search-panel__empty">Поиск по истории...</div> : null}
      {error ? <div className="message-search-panel__empty">{error}</div> : null}
      <div className="message-search-panel__header">
        <strong>Найденные сообщения</strong>
        <span>{results.length ? `${results.length} совпадений` : "Совпадений нет"}</span>
      </div>
      {results.length ? (
        <div className="message-search-panel__list">
          {results.slice(0, 8).map((result) => (
            <button key={result.id} type="button" className="message-search-panel__item" onClick={() => handleOpenMessage(result.id)}>
              <strong>{result.username || "User"}</strong>
              <span>{result.preview || "Сообщение без текста"}</span>
              <small>{formatTimestamp(result.timestamp)}</small>
            </button>
          ))}
        </div>
      ) : (
        <div className="message-search-panel__empty">В текущем чате ничего не найдено.</div>
      )}
    </div>
  );
}

export function PinnedMessagesPanel({ pinnedMessages, onOpenMessage, onRemovePinned }) {
  const [activePinnedIndex, setActivePinnedIndex] = useState(0);

  if (!pinnedMessages.length) {
    return null;
  }

  const safeActivePinnedIndex = Math.min(activePinnedIndex, pinnedMessages.length - 1);
  const activePinnedMessage = pinnedMessages[safeActivePinnedIndex] || pinnedMessages[0];

  const handlePinnedWheel = (event) => {
    if (pinnedMessages.length <= 1) {
      return;
    }

    const wheelDelta = Math.abs(event.deltaY) >= Math.abs(event.deltaX) ? event.deltaY : event.deltaX;
    if (!wheelDelta) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    setActivePinnedIndex((current) => {
      const nextIndex = current + (wheelDelta > 0 ? 1 : -1);
      return (nextIndex + pinnedMessages.length) % pinnedMessages.length;
    });
  };

  return (
    <div className="chat-pins" onWheel={handlePinnedWheel}>
      <div className="chat-pins__rail" aria-label="Закреплённые сообщения">
        {pinnedMessages.map((pinnedMessage, pinnedIndex) => (
          <button
            key={pinnedMessage.id}
            type="button"
            className={`chat-pins__rail-item ${pinnedIndex === safeActivePinnedIndex ? "chat-pins__rail-item--active" : ""}`}
            onClick={() => setActivePinnedIndex(pinnedIndex)}
            aria-label={`Показать закреп ${pinnedIndex + 1} из ${pinnedMessages.length}`}
            aria-pressed={pinnedIndex === safeActivePinnedIndex}
          />
        ))}
      </div>
      <button
        type="button"
        className="chat-pins__content"
        onClick={() => onOpenMessage?.(activePinnedMessage.id, {
          behavior: "smooth",
          block: "center",
          highlight: true,
        })}
      >
        <span className="chat-pins__title">Закреплённое сообщение</span>
        <span className="chat-pins__preview">{activePinnedMessage.preview || "Сообщение без текста"}</span>
      </button>
      <div className="chat-pins__actions">
        <span className="chat-pins__count">{safeActivePinnedIndex + 1}/{pinnedMessages.length}</span>
        {typeof onRemovePinned === "function" ? (
          <button
            type="button"
            className="chat-pins__remove"
            onClick={(event) => {
              event.stopPropagation();
              onRemovePinned(activePinnedMessage.id);
              setActivePinnedIndex((current) => Math.max(0, Math.min(current, pinnedMessages.length - 2)));
            }}
            aria-label="Открепить сообщение"
          />
        ) : null}
      </div>
    </div>
  );
}

function normalizeAttachmentHistoryItem(item = {}) {
  return {
    id: String(item.id || item.Id || `${item.messageId || item.MessageId || "message"}:${item.attachmentIndex || item.AttachmentIndex || 0}`),
    messageId: item.messageId ?? item.MessageId ?? "",
    channelId: item.channelId || item.ChannelId || "",
    authorUserId: item.authorUserId || item.AuthorUserId || "",
    username: item.username || item.Username || "User",
    timestamp: item.timestamp || item.Timestamp || "",
    attachmentIndex: Number(item.attachmentIndex ?? item.AttachmentIndex ?? 0) || 0,
    attachmentUrl: resolveMediaUrl(item.attachmentUrl || item.AttachmentUrl || "", item.attachmentUrl || item.AttachmentUrl || ""),
    attachmentSourceUrl: item.attachmentSourceUrl || item.AttachmentSourceUrl || item.attachmentUrl || item.AttachmentUrl || "",
    attachmentName: item.attachmentName || item.AttachmentName || "Вложение",
    attachmentSize: item.attachmentSize ?? item.AttachmentSize ?? null,
    attachmentContentType: item.attachmentContentType || item.AttachmentContentType || "",
    attachmentSpoiler: Boolean(item.attachmentSpoiler || item.AttachmentSpoiler),
    attachmentAsFile: Boolean(item.attachmentAsFile || item.AttachmentAsFile),
    attachmentEncryption: item.attachmentEncryption || item.AttachmentEncryption || null,
    kind: item.kind || item.Kind || "media",
    mediaType: item.mediaType || item.MediaType || "file",
  };
}

function formatAttachmentSize(value) {
  const size = Number(value);
  if (!Number.isFinite(size) || size <= 0) {
    return "";
  }

  if (size < 1024) {
    return `${Math.round(size)} Б`;
  }

  if (size < 1024 * 1024) {
    return `${(size / 1024).toFixed(size < 10 * 1024 ? 1 : 0)} КБ`;
  }

  return `${(size / (1024 * 1024)).toFixed(size < 10 * 1024 * 1024 ? 1 : 0)} МБ`;
}

function buildAttachmentPreviewItems(items) {
  return items
    .filter((item) => item.mediaType === "image" || item.mediaType === "video")
    .map((item) => ({
      type: item.mediaType === "video" ? "video" : "image",
      url: item.attachmentUrl,
      name: item.attachmentName,
      contentType: item.attachmentContentType,
      messageId: String(item.messageId || ""),
      attachmentIndex: item.attachmentIndex,
      attachmentEncryption: item.attachmentEncryption,
      sourceUrl: item.attachmentSourceUrl || item.attachmentUrl,
      canDelete: false,
    }));
}

export function ChatAttachmentsPanel({
  open = false,
  kind = "media",
  items = [],
  loading = false,
  error = "",
  hasMore = false,
  onKindChange,
  onClose,
  onRefresh,
  onLoadMore,
  onOpenMessage,
  onOpenMediaPreview,
  onDownloadAttachment,
}) {
  if (!open) {
    return null;
  }

  const normalizedKind = kind === "files" ? "files" : "media";
  const normalizedItems = items.map(normalizeAttachmentHistoryItem);
  const previewItems = buildAttachmentPreviewItems(normalizedItems);
  const summary = loading && !normalizedItems.length
    ? "Загружаем историю..."
    : normalizedItems.length
      ? `${normalizedItems.length} в ленте`
      : "Пока пусто";

  return (
    <section className="chat-attachments-panel" aria-label="Вложения чата">
      <div className="chat-attachments-panel__header">
        <div>
          <strong>Вложения</strong>
          <span>{summary}</span>
        </div>
        <div className="chat-attachments-panel__actions">
          <button type="button" className="chat-attachments-panel__icon-button" onClick={onRefresh} disabled={loading} aria-label="Обновить вложения">
            ↻
          </button>
          <button type="button" className="chat-attachments-panel__icon-button" onClick={onClose} aria-label="Закрыть вложения">
            ×
          </button>
        </div>
      </div>
      <div className="chat-attachments-panel__tabs" role="tablist" aria-label="Тип вложений">
        <button
          type="button"
          className={`chat-attachments-panel__tab ${normalizedKind === "media" ? "chat-attachments-panel__tab--active" : ""}`}
          onClick={() => onKindChange?.("media")}
          role="tab"
          aria-selected={normalizedKind === "media"}
        >
          Фото и видео
        </button>
        <button
          type="button"
          className={`chat-attachments-panel__tab ${normalizedKind === "files" ? "chat-attachments-panel__tab--active" : ""}`}
          onClick={() => onKindChange?.("files")}
          role="tab"
          aria-selected={normalizedKind === "files"}
        >
          Файлы
        </button>
      </div>
      {error ? <div className="chat-attachments-panel__empty">{error}</div> : null}
      <div className="chat-attachments-panel__list">
        {normalizedItems.map((item) => {
          const isMedia = item.mediaType === "image" || item.mediaType === "video";
          const sizeLabel = formatAttachmentSize(item.attachmentSize);
          return (
            <article key={item.id} className="chat-attachments-panel__item">
              <button
                type="button"
                className={`chat-attachments-panel__preview chat-attachments-panel__preview--${isMedia ? item.mediaType : "file"}`}
                onClick={() => (isMedia ? onOpenMediaPreview?.(item, previewItems) : onDownloadAttachment?.(item))}
                aria-label={isMedia ? "Открыть вложение" : "Скачать файл"}
              >
                {item.mediaType === "image" ? (
                  <img src={item.attachmentUrl} alt="" loading="lazy" />
                ) : (
                  <span>{item.mediaType === "video" ? "▶" : "FILE"}</span>
                )}
              </button>
              <div className="chat-attachments-panel__body">
                <div className="chat-attachments-panel__title-row">
                  <strong>{item.attachmentName || "Вложение"}</strong>
                  {sizeLabel ? <span>{sizeLabel}</span> : null}
                </div>
                <div className="chat-attachments-panel__meta">
                  <span>{item.username || "User"}</span>
                  <small>{formatTimestamp(item.timestamp)}</small>
                </div>
                <div className="chat-attachments-panel__item-actions">
                  {isMedia ? (
                    <button type="button" onClick={() => onOpenMediaPreview?.(item, previewItems)}>Открыть</button>
                  ) : null}
                  <button type="button" onClick={() => onDownloadAttachment?.(item)}>Скачать</button>
                  <button type="button" onClick={() => onOpenMessage?.(item.messageId)}>К сообщению</button>
                </div>
              </div>
            </article>
          );
        })}
      </div>
      {!loading && !error && !normalizedItems.length ? (
        <div className="chat-attachments-panel__empty">
          {normalizedKind === "media" ? "В этом чате ещё нет фото или видео." : "В этом чате ещё нет файлов."}
        </div>
      ) : null}
      {loading && normalizedItems.length ? <div className="chat-attachments-panel__empty">Загружаем ещё...</div> : null}
      {hasMore ? (
        <button type="button" className="chat-attachments-panel__load-more" onClick={onLoadMore} disabled={loading}>
          Показать ещё
        </button>
      ) : null}
    </section>
  );
}

export function ChatSelectionBar({ selectedCount, canForward, onForward, onCancel }) {
  if (selectedCount <= 0) {
    return null;
  }

  return (
    <div className="chat-selection-bar">
      <div className="chat-selection-bar__copy">
        <strong>{selectedCount}</strong>
        <span>Выбрано сообщений</span>
      </div>
      <div className="chat-selection-bar__actions">
        <button type="button" className="chat-selection-bar__button" disabled={!canForward} onClick={onForward}>
          Переслать
        </button>
        <button type="button" className="chat-selection-bar__button chat-selection-bar__button--ghost" onClick={onCancel}>
          Отмена
        </button>
      </div>
    </div>
  );
}

export function JumpToLatestBar({ pendingCount, onJump }) {
  if (pendingCount <= 0) {
    return null;
  }

  return (
    <div className="chat-jump-bar">
      <span className="chat-jump-bar__copy">
        {pendingCount === 1 ? "Новое сообщение" : `Новых сообщений: ${pendingCount}`}
      </span>
      <button type="button" className="chat-jump-bar__button" onClick={onJump}>
        Перейти вниз
      </button>
    </div>
  );
}

export function JumpToLatestButton({ visible = false, pendingCount = 0, onJump }) {
  return (
    <button
      type="button"
      className={`chat-jump-button ${visible ? "chat-jump-button--visible" : "chat-jump-button--hidden"}`}
      onClick={onJump}
      tabIndex={visible ? 0 : -1}
      aria-hidden={!visible}
      disabled={!visible}
      aria-label={pendingCount > 0 ? `Перейти к последним сообщениям (${pendingCount})` : "Перейти к последним сообщениям"}
      title={pendingCount > 0 ? "Перейти к новым сообщениям" : "Перейти вниз"}
    >
      <span className="chat-jump-button__icon" aria-hidden="true" />
      {pendingCount > 0 ? (
        <span className="chat-jump-button__badge" aria-hidden="true">
          {pendingCount > 99 ? "99+" : pendingCount}
        </span>
      ) : null}
    </button>
  );
}

export function ChatNavigationBar({
  firstUnreadMessageId,
  mentionMessages = [],
  canReturnToJumpPoint = false,
  onJumpToFirstUnread,
  onOpenMention,
  onReturnToJumpPoint,
}) {
  const latestMention = mentionMessages[mentionMessages.length - 1] || null;

  if (!firstUnreadMessageId && !latestMention && !canReturnToJumpPoint) {
    return null;
  }

  return (
    <div className="chat-nav-bar">
      {firstUnreadMessageId ? (
        <button type="button" className="chat-nav-bar__pill" onClick={onJumpToFirstUnread}>
          Непрочитанное
        </button>
      ) : null}
      {latestMention ? (
        <button type="button" className="chat-nav-bar__pill" onClick={() => onOpenMention(latestMention.id)}>
          Упоминания {mentionMessages.length}
        </button>
      ) : null}
      {canReturnToJumpPoint ? (
        <button type="button" className="chat-nav-bar__pill chat-nav-bar__pill--ghost" onClick={onReturnToJumpPoint}>
          Назад
        </button>
      ) : null}
    </div>
  );
}

export function ChatActionStatus({ feedback }) {
  if (!feedback?.message) {
    return null;
  }

  return (
    <div className={`chat-action-status chat-action-status--${feedback.tone || "info"}`}>
      <span className="chat-action-status__message">{feedback.message}</span>
    </div>
  );
}
