import { formatTimestamp } from "../utils/textChatHelpers";

export function MessageSearchPanel({ query, results, onOpenMessage }) {
  if (String(query || "").trim().length < 2) {
    return null;
  }

  return (
    <div className="message-search-panel">
      <div className="message-search-panel__header">
        <strong>Найденные сообщения</strong>
        <span>{results.length ? `${results.length} совпадений` : "Совпадений нет"}</span>
      </div>
      {results.length ? (
        <div className="message-search-panel__list">
          {results.slice(0, 8).map((result) => (
            <button key={result.id} type="button" className="message-search-panel__item" onClick={() => onOpenMessage(result.id)}>
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
  if (!pinnedMessages.length) {
    return null;
  }

  return (
    <div className="chat-pins">
      <div className="chat-pins__header">
        <strong>Закреплённые сообщения</strong>
        <span>{pinnedMessages.length}</span>
      </div>
      <div className="chat-pins__list">
        {pinnedMessages.map((pinnedMessage) => (
          <div key={pinnedMessage.id} className="chat-pins__item">
            <button type="button" className="chat-pins__link" onClick={() => onOpenMessage(pinnedMessage.id)}>
              <span className="chat-pins__meta">
                <strong>{pinnedMessage.username}</strong>
                <small>{formatTimestamp(pinnedMessage.timestamp)}</small>
              </span>
              <span className="chat-pins__preview">{pinnedMessage.preview}</span>
            </button>
            <button
              type="button"
              className="chat-pins__remove"
              onClick={(event) => {
                event.stopPropagation();
                onRemovePinned(pinnedMessage.id);
              }}
              aria-label="Открепить сообщение"
            >
              ?
            </button>
          </div>
        ))}
      </div>
    </div>
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

export function ChatNavigationBar({
  firstUnreadMessageId,
  mentionMessages = [],
  replyMessages = [],
  pinnedMessages = [],
  canReturnToJumpPoint = false,
  onJumpToFirstUnread,
  onOpenMention,
  onOpenReply,
  onOpenPinned,
  onReturnToJumpPoint,
}) {
  const latestMention = mentionMessages[mentionMessages.length - 1] || null;
  const latestReply = replyMessages[replyMessages.length - 1] || null;
  const latestPinned = pinnedMessages[0] || null;

  if (!firstUnreadMessageId && !latestMention && !latestReply && !latestPinned && !canReturnToJumpPoint) {
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
      {latestReply ? (
        <button type="button" className="chat-nav-bar__pill" onClick={() => onOpenReply(latestReply.id)}>
          Ответы {replyMessages.length}
        </button>
      ) : null}
      {latestPinned ? (
        <button type="button" className="chat-nav-bar__pill" onClick={() => onOpenPinned(latestPinned.id)}>
          Закрепы {pinnedMessages.length}
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
