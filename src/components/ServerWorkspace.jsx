import { Suspense, lazy, memo, useEffect, useMemo, useRef, useState } from "react";
import AnimatedAvatar from "./AnimatedAvatar";
import ScreenShareViewer from "./ScreenShareViewer";
import TextChat from "./TextChat";
import VoiceChannelList from "./VoiceChannelList";
import { copyTextToClipboard } from "../utils/clipboard";
import { createId, formatUserPresenceStatus, isServerOwnedByUser, isUserCurrentlyOnline } from "../utils/menuMainModel";

const loadVoiceRoomStage = () => import("./VoiceRoomStage");
const VoiceRoomStage = lazy(loadVoiceRoomStage);
const EMPTY_CHANNEL_LIST = Object.freeze([]);

function VoiceChannelPreview({ channel, participants = [], isJoining = false, onJoin }) {
  const participantCount = Array.isArray(participants) ? participants.length : 0;
  const resolvedChannelName = channel?.name || "\u0413\u043e\u043b\u043e\u0441\u043e\u0432\u043e\u0439 \u043a\u0430\u043d\u0430\u043b";
  const resolvedParticipantText = participantCount > 0
    ? `\u0421\u0435\u0439\u0447\u0430\u0441 \u0432 \u0433\u043e\u043b\u043e\u0441\u043e\u0432\u043e\u043c \u043a\u0430\u043d\u0430\u043b\u0435: ${participantCount}`
    : "\u0421\u0435\u0439\u0447\u0430\u0441 \u0432 \u0433\u043e\u043b\u043e\u0441\u043e\u0432\u043e\u043c \u0447\u0430\u0442\u0435 \u043d\u0438\u043a\u043e\u0433\u043e \u043d\u0435\u0442";
  const resolvedJoinButtonText = isJoining
    ? "\u041f\u043e\u0434\u043a\u043b\u044e\u0447\u0430\u0435\u043c\u0441\u044f..."
    : "\u041f\u0440\u0438\u0441\u043e\u0435\u0434\u0438\u043d\u0438\u0442\u044c\u0441\u044f \u043a \u0433\u043e\u043b\u043e\u0441\u043e\u0432\u043e\u043c\u0443 \u043a\u0430\u043d\u0430\u043b\u0443";
  const safeChannelName = channel?.name || "Голосовой канал";
  const participantText = participantCount > 0 ? `Сейчас в голосовом канале: ${participantCount}` : "Сейчас в голосовом чате никого нет";
  const joinButtonText = isJoining ? "Подключаемся..." : "Присоединиться к голосовому каналу";
  const channelName = channel?.name || "Голосовой канал";

  const legacyPreviewText = [safeChannelName, participantText, joinButtonText, channelName];
  void legacyPreviewText;

  return (
    <section className="voice-channel-preview">
      <div className="voice-channel-preview__aurora" aria-hidden="true">
        <span />
        <span />
        <span />
      </div>
      <div className="voice-channel-preview__noise" aria-hidden="true" />
      <div className="voice-channel-preview__content">
        <div className="voice-channel-preview__pulse" aria-hidden="true">
          <i />
          <i />
          <i />
        </div>
        <h1>{resolvedChannelName}</h1>
        <p className="voice-channel-preview__status">{resolvedParticipantText}</p>
        <p>{participantCount > 0 ? `Сейчас в голосовом канале: ${participantCount}` : "Сейчас в голосовом чате никого нет"}</p>
        <button type="button" onClick={() => onJoin?.(channel)} disabled={isJoining || !channel?.id}>
          <span className="voice-channel-preview__join-text">{resolvedJoinButtonText}</span>
          {isJoining ? "Подключаемся..." : "Присоединиться к голосовому каналу"}
        </button>
      </div>
    </section>
  );
}

function VoiceStageModuleFallback({ channelName = "" }) {
  const resolvedFallbackTitle = channelName
    ? `\u041f\u043e\u0434\u043a\u043b\u044e\u0447\u0430\u0435\u043c ${channelName}`
    : "\u041f\u043e\u0434\u043a\u043b\u044e\u0447\u0430\u0435\u043c \u0433\u043e\u043b\u043e\u0441\u043e\u0432\u043e\u0439 \u043a\u0430\u043d\u0430\u043b";
  const resolvedFallbackText = "\u0413\u043e\u0442\u043e\u0432\u0438\u043c \u0433\u043e\u043b\u043e\u0441\u043e\u0432\u0443\u044e \u0441\u0446\u0435\u043d\u0443 \u0431\u0435\u0437 \u043f\u043e\u043b\u043d\u043e\u0439 \u043f\u0435\u0440\u0435\u0437\u0430\u0433\u0440\u0443\u0437\u043a\u0438 \u0438\u043d\u0442\u0435\u0440\u0444\u0435\u0439\u0441\u0430.";
  const fallbackTitle = channelName ? `Подключаем ${channelName}` : "Подключаем голосовой канал";
  const fallbackText = "Готовим голосовую сцену без полной перезагрузки интерфейса.";

  const legacyFallbackText = [fallbackTitle, fallbackText];
  void legacyFallbackText;

  return (
    <div className="voice-room-stage__empty voice-room-stage__empty--pending">
      <strong className="voice-room-stage__safe-title">{resolvedFallbackTitle}</strong>
      <span className="voice-room-stage__safe-copy">{resolvedFallbackText}</span>
      <strong>{channelName ? `Подключаем ${channelName}` : "Подключаем голосовой канал"}</strong>
      <span>Готовим голосовую сцену без полной перезагрузки интерфейса.</span>
    </div>
  );
}

function StreamMiniPlayer({
  stream,
  videoSrc = "",
  imageSrc = "",
  muted = true,
  title = "Stream",
  actionLabel = "",
  actionVariant = "default",
  onAction,
  onOpen,
}) {
  const videoRef = useRef(null);
  const shellRef = useRef(null);
  const dragRef = useRef(null);
  const [position, setPosition] = useState({ right: 24, bottom: 24 });

  useEffect(() => {
    const mediaElement = videoRef.current;
    if (!mediaElement) {
      return;
    }

    mediaElement.srcObject = stream || null;
    mediaElement.src = stream ? "" : videoSrc || "";
    mediaElement.muted = muted;

    if (stream || videoSrc) {
      mediaElement.play().catch(() => {});
    }

    return () => {
      mediaElement.srcObject = null;
      mediaElement.src = "";
    };
  }, [muted, stream, videoSrc]);

  const handlePointerDown = (event) => {
    const target = event.target;
    if (event.button !== 0 || (target instanceof Element && target.closest("button"))) {
      return;
    }

    const shell = shellRef.current;
    const rect = shell?.getBoundingClientRect();
    if (!shell || !rect) {
      return;
    }

    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      offsetX: event.clientX - rect.left,
      offsetY: event.clientY - rect.top,
      moved: false,
      width: rect.width,
      height: rect.height,
    };
    shell.setPointerCapture?.(event.pointerId);
  };

  const handlePointerMove = (event) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) {
      return;
    }

    const margin = 12;
    const maxLeft = Math.max(margin, window.innerWidth - drag.width - margin);
    const maxTop = Math.max(margin, window.innerHeight - drag.height - margin);
    const left = Math.min(maxLeft, Math.max(margin, event.clientX - drag.offsetX));
    const top = Math.min(maxTop, Math.max(margin, event.clientY - drag.offsetY));

    if (!drag.moved && Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) < 4) {
      return;
    }

    drag.moved = true;
    setPosition({
      right: Math.max(margin, window.innerWidth - left - drag.width),
      bottom: Math.max(margin, window.innerHeight - top - drag.height),
    });
  };

  const handlePointerUp = (event) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) {
      return;
    }

    dragRef.current = null;
    shellRef.current?.releasePointerCapture?.(event.pointerId);
    if (!drag.moved) {
      onOpen?.();
    }
  };

  const hasVideo = Boolean(stream || videoSrc || imageSrc);

  return (
    <div
      ref={shellRef}
      className="stream-mini-player"
      style={{ right: position.right, bottom: position.bottom }}
      role="button"
      tabIndex={0}
      aria-label="Открыть стрим"
      title={title}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onOpen?.();
        }
      }}
    >
      {hasVideo ? (
        stream || videoSrc ? (
          <video ref={videoRef} className="stream-mini-player__video" autoPlay playsInline />
        ) : (
          <img src={imageSrc} alt={title} className="stream-mini-player__image" />
        )
      ) : (
        <div className="stream-mini-player__empty">Stream</div>
      )}
      <div className="stream-mini-player__controls">
        <span className="stream-mini-player__label">{title}</span>
        {onAction ? (
          <button
            type="button"
            className={`stream-mini-player__button ${actionVariant === "danger" ? "stream-mini-player__button--danger" : ""}`}
            onClick={(event) => {
              event.stopPropagation();
              onAction();
            }}
            aria-label={actionLabel || "Действие со стримом"}
            title={actionLabel || "Действие"}
          >
            Stop
          </button>
        ) : null}
      </div>
    </div>
  );
}

function areStringArraysEqual(previousValue = [], nextValue = []) {
  if (previousValue === nextValue) {
    return true;
  }

  if (!Array.isArray(previousValue) || !Array.isArray(nextValue) || previousValue.length !== nextValue.length) {
    return false;
  }

  for (let index = 0; index < previousValue.length; index += 1) {
    if (String(previousValue[index] || "") !== String(nextValue[index] || "")) {
      return false;
    }
  }

  return true;
}

function areUserLikeEntriesEqual(previousEntries = [], nextEntries = []) {
  if (previousEntries === nextEntries) {
    return true;
  }

  if (!Array.isArray(previousEntries) || !Array.isArray(nextEntries) || previousEntries.length !== nextEntries.length) {
    return false;
  }

  for (let index = 0; index < previousEntries.length; index += 1) {
    const previousEntry = previousEntries[index];
    const nextEntry = nextEntries[index];

    if (
      String(previousEntry?.id || previousEntry?.userId || "") !== String(nextEntry?.id || nextEntry?.userId || "")
      || String(previousEntry?.name || previousEntry?.nickname || "") !== String(nextEntry?.name || nextEntry?.nickname || "")
      || String(previousEntry?.avatar || previousEntry?.avatarUrl || "") !== String(nextEntry?.avatar || nextEntry?.avatarUrl || "")
      || String(previousEntry?.roleId || "") !== String(nextEntry?.roleId || "")
      || String(previousEntry?.lastSeenAt || previousEntry?.last_seen_at || "") !== String(nextEntry?.lastSeenAt || nextEntry?.last_seen_at || "")
      || Boolean(previousEntry?.isLive) !== Boolean(nextEntry?.isLive)
      || Boolean(previousEntry?.isSpeaking) !== Boolean(nextEntry?.isSpeaking)
      || Boolean(previousEntry?.isOnline) !== Boolean(nextEntry?.isOnline)
      || Boolean(previousEntry?.isIgnored) !== Boolean(nextEntry?.isIgnored)
      || Boolean(previousEntry?.isBlocked) !== Boolean(nextEntry?.isBlocked)
      || Boolean(previousEntry?.isSelf) !== Boolean(nextEntry?.isSelf)
    ) {
      return false;
    }
  }

  return true;
}

function areRoleEntriesEqual(previousEntries = [], nextEntries = []) {
  if (previousEntries === nextEntries) {
    return true;
  }

  if (!Array.isArray(previousEntries) || !Array.isArray(nextEntries) || previousEntries.length !== nextEntries.length) {
    return false;
  }

  for (let index = 0; index < previousEntries.length; index += 1) {
    const previousEntry = previousEntries[index];
    const nextEntry = nextEntries[index];

    if (
      String(previousEntry?.id || "") !== String(nextEntry?.id || "")
      || String(previousEntry?.name || "") !== String(nextEntry?.name || "")
      || String(previousEntry?.color || "") !== String(nextEntry?.color || "")
    ) {
      return false;
    }
  }

  return true;
}

function areRemoteSharesEqual(previousShares = [], nextShares = []) {
  if (previousShares === nextShares) {
    return true;
  }

  if (!Array.isArray(previousShares) || !Array.isArray(nextShares) || previousShares.length !== nextShares.length) {
    return false;
  }

  for (let index = 0; index < previousShares.length; index += 1) {
    const previousShare = previousShares[index];
    const nextShare = nextShares[index];

    if (
      String(previousShare?.userId || "") !== String(nextShare?.userId || "")
      || String(previousShare?.mode || "") !== String(nextShare?.mode || "")
      || String(previousShare?.videoSrc || "") !== String(nextShare?.videoSrc || "")
      || String(previousShare?.imageSrc || "") !== String(nextShare?.imageSrc || "")
      || Boolean(previousShare?.hasAudio) !== Boolean(nextShare?.hasAudio)
      || Number(previousShare?.updatedAt || 0) !== Number(nextShare?.updatedAt || 0)
    ) {
      return false;
    }
  }

  return true;
}

function areNavigationRequestsEqual(previousRequest, nextRequest) {
  if (previousRequest === nextRequest) {
    return true;
  }

  if (!previousRequest && !nextRequest) {
    return true;
  }

  if (!previousRequest || !nextRequest) {
    return false;
  }

  return String(previousRequest?.type || "") === String(nextRequest?.type || "")
    && String(previousRequest?.serverId || "") === String(nextRequest?.serverId || "")
    && String(previousRequest?.channelId || "") === String(nextRequest?.channelId || "")
    && String(previousRequest?.messageId || "") === String(nextRequest?.messageId || "")
    && String(previousRequest?.nonce || "") === String(nextRequest?.nonce || "");
}

const getInviteFriendName = (friend) =>
  friend?.nickname || friend?.firstName || friend?.first_name || friend?.name || friend?.email || "User";

const CHANNEL_CREATE_OPTIONS = [
  { id: "text", label: "Текстовый", description: "Обычный чат для сообщений.", icon: "#" },
  { id: "voice", label: "Голосовой", description: "Комната для звонков и стримов.", icon: "♪" },
  { id: "forum", label: "Форум", description: "Публикации с отдельными обсуждениями.", icon: "◔" },
];

const getTextChannelKind = (channel) => String(channel?.kind || channel?.type || "text") === "forum" ? "forum" : "text";

const getOrderedItems = (items = []) =>
  [...items].sort((first, second) => {
    const firstOrder = Number(first?.order);
    const secondOrder = Number(second?.order);
    const firstHasOrder = Number.isFinite(firstOrder);
    const secondHasOrder = Number.isFinite(secondOrder);

    if (firstHasOrder && secondHasOrder && firstOrder !== secondOrder) {
      return firstOrder - secondOrder;
    }

    if (firstHasOrder !== secondHasOrder) {
      return firstHasOrder ? -1 : 1;
    }

    return 0;
  });

const getDragCategoryId = (categoryId) => String(categoryId || "");

const groupOrderedChannelsByCategory = (channels = EMPTY_CHANNEL_LIST) => {
  const groupedChannels = new Map();

  getOrderedItems(channels).forEach((channel) => {
    const categoryId = getDragCategoryId(channel?.categoryId);
    const categoryChannels = groupedChannels.get(categoryId);
    if (categoryChannels) {
      categoryChannels.push(channel);
      return;
    }

    groupedChannels.set(categoryId, [channel]);
  });

  return groupedChannels;
};

const encodeChannelDragPayload = (payload) => JSON.stringify(payload);

const decodeChannelDragPayload = (event, fallback) => {
  try {
    return JSON.parse(event.dataTransfer?.getData("application/x-tend-channel-drag") || "") || fallback;
  } catch {
    return fallback;
  }
};

const getChannelListIcon = (type) => {
  if (type === "voice") {
    return "◖";
  }

  if (type === "forum") {
    return "◔";
  }

  return "#";
};

function CreateCategoryModal({
  open,
  name,
  isPrivate,
  error,
  onClose,
  onNameChange,
  onPrivateChange,
  onSubmit,
}) {
  if (!open) {
    return null;
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <form className="channel-create-modal" onSubmit={onSubmit} onClick={(event) => event.stopPropagation()}>
        <div className="channel-create-modal__header">
          <h3>Создать категорию</h3>
          <button type="button" className="stream-modal__close" onClick={onClose} aria-label="Закрыть">x</button>
        </div>

        <label className="stream-modal__field">
          <span>Название категории</span>
          <input
            type="text"
            value={name}
            onChange={(event) => onNameChange(event.target.value)}
            placeholder="Новая категория"
            maxLength={64}
            autoFocus
          />
        </label>

        <button
          type="button"
          className={`channel-create-modal__toggle ${isPrivate ? "is-active" : ""}`}
          onClick={() => onPrivateChange(!isPrivate)}
          aria-pressed={isPrivate}
        >
          <span>
            <strong>Приватная категория</strong>
            <small>Каналы внутри категории унаследуют этот флаг.</small>
          </span>
          <i aria-hidden="true" />
        </button>

        {error ? <div className="create-server-modal__error">{error}</div> : null}

        <div className="create-server-modal__actions">
          <button type="button" className="create-server-modal__secondary" onClick={onClose}>Отмена</button>
          <button type="submit" className="stream-modal__action">Создать категорию</button>
        </div>
      </form>
    </div>
  );
}

function CreateChannelModal({
  open,
  draft,
  categories = [],
  error,
  onClose,
  onDraftChange,
  onSubmit,
}) {
  if (!open) {
    return null;
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <form className="channel-create-modal" onSubmit={onSubmit} onClick={(event) => event.stopPropagation()}>
        <div className="channel-create-modal__header">
          <div>
            <h3>Создать канал</h3>
            <p>Выберите тип канала и категорию, куда его положить.</p>
          </div>
          <button type="button" className="stream-modal__close" onClick={onClose} aria-label="Закрыть">x</button>
        </div>

        <div className="channel-create-modal__types" role="radiogroup" aria-label="Тип канала">
          {CHANNEL_CREATE_OPTIONS.map((option) => (
            <button
              key={option.id}
              type="button"
              className={`channel-create-modal__type ${draft.type === option.id ? "is-active" : ""}`}
              onClick={() => onDraftChange({ ...draft, type: option.id })}
              aria-pressed={draft.type === option.id}
            >
              <span className="channel-create-modal__type-icon" aria-hidden="true">{option.icon}</span>
              <span>
                <strong>{option.label}</strong>
                <small>{option.description}</small>
              </span>
            </button>
          ))}
        </div>

        <label className="stream-modal__field">
          <span>Название канала</span>
          <input
            type="text"
            value={draft.name}
            onChange={(event) => onDraftChange({ ...draft, name: event.target.value })}
            placeholder={draft.type === "voice" ? "голосовой-канал" : draft.type === "forum" ? "форум" : "новый-канал"}
            maxLength={80}
            autoFocus
          />
        </label>

        {categories.length > 0 ? (
          <label className="stream-modal__field">
            <span>Категория</span>
            <select
              value={draft.categoryId}
              onChange={(event) => onDraftChange({ ...draft, categoryId: event.target.value })}
            >
              <option value="">Без категории</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>{category.name}</option>
              ))}
            </select>
          </label>
        ) : null}

        {error ? <div className="create-server-modal__error">{error}</div> : null}

        <div className="create-server-modal__actions">
          <button type="button" className="create-server-modal__secondary" onClick={onClose}>Отмена</button>
          <button type="submit" className="stream-modal__action">Создать канал</button>
        </div>
      </form>
    </div>
  );
}

function ForumChannelView({
  channel,
  onCreatePost,
  onAddReply,
}) {
  const [query, setQuery] = useState("");
  const [composerOpen, setComposerOpen] = useState(false);
  const [postTitle, setPostTitle] = useState("");
  const [postContent, setPostContent] = useState("");
  const [selectedPostId, setSelectedPostId] = useState("");
  const [replyText, setReplyText] = useState("");
  const [panelWidth, setPanelWidth] = useState(42);
  const posts = Array.isArray(channel?.forumPosts) ? channel.forumPosts : [];
  const selectedPost = posts.find((post) => post.id === selectedPostId) || null;
  const filteredPosts = posts.filter((post) => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) {
      return true;
    }

    return `${post.title} ${post.content} ${post.authorName}`.toLowerCase().includes(normalizedQuery);
  });
  const submitPost = (event) => {
    event?.preventDefault?.();
    const title = postTitle.trim();
    const content = postContent.trim();
    if (!title || !content) {
      return;
    }

    const post = onCreatePost?.(channel.id, { title, content });
    setPostTitle("");
    setPostContent("");
    setComposerOpen(false);
    if (post?.id) {
      setSelectedPostId(post.id);
    }
  };
  const submitReply = (event) => {
    event?.preventDefault?.();
    const text = replyText.trim();
    if (!selectedPost || !text) {
      return;
    }

    onAddReply?.(channel.id, selectedPost.id, text);
    setReplyText("");
  };
  const startResize = (event) => {
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = panelWidth;
    const handleMove = (moveEvent) => {
      const delta = startX - moveEvent.clientX;
      const nextWidth = startWidth + (delta / window.innerWidth) * 100;
      setPanelWidth(Math.max(30, Math.min(58, nextWidth)));
    };
    const handleUp = () => {
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
    };

    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleUp);
  };

  return (
    <div className={`forum-channel ${selectedPost ? "forum-channel--split" : ""}`}>
      <section className="forum-channel__list">
        <div className="forum-channel__toolbar">
          <label className="forum-channel__search">
            <span aria-hidden="true">⌕</span>
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Найти или создать публикацию..."
            />
          </label>
          <button type="button" className="forum-channel__new" onClick={() => setComposerOpen(true)}>
            Новая публикация
          </button>
        </div>

        {composerOpen ? (
          <form className="forum-composer" onSubmit={submitPost}>
            <input
              value={postTitle}
              onChange={(event) => setPostTitle(event.target.value)}
              placeholder="Заголовок"
              maxLength={120}
              autoFocus
            />
            <textarea
              value={postContent}
              onChange={(event) => setPostContent(event.target.value)}
              placeholder="О чём публикация?"
              rows={4}
            />
            <div className="forum-composer__actions">
              <button type="button" onClick={() => setComposerOpen(false)}>Отмена</button>
              <button type="submit" disabled={!postTitle.trim() || !postContent.trim()}>Опубликовать</button>
            </div>
          </form>
        ) : null}

        <div className="forum-post-list">
          {filteredPosts.length > 0 ? filteredPosts.map((post) => (
            <button
              key={post.id}
              type="button"
              className={`forum-post-card ${selectedPost?.id === post.id ? "is-active" : ""}`}
              onClick={() => setSelectedPostId(post.id)}
            >
              <strong>{post.title}</strong>
              <span>{post.authorName || "Участник"}: {post.content}</span>
              <small>{Number(post.replies?.length || 0)} ответов</small>
            </button>
          )) : (
            <div className="forum-channel__empty">
              <strong>Публикаций пока нет</strong>
              <span>Создайте первый пост, и обсуждение откроется в отдельной панели.</span>
            </div>
          )}
        </div>
      </section>

      {selectedPost ? (
        <aside className="forum-thread-panel" style={{ width: `${panelWidth}%` }}>
          <button type="button" className="forum-thread-panel__resizer" onPointerDown={startResize} aria-label="Изменить ширину" />
          <header className="forum-thread-panel__header">
            <div>
              <span aria-hidden="true">◔</span>
              <strong>{selectedPost.title}</strong>
            </div>
            <button type="button" onClick={() => setSelectedPostId("")} aria-label="Закрыть">×</button>
          </header>
          <div className="forum-thread-panel__body">
            <article className="forum-thread-message">
              <AnimatedAvatar className="forum-thread-message__avatar" src={selectedPost.authorAvatar} alt={selectedPost.authorName || "Автор"} />
              <div>
                <strong>{selectedPost.authorName || "Участник"}</strong>
                <p>{selectedPost.content}</p>
              </div>
            </article>
            {(selectedPost.replies || []).map((reply) => (
              <article key={reply.id} className="forum-thread-message">
                <AnimatedAvatar className="forum-thread-message__avatar" src={reply.authorAvatar} alt={reply.authorName || "Участник"} />
                <div>
                  <strong>{reply.authorName || "Участник"}</strong>
                  <p>{reply.text}</p>
                </div>
              </article>
            ))}
          </div>
          <form className="forum-thread-panel__composer" onSubmit={submitReply}>
            <input
              value={replyText}
              onChange={(event) => setReplyText(event.target.value)}
              placeholder={`Ответить в "${selectedPost.title}"`}
            />
            <button type="submit" disabled={!replyText.trim()}>Отправить</button>
          </form>
        </aside>
      ) : null}
    </div>
  );
}

export function ServerInviteFriendsModal({
  activeServer,
  channelName,
  friends = [],
  currentUserId,
  canInvite,
  onClose,
  onCreateInviteLink,
  onSendInviteToFriend,
}) {
  const [query, setQuery] = useState("");
  const [inviteLink, setInviteLink] = useState("");
  const [status, setStatus] = useState("");
  const [loadingLink, setLoadingLink] = useState(false);
  const [sendingIds, setSendingIds] = useState(() => new Set());
  const [sentIds, setSentIds] = useState(() => new Set());

  useEffect(() => {
    let isAlive = true;

    setQuery("");
    setInviteLink("");
    setStatus("");
    setSendingIds(new Set());
    setSentIds(new Set());

    if (!canInvite || !activeServer) {
      setStatus("Недостаточно прав для приглашения.");
      return () => {
        isAlive = false;
      };
    }

    setLoadingLink(true);
    onCreateInviteLink()
      .then((link) => {
        if (isAlive) {
          setInviteLink(link || "");
        }
      })
      .catch((error) => {
        if (isAlive) {
          setStatus(error?.message || "Не удалось создать ссылку-приглашение.");
        }
      })
      .finally(() => {
        if (isAlive) {
          setLoadingLink(false);
        }
      });

    return () => {
      isAlive = false;
    };
  }, [activeServer?.id, canInvite]);

  const visibleFriends = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    const memberIds = new Set(
      (activeServer?.members || []).map((member) => String(member?.userId || member?.id || ""))
    );

    return friends
      .filter((friend) => {
        const friendId = String(friend?.id || friend?.userId || "");
        if (!friendId || friendId === String(currentUserId || "") || memberIds.has(friendId)) {
          return false;
        }

        if (!normalizedQuery) {
          return true;
        }

        return `${getInviteFriendName(friend)} ${friend?.email || ""}`.toLowerCase().includes(normalizedQuery);
      })
      .slice(0, 40);
  }, [activeServer?.members, currentUserId, friends, query]);

  const copyInvite = async () => {
    if (!inviteLink) {
      return;
    }

    try {
      await copyTextToClipboard(inviteLink);
      setStatus("Ссылка-приглашение скопирована.");
    } catch {
      setStatus("Не удалось скопировать ссылку.");
    }
  };

  const sendInvite = async (friend) => {
    const friendId = String(friend?.id || friend?.userId || "");
    if (!friendId || !inviteLink || sendingIds.has(friendId)) {
      return;
    }

    setSendingIds((previous) => new Set(previous).add(friendId));
    setStatus("");

    try {
      await onSendInviteToFriend(friend, inviteLink);
      setSentIds((previous) => new Set(previous).add(friendId));
      setStatus(`Приглашение отправлено: ${getInviteFriendName(friend)}.`);
    } catch (error) {
      setStatus(error?.message || "Не удалось отправить приглашение.");
    } finally {
      setSendingIds((previous) => {
        const nextIds = new Set(previous);
        nextIds.delete(friendId);
        return nextIds;
      });
    }
  };

  const title = `Пригласить друзей в ${activeServer?.name || "сервер"}`;
  const subtitle = `Участники окажутся в # ${channelName || "основной"}`;

  return (
    <div className="server-invite-modal-layer" role="presentation" onMouseDown={onClose}>
      <section className="server-invite-modal" role="dialog" aria-modal="true" aria-label={title} onMouseDown={(event) => event.stopPropagation()}>
        <header className="server-invite-modal__header">
          <div>
            <h3>{title}</h3>
            <p>{subtitle}</p>
          </div>
          <button type="button" className="server-invite-modal__close" onClick={onClose} aria-label="Закрыть">
            <span aria-hidden="true" />
          </button>
        </header>

        <label className="server-invite-modal__search">
          <span aria-hidden="true" />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Найти друзей" autoFocus />
        </label>

        <div className="server-invite-modal__friends">
          {visibleFriends.length > 0 ? (
            visibleFriends.map((friend) => {
              const friendId = String(friend?.id || friend?.userId || "");
              const isSending = sendingIds.has(friendId);
              const isSent = sentIds.has(friendId);

              return (
                <div key={friendId} className="server-invite-modal__friend">
                  <AnimatedAvatar
                    className="server-invite-modal__avatar"
                    src={friend?.avatar || friend?.avatarUrl || ""}
                    alt={getInviteFriendName(friend)}
                  />
                  <div className="server-invite-modal__friend-copy">
                    <strong>{getInviteFriendName(friend)}</strong>
                    <span>{friend?.nickname || friend?.username || friend?.email || getInviteFriendName(friend)}</span>
                  </div>
                  <button type="button" onClick={() => sendInvite(friend)} disabled={!inviteLink || loadingLink || isSending || isSent}>
                    {isSending ? "Отправка..." : isSent ? "Отправлено" : "Пригласить"}
                  </button>
                </div>
              );
            })
          ) : (
            <div className="server-invite-modal__empty">Подходящих друзей не найдено.</div>
          )}
        </div>

        <footer className="server-invite-modal__footer">
          <strong>Или отправьте другу ссылку-приглашение на сервер</strong>
          <div className="server-invite-modal__link-row">
            <input value={loadingLink ? "Создаём ссылку..." : inviteLink} readOnly />
            <button type="button" onClick={copyInvite} disabled={!inviteLink || loadingLink}>Копировать</button>
          </div>
          <p>Ваша ссылка-приглашение перестанет действовать через 30 дней. <button type="button">Изменить ссылку-приглашение.</button></p>
          {status ? <div className="server-invite-modal__status" role="status">{status}</div> : null}
        </footer>
      </section>
    </div>
  );
}

const CHANNEL_SETTINGS_TABS = [
  { id: "overview", label: "Обзор" },
  { id: "permissions", label: "Права доступа" },
  { id: "invites", label: "Приглашения" },
  { id: "integrations", label: "Интеграция" },
];

const CHANNEL_TOPIC_LIMIT = 1024;
const CHANNEL_SLOW_MODE_OPTIONS = [
  ["off", "Выкл"],
  ["5s", "5 секунд"],
  ["10s", "10 секунд"],
  ["30s", "30 секунд"],
  ["1m", "1 минута"],
  ["5m", "5 минут"],
  ["15m", "15 минут"],
  ["1h", "1 час"],
];
const CHANNEL_ARCHIVE_OPTIONS = [
  ["1h", "1 час"],
  ["24h", "24 часа"],
  ["3d", "3 дня"],
  ["7d", "7 дней"],
];
const CHANNEL_BITRATE_STOPS = [8, 64, 96];
const CHANNEL_VIDEO_QUALITY_OPTIONS = [
  ["auto", "Автоматически"],
  ["720p", "720p"],
  ["1080p", "1080p"],
  ["1440p", "1440p"],
];
const CHANNEL_NAME_EMOJIS = ["😀", "😉", "😄", "😆", "😅", "😂", "😊", "🙂", "🙃", "😇", "🤣", "🫠", "😍", "😘", "🥰", "🤩", "😋", "😜", "🤪", "🤔", "🤗", "🤫", "😎", "🥳", "💯", "💬", "💤", "❤️", "💙", "💜", "💛", "💚"];

const getInviteCodeFromLink = (link) => String(link || "").split("/").filter(Boolean).pop() || "aWxNK8ukw";
const getRangePercent = (value, min, max) => {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue) || max <= min) {
    return 0;
  }

  return Math.min(100, Math.max(0, ((numericValue - min) / (max - min)) * 100));
};
const getClosestBitrateStop = (value) => {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) {
    return 64;
  }

  return CHANNEL_BITRATE_STOPS.reduce((closest, option) => (
    Math.abs(option - numericValue) < Math.abs(closest - numericValue) ? option : closest
  ), CHANNEL_BITRATE_STOPS[0]);
};

function ChannelSettingsModal({
  activeServer,
  state,
  canManageChannels,
  onClose,
  onCreateServerInviteLink,
  onUpdateChannelSettings,
  onDeleteTextChannel,
  onDeleteVoiceChannel,
}) {
  const [activeTabState, setActiveTabState] = useState({ channelKey: "", tab: "overview" });
  const [inviteStatus, setInviteStatus] = useState("");
  const [isCreatingInvite, setIsCreatingInvite] = useState(false);
  const [isNameEmojiPickerOpen, setIsNameEmojiPickerOpen] = useState(false);
  const channelNameInputRef = useRef(null);
  const channelKey = `${state?.type || ""}:${state?.channelId || ""}`;
  const activeTab = activeTabState.channelKey === channelKey ? activeTabState.tab : "overview";
  const source = state?.type === "voice" ? activeServer?.voiceChannels : activeServer?.textChannels;
  const channel = state?.channelId
    ? (source || []).find((item) => String(item.id) === String(state.channelId)) || null
    : null;
  const isVoice = state?.type === "voice";
  const channelName = channel?.name || "";
  const slowMode = String(channel?.slowMode || "off");
  const bitrate = getClosestBitrateStop(channel?.bitrateKbps || 64);
  const bitrateIndex = CHANNEL_BITRATE_STOPS.indexOf(bitrate);
  const userLimit = Math.min(99, Math.max(0, Number(channel?.userLimit ?? 0)));
  const bitrateProgress = getRangePercent(bitrateIndex, 0, CHANNEL_BITRATE_STOPS.length - 1);
  const userLimitProgress = getRangePercent(userLimit, 0, 99);
  const videoQuality = String(channel?.videoQuality || "auto");
  const region = String(channel?.region || "auto");
  const ageRestricted = Boolean(channel?.ageRestricted);
  const topic = String(channel?.topic || "");
  const autoArchiveDuration = String(channel?.autoArchiveDuration || "3d");
  const permissionsSynced = channel?.permissionsSynced !== false;
  const privateChannel = Boolean(channel?.privateChannel);
  const advancedPermissionsOpen = Boolean(channel?.advancedPermissionsOpen);
  const permissionOverrides = channel?.permissionOverrides || {};
  const invitesPaused = Boolean(channel?.invitesPaused);
  const channelInvites = Array.isArray(channel?.invites) ? channel.invites : [];
  const webhooks = Array.isArray(channel?.webhooks) ? channel.webhooks : [];
  const followedChannels = Array.isArray(channel?.followedChannels) ? channel.followedChannels : [];
  const integrationInfoOpen = Boolean(channel?.integrationInfoOpen);

  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        onClose?.();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  if (!state || !channel) {
    return null;
  }

  const updateSettings = (patch) => {
    onUpdateChannelSettings?.(state.type, channel.id, patch);
  };

  const formatTopic = (mark) => {
    if (!topic.trim()) {
      return;
    }

    const wrapper = mark === "bold" ? "**" : mark === "italic" ? "_" : "~~";
    updateSettings({ topic: `${wrapper}${topic}${wrapper}`.slice(0, CHANNEL_TOPIC_LIMIT) });
  };

  const updatePermission = (key, value) => {
    updateSettings({ permissionOverrides: { ...permissionOverrides, [key]: value } });
  };

  const insertChannelNameEmoji = (emoji) => {
    const input = channelNameInputRef.current;
    const selectionStart = Number.isInteger(input?.selectionStart) ? input.selectionStart : channelName.length;
    const selectionEnd = Number.isInteger(input?.selectionEnd) ? input.selectionEnd : selectionStart;
    const nextName = `${channelName.slice(0, selectionStart)}${emoji}${channelName.slice(selectionEnd)}`;

    updateSettings({ name: nextName });
    setIsNameEmojiPickerOpen(false);

    window.requestAnimationFrame(() => {
      input?.focus?.();
      input?.setSelectionRange?.(selectionStart + emoji.length, selectionStart + emoji.length);
    });
  };

  const createInvite = async () => {
    if (isCreatingInvite || invitesPaused) {
      return;
    }

    setIsCreatingInvite(true);
    setInviteStatus("");

    try {
      const link = await onCreateServerInviteLink?.();
      const inviteLink = link || `https://tendsec.ru/invite/${getInviteCodeFromLink(link)}`;
      const invite = {
        id: createId("channel-invite"),
        inviter: "Вы",
        code: getInviteCodeFromLink(inviteLink),
        uses: 0,
        expiresAtLabel: "29:23:59:59",
        roles: "—",
        link: inviteLink,
      };
      updateSettings({ invites: [invite, ...channelInvites] });
      setInviteStatus("Ссылка-приглашение создана.");
    } catch (error) {
      setInviteStatus(error?.message || "Не удалось создать ссылку-приглашение.");
    } finally {
      setIsCreatingInvite(false);
    }
  };

  const copyInvite = async (invite) => {
    const value = invite?.link || invite?.code || "";
    if (!value) {
      return;
    }

    try {
      await copyTextToClipboard(value);
      setInviteStatus("Ссылка-приглашение скопирована.");
    } catch {
      setInviteStatus("Не удалось скопировать ссылку.");
    }
  };

  const revokeInvite = (inviteId) => {
    updateSettings({ invites: channelInvites.filter((invite) => String(invite.id) !== String(inviteId)) });
  };

  const createWebhook = () => {
    updateSettings({
      webhooks: [
        ...webhooks,
        {
          id: createId("webhook"),
          name: `Вебхук ${webhooks.length + 1}`,
          url: `https://tendsec.ru/webhooks/${createId("hook")}`,
        },
      ],
    });
  };

  const removeWebhook = (webhookId) => {
    updateSettings({ webhooks: webhooks.filter((webhook) => String(webhook.id) !== String(webhookId)) });
  };

  const deleteChannel = () => {
    if (!canManageChannels) {
      return;
    }

    if (isVoice) {
      void onDeleteVoiceChannel?.(channel.id);
    } else {
      onDeleteTextChannel?.(channel.id);
    }
  };

  return (
    <div className="channel-settings-shell" role="dialog" aria-modal="true" aria-label="Настройки канала">
      <aside className="channel-settings-shell__sidebar">
        <div className="channel-settings-shell__channel">
          <span className={`channel-settings-shell__channel-icon ${isVoice ? "channel-settings-shell__channel-icon--voice" : "channel-settings-shell__channel-icon--text"}`} aria-hidden="true" />
          <strong>{channelName || "канал"}</strong>
        </div>
        <nav className="channel-settings-shell__nav" aria-label="Разделы настроек канала">
          {CHANNEL_SETTINGS_TABS.map((item) => (
            <button
              key={item.id}
              type="button"
              className={activeTab === item.id ? "is-active" : ""}
              onClick={() => setActiveTabState({ channelKey, tab: item.id })}
            >
              {item.label}
            </button>
          ))}
        </nav>
        <button type="button" className="channel-settings-shell__delete" onClick={deleteChannel} disabled={!canManageChannels}>
          <span>Удалить канал</span>
          <span className="channel-settings-shell__delete-icon" aria-hidden="true" />
        </button>
      </aside>

      <main className="channel-settings-shell__content">
        <button type="button" className="channel-settings-shell__close" onClick={onClose} aria-label="Закрыть настройки">
          <span aria-hidden="true" />
          <small>ESC</small>
        </button>

        {activeTab === "overview" ? (
          <section className="channel-settings-overview">
            <h2>Обзор</h2>

            <label className="channel-settings-field">
              <span>Название канала</span>
              <div className="channel-settings-input-wrap">
                <input
                  ref={channelNameInputRef}
                  value={channelName}
                  onChange={(event) => updateSettings({ name: event.target.value })}
                  spellCheck={false}
                  autoCorrect="off"
                  autoCapitalize="off"
                />
                <button
                  type="button"
                  className="channel-settings-emoji-button"
                  onClick={() => setIsNameEmojiPickerOpen((value) => !value)}
                  aria-label="Добавить смайлик"
                >
                  ☺
                </button>
                {isNameEmojiPickerOpen ? (
                  <div className="channel-settings-emoji-picker" role="menu" aria-label="Смайлики для названия канала">
                    {CHANNEL_NAME_EMOJIS.map((emoji) => (
                      <button key={emoji} type="button" onClick={() => insertChannelNameEmoji(emoji)}>
                        {emoji}
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
            </label>

            {!isVoice ? (
              <label className="channel-settings-topic">
                <span>Тема канала</span>
                <div className="channel-settings-topic__box">
                  <div className="channel-settings-topic__toolbar" aria-label="Форматирование темы">
                    <button type="button" onClick={() => formatTopic("bold")} aria-label="Жирный текст">B</button>
                    <button type="button" onClick={() => formatTopic("italic")} aria-label="Курсив">I</button>
                    <button type="button" onClick={() => formatTopic("strike")} aria-label="Зачеркнутый текст">S</button>
                    <button type="button" onClick={() => updateSettings({ topicPreview: !channel?.topicPreview })} aria-label="Предпросмотр">◉</button>
                    <button type="button" onClick={() => updateSettings({ topic: `${topic}☺`.slice(0, CHANNEL_TOPIC_LIMIT) })} aria-label="Добавить смайлик">☺</button>
                  </div>
                  <textarea
                    value={topic}
                    maxLength={CHANNEL_TOPIC_LIMIT}
                    onChange={(event) => updateSettings({ topic: event.target.value.slice(0, CHANNEL_TOPIC_LIMIT) })}
                    placeholder="Расскажите участникам, как пользоваться этим каналом!"
                  />
                  <small>{CHANNEL_TOPIC_LIMIT - topic.length}</small>
                </div>
              </label>
            ) : null}

            {!isVoice ? (
              <label className="channel-settings-field">
                <span>Медленный режим</span>
                <select value={slowMode} onChange={(event) => updateSettings({ slowMode: event.target.value })}>
                  {CHANNEL_SLOW_MODE_OPTIONS.map(([value, label]) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </select>
                <small>Участники не смогут отправлять больше одного сообщения и создавать больше одной ветки в течение этого периода времени.</small>
              </label>
            ) : null}

            <div className="channel-settings-row">
              <div>
                <strong>Канал с возрастным ограничением</strong>
                <p>Для просмотра содержимого этого канала пользователям необходимо подтвердить, что они достигли совершеннолетия.</p>
              </div>
              <button
                type="button"
                className={`channel-settings-switch ${ageRestricted ? "is-active" : ""}`}
                onClick={() => updateSettings({ ageRestricted: !ageRestricted })}
                aria-label="Канал с возрастным ограничением"
              >
                <span aria-hidden="true" />
              </button>
            </div>

            {isVoice ? (
              <>
                <div className="channel-settings-divider" />

                <label className="channel-settings-range channel-settings-range--stops">
                  <span className="channel-settings-range__heading">
                    <span>Битрейт</span>
                  </span>
                  <div className="channel-settings-range__labels">
                    <small>8kbps</small>
                    <small>64kbps</small>
                    <small>96kbps</small>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max={CHANNEL_BITRATE_STOPS.length - 1}
                    step="1"
                    value={bitrateIndex}
                    style={{ "--channel-range-progress": `${bitrateProgress}%` }}
                    onInput={(event) => updateSettings({ bitrateKbps: CHANNEL_BITRATE_STOPS[Number(event.currentTarget.value)] || 64 })}
                    onChange={(event) => updateSettings({ bitrateKbps: CHANNEL_BITRATE_STOPS[Number(event.target.value)] || 64 })}
                  />
                  <p>ВНИМАНИЕ! Не поднимайте битрейт выше 64 кбит/с, чтобы не создать проблемы людям с низкой скоростью соединения.</p>
                </label>

                <div className="channel-settings-radio-group">
                  <strong>Качество видео</strong>
                  {CHANNEL_VIDEO_QUALITY_OPTIONS.map(([value, label]) => (
                    <label key={value}>
                      <input
                        type="radio"
                        name="channelVideoQuality"
                        checked={videoQuality === value}
                        onChange={() => updateSettings({ videoQuality: value })}
                      />
                      <span>{label}</span>
                    </label>
                  ))}
                  <p>Устанавливает качество изображения для всех участников канала. Выберите автоматический режим для оптимальной производительности.</p>
                </div>

                <label className="channel-settings-range">
                  <span className="channel-settings-range__heading">
                    <span>Лимит пользователей</span>
                    <output>{userLimit === 0 ? "∞" : `${userLimit}/99`}</output>
                  </span>
                  <div className="channel-settings-range__labels">
                    <small>∞</small>
                    <small>99</small>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="99"
                    value={userLimit}
                    style={{ "--channel-range-progress": `${userLimitProgress}%` }}
                    onInput={(event) => updateSettings({ userLimit: Number(event.currentTarget.value) })}
                    onChange={(event) => updateSettings({ userLimit: Number(event.target.value) })}
                  />
                  <p>Ограничивает количество пользователей, которые могут подключаться к этому голосовому каналу.</p>
                </label>

                <label className="channel-settings-field channel-settings-field--region">
                  <span>Назначение региона</span>
                  <small>Для всех пользователей канала будет предпринята попытка подключения к указанному региону.</small>
                  <select value={region} onChange={(event) => updateSettings({ region: event.target.value })}>
                    <option value="auto">Автоматический выбор</option>
                    <option value="eu-central">Европа</option>
                    <option value="ru-west">Россия</option>
                    <option value="us-east">США Восток</option>
                  </select>
                </label>
              </>
            ) : (
              <label className="channel-settings-field">
                <span>Скрыть после неактивности</span>
                <select value={autoArchiveDuration} onChange={(event) => updateSettings({ autoArchiveDuration: event.target.value })}>
                  {CHANNEL_ARCHIVE_OPTIONS.map(([value, label]) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </select>
                <small>Новые ветки перестанут отображаться в списке каналов после заданного периода неактивности.</small>
              </label>
            )}
          </section>
        ) : activeTab === "permissions" ? (
          <section className="channel-settings-panel">
            <h2>Права канала</h2>
            <p className="channel-settings-panel__lead">Используйте права, чтобы настроить возможности пользователей на этом канале.</p>

            <div className="channel-settings-card channel-settings-card--notice">
              <span aria-hidden="true">↔</span>
              <strong>Права {permissionsSynced ? "синхронизированы" : "отвязаны"} с категорией «{isVoice ? "Голосовые каналы" : "Текстовые каналы"}»</strong>
              <button type="button" onClick={() => updateSettings({ permissionsSynced: !permissionsSynced })}>
                {permissionsSynced ? "Отвязать" : "Синхронизировать"}
              </button>
            </div>

            <div className="channel-settings-card channel-settings-card--switch">
              <div>
                <strong>Приватный канал</strong>
                <p>Если сделать канал приватным, только выбранные вами участники и роли смогут просматривать его.</p>
              </div>
              <button
                type="button"
                className={`channel-settings-switch ${privateChannel ? "is-active" : ""}`}
                onClick={() => updateSettings({ privateChannel: !privateChannel })}
                aria-label="Приватный канал"
              >
                <span aria-hidden="true" />
              </button>
            </div>

            <button
              type="button"
              className={`channel-settings-advanced ${advancedPermissionsOpen ? "is-open" : ""}`}
              onClick={() => updateSettings({ advancedPermissionsOpen: !advancedPermissionsOpen })}
            >
              <span>Расширенные права</span>
              <span aria-hidden="true">›</span>
            </button>

            {advancedPermissionsOpen ? (
              <div className="channel-settings-permissions">
                <label>
                  <span>Просматривать канал</span>
                  <input type="checkbox" checked={permissionOverrides.viewChannel !== false} onChange={(event) => updatePermission("viewChannel", event.target.checked)} />
                </label>
                <label>
                  <span>{isVoice ? "Подключаться" : "Отправлять сообщения"}</span>
                  <input
                    type="checkbox"
                    checked={isVoice ? permissionOverrides.connect !== false : permissionOverrides.sendMessages !== false}
                    onChange={(event) => updatePermission(isVoice ? "connect" : "sendMessages", event.target.checked)}
                  />
                </label>
                <label>
                  <span>{isVoice ? "Говорить" : "Прикреплять файлы"}</span>
                  <input
                    type="checkbox"
                    checked={isVoice ? permissionOverrides.speak !== false : permissionOverrides.attachFiles !== false}
                    onChange={(event) => updatePermission(isVoice ? "speak" : "attachFiles", event.target.checked)}
                  />
                </label>
              </div>
            ) : null}
          </section>
        ) : activeTab === "invites" ? (
          <section className="channel-settings-panel">
            <h2>Приглашения</h2>
            <p className="channel-settings-panel__lead">
              Вот список всех активных ссылок-приглашений. Вы можете отозвать любое или{" "}
              <button type="button" onClick={createInvite} disabled={!canManageChannels || invitesPaused || isCreatingInvite}>создать ещё</button>.
            </p>

            <button
              type="button"
              className={`channel-settings-danger ${invitesPaused ? "is-muted" : ""}`}
              onClick={() => updateSettings({ invitesPaused: !invitesPaused })}
              disabled={!canManageChannels}
            >
              {invitesPaused ? "Возобновить приглашения" : "Приостановить приглашения"}
            </button>

            <div className="channel-settings-table" role="table" aria-label="Активные приглашения">
              <div className="channel-settings-table__head" role="row">
                <span>Приглашающий</span>
                <span>Код приглашения</span>
                <span>Использований</span>
                <span>Истекает</span>
                <span>Роли</span>
                <span />
              </div>
              {channelInvites.length ? (
                channelInvites.map((invite) => (
                  <div className="channel-settings-table__row" role="row" key={invite.id || invite.code}>
                    <span>{invite.inviter || "Вы"}</span>
                    <code>{invite.code || getInviteCodeFromLink(invite.link)}</code>
                    <span>{Number(invite.uses || 0)}</span>
                    <span>{invite.expiresAtLabel || "29:23:59:59"}</span>
                    <span>{invite.roles || "—"}</span>
                    <span className="channel-settings-table__actions">
                      <button type="button" onClick={() => copyInvite(invite)}>Копировать</button>
                      <button type="button" onClick={() => revokeInvite(invite.id)}>Отозвать</button>
                    </span>
                  </div>
                ))
              ) : (
                <div className="channel-settings-empty">Активных приглашений пока нет.</div>
              )}
            </div>
            {inviteStatus ? <div className="channel-settings-status" role="status">{inviteStatus}</div> : null}
          </section>
        ) : (
          <section className="channel-settings-panel">
            <h2>Интеграция</h2>
            <p className="channel-settings-panel__lead">
              Персонализируйте свой сервер с помощью интеграций. Управляйте вебхуками и отслеживаемыми каналами, публикации с которых появляются на этом канале.
            </p>

            <div className="channel-settings-integration-list">
              <div className="channel-settings-integration">
                <span aria-hidden="true">⌁</span>
                <div>
                  <strong>Вебхуки</strong>
                  <small>{webhooks.length} вебхуков</small>
                </div>
                <button type="button" onClick={createWebhook} disabled={!canManageChannels}>Создать вебхук</button>
              </div>
              {webhooks.map((webhook) => (
                <div className="channel-settings-integration channel-settings-integration--sub" key={webhook.id}>
                  <span aria-hidden="true">↳</span>
                  <div>
                    <strong>{webhook.name}</strong>
                    <small>{webhook.url}</small>
                  </div>
                  <button type="button" onClick={() => removeWebhook(webhook.id)}>Удалить</button>
                </div>
              ))}

              <div className="channel-settings-integration">
                <span aria-hidden="true">▣</span>
                <div>
                  <strong>Отслеживаемые каналы</strong>
                  <small>{followedChannels.length} каналов</small>
                </div>
                <button type="button" onClick={() => updateSettings({ integrationInfoOpen: !integrationInfoOpen })}>Подробнее</button>
              </div>
              {integrationInfoOpen ? (
                <div className="channel-settings-integration-note">
                  Публикации из отслеживаемых каналов будут появляться здесь автоматически. Добавление внешних источников можно подключить позже без изменения этих настроек.
                </div>
              ) : null}
            </div>
          </section>
        )}
      </main>
    </div>
  );
}

export const ServersSidebar = memo(({
  includeProfilePanel = true,
  profilePanel,
  activeServer,
  desktopServerPane = "text",
  servers,
  serverMembersRef,
  memberRoleMenu,
  memberRoleMenuRef,
  serverContextMenu,
  serverContextMenuRef,
  voiceParticipantByUserId,
  currentUserId,
  canManageChannels,
  channelSettingsState,
  channelRenameState,
  serverUnreadCounts,
  chatDraftPresence,
  currentTextChannel,
  selectedVoiceChannel,
  currentVoiceChannel,
  activeVoiceParticipantsMap,
  liveUserIds,
  speakingUserIds,
  watchedStreamUserId,
  joiningVoiceChannelId,
  icons,
  onOpenServerSettings,
  onOpenNotificationSettings,
  onOpenPersonalProfileSettings,
  onShowServerFeedback,
  inviteFriends = [],
  isServerInviteModalOpen = false,
  serverInviteTarget = null,
  serverInviteTargetChannelName = "",
  onOpenServerInviteModal,
  onCloseServerInviteModal,
  onCreateServerInviteLink,
  onSendServerInviteToFriend,
  onOpenMemberActions,
  onUpdateMemberNickname,
  onUpdateMemberVoiceState,
  onUpdateMemberRole,
  onCopyServerInvite,
  onLeaveServer,
  onDeleteServer,
  onAddServer,
  onAddTextChannel,
  onAddVoiceChannel,
  onCreateCategory,
  onToggleCategory,
  onReorderCategories,
  onCreateChannel,
  onMoveChannel,
  onOpenChannelSettings,
  onCloseChannelSettings,
  onUpdateChannelSettings,
  onDeleteTextChannel,
  onDeleteVoiceChannel,
  onSelectTextChannel,
  onUpdateChannelRenameValue,
  onSubmitChannelRename,
  onCancelChannelRename,
  onJoinVoiceChannel,
  onLeaveVoiceChannel,
  onPrewarmVoiceChannel,
  onWatchStream,
  canManageTargetMember,
  canAssignRoleToMember,
  canInviteToServer,
  getChannelDisplayName,
  getScopedChatChannelId,
}) => {
  const [isServerMenuOpen, setIsServerMenuOpen] = useState(false);
  const [serverMenuPosition, setServerMenuPosition] = useState({ left: 0, top: 0, maxHeight: 420 });
  const [hideMutedChannels, setHideMutedChannels] = useState(false);
  const [createCategoryOpen, setCreateCategoryOpen] = useState(false);
  const [createCategoryName, setCreateCategoryName] = useState("");
  const [createCategoryPrivate, setCreateCategoryPrivate] = useState(false);
  const [createCategoryError, setCreateCategoryError] = useState("");
  const [createChannelDraft, setCreateChannelDraft] = useState(null);
  const [createChannelError, setCreateChannelError] = useState("");
  const [dragState, setDragState] = useState(null);
  const dragEndedRef = useRef(false);

  const updateServerMenuPosition = () => {
    const anchor = serverMembersRef?.current;
    if (!anchor) {
      return;
    }

    const rect = anchor.getBoundingClientRect();
    const top = Math.max(8, rect.bottom + 8);
    setServerMenuPosition({
      left: Math.max(8, rect.left + 36),
      top,
      maxHeight: Math.max(180, window.innerHeight - top - 16),
    });
  };

  useEffect(() => {
    if (!isServerMenuOpen) {
      return undefined;
    }

    const handlePointerDown = (event) => {
      if (event.target instanceof Element && event.target.closest(".server-summary-wrap, .server-summary-menu")) {
        return;
      }

      setIsServerMenuOpen(false);
    };
    const handleReposition = () => updateServerMenuPosition();

    window.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("resize", handleReposition);
    window.addEventListener("scroll", handleReposition, true);
    return () => {
      window.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("resize", handleReposition);
      window.removeEventListener("scroll", handleReposition, true);
    };
  }, [isServerMenuOpen]);

  const runServerMenuAction = (action) => {
    setIsServerMenuOpen(false);
    action?.();
  };
  const showUnavailableServerMenuAction = () => {
    onShowServerFeedback?.("Этот раздел пока не подключён.");
  };
  const channelCategories = useMemo(
    () => getOrderedItems(Array.isArray(activeServer?.channelCategories) ? activeServer.channelCategories : EMPTY_CHANNEL_LIST),
    [activeServer?.channelCategories]
  );
  const textChannelsByCategory = useMemo(
    () => groupOrderedChannelsByCategory(activeServer?.textChannels || EMPTY_CHANNEL_LIST),
    [activeServer?.textChannels]
  );
  const voiceChannelsByCategory = useMemo(
    () => groupOrderedChannelsByCategory(activeServer?.voiceChannels || EMPTY_CHANNEL_LIST),
    [activeServer?.voiceChannels]
  );
  const uncategorizedTextChannels = textChannelsByCategory.get("") || EMPTY_CHANNEL_LIST;
  const uncategorizedVoiceChannels = voiceChannelsByCategory.get("") || EMPTY_CHANNEL_LIST;
  const canDragChannels = Boolean(canManageChannels && activeServer);
  const endDrag = () => {
    dragEndedRef.current = true;
    setDragState(null);
    window.setTimeout(() => {
      dragEndedRef.current = false;
    }, 180);
  };
  const handleCategoryClick = (event, categoryId) => {
    if (dragEndedRef.current) {
      event.preventDefault();
      return;
    }

    onToggleCategory?.(categoryId);
  };
  const startCategoryDrag = (event, category) => {
    if (!canDragChannels || !category?.id) {
      event.preventDefault();
      return;
    }

    const payload = { kind: "category", categoryId: String(category.id) };
    setDragState(payload);
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("application/x-tend-channel-drag", encodeChannelDragPayload(payload));
  };
  const handleCategoryDragOver = (event, category) => {
    if (!category?.id) {
      return;
    }

    if (dragState?.kind === "category" && dragState.categoryId !== category.id) {
      event.preventDefault();
      event.dataTransfer.dropEffect = "move";
      return;
    }

    if (dragState?.kind === "channel") {
      event.preventDefault();
      event.dataTransfer.dropEffect = "move";
    }
  };
  const handleCategoryDrop = (event, category) => {
    const payload = decodeChannelDragPayload(event, dragState);
    if (!category?.id) {
      return;
    }

    if (payload?.kind === "channel") {
      handleChannelDrop(event, payload.type, null, category.id);
      return;
    }

    if (payload?.kind !== "category" || payload.categoryId === category.id) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    onReorderCategories?.(payload.categoryId, category.id);
    endDrag();
  };
  const startChannelDrag = (event, type, channel, categoryId = "") => {
    const dragTarget = event.target instanceof Element ? event.target.closest(".channel-drag-handle") : null;
    if (!canDragChannels || !channel?.id || !dragTarget || event.target?.closest?.(".channel-edit-button, input, select, textarea")) {
      event.preventDefault();
      return;
    }

    const payload = {
      kind: "channel",
      type,
      channelId: String(channel.id),
      categoryId: getDragCategoryId(categoryId),
    };
    setDragState(payload);
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("application/x-tend-channel-drag", encodeChannelDragPayload(payload));
  };
  const handleChannelDragOver = (event, type, channel = null, categoryId = "") => {
    if (dragState?.kind !== "channel" || dragState.type !== type) {
      return;
    }

    if (channel?.id && dragState.channelId === channel.id && dragState.categoryId === getDragCategoryId(categoryId)) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = "move";
  };
  const handleChannelDrop = (event, type, channel = null, categoryId = "") => {
    const payload = decodeChannelDragPayload(event, dragState);
    if (payload?.kind !== "channel" || payload.type !== type) {
      return;
    }

    const nextCategoryId = getDragCategoryId(categoryId);
    const targetChannelId = channel?.id ? String(channel.id) : "";
    if (payload.channelId === targetChannelId && payload.categoryId === nextCategoryId) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    onMoveChannel?.({
      type,
      channelId: payload.channelId,
      targetChannelId,
      targetCategoryId: nextCategoryId,
    });
    endDrag();
  };
  const openCreateCategoryModal = () => {
    setCreateCategoryName("");
    setCreateCategoryPrivate(false);
    setCreateCategoryError("");
    setCreateCategoryOpen(true);
  };
  const closeCreateCategoryModal = () => {
    setCreateCategoryOpen(false);
    setCreateCategoryError("");
  };
  const submitCreateCategory = (event) => {
    event?.preventDefault?.();
    const nextName = createCategoryName.trim();
    if (!nextName) {
      setCreateCategoryError("Введите название категории.");
      return;
    }

    onCreateCategory?.({
      name: nextName,
      privateCategory: createCategoryPrivate,
    });
    closeCreateCategoryModal();
  };
  const openCreateChannelModal = (categoryId = "", type = "text") => {
    setCreateChannelDraft({
      type,
      categoryId: String(categoryId || ""),
      name: "",
    });
    setCreateChannelError("");
  };
  const closeCreateChannelModal = () => {
    setCreateChannelDraft(null);
    setCreateChannelError("");
  };
  const submitCreateChannel = (event) => {
    event?.preventDefault?.();
    if (!createChannelDraft) {
      return;
    }

    const nextName = createChannelDraft.name.trim();
    if (!nextName) {
      setCreateChannelError("Введите название канала.");
      return;
    }

    onCreateChannel?.({
      ...createChannelDraft,
      name: nextName,
    });
    closeCreateChannelModal();
  };
  const renderTextChannelItem = (channel, categoryId = "") => {
    const kind = getTextChannelKind(channel);
    const isEditing = channelRenameState?.type === "text" && channelRenameState.channelId === channel.id;
    const scopedChannelId = getScopedChatChannelId(activeServer?.id || "", channel.id);
    const unreadCount = Number(serverUnreadCounts[scopedChannelId] || 0);
    const hasDraft = Boolean(chatDraftPresence[scopedChannelId]);
    const isTextChannelActive = desktopServerPane !== "voice" && currentTextChannel?.id === channel.id;

    return (
      <li
        key={channel.id}
        className={`channel-item ${canDragChannels && !isEditing ? "channel-item--with-drag-handle" : ""} ${isTextChannelActive ? "active-channel" : ""} ${isEditing ? "channel-item--editing" : ""} ${kind === "forum" ? "channel-item--forum" : ""} ${dragState?.kind === "channel" && dragState.channelId === channel.id ? "channel-item--dragging" : ""}`}
        onDragOver={(event) => handleChannelDragOver(event, "text", channel, categoryId)}
        onDrop={(event) => handleChannelDrop(event, "text", channel, categoryId)}
        onDragEnd={endDrag}
      >
        {isEditing ? (
          <input
            className="channel-inline-input"
            type="text"
            value={channelRenameState.value}
            autoFocus
            spellCheck={false}
            autoCorrect="off"
            autoCapitalize="off"
            onChange={(event) => onUpdateChannelRenameValue(event.target.value)}
            onBlur={onSubmitChannelRename}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                onSubmitChannelRename();
              }
              if (event.key === "Escape") {
                event.preventDefault();
                onCancelChannelRename();
              }
            }}
          />
        ) : (
          <>
          {canDragChannels ? (
            <span
              className="channel-drag-handle"
              draggable
              onDragStart={(event) => startChannelDrag(event, "text", channel, categoryId)}
              onDragEnd={endDrag}
              role="button"
              tabIndex={-1}
              aria-label="Drag channel"
            />
          ) : null}
          <button type="button" className="channel-item__button" onClick={() => onSelectTextChannel(channel.id)}>
            <span className="channel-item__icon" aria-hidden="true">{getChannelListIcon(kind)}</span>
            <span className="channel-item__label">{getChannelDisplayName(channel.name, "text")}</span>
            {hasDraft ? <span className="channel-item__draft">Черновик</span> : null}
            {unreadCount > 0 ? <span className="sidebar-unread-badge sidebar-unread-badge--channel">{Math.min(unreadCount, 99)}</span> : null}
          </button>
          </>
        )}
        <button type="button" className="channel-edit-button" onClick={() => onOpenChannelSettings?.("text", channel)} aria-label="Настройки канала" disabled={!canManageChannels}>
          <img src={icons.settings} alt="" />
        </button>
      </li>
    );
  };
  const renderVoiceChannels = (channels, categoryId = "") => (
    <VoiceChannelList
      channels={channels}
      categoryId={categoryId}
      activeChannelId={currentVoiceChannel || ""}
      participantsMap={activeVoiceParticipantsMap}
      serverId={activeServer?.id || ""}
      serverMembers={activeServer?.members || []}
      serverRoles={activeServer?.roles || []}
      onJoinChannel={onJoinVoiceChannel}
      onLeaveChannel={onLeaveVoiceChannel}
      onPrewarmChannel={(channelId) => {
        void loadVoiceRoomStage();
        onPrewarmVoiceChannel?.(channelId);
      }}
      onRenameChannel={onOpenChannelSettings}
      liveUserIds={liveUserIds}
      speakingUserIds={speakingUserIds}
      watchedStreamUserId={watchedStreamUserId}
      joiningChannelId={joiningVoiceChannelId}
      onWatchStream={onWatchStream}
      canManageChannels={canManageChannels}
      editingChannelId={channelRenameState?.type === "voice" ? channelRenameState.channelId : ""}
      editingChannelValue={channelRenameState?.type === "voice" ? channelRenameState.value : ""}
      onRenameValueChange={onUpdateChannelRenameValue}
      onRenameSubmit={onSubmitChannelRename}
      onRenameCancel={onCancelChannelRename}
      dragState={dragState}
      onChannelDragStart={startChannelDrag}
      onChannelDragOver={handleChannelDragOver}
      onChannelDrop={handleChannelDrop}
      onChannelDragEnd={endDrag}
    />
  );

  return (
    <>
  <aside className="sidebar__channels sidebar__channels--servers">
    <div className="channels__top">
      {activeServer ? (
        <div className="server-summary-wrap" ref={serverMembersRef}>
          <div className="server-summary server-summary--discordish">
            <button
              type="button"
              className="server-summary__main"
              onClick={() => {
                if (!isServerMenuOpen) {
                  updateServerMenuPosition();
                }
                setIsServerMenuOpen((value) => !value);
              }}
            >
              <span className="server-summary__name">{activeServer.name || "Server"}</span>
              <svg className={`server-summary__caret ${isServerMenuOpen ? "is-open" : ""}`} viewBox="0 0 16 16" aria-hidden="true">
                <path d="M4.2 6.2 8 10l3.8-3.8" />
              </svg>
            </button>
            <button
              type="button"
              className="server-summary__invite"
              onClick={onOpenServerInviteModal}
              disabled={!canInviteToServer(activeServer)}
              aria-label="Пригласить друзей"
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M15 19.2c0-2.1-2.7-3.8-6-3.8s-6 1.7-6 3.8" />
                <circle cx="9" cy="8" r="3.2" />
                <path d="M18 8v6" />
                <path d="M15 11h6" />
              </svg>
            </button>
          </div>

          {isServerMenuOpen ? (
            <div
              className="server-summary-menu"
              style={{
                left: serverMenuPosition.left,
                top: serverMenuPosition.top,
                maxHeight: serverMenuPosition.maxHeight,
              }}
            >
              <button type="button" onClick={() => runServerMenuAction(onOpenServerInviteModal)}>
                <span>Пригласить на сервер</span>
                <span className="server-summary-menu__icon" aria-hidden="true">♣</span>
              </button>
              <button type="button" onClick={() => runServerMenuAction(onOpenServerSettings)}>
                <span>Настройки сервера</span>
                <span className="server-summary-menu__icon" aria-hidden="true">⚙</span>
              </button>
              <button type="button" onClick={() => runServerMenuAction(() => openCreateChannelModal("", "text"))} disabled={!canManageChannels}>
                <span>Создать канал</span>
                <span className="server-summary-menu__icon" aria-hidden="true">＋</span>
              </button>
              <button type="button" onClick={() => runServerMenuAction(openCreateCategoryModal)} disabled={!canManageChannels}>
                <span>Создать категорию</span>
                <span className="server-summary-menu__icon" aria-hidden="true">▣</span>
              </button>
              <button type="button" onClick={() => runServerMenuAction(showUnavailableServerMenuAction)}>
                <span>Создать событие</span>
                <span className="server-summary-menu__icon" aria-hidden="true">▦</span>
              </button>
              <button type="button" onClick={() => runServerMenuAction(showUnavailableServerMenuAction)}>
                <span>Каталог приложений</span>
                <span className="server-summary-menu__icon" aria-hidden="true">◆</span>
              </button>
              <span className="server-summary-menu__separator" aria-hidden="true" />
              <button type="button" onClick={() => runServerMenuAction(onOpenNotificationSettings)}>
                <span>Параметры уведомлений</span>
                <span className="server-summary-menu__icon" aria-hidden="true">●</span>
              </button>
              <span className="server-summary-menu__separator" aria-hidden="true" />
              <button type="button" onClick={() => runServerMenuAction(onOpenPersonalProfileSettings)}>
                <span>Редактировать личный профиль</span>
                <span className="server-summary-menu__icon" aria-hidden="true">✎</span>
              </button>
              <button type="button" onClick={() => setHideMutedChannels((value) => !value)}>
                <span>Скрыть заглушённые каналы</span>
                <span className={`server-summary-menu__checkbox ${hideMutedChannels ? "is-checked" : ""}`} aria-hidden="true" />
              </button>
              <span className="server-summary-menu__separator" aria-hidden="true" />
              <button
                type="button"
                onClick={() => runServerMenuAction(() => {
                  void copyTextToClipboard(String(activeServer.id || ""));
                  onShowServerFeedback?.("ID сервера скопирован.");
                })}
              >
                <span>Копировать ID сервера</span>
                <span className="server-summary-menu__id" aria-hidden="true">ID</span>
              </button>
            </div>
          ) : null}

          {isServerInviteModalOpen ? (
            <ServerInviteFriendsModal
              key={serverInviteTargetChannelName || currentTextChannel?.name || "server-invite"}
              activeServer={serverInviteTarget || activeServer}
              channelName={getChannelDisplayName(serverInviteTargetChannelName || currentTextChannel?.name || "основной", "text")}
              friends={inviteFriends}
              currentUserId={currentUserId}
              canInvite={canInviteToServer(serverInviteTarget || activeServer)}
              onClose={onCloseServerInviteModal}
              onCreateInviteLink={onCreateServerInviteLink}
              onSendInviteToFriend={onSendServerInviteToFriend}
            />
          ) : null}

          {memberRoleMenu ? (
            <div ref={memberRoleMenuRef} className="member-role-menu" style={{ left: memberRoleMenu.x, top: memberRoleMenu.y }}>
              {(() => {
                const targetMember = activeServer?.members?.find((member) => String(member.userId) === String(memberRoleMenu.memberUserId));
                const targetVoiceState = voiceParticipantByUserId.get(String(memberRoleMenu.memberUserId));
                const canRenameMember = canManageTargetMember(activeServer, currentUserId, memberRoleMenu.memberUserId, "manage_nicknames");
                const canMuteMember = canManageTargetMember(activeServer, currentUserId, memberRoleMenu.memberUserId, "mute_members");
                const canDeafenMember = canManageTargetMember(activeServer, currentUserId, memberRoleMenu.memberUserId, "deafen_members");
                const assignableRoles = (activeServer?.roles || []).filter((role) =>
                  canAssignRoleToMember(activeServer, currentUserId, memberRoleMenu.memberUserId, role.id)
                );

                return (
                  <>
                    {targetMember ? <div className="member-role-menu__title">{targetMember.name}</div> : null}
                    {canRenameMember ? (
                      <button type="button" className="member-role-menu__item" onClick={() => onUpdateMemberNickname(memberRoleMenu.memberUserId)}>
                        <img src={icons.pencil} alt="" className="member-role-menu__icon" />
                        Сменить ник
                      </button>
                    ) : null}
                    {canMuteMember ? (
                      <button
                        type="button"
                        className="member-role-menu__item"
                        onClick={() =>
                          onUpdateMemberVoiceState(memberRoleMenu.memberUserId, {
                            isMicMuted: !targetVoiceState?.isMicMuted,
                            isDeafened: Boolean(targetVoiceState?.isDeafened),
                          })
                        }
                      >
                        <img src={icons.microphone} alt="" className="member-role-menu__icon" />
                        {targetVoiceState?.isMicMuted ? "Включить микрофон" : "Выключить микрофон"}
                      </button>
                    ) : null}
                    {canDeafenMember ? (
                      <button
                        type="button"
                        className="member-role-menu__item"
                        onClick={() =>
                          onUpdateMemberVoiceState(memberRoleMenu.memberUserId, {
                            isMicMuted: targetVoiceState?.isDeafened ? Boolean(targetVoiceState?.isMicMuted) : true,
                            isDeafened: !targetVoiceState?.isDeafened,
                          })
                        }
                      >
                        <img src={icons.headphones} alt="" className="member-role-menu__icon" />
                        {targetVoiceState?.isDeafened ? "Вернуть звук" : "Отключить звук"}
                      </button>
                    ) : null}
                    {assignableRoles.length > 0 ? (
                      <>
                        <div className="member-role-menu__separator" />
                        <div className="member-role-menu__subtitle">Роль</div>
                        {assignableRoles.map((role) => (
                          <button
                            key={role.id}
                            type="button"
                            className={`member-role-menu__item ${targetMember?.roleId === role.id ? "member-role-menu__item--active" : ""}`}
                            onClick={() => onUpdateMemberRole(memberRoleMenu.memberUserId, role.id)}
                          >
                            <span className="member-role-menu__dot" style={{ backgroundColor: role.color || "#7b89a8" }} aria-hidden="true" />
                            {role.name}
                          </button>
                        ))}
                      </>
                    ) : null}
                  </>
                );
              })()}
            </div>
          ) : null}

          {serverContextMenu ? (
            <div ref={serverContextMenuRef} className="member-role-menu member-role-menu--server member-role-menu--server-compact" style={{ left: serverContextMenu.x, top: serverContextMenu.y }}>
              {(() => {
                const targetServer = servers.find((server) => String(server.id) === String(serverContextMenu.serverId));
                const canCopyInvite = canInviteToServer(targetServer);
                const canUseServerActions = Boolean(targetServer);
                const isTargetServerOwner = isServerOwnedByUser(targetServer, currentUserId);

                return (
                  <>
                    <div className="member-role-menu__title">{targetServer?.name || "Сервер"}</div>
                    <button
                      type="button"
                      className={`member-role-menu__item ${!canCopyInvite ? "member-role-menu__item--disabled" : ""}`}
                      onClick={() => onOpenServerInviteModal?.(targetServer)}
                      disabled={!canCopyInvite || serverContextMenu.isLoading}
                    >
                      Пригласить друзей
                    </button>
                    <button
                      type="button"
                      className={`member-role-menu__item ${!canCopyInvite ? "member-role-menu__item--disabled" : ""}`}
                      onClick={onCopyServerInvite}
                      disabled={!canCopyInvite || serverContextMenu.isLoading}
                    >
                      {serverContextMenu.isLoading ? "Готовим ссылку..." : "Скопировать ссылку"}
                    </button>
                    <button
                      type="button"
                      className="member-role-menu__item member-role-menu__item--danger"
                      onClick={() => (isTargetServerOwner ? onDeleteServer?.(targetServer?.id) : onLeaveServer?.(targetServer))}
                      disabled={!canUseServerActions || (isTargetServerOwner ? !onDeleteServer : !onLeaveServer)}
                    >
                      {isTargetServerOwner ? "Удалить сервер" : "Выйти с сервера"}
                    </button>
                    {serverContextMenu.status ? (
                      <>
                        <div className="member-role-menu__separator" />
                        <div className="member-role-menu__status">{serverContextMenu.status}</div>
                      </>
                    ) : null}
                  </>
                );
              })()}
            </div>
          ) : null}
        </div>
      ) : (
        <div className="servers-empty-sidebar">
          <h3>Серверов пока нет</h3>
          <p>Создайте первый сервер, и здесь появятся каналы, участники и настройки.</p>
          <button type="button" className="servers-empty-sidebar__button" onClick={onAddServer}>Создать сервер</button>
        </div>
      )}

      {activeServer ? (
        <>
          <div className="server-panel__section">
            <div className="server-panel__header">
              <span>Текстовые каналы</span>
              <button type="button" onClick={onAddTextChannel} disabled={!canManageChannels}>+</button>
            </div>
            <ul
              className="channel-list"
              onDragOver={(event) => handleChannelDragOver(event, "text", null, "")}
              onDrop={(event) => handleChannelDrop(event, "text", null, "")}
            >
              {uncategorizedTextChannels.map((channel) => renderTextChannelItem(channel, ""))}
            </ul>
          </div>

          <div className="server-panel__section">
            <div className="server-panel__header">
              <span>Голосовые каналы</span>
              <button type="button" onClick={onAddVoiceChannel} disabled={!canManageChannels}>+</button>
            </div>
            {renderVoiceChannels(uncategorizedVoiceChannels, "")}
          </div>

          {channelCategories.map((category) => {
            const categoryId = getDragCategoryId(category.id);
            const textChannels = textChannelsByCategory.get(categoryId) || EMPTY_CHANNEL_LIST;
            const voiceChannels = voiceChannelsByCategory.get(categoryId) || EMPTY_CHANNEL_LIST;
            const isCollapsed = Boolean(category.collapsed);
            const hasChannels = textChannels.length > 0 || voiceChannels.length > 0;

            return (
              <div
                key={category.id}
                className={`server-panel__section server-panel__section--category ${dragState?.kind === "category" && dragState.categoryId === category.id ? "server-panel__section--dragging" : ""}`}
                onDragOver={(event) => handleCategoryDragOver(event, category)}
                onDrop={(event) => handleCategoryDrop(event, category)}
              >
                <div className="server-panel__header server-panel__header--category">
                  <button
                    type="button"
                    className="server-panel__category-toggle"
                    draggable={canDragChannels}
                    onDragStart={(event) => startCategoryDrag(event, category)}
                    onDragEnd={endDrag}
                    onClick={(event) => handleCategoryClick(event, category.id)}
                    aria-expanded={!isCollapsed}
                  >
                    <span className={`server-panel__category-caret ${isCollapsed ? "" : "is-open"}`} aria-hidden="true" />
                    <span>{category.name}</span>
                  </button>
                  <button type="button" onClick={() => openCreateChannelModal(category.id, "text")} disabled={!canManageChannels}>+</button>
                </div>

                {!isCollapsed ? (
                  hasChannels ? (
                    <>
                      <ul
                        className="channel-list"
                        onDragOver={(event) => handleChannelDragOver(event, "text", null, category.id)}
                        onDrop={(event) => handleChannelDrop(event, "text", null, category.id)}
                      >
                        {textChannels.map((channel) => renderTextChannelItem(channel, category.id))}
                      </ul>
                      {renderVoiceChannels(voiceChannels, category.id)}
                    </>
                  ) : (
                    <button
                      type="button"
                      className="server-panel__empty-category"
                      onClick={() => openCreateChannelModal(category.id, "text")}
                      disabled={!canManageChannels}
                    >
                      Создать первый канал
                    </button>
                  )
                ) : null}
              </div>
            );
          })}
        </>
      ) : null}
    </div>

    {includeProfilePanel ? profilePanel : null}
  </aside>
  <ChannelSettingsModal
    activeServer={activeServer}
    state={channelSettingsState}
    canManageChannels={canManageChannels}
    onClose={onCloseChannelSettings}
    onCreateServerInviteLink={onCreateServerInviteLink}
    onUpdateChannelSettings={onUpdateChannelSettings}
    onDeleteTextChannel={onDeleteTextChannel}
    onDeleteVoiceChannel={onDeleteVoiceChannel}
  />
  <CreateCategoryModal
    open={createCategoryOpen}
    name={createCategoryName}
    isPrivate={createCategoryPrivate}
    error={createCategoryError}
    onClose={closeCreateCategoryModal}
    onNameChange={(value) => {
      setCreateCategoryName(value);
      if (createCategoryError) {
        setCreateCategoryError("");
      }
    }}
    onPrivateChange={setCreateCategoryPrivate}
    onSubmit={submitCreateCategory}
  />
  <CreateChannelModal
    open={Boolean(createChannelDraft)}
    draft={createChannelDraft || { type: "text", categoryId: "", name: "" }}
    categories={channelCategories}
    error={createChannelError}
    onClose={closeCreateChannelModal}
    onDraftChange={(draft) => {
      setCreateChannelDraft(draft);
      if (createChannelError) {
        setCreateChannelError("");
      }
    }}
    onSubmit={submitCreateChannel}
  />
    </>
  );
});

function ServerMainComponent({
  activeServer,
  currentTextChannel,
  selectedVoiceChannel,
  currentVoiceChannelName,
  desktopServerPane = "text",
  currentVoiceParticipants,
  activeVoiceParticipantsMap,
  joiningVoiceChannelId,
  remoteScreenShares,
  activeServerUnreadCount,
  hasLocalSharePreview,
  isLocalSharePreviewVisible,
  localSharePreview,
  localSharePreviewMeta,
  localSharePreviewDebugInfo,
  selectedStreamUserId,
  selectedStream,
  selectedStreamParticipant,
  selectedStreamDebugInfo,
  channelSearchQuery,
  searchIcon,
  user,
  directConversationTargets,
  serverMembers,
  serverRoles,
  textChatNavigationRequest,
  onTextChatNavigationIndexChange,
  onOpenDirectChat,
  onStartDirectCall,
  onOpenLocalSharePreview,
  onPreviewStream,
  onWatchStream,
  onChannelSearchChange,
  onClearChannelSearch,
  onAddServer,
  onCloseSelectedStream,
  onStopCameraShare,
  onStopScreenShare,
  onCloseLocalSharePreview,
  isMicMuted = false,
  isSoundMuted = false,
  isScreenShareActive = false,
  isCameraShareActive = false,
  onToggleMic,
  onToggleSound,
  onOpenTextChat,
  onScreenShareAction,
  onOpenCamera,
  onLeave,
  onJoinVoiceChannel,
  onCreateForumPost,
  onAddForumReply,
  getChannelDisplayName,
}) {
  const isVoiceStageVisible = Boolean(activeServer && currentVoiceChannelName && desktopServerPane === "voice");
  const isVoicePreviewVisible = Boolean(activeServer && selectedVoiceChannel && desktopServerPane === "voice" && !isVoiceStageVisible);
  const isJoiningVoiceChannel = Boolean(joiningVoiceChannelId && desktopServerPane === "voice");
  const selectedVoiceRuntimeId = selectedVoiceChannel && activeServer ? `${activeServer.id}::${selectedVoiceChannel.id}` : "";
  const selectedVoiceParticipants = selectedVoiceChannel
    ? (activeVoiceParticipantsMap?.[selectedVoiceChannel.id] || activeVoiceParticipantsMap?.[selectedVoiceRuntimeId] || [])
    : [];
  const shouldShowFloatingStream = Boolean(activeServer && desktopServerPane !== "voice" && (selectedStreamUserId || hasLocalSharePreview));
  const floatingStream = shouldShowFloatingStream && selectedStreamUserId
    ? {
        kind: "remote",
        stream: selectedStream?.stream || null,
        videoSrc: selectedStream?.videoSrc || "",
        imageSrc: selectedStream?.imageSrc || "",
        muted: !Boolean(selectedStream?.hasAudio || selectedStream?.stream?.getAudioTracks?.().length),
        title: selectedStreamParticipant?.name || "Стрим",
        onOpen: () => onWatchStream?.(selectedStreamUserId),
      }
    : shouldShowFloatingStream && hasLocalSharePreview
      ? {
          kind: "local",
          stream: localSharePreview?.stream || null,
          videoSrc: "",
          imageSrc: "",
          muted: true,
          title: localSharePreview?.mode === "camera" ? "Моё видео" : "Мой стрим",
          actionLabel: localSharePreview?.mode === "camera" ? "Остановить камеру" : "Остановить стрим",
          actionVariant: "danger",
          onAction: localSharePreview?.mode === "camera" ? onStopCameraShare : onStopScreenShare,
          onOpen: onOpenLocalSharePreview,
        }
      : null;

  return (
    <main className="chat__wrapper chat__wrapper--servers">
      <div className={`chat__box chat__box--servers ${isVoiceStageVisible ? "chat__box--voice-stage" : ""}`}>
        {activeServer && !isVoiceStageVisible && !isVoicePreviewVisible ? (
          <div className={`chat__topbar ${isVoicePreviewVisible ? "chat__topbar--voice-preview" : ""}`}>
            <div className="chat__topbar-title">
              <div className="chat__topbar-copy">
                <strong>
                  <span>{isVoicePreviewVisible ? selectedVoiceChannel.name : getChannelDisplayName(currentTextChannel?.name || "channel", "text")}</span>
                  {activeServerUnreadCount > 0 ? <span className="chat__topbar-badge">{Math.min(activeServerUnreadCount, 99)}</span> : null}
                </strong>
                <span>{getTextChannelKind(currentTextChannel) === "forum" ? "Форум сервера" : "Текстовый канал сервера"}</span>
              </div>
            </div>
            <div className="chat__topbar-actions">
              {hasLocalSharePreview ? (
                <button type="button" className={`chat__topbar-action ${isLocalSharePreviewVisible ? "chat__topbar-action--active" : ""}`} onClick={onOpenLocalSharePreview}>
                  {localSharePreview?.mode === "camera" ? "Моё видео" : "Мой стрим"}
                </button>
              ) : null}
              <label className="chat__topbar-search-wrap">
                <img src={searchIcon} alt="" />
                <input
                  className="chat__topbar-search"
                  type="text"
                  value={channelSearchQuery}
                  onChange={(event) => onChannelSearchChange(event.target.value)}
                  placeholder={`Искать в ${getChannelDisplayName(currentTextChannel?.name || "канал", "text")}`}
                />
              </label>
            </div>
          </div>
        ) : null}

        {!activeServer ? (
          <div className="server-empty-state">
            <div className="server-empty-state__badge">Серверы</div>
            <h1>У вас пока нет серверов</h1>
            <p>После регистрации список пустой. Создайте свой первый сервер вручную, и здесь появятся каналы и чат.</p>
            <button type="button" className="server-empty-state__button" onClick={onAddServer}>Создать первый сервер</button>
          </div>
        ) : isVoiceStageVisible ? (
          <Suspense fallback={<VoiceStageModuleFallback channelName={currentVoiceChannelName} />}>
          <VoiceRoomStage
            activeServerName={activeServer?.name || "Сервер"}
            channelName={currentVoiceChannelName}
            participants={currentVoiceParticipants}
            isJoining={isJoiningVoiceChannel}
            pendingParticipant={user ? { name: user.nickname || user.firstName || user.first_name || user.email || "Вы", avatar: user.avatarUrl || user.avatar || "" } : null}
            remoteShares={remoteScreenShares}
            selectedStreamUserId={selectedStreamUserId}
            selectedStream={selectedStream}
            selectedStreamParticipant={selectedStreamParticipant}
            hasLocalSharePreview={hasLocalSharePreview}
            isLocalSharePreviewVisible={isLocalSharePreviewVisible}
            localSharePreview={localSharePreview}
            onPreviewStream={onPreviewStream}
            onWatchStream={onWatchStream}
            onOpenLocalSharePreview={onOpenLocalSharePreview}
            onCloseSelectedStream={onCloseSelectedStream}
            onCloseLocalSharePreview={onCloseLocalSharePreview}
            onStopScreenShare={onStopScreenShare}
            onStopCameraShare={onStopCameraShare}
            isMicMuted={isMicMuted}
            isSoundMuted={isSoundMuted}
            isScreenShareActive={isScreenShareActive}
            isCameraShareActive={isCameraShareActive}
            onToggleMic={onToggleMic}
            onToggleSound={onToggleSound}
            onOpenTextChat={onOpenTextChat}
            onScreenShareAction={onScreenShareAction}
            onOpenCamera={onOpenCamera}
            onLeave={onLeave}
          />
          </Suspense>
        ) : desktopServerPane === "voice" && selectedStreamUserId ? (
          <ScreenShareViewer
            stream={selectedStream?.stream || null}
            videoSrc={selectedStream?.videoSrc || ""}
            imageSrc={selectedStream?.imageSrc || ""}
            muted={!Boolean(selectedStream?.hasAudio || selectedStream?.stream?.getAudioTracks?.().length)}
            hasAudio={Boolean(selectedStream?.hasAudio || selectedStream?.stream?.getAudioTracks?.().length)}
            title={`Трансляция ${selectedStreamParticipant?.name || "участника"}`}
            subtitle="Просмотр видеопотока участника"
            onClose={onCloseSelectedStream}
            debugInfo={selectedStreamDebugInfo}
          />
        ) : desktopServerPane === "voice" && isLocalSharePreviewVisible && hasLocalSharePreview ? (
          <ScreenShareViewer
            stream={localSharePreview?.stream || null}
            title={localSharePreviewMeta.title}
            subtitle={localSharePreviewMeta.subtitle}
            onAction={localSharePreview?.mode === "camera" ? onStopCameraShare : onStopScreenShare}
            actionLabel={localSharePreview?.mode === "camera" ? "Остановить камеру" : "Остановить стрим"}
            actionVariant="danger"
            onClose={onCloseLocalSharePreview}
            debugInfo={localSharePreviewDebugInfo}
          />
        ) : isVoicePreviewVisible ? (
          <VoiceChannelPreview
            channel={selectedVoiceChannel}
            participants={selectedVoiceParticipants}
            isJoining={isJoiningVoiceChannel}
            onJoin={onJoinVoiceChannel}
          />
        ) : getTextChannelKind(currentTextChannel) === "forum" ? (
          <ForumChannelView
            channel={currentTextChannel}
            onCreatePost={onCreateForumPost}
            onAddReply={onAddForumReply}
          />
        ) : (
          currentTextChannel ? (
            <TextChat
              serverId={activeServer?.id}
              channelId={currentTextChannel.id}
              channelSlowMode={currentTextChannel?.slowMode || "off"}
              user={user}
              searchQuery={channelSearchQuery}
              onClearSearchQuery={onClearChannelSearch}
              directTargets={directConversationTargets}
              serverMembers={serverMembers}
              serverRoles={serverRoles}
              navigationRequest={textChatNavigationRequest}
              onNavigationIndexChange={onTextChatNavigationIndexChange}
              onOpenDirectChat={onOpenDirectChat}
              onStartDirectCall={onStartDirectCall}
            />
          ) : null
        )}
      </div>
      {floatingStream ? (
        <StreamMiniPlayer
          stream={floatingStream.stream}
          videoSrc={floatingStream.videoSrc}
          imageSrc={floatingStream.imageSrc}
          muted={floatingStream.muted}
          title={floatingStream.title}
          actionLabel={floatingStream.actionLabel}
          actionVariant={floatingStream.actionVariant}
          onAction={floatingStream.onAction}
          onOpen={floatingStream.onOpen}
        />
      ) : null}
    </main>
  );
}

function areServerMainPropsEqual(previousProps, nextProps) {
  return previousProps.activeServer === nextProps.activeServer
    && previousProps.currentTextChannel === nextProps.currentTextChannel
    && previousProps.selectedVoiceChannel === nextProps.selectedVoiceChannel
    && previousProps.currentVoiceChannelName === nextProps.currentVoiceChannelName
    && previousProps.desktopServerPane === nextProps.desktopServerPane
    && areUserLikeEntriesEqual(previousProps.currentVoiceParticipants, nextProps.currentVoiceParticipants)
    && previousProps.activeVoiceParticipantsMap === nextProps.activeVoiceParticipantsMap
    && previousProps.joiningVoiceChannelId === nextProps.joiningVoiceChannelId
    && areRemoteSharesEqual(previousProps.remoteScreenShares, nextProps.remoteScreenShares)
    && previousProps.activeServerUnreadCount === nextProps.activeServerUnreadCount
    && previousProps.hasLocalSharePreview === nextProps.hasLocalSharePreview
    && previousProps.isLocalSharePreviewVisible === nextProps.isLocalSharePreviewVisible
    && previousProps.localSharePreview === nextProps.localSharePreview
    && previousProps.localSharePreviewMeta === nextProps.localSharePreviewMeta
    && previousProps.localSharePreviewDebugInfo === nextProps.localSharePreviewDebugInfo
    && previousProps.selectedStreamUserId === nextProps.selectedStreamUserId
    && previousProps.selectedStream === nextProps.selectedStream
    && previousProps.selectedStreamParticipant === nextProps.selectedStreamParticipant
    && previousProps.selectedStreamDebugInfo === nextProps.selectedStreamDebugInfo
    && previousProps.channelSearchQuery === nextProps.channelSearchQuery
    && previousProps.searchIcon === nextProps.searchIcon
    && previousProps.user === nextProps.user
    && areUserLikeEntriesEqual(previousProps.directConversationTargets, nextProps.directConversationTargets)
    && areUserLikeEntriesEqual(previousProps.serverMembers, nextProps.serverMembers)
    && areRoleEntriesEqual(previousProps.serverRoles, nextProps.serverRoles)
    && areNavigationRequestsEqual(previousProps.textChatNavigationRequest, nextProps.textChatNavigationRequest)
    && previousProps.onTextChatNavigationIndexChange === nextProps.onTextChatNavigationIndexChange
    && previousProps.onOpenDirectChat === nextProps.onOpenDirectChat
    && previousProps.onStartDirectCall === nextProps.onStartDirectCall
    && previousProps.onOpenLocalSharePreview === nextProps.onOpenLocalSharePreview
    && previousProps.onPreviewStream === nextProps.onPreviewStream
    && previousProps.onWatchStream === nextProps.onWatchStream
    && previousProps.onChannelSearchChange === nextProps.onChannelSearchChange
    && previousProps.onAddServer === nextProps.onAddServer
    && previousProps.onCloseSelectedStream === nextProps.onCloseSelectedStream
    && previousProps.onStopCameraShare === nextProps.onStopCameraShare
    && previousProps.onStopScreenShare === nextProps.onStopScreenShare
    && previousProps.onCloseLocalSharePreview === nextProps.onCloseLocalSharePreview
    && previousProps.isMicMuted === nextProps.isMicMuted
    && previousProps.isSoundMuted === nextProps.isSoundMuted
    && previousProps.isScreenShareActive === nextProps.isScreenShareActive
    && previousProps.isCameraShareActive === nextProps.isCameraShareActive
    && previousProps.onToggleMic === nextProps.onToggleMic
    && previousProps.onToggleSound === nextProps.onToggleSound
    && previousProps.onOpenTextChat === nextProps.onOpenTextChat
    && previousProps.onScreenShareAction === nextProps.onScreenShareAction
    && previousProps.onOpenCamera === nextProps.onOpenCamera
    && previousProps.onLeave === nextProps.onLeave
    && previousProps.onJoinVoiceChannel === nextProps.onJoinVoiceChannel
    && previousProps.onCreateForumPost === nextProps.onCreateForumPost
    && previousProps.onAddForumReply === nextProps.onAddForumReply
    && previousProps.getChannelDisplayName === nextProps.getChannelDisplayName;
}

export const ServerMain = memo(ServerMainComponent, areServerMainPropsEqual);

ServersSidebar.displayName = "ServersSidebar";
ServerMain.displayName = "ServerMain";

function getServerVoiceActivityIds(servers = [], participantsMap = {}) {
  const activeIds = new Set();
  servers.forEach((server) => {
    const hasActiveVoice = (server?.voiceChannels || []).some((channel) => {
      const scopedChannelId = `${server.id}::${channel.id}`;
      const participants = participantsMap?.[scopedChannelId] || participantsMap?.[channel.id] || [];
      return Array.isArray(participants) && participants.length > 0;
    });

    if (hasActiveVoice) {
      activeIds.add(String(server.id || ""));
    }
  });
  return activeIds;
}

function ServerVoiceBadge() {
  return (
    <span className="btn__server-voice-badge" aria-hidden="true">
      <svg viewBox="0 0 24 24" focusable="false">
        <path d="M12 14.5C14 14.5 15.25 13.05 15.25 11.25V6.75C15.25 4.95 14 3.5 12 3.5C10 3.5 8.75 4.95 8.75 6.75V11.25C8.75 13.05 10 14.5 12 14.5Z" />
        <path d="M5.75 10.75C5.75 14.2 8.25 16.75 12 16.75C15.75 16.75 18.25 14.2 18.25 10.75" />
        <path d="M12 16.75V20.5" />
      </svg>
    </span>
  );
}

export const DesktopServerRail = ({
  servers,
  workspaceMode,
  activeServer,
  activeDirectCall = null,
  participantsMap = {},
  defaultServerIcon,
  smsIcon,
  onOpenFriendsWorkspace,
  onOpenDirectCallChat,
  onServerShortcutClick,
  onServerContextMenu,
  onServerPointerDown,
  onServerPointerUp,
  onServerPointerCancel,
  onAddServer,
  getServerIconFrame,
}) => {
  const [serverTooltip, setServerTooltip] = useState(null);
  const serverVoiceActivityIds = useMemo(
    () => getServerVoiceActivityIds(servers, participantsMap),
    [participantsMap, servers]
  );

  const showServerTooltip = (event, server) => {
    const rect = event.currentTarget.getBoundingClientRect();
    setServerTooltip({
      name: server?.name || "Без названия",
      left: rect.right + 12,
      top: rect.top + rect.height / 2,
    });
  };
  const hideServerTooltip = () => setServerTooltip(null);

  return (
  <aside className="sidebar__servers">
    <button type="button" className={`workspace-switch ${workspaceMode === "friends" ? "workspace-switch--active" : ""}`} onClick={onOpenFriendsWorkspace} aria-label="Друзья">
      <img src={smsIcon} alt="" />
      <span>Друзья</span>
    </button>
    {activeDirectCall ? (
      <button
        type="button"
        className="btn__direct-call"
        onClick={() => onOpenDirectCallChat?.(activeDirectCall.peerUserId)}
        aria-label={`Открыть звонок с ${activeDirectCall.peerName || "пользователем"}`}
        title={activeDirectCall.peerName ? `${activeDirectCall.peerName}: ${activeDirectCall.statusLabel || "Идет звонок"}` : "Личный звонок"}
      >
        <span className="btn__direct-call-icon" aria-hidden="true" />
      </button>
    ) : null}
    <div className="sidebar__servers-list" onScroll={hideServerTooltip}>
      {servers.map((server) => {
        const hasVoiceActivity = serverVoiceActivityIds.has(String(server.id || ""));

        return (
        <button
        key={server.id}
        type="button"
        className={`btn__server ${workspaceMode === "servers" && server.id === activeServer?.id ? "btn__server--active" : ""} ${hasVoiceActivity ? "btn__server--voice-active" : ""}`}
        onClick={onServerShortcutClick(server)}
        onContextMenu={(event) => onServerContextMenu(event, server)}
        onPointerDown={(event) => onServerPointerDown(event, server)}
        onPointerUp={onServerPointerUp}
        onPointerLeave={onServerPointerCancel}
        onPointerCancel={onServerPointerCancel}
        onMouseEnter={(event) => showServerTooltip(event, server)}
        onMouseLeave={hideServerTooltip}
        onFocus={(event) => showServerTooltip(event, server)}
        onBlur={hideServerTooltip}
        aria-label={server.name || "Без названия"}
      >
        {server.icon ? (
          <AnimatedAvatar
            className="btn__server-media"
            src={server.icon}
            fallback={defaultServerIcon}
            alt={server.name || "Без названия"}
            frame={getServerIconFrame(server)}
            loading="eager"
            decoding="sync"
          />
        ) : (
          <span className="btn__server-empty" aria-hidden="true" />
        )}
          {hasVoiceActivity ? <ServerVoiceBadge /> : null}
          <span className="btn__server-tooltip" role="tooltip">{server.name || "Без названия"}</span>
        </button>
        );
      })}
      <button type="button" className="btn__create-server" aria-label="Создать сервер" onClick={onAddServer}>+</button>
    </div>
    {serverTooltip ? (
      <div className="server-rail-tooltip" style={{ left: serverTooltip.left, top: serverTooltip.top }}>
        {serverTooltip.name}
      </div>
    ) : null}
  </aside>
  );
};

export const MobileServerStrip = ({
  servers,
  workspaceMode,
  activeServer,
  participantsMap = {},
  defaultServerIcon,
  onServerShortcutClick,
  onServerPointerDown,
  onServerPointerUp,
  onServerPointerCancel,
  onAddServer,
  getServerIconFrame,
}) => {
  const serverVoiceActivityIds = useMemo(
    () => getServerVoiceActivityIds(servers, participantsMap),
    [participantsMap, servers]
  );

  return (
  <div className="mobile-server-strip">
    <div className="mobile-server-strip__scroller">
      {servers.map((server) => {
        const hasVoiceActivity = serverVoiceActivityIds.has(String(server.id || ""));

        return (
        <button
          key={server.id}
          type="button"
          className={`btn__server ${workspaceMode === "servers" && server.id === activeServer?.id ? "btn__server--active" : ""} ${hasVoiceActivity ? "btn__server--voice-active" : ""}`}
          onClick={onServerShortcutClick(server)}
          onPointerDown={(event) => onServerPointerDown(event, server)}
          onPointerUp={onServerPointerUp}
          onPointerLeave={onServerPointerCancel}
          onPointerCancel={onServerPointerCancel}
          aria-label={server.name || "Без названия"}
        >
          {server.icon ? (
            <AnimatedAvatar
              className="btn__server-media"
              src={server.icon}
              fallback={defaultServerIcon}
              alt={server.name || "Без названия"}
              frame={getServerIconFrame(server)}
              loading="eager"
              decoding="sync"
            />
          ) : (
            <span className="btn__server-empty" aria-hidden="true" />
          )}
          {hasVoiceActivity ? <ServerVoiceBadge /> : null}
        </button>
        );
      })}
      <button type="button" className="btn__create-server btn__create-server--mobile" aria-label="Создать сервер" onClick={onAddServer}>+</button>
    </div>
  </div>
  );
};

export const MobileDirectChat = ({
  currentDirectFriend,
  currentDirectChannelId,
  textChatLocalStateVersion = 0,
  user,
  directConversationTargets,
  getDisplayName,
  textChatNavigationRequest,
  onTextChatNavigationIndexChange,
  onClearChannelSearch,
  onStartDirectCall,
}) => (
  <main className="chat__wrapper chat__wrapper--friends chat__wrapper--mobile-direct">
    <div className="chat__box chat__box--servers">
      <div className="chat__topbar chat__topbar--mobile-direct">
        <div className="chat__topbar-title">
          <div className="chat__topbar-copy">
            <strong className={isUserCurrentlyOnline(currentDirectFriend) ? "chat__topbar-copy-name--online" : ""}>{getDisplayName(currentDirectFriend)}</strong>
            <span>{formatUserPresenceStatus(currentDirectFriend)}</span>
          </div>
        </div>
      </div>
      <TextChat
        resolvedChannelId={currentDirectChannelId}
        localMessageStateVersion={textChatLocalStateVersion}
        user={user}
        onClearSearchQuery={onClearChannelSearch}
        directTargets={directConversationTargets}
        navigationRequest={textChatNavigationRequest}
        onNavigationIndexChange={onTextChatNavigationIndexChange}
        onStartDirectCall={onStartDirectCall}
      />
    </div>
  </main>
);
