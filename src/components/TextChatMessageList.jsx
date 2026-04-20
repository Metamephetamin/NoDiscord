import { memo, useCallback, useEffect, useMemo, useState } from "react";
import AnimatedEmojiGlyph from "./AnimatedEmojiGlyph";
import AnimatedAvatar from "./AnimatedAvatar";
import VoiceMessageBubble from "./VoiceMessageBubble";
import useMobileLongPress from "../hooks/useMobileLongPress";
import { API_BASE_URL } from "../config/runtime";
import { authFetch, getApiErrorMessage, parseApiResponse } from "../utils/auth";
import { segmentMessageTextByMentions } from "../utils/messageMentions";
import { DEFAULT_SERVER_ICON, resolveMediaUrl, resolveOptimizedMediaUrl } from "../utils/media";
import { resolvePollTheme } from "../utils/pollMessages";
import { extractInviteCode, getInviteRoute } from "../utils/serverInviteLinks";
import { formatFileSize, formatTime } from "../utils/textChatHelpers";
import {
  getAttachmentCacheKey,
  getMessagePoll,
  getUserName,
  isVoiceMessage,
  normalizeAttachmentItems,
  normalizeReactions,
  resolveAnimatedEmojiFallbackGlyph,
} from "../utils/textChatModel";
import { normalizeVoiceMessageMetadata } from "../utils/voiceMessages";
import { parseMediaFrame } from "../utils/mediaFrames";
import { recordPerfEvent } from "../utils/perf";

const URL_PATTERN = /(?:https?:\/\/|www\.)[^\s<]+[^\s<.,:;"')\]]/gi;
const invitePreviewCache = new Map();
const TEXT_CHAT_STATIC_EMOJI_IN_FEED = true;

function getMessageRenderId(messageItem) {
  return String(messageItem?.id || messageItem?.clientId || messageItem?.localId || "");
}

const getPreviewableMediaItems = (messageItem, attachments) =>
  attachments
    .filter((attachmentItem) => attachmentItem.attachmentUrl && (attachmentItem.isImage || attachmentItem.isVideo))
    .map((attachmentItem) => ({
      type: attachmentItem.isImage ? "image" : "video",
      url: attachmentItem.attachmentUrl,
      name: attachmentItem.attachmentName || (attachmentItem.isImage ? "Изображение" : "Видео"),
      contentType: attachmentItem.attachmentContentType || "",
      messageId: String(messageItem?.id || ""),
      attachmentIndex: Number(attachmentItem.attachmentIndex) || 0,
      attachmentEncryption: attachmentItem.attachmentEncryption || null,
      sourceUrl: attachmentItem.attachmentSourceUrl || attachmentItem.attachmentUrl,
    }));

const DOCUMENT_IMAGE_EXTENSION_PATTERN = /\.(?:avif|gif|heic|heif|jpe?g|png|webp)(?:[?#].*)?$/i;
const DOCUMENT_VIDEO_EXTENSION_PATTERN = /\.(?:m4v|mov|mp4|ogv|webm)(?:[?#].*)?$/i;
const PRIORITY_MEDIA_MESSAGE_COUNT = 0;
const MEDIA_PREFETCH_MESSAGE_BUFFER = 4;
const MEDIA_PREFETCH_IMAGE_LIMIT = 4;
const EMOJI_ONLY_MESSAGE_PATTERN = /^(?:(?:\p{Extended_Pictographic}|\p{Emoji_Presentation}|\u200d|\ufe0f|\s))+$/u;
const prefetchedFeedImageUrls = new Set();

function isPrefetchableFeedImage(attachmentItem) {
  const contentType = String(attachmentItem?.attachmentContentType || "").toLowerCase();
  if (contentType.startsWith("image/")) {
    return true;
  }

  return isImageLikeDocumentAttachment(attachmentItem);
}

function preloadFeedImageUrl(url) {
  const normalizedUrl = String(url || "").trim();
  if (!normalizedUrl || prefetchedFeedImageUrls.has(normalizedUrl)) {
    return;
  }

  prefetchedFeedImageUrls.add(normalizedUrl);
  const image = new Image();
  image.decoding = "async";
  image.fetchPriority = "low";
  image.src = normalizedUrl;
}

function isImageLikeDocumentAttachment(attachmentItem) {
  const contentType = String(attachmentItem?.attachmentContentType || "").toLowerCase();
  if (contentType.startsWith("image/")) {
    return true;
  }

  const attachmentName = String(attachmentItem?.attachmentName || "");
  const attachmentUrl = String(attachmentItem?.attachmentSourceUrl || attachmentItem?.attachmentUrl || "");
  return DOCUMENT_IMAGE_EXTENSION_PATTERN.test(attachmentName) || DOCUMENT_IMAGE_EXTENSION_PATTERN.test(attachmentUrl);
}

function isVideoLikeAttachment(attachmentItem) {
  const contentType = String(attachmentItem?.attachmentContentType || "").toLowerCase();
  if (contentType.startsWith("video/")) {
    return true;
  }

  const attachmentName = String(attachmentItem?.attachmentName || "");
  const attachmentUrl = String(attachmentItem?.attachmentSourceUrl || attachmentItem?.attachmentUrl || "");
  return DOCUMENT_VIDEO_EXTENSION_PATTERN.test(attachmentName) || DOCUMENT_VIDEO_EXTENSION_PATTERN.test(attachmentUrl);
}

function normalizeRoleName(role) {
  return String(role?.name || role?.Name || role?.roleName || role?.role_name || "").trim().toLowerCase();
}

function getRoleColorValue(role) {
  return String(role?.color || role?.Color || role?.roleColor || role?.role_color || "").trim();
}

function isDefaultMemberRole(role) {
  const normalizedRoleName = normalizeRoleName(role);
  return !normalizedRoleName || normalizedRoleName === "member";
}

function normalizeTextLinkHref(value) {
  const rawValue = String(value || "").trim();
  if (!rawValue) {
    return "";
  }

  const inviteCode = extractInviteCode(rawValue);
  if (inviteCode) {
    return getInviteRoute(inviteCode);
  }

  return /^https?:\/\//i.test(rawValue) ? rawValue : `https://${rawValue}`;
}

function getEmojiOnlyMessageMeta(value) {
  const normalizedValue = String(value || "").trim();
  if (!normalizedValue || normalizedValue.length > 16 || !EMOJI_ONLY_MESSAGE_PATTERN.test(normalizedValue)) {
    return { isEmojiOnly: false, count: 0 };
  }

  const emojiMatches = normalizedValue.match(/[\p{Extended_Pictographic}\p{Emoji_Presentation}]/gu) || [];
  return {
    isEmojiOnly: emojiMatches.length > 0,
    count: emojiMatches.length,
  };
}

function EditedBadge({ message }) {
  if (!message?.editedAt) {
    return null;
  }

  return (
    <span className="message-edited-badge" title="Сообщение было отредактировано">
      <span className="message-edited-badge__icon" aria-hidden="true">✎</span>
      <span className="message-edited-badge__label">ред.</span>
    </span>
  );
}

function MessageTimestamp({ messageItem }) {
  return (
    <span className={`message-time ${messageItem?.isLocalEcho ? "message-time--pending" : ""}`}>
      {messageItem?.isLocalEcho ? "Отправка..." : formatTime(messageItem.timestamp)}
    </span>
  );
}

function getLocalEchoUploadStatusLabel(status) {
  const normalizedStatus = String(status || "uploading").trim();
  if (normalizedStatus === "pending") {
    return "Ожидание";
  }
  if (normalizedStatus === "preparing") {
    return "Подготовка";
  }
  if (normalizedStatus === "processing") {
    return "Обработка";
  }
  if (normalizedStatus === "sent") {
    return "Отправлено";
  }
  if (normalizedStatus === "failed") {
    return "Ошибка";
  }
  if (normalizedStatus === "canceled") {
    return "Отменено";
  }

  return "Загрузка";
}

function LocalEchoMediaOverlay({ attachmentItem, onCancel, onRetry, onRemove }) {
  const normalizedProgress = Math.max(0, Math.min(100, Math.round(Number(attachmentItem?.localEchoProgress) || 0)));
  const normalizedStatus = String(attachmentItem?.localEchoStatus || "uploading").trim();
  const attachmentSize = Math.max(0, Number(attachmentItem?.attachmentSize) || 0);
  const uploadedBytes = Math.max(
    0,
    Number(attachmentItem?.localEchoUploadedBytes) || (
      attachmentSize > 0 ? Math.min(attachmentSize, Math.round((attachmentSize * normalizedProgress) / 100)) : 0
    )
  );
  const isTerminalFailureState = normalizedStatus === "failed" || normalizedStatus === "canceled";
  const resolvedStatusLabel = getLocalEchoUploadStatusLabel(normalizedStatus);
  const progressLabel = attachmentSize > 0
    ? `${formatFileSize(uploadedBytes)} / ${formatFileSize(attachmentSize)}`
    : `${normalizedProgress}%`;

  return (
    <span className="message-media__upload-overlay">
      <span className="message-media__upload-progress-chip">
        {isTerminalFailureState ? (attachmentItem?.localEchoError || resolvedStatusLabel) : progressLabel}
      </span>
      {isTerminalFailureState ? (
        <span className="message-media__upload-actions">
          <span
            className="message-media__upload-cancel"
            role="button"
            tabIndex={0}
            aria-label="Повторить загрузку"
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              onRetry?.();
            }}
            onKeyDown={(event) => {
              if (event.key !== "Enter" && event.key !== " ") {
                return;
              }

              event.preventDefault();
              event.stopPropagation();
              onRetry?.();
            }}
          >
            ↻
          </span>
          <span
            className="message-media__upload-cancel"
            role="button"
            tabIndex={0}
            aria-label="Убрать загрузку"
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              onRemove?.();
            }}
            onKeyDown={(event) => {
              if (event.key !== "Enter" && event.key !== " ") {
                return;
              }

              event.preventDefault();
              event.stopPropagation();
              onRemove?.();
            }}
          >
            <span className="message-media__upload-cancel-icon" aria-hidden="true" />
          </span>
        </span>
      ) : normalizedStatus === "sent" ? null : (
        <span
          className="message-media__upload-cancel"
          role="button"
          tabIndex={0}
          aria-label="Отменить загрузку"
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            onCancel?.();
          }}
          onKeyDown={(event) => {
            if (event.key !== "Enter" && event.key !== " ") {
              return;
            }

            event.preventDefault();
            event.stopPropagation();
            onCancel?.();
          }}
        >
          <span className="message-media__upload-cancel-icon" aria-hidden="true" />
        </span>
      )}
      <span className="message-media__upload-footer">
        <span className="message-media__upload-status">{resolvedStatusLabel}</span>
        <span className="message-media__upload-progress-value">{normalizedProgress}%</span>
      </span>
    </span>
  );
}

function LocalEchoDocumentMeta({ attachmentItem, onCancel, onRetry, onRemove }) {
  const normalizedStatus = String(attachmentItem?.localEchoStatus || "pending").trim();
  const normalizedProgress = Math.max(0, Math.min(100, Math.round(Number(attachmentItem?.localEchoProgress) || 0)));
  const totalBytes = Math.max(0, Number(attachmentItem?.localEchoTotalBytes || attachmentItem?.attachmentSize) || 0);
  const uploadedBytes = Math.max(
    0,
    Number(attachmentItem?.localEchoUploadedBytes) || (
      totalBytes > 0 ? Math.round((totalBytes * normalizedProgress) / 100) : 0
    )
  );
  const isTerminalFailureState = normalizedStatus === "failed" || normalizedStatus === "canceled";
  const statusLabel = getLocalEchoUploadStatusLabel(normalizedStatus);
  const progressLabel = totalBytes > 0
    ? `${formatFileSize(uploadedBytes)} / ${formatFileSize(totalBytes)}`
    : `${normalizedProgress}%`;

  return (
    <>
      <span className="message-attachment__size">
        {isTerminalFailureState ? (attachmentItem?.localEchoError || statusLabel) : progressLabel}
      </span>
      <span className="message-attachment__open-with">{statusLabel}</span>
      <span className="message-attachment__local-echo-actions">
        {isTerminalFailureState ? (
          <button type="button" className="message-attachment__local-echo-action" onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            onRetry?.();
          }}>
            Повторить
          </button>
        ) : normalizedStatus === "sent" ? null : (
          <button type="button" className="message-attachment__local-echo-action" onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            onCancel?.();
          }}>
            Отмена
          </button>
        )}
        <button type="button" className="message-attachment__local-echo-action" onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          onRemove?.();
        }}>
          Убрать
        </button>
      </span>
    </>
  );
}

const MESSAGE_MEDIA_FALLBACK_SIZE = 1024;

const MessageMediaImage = memo(function MessageMediaImage({
  attachmentItem,
  alt = "image",
  className = "message-media__image",
  priorityMedia = false,
}) {
  const directSourceUrl = String(attachmentItem?.attachmentUrl || "").trim();
  const sourceCandidates = useMemo(() => {
    const sourceUrl = String(attachmentItem?.attachmentSourceUrl || attachmentItem?.attachmentUrl || "").trim();
    const candidates = [];
    const isLocalPreview = /^(?:blob:|data:|file:)/i.test(directSourceUrl);

    if (sourceUrl && !isLocalPreview) {
      const optimizedUrl = resolveOptimizedMediaUrl(sourceUrl, {
        width: MESSAGE_MEDIA_FALLBACK_SIZE,
        height: MESSAGE_MEDIA_FALLBACK_SIZE,
        fit: "contain",
        animated: true,
      });
      if (optimizedUrl && optimizedUrl !== sourceUrl && optimizedUrl !== directSourceUrl) {
        candidates.push(optimizedUrl);
      }
    }

    if (directSourceUrl) {
      candidates.push(directSourceUrl);
    }

    if (!candidates.length && sourceUrl) {
      candidates.push(sourceUrl);
    }

    return Array.from(new Set(candidates));
  }, [attachmentItem?.attachmentSourceUrl, attachmentItem?.attachmentUrl, directSourceUrl]);
  const [sourceIndex, setSourceIndex] = useState(0);
  const [isUnavailable, setIsUnavailable] = useState(false);
  const resolvedSourceUrl = sourceCandidates[sourceIndex] || "";

  const handleError = useCallback(() => {
    if (sourceIndex < sourceCandidates.length - 1) {
      setSourceIndex((currentIndex) => Math.min(currentIndex + 1, sourceCandidates.length - 1));
      return;
    }

    setIsUnavailable(true);
  }, [sourceCandidates.length, sourceIndex]);

  if (!resolvedSourceUrl || isUnavailable) {
    return (
      <span className="message-media__fallback" aria-label="Изображение недоступно">
        Не удалось загрузить фото
      </span>
    );
  }

  return (
    <img
      className={className}
      src={resolvedSourceUrl}
      alt={alt}
      loading={priorityMedia ? "eager" : "lazy"}
      decoding="async"
      fetchPriority={priorityMedia ? "auto" : "low"}
      draggable={false}
      onError={handleError}
    />
  );
});

function MessageMediaOverlayFooter({ messageItem, isOwnMessage }) {
  return (
    <div className={`message-footer message-media-overlay-footer ${isOwnMessage ? "message-footer--own" : ""}`}>
      <MessageTimestamp messageItem={messageItem} />
      <EditedBadge message={messageItem} />
      {isOwnMessage && !messageItem?.isLocalEcho ? (
        <span className={`message-read-status ${messageItem.isRead ? "message-read-status--read" : ""}`}>
          <span className="message-read-status__check" />
          <span className="message-read-status__check" />
        </span>
      ) : null}
    </div>
  );
}

const MessageText = memo(function MessageText({ text, mentions, currentUserId }) {
  return segmentMessageTextByMentions(text, mentions).map((segment, index) => {
    if (segment.isMention) {
      const isSelfUserMention = String(segment.type || "") !== "role" && String(segment.userId || "") === currentUserId;
      const roleMentionStyle = segment.color
        ? { color: segment.color, background: `${segment.color}22` }
        : undefined;
      return (
        <span
          key={`mention-${index}-${segment.roleId || segment.userId || segment.text}`}
          className={`message-text__mention ${isSelfUserMention ? "message-text__mention--self" : ""} ${segment.type === "role" ? "message-text__mention--role" : ""}`}
          style={roleMentionStyle}
          title={segment.displayName || segment.text}
        >
          {segment.text}
        </span>
      );
    }

    const parts = String(segment.text || "").split(URL_PATTERN);
    const matches = String(segment.text || "").match(URL_PATTERN) || [];

    return (
      <span key={`text-${index}`}>
        {parts.map((part, partIndex) => {
          const urlMatch = matches[partIndex];
          const items = [];

          if (part) {
            items.push(<span key={`copy-${index}-${partIndex}`}>{part}</span>);
          }

          if (urlMatch) {
            items.push(
              <a
                key={`url-${index}-${partIndex}`}
                className="message-text__link"
                href={normalizeTextLinkHref(urlMatch)}
                target={extractInviteCode(urlMatch) ? undefined : "_blank"}
                rel={extractInviteCode(urlMatch) ? undefined : "noreferrer"}
                onClick={(event) => event.stopPropagation()}
              >
                {urlMatch}
              </a>
            );
          }

          return items;
        })}
      </span>
    );
  });
});

MessageText.displayName = "MessageText";

function MessagePollCard({ poll }) {
  const pollResetKey = JSON.stringify({
    question: String(poll?.question || ""),
    themeId: String(poll?.themeId || ""),
    totalVoters: Math.max(0, Number(poll?.totalVoters) || 0),
    options: Array.isArray(poll?.options)
      ? poll.options.map((option) => ({
        id: String(option?.id || ""),
        text: String(option?.text || ""),
      }))
      : [],
    votes: poll?.votes || {},
    settings: poll?.settings || {},
  });

  return <MessagePollCardInner key={pollResetKey} poll={poll} />;
}

function MessagePollCardInner({ poll }) {
  const [selectedOptionIds, setSelectedOptionIds] = useState([]);
  const [submitted, setSubmitted] = useState(false);
  const [addedOptions, setAddedOptions] = useState([]);
  const [localVotes, setLocalVotes] = useState(() => ({ ...(poll?.votes || {}) }));
  const [localTotalVoters, setLocalTotalVoters] = useState(() => Math.max(0, Number(poll?.totalVoters) || 0));
  const [lastSubmittedOptionIds, setLastSubmittedOptionIds] = useState([]);
  const options = [...(Array.isArray(poll?.options) ? poll.options : []), ...addedOptions];
  const pollTheme = useMemo(() => resolvePollTheme(poll?.themeId), [poll?.themeId]);
  const totalVoters = Math.max(
    localTotalVoters,
    Object.values(localVotes).reduce((sum, voteCount) => sum + Math.max(0, Number(voteCount) || 0), 0)
  );

  const toggleOption = (optionId) => {
    if (submitted && !poll?.settings?.allowRevoting) {
      return;
    }

    setSelectedOptionIds((previous) => {
      const normalizedOptionId = String(optionId || "");
      const alreadySelected = previous.includes(normalizedOptionId);

      if (poll?.settings?.allowMultipleAnswers) {
        return alreadySelected
          ? previous.filter((value) => value !== normalizedOptionId)
          : [...previous, normalizedOptionId];
      }

      if (alreadySelected) {
        return [];
      }

      return [normalizedOptionId];
    });
  };

  const handleVote = () => {
    if (!selectedOptionIds.length) {
      return;
    }

    setLocalVotes((previous) => {
      const nextVotes = { ...previous };

      if (submitted && poll?.settings?.allowRevoting && lastSubmittedOptionIds.length) {
        lastSubmittedOptionIds.forEach((optionId) => {
          nextVotes[optionId] = Math.max(0, (Number(nextVotes[optionId]) || 0) - 1);
        });
      } else if (!submitted) {
        setLocalTotalVoters((previousTotal) => previousTotal + 1);
      }

      selectedOptionIds.forEach((optionId) => {
        nextVotes[optionId] = (Number(nextVotes[optionId]) || 0) + 1;
      });

      return nextVotes;
    });

    setLastSubmittedOptionIds([...selectedOptionIds]);
    setSubmitted(true);
  };

  const handleAddOption = () => {
    if (!poll?.settings?.allowAddingOptions || typeof window === "undefined") {
      return;
    }

    const nextOptionText = window.prompt("Новый вариант ответа");
    const normalizedText = String(nextOptionText || "").trim().slice(0, 120);
    if (!normalizedText) {
      return;
    }

    setAddedOptions((previous) => [
      ...previous,
      {
        id: `local-option-${Date.now()}-${previous.length + 1}`,
        text: normalizedText,
      },
    ]);
  };

  return (
    <div
      className="message-poll-card"
      style={{
        "--poll-card-background": pollTheme.cardBackground,
        "--poll-card-shadow": pollTheme.cardShadow,
        "--poll-card-badge": pollTheme.badgeColor,
        "--poll-card-track": pollTheme.trackColor,
        "--poll-card-fill": pollTheme.fillColor,
        "--poll-card-selected-ring": pollTheme.selectedRing,
      }}
    >
      <div className="message-poll-card__header">
        <strong>{poll?.question || "Опрос"}</strong>
        <span className="message-poll-card__badge">Опрос</span>
      </div>

      <div className="message-poll-card__options">
        {options.map((option) => {
          const optionId = String(option?.id || "");
          const isSelected = selectedOptionIds.includes(optionId);
          const voteCount = Math.max(0, Number(localVotes[optionId]) || 0);
          const percent = totalVoters > 0 ? Math.round((voteCount / totalVoters) * 100) : 0;

          return (
            <button
              key={optionId}
              type="button"
              className={`message-poll-card__option ${isSelected ? "message-poll-card__option--selected" : ""}`}
              onClick={() => toggleOption(optionId)}
              disabled={submitted && !poll?.settings?.allowRevoting}
            >
              <span className="message-poll-card__option-fill" style={{ width: `${percent}%` }} aria-hidden="true" />
              <span className="message-poll-card__checkbox" aria-hidden="true" />
              <span className="message-poll-card__option-text">{option?.text || "Вариант"}</span>
              <span className="message-poll-card__option-percent">{percent}%</span>
            </button>
          );
        })}
      </div>

      <div className="message-poll-card__footer">
        {poll?.settings?.allowAddingOptions ? (
          <button type="button" className="message-poll-card__add-option" onClick={handleAddOption}>
            Добавить вариант
          </button>
        ) : (
          <span className="message-poll-card__meta">
            {totalVoters > 0
              ? `${totalVoters} ${totalVoters === 1 ? "голос" : totalVoters < 5 ? "голоса" : "голосов"}`
              : poll?.settings?.allowMultipleAnswers
                ? "Можно выбрать несколько вариантов."
                : "Можно выбрать один вариант."}
          </span>
        )}

        <button
          type="button"
          className="message-poll-card__vote"
          onClick={handleVote}
          disabled={!selectedOptionIds.length || (submitted && !poll?.settings?.allowRevoting)}
        >
          {submitted ? (poll?.settings?.allowRevoting ? "Голос обновлён" : "Голос учтён") : "Голосовать"}
        </button>
      </div>
    </div>
  );
}

function MessageInviteCardBase({ inviteCode }) {
  const [preview, setPreview] = useState(null);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!inviteCode) {
      setPreview(null);
      setError("");
      setIsLoading(false);
      return undefined;
    }

    let disposed = false;

    const loadPreview = async () => {
      if (invitePreviewCache.has(inviteCode)) {
        setPreview(invitePreviewCache.get(inviteCode) || null);
        setError("");
        setIsLoading(false);
        return;
      }

      setIsLoading(true);
      setError("");

      try {
        const response = await authFetch(`${API_BASE_URL}/server-invites/${encodeURIComponent(inviteCode)}`, {
          method: "GET",
        });
        const data = await parseApiResponse(response);

        if (!response.ok) {
          throw new Error(getApiErrorMessage(response, data, "Не удалось загрузить приглашение."));
        }

        if (!disposed) {
          invitePreviewCache.set(inviteCode, data || null);
          setPreview(data || null);
        }
      } catch (requestError) {
        if (!disposed) {
          setPreview(null);
          setError(requestError?.message || "Приглашение недоступно.");
        }
      } finally {
        if (!disposed) {
          setIsLoading(false);
        }
      }
    };

    void loadPreview();

    return () => {
      disposed = true;
    };
  }, [inviteCode]);

  const rawServerIconValue = preview?.serverIcon || preview?.server_icon || preview?.iconUrl || preview?.icon_url || preview?.icon || "";
  const serverIconFrame = useMemo(
    () => parseMediaFrame(preview?.serverIconFrame, preview?.server_icon_frame, preview?.iconFrame, preview?.icon_frame),
    [preview?.serverIconFrame, preview?.server_icon_frame, preview?.iconFrame, preview?.icon_frame]
  );
  const inviteHref = getInviteRoute(inviteCode);
  const onlineCount = Number(preview?.onlineMemberCount ?? preview?.onlineCount ?? 0);
  const memberCount = Number(preview?.memberCount || 0);
  const createdAt = preview?.serverCreatedAt || preview?.createdAt || "";
  const foundedAtLabel = createdAt
    ? new Date(createdAt).toLocaleDateString("ru-RU", { month: "long", year: "numeric" })
    : "";

  if (!inviteCode) {
    return null;
  }

  if (isLoading) {
    return (
      <div className="message-invite-card message-invite-card--loading">
        <div className="message-invite-card__header">
          <span className="message-invite-card__badge">Invite</span>
          <span className="message-invite-card__status">Загружаем приглашение…</span>
        </div>
      </div>
    );
  }

  if (error || !preview) {
    return (
      <a className="message-invite-card message-invite-card--error" href={inviteHref} onClick={(event) => event.stopPropagation()}>
        <div className="message-invite-card__header">
          <span className="message-invite-card__badge">Invite</span>
          <span className="message-invite-card__status">{error || "Приглашение недоступно"}</span>
        </div>
        <span className="message-invite-card__button">Открыть приглашение</span>
      </a>
    );
  }

  return (
    <a className="message-invite-card" href={inviteHref} onClick={(event) => event.stopPropagation()}>
      <div className="message-invite-card__header">
        <span className="message-invite-card__badge">Приглашение</span>
        <span className="message-invite-card__status">Код: {preview.inviteCode || inviteCode}</span>
      </div>
      <div className="message-invite-card__body">
        <AnimatedAvatar className="message-invite-card__icon" src={rawServerIconValue} fallback={DEFAULT_SERVER_ICON} alt={preview.serverName || "Сервер"} frame={serverIconFrame} />
        <div className="message-invite-card__copy">
          <strong>{preview.serverName || "Без названия"}</strong>
          <div className="message-invite-card__meta">
            <span className="message-invite-card__meta-dot message-invite-card__meta-dot--online" />
            <span>{onlineCount} в сети</span>
            <span className="message-invite-card__meta-separator">•</span>
            <span>{memberCount} участников</span>
          </div>
          {foundedAtLabel ? <span className="message-invite-card__founded">Дата основания: {foundedAtLabel}</span> : null}
        </div>
      </div>
      <span className="message-invite-card__button">
        {preview.currentUserAlreadyMember ? "Открыть сервер" : "Перейти по приглашению"}
      </span>
    </a>
  );
}

const MessageInviteCard = memo(MessageInviteCardBase);
MessageInviteCard.displayName = "MessageInviteCard";

function areMessagesInSameForwardGroup(currentMessage, adjacentMessage) {
  if (!currentMessage?.forwardedFromUsername || !adjacentMessage?.forwardedFromUsername) {
    return false;
  }

  const sameForwardAuthor =
    String(currentMessage.forwardedFromUserId || "") === String(adjacentMessage.forwardedFromUserId || "")
    && String(currentMessage.forwardedFromUsername || "") === String(adjacentMessage.forwardedFromUsername || "");
  const sameSender =
    String(currentMessage.authorUserId || "") === String(adjacentMessage.authorUserId || "")
    && String(currentMessage.username || "") === String(adjacentMessage.username || "");

  if (!sameForwardAuthor || !sameSender) {
    return false;
  }

  const currentTimestamp = new Date(currentMessage.timestamp || 0).getTime();
  const adjacentTimestamp = new Date(adjacentMessage.timestamp || 0).getTime();
  if (!Number.isFinite(currentTimestamp) || !Number.isFinite(adjacentTimestamp)) {
    return false;
  }

  return Math.abs(currentTimestamp - adjacentTimestamp) <= 10 * 60 * 1000;
}

function isAnimatedEmojiAttachment(messageItem, attachmentItem, galleryAttachments) {
  const messageText = String(messageItem?.message || "").trim();
  const attachmentName = String(attachmentItem?.attachmentName || "").trim().toLowerCase();
  const attachmentContentType = String(attachmentItem?.attachmentContentType || "").trim().toLowerCase();
  const hasSingleVisualAttachment = Array.isArray(galleryAttachments) && galleryAttachments.length === 1;

  if (messageText || !hasSingleVisualAttachment) {
    return false;
  }

  if (!attachmentItem?.attachmentUrl || attachmentItem?.voiceMessage) {
    return false;
  }

  const isGif = attachmentContentType.includes("gif") || attachmentName.endsWith(".gif");
  if (!isGif) {
    return false;
  }

  return attachmentName.startsWith("lf-") || attachmentName.startsWith("emoji-") || attachmentName.startsWith("emoji_");
}

function getNormalizedMessageAttachments(messageItem) {
  return Array.isArray(messageItem?.attachments) && messageItem.attachments.length
    ? messageItem.attachments
    : normalizeAttachmentItems(messageItem);
}

function MessageAttachmentCard({
  messageItem,
  attachmentItem,
  galleryAttachments,
  selectionMode,
  onToggleSelection,
  onOpenMediaPreview,
  onCancelLocalEchoUpload,
  onRetryLocalEchoUpload,
  onRemoveLocalEchoUpload,
  priorityMedia = false,
}) {
  const openAttachmentMediaPreview = () => {
    const type = attachmentItem.isImage ? "image" : "video";
    onOpenMediaPreview(
      type,
      attachmentItem.attachmentUrl,
      attachmentItem.attachmentName,
      attachmentItem.attachmentContentType,
      messageItem.id,
      attachmentItem.attachmentEncryption,
      attachmentItem.attachmentSourceUrl || attachmentItem.attachmentUrl,
      attachmentItem.attachmentIndex,
      getPreviewableMediaItems(messageItem, galleryAttachments)
    );
  };

  const handlePreviewClick = (event) => {
    if (selectionMode) {
      event.preventDefault();
      event.stopPropagation();
      onToggleSelection(messageItem.id);
      return;
    }

    openAttachmentMediaPreview();
  };

  if (attachmentItem.isVoice) {
    return (
      <VoiceMessageBubble
        src={attachmentItem.attachmentUrl}
        pending={!attachmentItem.attachmentUrl}
        waveform={attachmentItem.voiceMessage?.waveform || []}
        durationMs={attachmentItem.voiceMessage?.durationMs || 0}
        fileName={attachmentItem.voiceMessage?.fileName || attachmentItem.attachmentName}
      />
    );
  }

  if (attachmentItem.attachmentUrl) {
    const showLocalEchoOverlay = Boolean(messageItem?.isLocalEcho);

    if (isAnimatedEmojiAttachment(messageItem, attachmentItem, galleryAttachments)) {
      const fallbackGlyph = resolveAnimatedEmojiFallbackGlyph(
        attachmentItem,
        attachmentItem?.attachmentName,
        attachmentItem?.attachmentSourceUrl,
        attachmentItem?.attachmentUrl
      ) || "🙂";
      return (
        <button
          type="button"
          className="message-inline-emoji message-inline-emoji--button"
          onClick={handlePreviewClick}
          aria-label={`Открыть смайлик ${attachmentItem.attachmentName || ""}`.trim()}
        >
          {TEXT_CHAT_STATIC_EMOJI_IN_FEED ? (
            <AnimatedEmojiGlyph
              emoji={{ glyph: fallbackGlyph, assetUrl: attachmentItem.attachmentUrl }}
              className="message-inline-emoji__glyph"
              showAsset={false}
              fallbackText={fallbackGlyph}
            />
          ) : (
            <img className="message-inline-emoji__image" src={attachmentItem.attachmentUrl} alt={attachmentItem.attachmentName || "emoji"} />
          )}
        </button>
      );
    }

    if (attachmentItem.isImage) {
      return (
        <button
          type="button"
          className={`message-media message-media--button ${showLocalEchoOverlay ? "message-media--local-echo" : ""}`}
          onClick={handlePreviewClick}
          aria-label={`Открыть изображение ${attachmentItem.attachmentName || ""}`.trim()}
        >
          <MessageMediaImage
            key={`${attachmentItem.cacheKey || attachmentItem.attachmentIndex || 0}:${attachmentItem.attachmentUrl || attachmentItem.attachmentSourceUrl || ""}`}
            className="message-media__image"
            attachmentItem={attachmentItem}
            alt={attachmentItem.attachmentName || "image"}
            priorityMedia={priorityMedia}
          />
          {showLocalEchoOverlay ? (
            <LocalEchoMediaOverlay
              attachmentItem={attachmentItem}
              onCancel={() => onCancelLocalEchoUpload?.(messageItem?.id)}
              onRetry={() => onRetryLocalEchoUpload?.(messageItem?.id)}
              onRemove={() => onRemoveLocalEchoUpload?.(messageItem?.id)}
            />
          ) : null}
        </button>
      );
    }

    if (attachmentItem.isVideo) {
      return (
        <button
          type="button"
          className={`message-media message-media--video message-media--button ${showLocalEchoOverlay ? "message-media--local-echo" : ""}`}
          onClick={handlePreviewClick}
          aria-label={`Открыть видео ${attachmentItem.attachmentName || ""}`.trim()}
        >
          <video className="message-media__video" src={attachmentItem.attachmentUrl} preload="metadata" playsInline muted />
          {showLocalEchoOverlay ? (
            <LocalEchoMediaOverlay
              attachmentItem={attachmentItem}
              onCancel={() => onCancelLocalEchoUpload?.(messageItem?.id)}
              onRetry={() => onRetryLocalEchoUpload?.(messageItem?.id)}
              onRemove={() => onRemoveLocalEchoUpload?.(messageItem?.id)}
            />
          ) : <span className="message-media__play" aria-hidden="true" />}
        </button>
      );
    }

    const isDocumentAttachment = Boolean(attachmentItem.attachmentAsFile);
    const showDocumentPreview = isDocumentAttachment && isImageLikeDocumentAttachment(attachmentItem);

    return (
      <a
        className={`message-attachment ${isDocumentAttachment ? "message-attachment--document" : ""}`}
        href={attachmentItem.attachmentUrl}
        target="_blank"
        rel="noreferrer"
        onClick={(event) => {
          if (!selectionMode) {
            return;
          }

          event.preventDefault();
          event.stopPropagation();
          onToggleSelection(messageItem.id);
        }}
      >
        {showDocumentPreview ? (
          <span className="message-attachment__preview" aria-hidden="true">
            <img src={attachmentItem.attachmentUrl} alt="" loading="lazy" decoding="async" />
          </span>
        ) : (
          <span className="message-attachment__icon" aria-hidden="true" />
        )}
        <span className="message-attachment__meta">
          <span className="message-attachment__name">{attachmentItem.attachmentName || "Файл"}</span>
          {showLocalEchoOverlay ? (
            <LocalEchoDocumentMeta
              attachmentItem={attachmentItem}
              onCancel={() => onCancelLocalEchoUpload?.(messageItem?.id)}
              onRetry={() => onRetryLocalEchoUpload?.(messageItem?.id)}
              onRemove={() => onRemoveLocalEchoUpload?.(messageItem?.id)}
            />
          ) : (
            <>
              <span className="message-attachment__size">{formatFileSize(attachmentItem.attachmentSize)}</span>
              {isDocumentAttachment ? <span className="message-attachment__open-with">OPEN WITH</span> : null}
            </>
          )}
        </span>
      </a>
    );
  }

  if (!attachmentItem.attachmentEncryption) {
    return null;
  }

  return (
    <div className={`message-attachment ${attachmentItem.attachmentUnavailable ? "message-attachment--unavailable" : "message-attachment--pending"}`}>
      <span className="message-attachment__icon" aria-hidden="true" />
      <span className="message-attachment__meta">
        <span className="message-attachment__name">
          {attachmentItem.attachmentUnavailable ? "Зашифрованное вложение недоступно" : "Зашифрованный файл"}
        </span>
        <span className="message-attachment__size">
          {attachmentItem.attachmentUnavailable ? "На этом устройстве нет ключа для расшифровки" : "Расшифровывается автоматически"}
        </span>
      </span>
    </div>
  );
}

const MessageAttachmentCollection = memo(function MessageAttachmentCollection(props) {
  const {
    messageItem,
    attachments,
    galleryAttachments = attachments,
    mediaOverlayFooter,
    priorityMediaMessageIdSet,
  } = props;
  const isPriorityMediaMessage = priorityMediaMessageIdSet?.has(String(messageItem?.id || ""));
  const attachmentList = Array.isArray(attachments) ? attachments : [];
  const visualAttachments = attachmentList.filter((attachmentItem) => (
    !attachmentItem.attachmentAsFile && (attachmentItem.isVoice || attachmentItem.isImage || attachmentItem.isVideo)
  ));
  const fileAttachments = attachmentList.filter((attachmentItem) => (
    Boolean(attachmentItem.attachmentAsFile) || (!attachmentItem.isVoice && !attachmentItem.isImage && !attachmentItem.isVideo)
  ));
  const featureStackCount = (
    (visualAttachments.length === 3 || visualAttachments.length === 4)
    && !fileAttachments.length
    && visualAttachments.every((attachmentItem) => !attachmentItem.isVoice)
  )
    ? visualAttachments.length
    : 0;
  const useFiveTileLayout = (
    visualAttachments.length === 5
    && !fileAttachments.length
    && visualAttachments.every((attachmentItem) => !attachmentItem.isVoice)
  );
  const useSixTileLayout = (
    visualAttachments.length === 6
    && !fileAttachments.length
    && visualAttachments.every((attachmentItem) => !attachmentItem.isVoice)
  );
  const useWideTopMosaicLayout = (
    visualAttachments.length >= 7
    && !fileAttachments.length
    && visualAttachments.every((attachmentItem) => !attachmentItem.isVoice)
  );

  if (!attachmentList.length) {
    return null;
  }

  if (attachmentList.length === 1) {
    if (mediaOverlayFooter) {
      return (
        <div className="message-attachments-stack message-attachments-stack--single message-attachments-stack--with-overlay">
          <div className="message-media-overlay-anchor">
            <div className="message-attachment-single">
              <MessageAttachmentCard
                {...props}
                attachmentItem={attachmentList[0]}
                galleryAttachments={galleryAttachments}
                priorityMedia={isPriorityMediaMessage}
              />
            </div>
            {mediaOverlayFooter}
          </div>
        </div>
      );
    }

    return (
      <MessageAttachmentCard
        {...props}
        attachmentItem={attachmentList[0]}
        galleryAttachments={galleryAttachments}
        priorityMedia={isPriorityMediaMessage}
      />
    );
  }

  return (
    <div className={`message-attachments-stack ${mediaOverlayFooter ? "message-attachments-stack--with-overlay" : ""}`}>
      {visualAttachments.length ? (
        <div className="message-media-overlay-anchor">
          <div
            className={`message-attachment-grid ${featureStackCount ? "message-attachment-grid--feature-stack" : ""} ${
              featureStackCount ? `message-attachment-grid--feature-stack-${featureStackCount}` : ""
            } ${useFiveTileLayout ? "message-attachment-grid--five-tile" : ""
            } ${useSixTileLayout ? "message-attachment-grid--six-tile" : ""
            } ${useWideTopMosaicLayout ? "message-attachment-grid--wide-top-mosaic" : ""
            }`}
          >
            {visualAttachments.map((attachmentItem, attachmentIndex) => (
              <div
                key={`${messageItem.id}-${attachmentItem.attachmentIndex}`}
                className={`message-attachment-grid__item ${attachmentItem.isVoice ? "message-attachment-grid__item--voice" : ""} ${featureStackCount && attachmentIndex === 0 ? "message-attachment-grid__item--feature-primary" : ""}`}
              >
                <MessageAttachmentCard
                  {...props}
                  attachmentItem={attachmentItem}
                  galleryAttachments={galleryAttachments}
                  priorityMedia={isPriorityMediaMessage && attachmentIndex === 0}
                />
              </div>
            ))}
          </div>
          {mediaOverlayFooter}
        </div>
      ) : null}

      {fileAttachments.length ? (
        <div className="message-attachment-list">
          {fileAttachments.map((attachmentItem) => (
            <div key={`${messageItem.id}-${attachmentItem.attachmentIndex}`} className="message-attachment-list__item">
              <MessageAttachmentCard
                {...props}
                attachmentItem={attachmentItem}
                galleryAttachments={galleryAttachments}
                priorityMedia={isPriorityMediaMessage}
              />
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
});

MessageAttachmentCollection.displayName = "MessageAttachmentCollection";

function TextChatMessageList({
  messages,
  visibleMessages = messages,
  visibleStartIndex = 0,
  messagesListRef,
  messagesEndRef,
  messageRefs,
  virtualizationEnabled = false,
  topSpacerHeight = 0,
  bottomSpacerHeight = 0,
  registerMeasuredNode,
  floatingDateLabel,
  decryptedAttachmentsByMessageId,
  selectedMessageIdSet,
  highlightedMessageId,
  isDirectChat,
  currentUserId,
  user,
  serverMembers = [],
  serverRoles = [],
  selectionMode,
  onToggleSelection,
  onOpenContextMenu,
  onOpenUserContextMenu,
  onInsertMentionByUserId,
  onOpenMediaPreview,
  onToggleReaction,
  onJumpToReply,
  onCancelLocalEchoUpload,
  onRetryLocalEchoUpload,
  onRemoveLocalEchoUpload,
}) {
  const messageLongPress = useMobileLongPress();
  const avatarLongPress = useMobileLongPress();
  const [pressedMessageId, setPressedMessageId] = useState("");
  const [pressedAvatarMessageId, setPressedAvatarMessageId] = useState("");
  const currentUserName = useMemo(() => getUserName(user).toLowerCase(), [user]);
  const serverRoleById = useMemo(
    () => new Map((serverRoles || []).map((role) => [String(role?.id || ""), role])),
    [serverRoles]
  );
  const authorRoleColorByUserId = useMemo(
    () =>
      new Map(
        (serverMembers || []).flatMap((member) => {
          const userId = String(member?.userId || member?.id || "");
          if (!userId) {
            return [];
          }

          const resolvedRole = serverRoleById.get(String(member?.roleId || member?.role_id || "")) || member;
          const resolvedRoleColor = getRoleColorValue(resolvedRole);
          if (!resolvedRoleColor || isDefaultMemberRole(resolvedRole)) {
            return [[userId, ""]];
          }

          return [[userId, resolvedRoleColor]];
        })
      ),
    [serverMembers, serverRoleById]
  );
  const registerMessageNode = useCallback((messageId, node) => {
    registerMeasuredNode?.(messageId, node);
    if (node) {
      messageRefs.current.set(messageId, node);
      return;
    }

    messageRefs.current.delete(messageId);
  }, [messageRefs, registerMeasuredNode]);

  const renderedAttachmentsByMessageId = useMemo(() => new Map(
    visibleMessages.map((messageItem) => [
      String(messageItem?.id || ""),
      getNormalizedMessageAttachments(messageItem).map((attachmentItem, attachmentIndex) => {
        const cacheKey = getAttachmentCacheKey(messageItem?.id, attachmentIndex);
        const attachmentView = decryptedAttachmentsByMessageId[cacheKey] || null;
        const attachmentUnavailable = Boolean(attachmentView?.unavailable);
        const attachmentUrl = attachmentView?.objectUrl || (
          attachmentItem.attachmentEncryption
            ? ""
            : attachmentItem.attachmentUrl
              ? resolveMediaUrl(attachmentItem.attachmentUrl, attachmentItem.attachmentUrl)
              : ""
        );
        const attachmentName = attachmentView?.name || attachmentItem.attachmentName || "";
        const attachmentContentType = attachmentView?.contentType || attachmentItem.attachmentContentType || "";
        const attachmentSize = attachmentView?.size || attachmentItem.attachmentSize || null;
        const voiceMessage = normalizeVoiceMessageMetadata(attachmentItem.voiceMessage);
        const attachmentAsFile = Boolean(attachmentItem.attachmentAsFile);
        const mediaTypeAttachment = {
          ...attachmentItem,
          attachmentName,
          attachmentUrl,
          attachmentSourceUrl: attachmentItem.attachmentUrl
            ? resolveMediaUrl(attachmentItem.attachmentUrl, attachmentItem.attachmentUrl)
            : attachmentUrl,
          attachmentContentType,
        };
        const isImageContent = isImageLikeDocumentAttachment(mediaTypeAttachment);
        const isVideoContent = isVideoLikeAttachment(mediaTypeAttachment);

        return {
          ...attachmentItem,
          attachmentIndex,
          cacheKey,
          attachmentView,
          attachmentUnavailable,
          attachmentUrl,
          attachmentSourceUrl: attachmentItem.attachmentUrl
            ? resolveMediaUrl(attachmentItem.attachmentUrl, attachmentItem.attachmentUrl)
            : attachmentUrl,
          attachmentName,
          attachmentContentType,
          attachmentSize,
          attachmentAsFile,
          voiceMessage,
          isImage: isImageContent && !attachmentAsFile,
          isVideo: isVideoContent && !attachmentAsFile,
          isVoice: isVoiceMessage({
            attachmentUrl,
            attachmentEncryption: attachmentItem.attachmentEncryption,
            voiceMessage,
          }) && !attachmentUnavailable,
        };
      }),
    ])
  ), [decryptedAttachmentsByMessageId, visibleMessages]);
  const normalizedReactionsByMessageId = useMemo(() => new Map(
    visibleMessages.map((messageItem) => [
      String(messageItem?.id || ""),
      normalizeReactions(messageItem?.reactions),
    ])
  ), [visibleMessages]);
  const duplicateMessageIdSet = useMemo(() => {
    const countById = new Map();
    messages.forEach((messageItem) => {
      const messageId = getMessageRenderId(messageItem);
      if (!messageId) {
        return;
      }

      countById.set(messageId, (countById.get(messageId) || 0) + 1);
    });

    return new Set(
      Array.from(countById.entries())
        .filter(([, count]) => count > 1)
        .map(([messageId]) => messageId)
    );
  }, [messages]);

  useEffect(() => {
    if (!duplicateMessageIdSet.size) {
      return;
    }

    recordPerfEvent("text-chat", "message-list:duplicate-message-ids", {
      duplicateIds: Array.from(duplicateMessageIdSet).slice(0, 20),
      duplicateCount: duplicateMessageIdSet.size,
      messageCount: messages.length,
    });
  }, [duplicateMessageIdSet, messages.length]);

  const priorityMediaMessageIdSet = useMemo(() => {
    const priorityIds = new Set();

    for (let index = visibleMessages.length - 1; index >= 0 && priorityIds.size < PRIORITY_MEDIA_MESSAGE_COUNT; index -= 1) {
      const messageItem = visibleMessages[index];
      const attachments = renderedAttachmentsByMessageId.get(String(messageItem?.id || "")) || [];
      const hasMediaImage = attachments.some((attachmentItem) => (
        attachmentItem?.attachmentUrl
        && !attachmentItem.attachmentAsFile
        && attachmentItem.isImage
      ));

      if (hasMediaImage) {
        priorityIds.add(String(messageItem.id));
      }
    }

    return priorityIds;
  }, [renderedAttachmentsByMessageId, visibleMessages]);

  const mediaPrefetchUrls = useMemo(() => {
    const startIndex = Math.max(0, (Number(visibleStartIndex) || 0) - MEDIA_PREFETCH_MESSAGE_BUFFER);
    const endIndex = Math.min(
      messages.length,
      (Number(visibleStartIndex) || 0) + visibleMessages.length + MEDIA_PREFETCH_MESSAGE_BUFFER
    );
    const seenUrls = new Set();
    const urls = [];

    for (let index = startIndex; index < endIndex; index += 1) {
      const attachments = getNormalizedMessageAttachments(messages[index]);
      attachments.forEach((attachmentItem) => {
        if (!attachmentItem?.attachmentUrl || attachmentItem?.attachmentEncryption || !isPrefetchableFeedImage(attachmentItem)) {
          return;
        }

        const resolvedUrl = resolveMediaUrl(attachmentItem.attachmentUrl, attachmentItem.attachmentUrl);
        const nextUrl = resolveOptimizedMediaUrl(resolvedUrl, {
          width: MESSAGE_MEDIA_FALLBACK_SIZE,
          height: MESSAGE_MEDIA_FALLBACK_SIZE,
          fit: "contain",
          animated: true,
        }) || resolvedUrl;
        if (!nextUrl || seenUrls.has(nextUrl)) {
          return;
        }

        seenUrls.add(nextUrl);
        urls.push(nextUrl);
      });
    }

    return urls.slice(0, MEDIA_PREFETCH_IMAGE_LIMIT);
  }, [messages, visibleMessages.length, visibleStartIndex]);

  useEffect(() => {
    if (typeof window === "undefined" || !mediaPrefetchUrls.length) {
      return undefined;
    }

    let cancelled = false;
    let idleCallbackId = 0;
    let timeoutId = 0;
    const runPreload = () => {
      if (cancelled) {
        return;
      }

      mediaPrefetchUrls.forEach(preloadFeedImageUrl);
    };

    if (typeof window.requestIdleCallback === "function") {
      idleCallbackId = window.requestIdleCallback(runPreload, { timeout: 600 });
    } else {
      timeoutId = window.setTimeout(runPreload, 120);
    }

    return () => {
      cancelled = true;
      if (idleCallbackId && typeof window.cancelIdleCallback === "function") {
        window.cancelIdleCallback(idleCallbackId);
      }
      if (timeoutId) {
        window.clearTimeout(timeoutId);
      }
    };
  }, [mediaPrefetchUrls]);

  return (
    <div className="messages-list-shell">
      {floatingDateLabel ? <div className="messages-floating-date">{floatingDateLabel}</div> : null}

      <div ref={messagesListRef} className={`messages-list ${virtualizationEnabled ? "messages-list--virtualized" : "messages-list--plain"}`}>
        {virtualizationEnabled && topSpacerHeight > 0 ? <div style={{ height: `${topSpacerHeight}px` }} aria-hidden="true" /> : null}
        {visibleMessages.map((messageItem, visibleIndex) => {
          const messageIndex = Math.max(0, Number(visibleStartIndex) || 0) + visibleIndex;
          const previousMessage = messages[messageIndex - 1] || null;
          const nextMessage = messages[messageIndex + 1] || null;
          const attachments = renderedAttachmentsByMessageId.get(String(messageItem.id)) || [];
          const hasRenderableAttachments = attachments.length > 0;
          const reactions = normalizedReactionsByMessageId.get(String(messageItem.id)) || [];
          const messageText = String(messageItem.message || "");
          const emojiOnlyMessageMeta = getEmojiOnlyMessageMeta(messageText);
          const messagePoll = getMessagePoll(messageItem);
          const inviteCode = extractInviteCode(messageText);
          const messageMentions = Array.isArray(messageItem.mentions) ? messageItem.mentions : [];
          const isOwnMessage =
            String(messageItem.authorUserId || "") === currentUserId ||
            (!messageItem.authorUserId && messageItem.username?.toLowerCase() === currentUserName);
          const isSelectedMessage = selectedMessageIdSet.has(String(messageItem.id));
          const isForwardGroupFollow = areMessagesInSameForwardGroup(messageItem, previousMessage);
          const isForwardGroupStart = !isForwardGroupFollow && areMessagesInSameForwardGroup(messageItem, nextMessage);
          const isForwardGroupEnd = isForwardGroupFollow && !areMessagesInSameForwardGroup(messageItem, nextMessage);
          const isMediaOnlyMessage =
            !messageText.trim()
            && !inviteCode
            && !messagePoll
            && hasRenderableAttachments
            && !reactions.length
            && !messageItem.forwardedFromUsername
            && !messageItem.replyToMessageId;
          const isInlineEmojiOnlyMessage = isMediaOnlyMessage
            && attachments.length === 1
            && isAnimatedEmojiAttachment(messageItem, attachments[0], attachments);
          const hasVisualAttachmentGroup = hasRenderableAttachments
            && attachments.length > 0
            && attachments.every((attachmentItem) => (
              !attachmentItem.attachmentAsFile
              && !attachmentItem.isVoice
              && (attachmentItem.isImage || attachmentItem.isVideo)
            ));
          const showFloatingMediaFooter = hasVisualAttachmentGroup && !isInlineEmojiOnlyMessage && !reactions.length && !messagePoll;
          const isSingleVideoOnly = isMediaOnlyMessage && attachments.length === 1 && attachments[0]?.isVideo;
          const showAttachmentOverlayFooter = showFloatingMediaFooter;
          const useInlineFooter = isDirectChat
            && Boolean(messageText.trim())
            && !messagePoll
            && !hasRenderableAttachments
            && !reactions.length
            && !messageItem.forwardedFromUsername
            && !messageItem.replyToMessageId
            && !messageText.includes("\n")
            && messageText.trim().length <= 14;
          const isEmojiOnlyTextMessage = emojiOnlyMessageMeta.isEmojiOnly
            && !hasRenderableAttachments
            && !messagePoll
            && !inviteCode
            && !reactions.length
            && !messageItem.forwardedFromUsername
            && !messageItem.replyToMessageId;
          const authorRoleColor = !isDirectChat
            ? authorRoleColorByUserId.get(String(messageItem.authorUserId || "")) || ""
            : "";
          const forwardedFromRoleColor = !isDirectChat
            ? authorRoleColorByUserId.get(String(messageItem.forwardedFromUserId || "")) || ""
            : "";
          const canInsertAuthorMention = !isDirectChat && typeof onInsertMentionByUserId === "function";
          const messageRenderId = getMessageRenderId(messageItem);
          const messageRenderKey = duplicateMessageIdSet.has(messageRenderId)
            ? `${messageRenderId || "message"}:${messageIndex}`
            : messageRenderId || `message:${messageIndex}`;

          const handleMessageClick = selectionMode
            ? (event) => {
              if (messageLongPress.consumeSuppressedClick() || avatarLongPress.consumeSuppressedClick()) {
                event.preventDefault();
                event.stopPropagation();
                return;
              }

              onToggleSelection(messageItem.id);
            }
            : undefined;

          return (
            <div
              key={messageRenderKey}
              ref={(node) => registerMessageNode(messageItem.id, node)}
              className={`message-item ${isDirectChat ? "message-item--dm" : ""} ${isDirectChat && isOwnMessage ? "message-item--dm-own" : ""} ${isDirectChat && !isOwnMessage ? "message-item--dm-incoming" : ""} ${messageItem?.isLocalEcho ? "message-item--local-echo" : ""} ${String(messageItem.id) === highlightedMessageId ? "message-item--highlighted" : ""} ${isSelectedMessage ? "message-item--selected" : ""} ${selectionMode ? "message-item--selectable" : ""} ${isForwardGroupStart ? "message-item--forward-group-start" : ""} ${isForwardGroupFollow ? "message-item--forward-group-follow" : ""} ${isForwardGroupEnd ? "message-item--forward-group-end" : ""}`}
              onContextMenu={(event) => onOpenContextMenu(event, messageItem, isOwnMessage)}
              onClick={handleMessageClick}
            >
              {selectionMode ? (
                <button
                  type="button"
                  className={`message-select-toggle ${isSelectedMessage ? "message-select-toggle--active" : ""}`}
                  onClick={(event) => {
                    event.stopPropagation();
                    onToggleSelection(messageItem.id);
                  }}
                  aria-label={isSelectedMessage ? "Снять выделение" : "Выбрать сообщение"}
                >
                  <span className="message-select-toggle__mark" aria-hidden="true" />
                </button>
              ) : null}
              <AnimatedAvatar
                src={messageItem.photoUrl}
                alt="avatar"
                className={`msg-avatar ${pressedAvatarMessageId === String(messageItem.id) ? "msg-avatar--pressing" : ""}`}
                loading="eager"
                decoding="sync"
                onContextMenu={(event) => onOpenUserContextMenu?.(event, messageItem)}
                {...avatarLongPress.bindLongPress(messageItem, (event, pressedMessageItem) => {
                  onOpenUserContextMenu?.(event, pressedMessageItem);
                }, {
                  onStart: (pressedMessageItem) => setPressedAvatarMessageId(String(pressedMessageItem?.id || "")),
                  onCancel: () => setPressedAvatarMessageId(""),
                  onTrigger: () => setPressedAvatarMessageId(""),
                })}
              />

              <div
                className={`msg-content ${isDirectChat ? "msg-content--dm" : ""} ${isDirectChat && isOwnMessage ? "msg-content--dm-own" : ""} ${isMediaOnlyMessage ? "msg-content--media-only" : ""} ${isInlineEmojiOnlyMessage ? "msg-content--inline-emoji-only" : ""} ${isSingleVideoOnly ? "msg-content--single-video-only" : ""} ${hasRenderableAttachments ? "msg-content--attachments" : ""} ${pressedMessageId === String(messageItem.id) ? "msg-content--pressing" : ""}`}
                {...messageLongPress.bindLongPress({ messageItem, isOwnMessage }, (event, payload) => {
                  onOpenContextMenu(event, payload.messageItem, payload.isOwnMessage);
                }, {
                  onStart: (payload) => setPressedMessageId(String(payload?.messageItem?.id || "")),
                  onCancel: () => setPressedMessageId(""),
                  onTrigger: () => setPressedMessageId(""),
                })}
              >
                {!isDirectChat && !isForwardGroupFollow ? (
                  <div className="message-author">
                    <button
                      type="button"
                      className={`message-author__name ${canInsertAuthorMention ? "message-author__name--interactive" : ""}`}
                      style={authorRoleColor ? { color: authorRoleColor } : undefined}
                      onClick={(event) => {
                        event.stopPropagation();
                        if (!canInsertAuthorMention) {
                          return;
                        }

                        onInsertMentionByUserId?.(messageItem.authorUserId, messageItem.username || "User");
                      }}
                    >
                      {messageItem.username || "User"}
                    </button>
                    {!showAttachmentOverlayFooter ? (
                      <span className="message-meta">
                        <MessageTimestamp messageItem={messageItem} />
                        <EditedBadge message={messageItem} />
                      </span>
                    ) : null}
                  </div>
                ) : null}

                {messageItem.forwardedFromUsername && !isForwardGroupFollow ? (
                  <div className="message-forwarded">
                    <span className="message-forwarded__label">Переслал</span>
                    <button
                      type="button"
                      className={`message-author__name ${canInsertAuthorMention ? "message-author__name--interactive" : ""}`}
                      style={authorRoleColor ? { color: authorRoleColor } : undefined}
                      onClick={(event) => {
                        event.stopPropagation();
                        if (!canInsertAuthorMention) {
                          return;
                        }

                        onInsertMentionByUserId?.(messageItem.authorUserId, messageItem.username || "User");
                      }}
                    >
                      {messageItem.username}
                    </button>
                    <span className="message-forwarded__label">Автор</span>
                    <button
                      type="button"
                      className={`message-author__name ${canInsertAuthorMention ? "message-author__name--interactive" : ""}`}
                      style={forwardedFromRoleColor ? { color: forwardedFromRoleColor } : undefined}
                      onClick={(event) => {
                        event.stopPropagation();
                        if (!canInsertAuthorMention || !messageItem.forwardedFromUserId) {
                          return;
                        }

                        onInsertMentionByUserId?.(messageItem.forwardedFromUserId, messageItem.forwardedFromUsername || "User");
                      }}
                    >
                      {messageItem.forwardedFromUsername}
                    </button>
                  </div>
                ) : null}

                {messageItem.replyToMessageId ? (
                  <button
                    type="button"
                    className="message-reply-chip"
                    onClick={(event) => {
                      event.stopPropagation();
                      onJumpToReply?.(messageItem.replyToMessageId);
                    }}
                  >
                    <span className="message-reply-chip__line" aria-hidden="true" />
                    <span className="message-reply-chip__copy">
                      <strong>{messageItem.replyToUsername || "User"}</strong>
                      <span>{messageItem.replyPreview || "Сообщение без текста"}</span>
                    </span>
                  </button>
                ) : null}

                {messageText && !messagePoll ? (
                  useInlineFooter ? (
                    <div className="message-text-row">
                      <div className="message-text">
                        <MessageText text={messageText} mentions={messageMentions} currentUserId={currentUserId} />
                      </div>
                      <div className={`message-footer message-footer--inline ${isOwnMessage ? "message-footer--own" : ""}`}>
                        <MessageTimestamp messageItem={messageItem} />
                        <EditedBadge message={messageItem} />
                        {isOwnMessage && !messageItem?.isLocalEcho ? (
                          <span className={`message-read-status ${messageItem.isRead ? "message-read-status--read" : ""}`}>
                            <span className="message-read-status__check" />
                            <span className="message-read-status__check" />
                          </span>
                        ) : null}
                      </div>
                    </div>
                  ) : (
                    <div className={`message-text ${isEmojiOnlyTextMessage ? "message-text--emoji-only" : ""} ${isEmojiOnlyTextMessage && emojiOnlyMessageMeta.count > 1 ? "message-text--emoji-only-multi" : ""}`}>
                      <MessageText text={messageText} mentions={messageMentions} currentUserId={currentUserId} />
                    </div>
                  )
                ) : null}

                {messagePoll ? <MessagePollCard poll={messagePoll} /> : null}

                {inviteCode ? <MessageInviteCard inviteCode={inviteCode} /> : null}

                <MessageAttachmentCollection
                  messageItem={messageItem}
                  attachments={attachments}
                  selectionMode={selectionMode}
                  onToggleSelection={onToggleSelection}
                  onOpenMediaPreview={onOpenMediaPreview}
                  mediaOverlayFooter={
                    showAttachmentOverlayFooter
                      ? <MessageMediaOverlayFooter messageItem={messageItem} isOwnMessage={isOwnMessage} />
                      : null
                  }
                  priorityMediaMessageIdSet={priorityMediaMessageIdSet}
                />

                {((isDirectChat && !useInlineFooter && !showAttachmentOverlayFooter) || reactions.length) ? (
                  <div className="message-bottom-row">
                    {reactions.length ? (
                      <div className="message-reactions-wrap">
                        <div className="message-reactions">
                          {reactions.map((reaction) => {
                            const reactedByCurrentUser = reaction.reactorUserIds.some((userId) => String(userId) === currentUserId);
                            return (
                              <button
                                key={`${messageItem.id}-${reaction.key}`}
                                type="button"
                                className={`message-reaction ${reactedByCurrentUser ? "message-reaction--active" : ""}`}
                                onClick={(event) => {
                                  event.stopPropagation();
                                  onToggleReaction(messageItem.id, reaction);
                                }}
                                aria-label={`${reaction.glyph} ${reaction.count}`}
                              >
                                <AnimatedEmojiGlyph
                                  emoji={reaction}
                                  className="message-reaction__glyph"
                                  showAsset={!TEXT_CHAT_STATIC_EMOJI_IN_FEED}
                                  fallbackText={resolveAnimatedEmojiFallbackGlyph(reaction) || reaction.glyph}
                                />
                                <span className="message-reaction__count">{reaction.count}</span>
                                <span className="message-reaction__avatars" aria-hidden="true">
                                  {reaction.users.slice(0, 2).map((reactor) => (
                                    <AnimatedAvatar
                                      key={`${reaction.key}-${reactor.userId}`}
                                      className="message-reaction__avatar"
                                      src={reactor.avatarUrl}
                                      alt={reactor.displayName}
                                    />
                                  ))}
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    ) : (
                      <span />
                    )}

                    {(isDirectChat && !useInlineFooter) ? (
                      <div className={`message-footer ${isOwnMessage ? "message-footer--own" : ""}`}>
                        <MessageTimestamp messageItem={messageItem} />
                        <EditedBadge message={messageItem} />
                        {isOwnMessage && !messageItem?.isLocalEcho ? (
                          <span className={`message-read-status ${messageItem.isRead ? "message-read-status--read" : ""}`}>
                            <span className="message-read-status__check" />
                            <span className="message-read-status__check" />
                          </span>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </div>
            </div>
          );
        })}
        {virtualizationEnabled && bottomSpacerHeight > 0 ? <div style={{ height: `${bottomSpacerHeight}px` }} aria-hidden="true" /> : null}
        <div ref={messagesEndRef} />
      </div>
    </div>
  );
}

function areTextChatMessageListPropsEqual(previousProps, nextProps) {
  return (
    previousProps.messages === nextProps.messages
    && previousProps.visibleMessages === nextProps.visibleMessages
    && previousProps.visibleStartIndex === nextProps.visibleStartIndex
    && previousProps.messagesListRef === nextProps.messagesListRef
    && previousProps.messagesEndRef === nextProps.messagesEndRef
    && previousProps.messageRefs === nextProps.messageRefs
    && previousProps.virtualizationEnabled === nextProps.virtualizationEnabled
    && previousProps.topSpacerHeight === nextProps.topSpacerHeight
    && previousProps.bottomSpacerHeight === nextProps.bottomSpacerHeight
    && previousProps.registerMeasuredNode === nextProps.registerMeasuredNode
    && previousProps.floatingDateLabel === nextProps.floatingDateLabel
    && previousProps.decryptedAttachmentsByMessageId === nextProps.decryptedAttachmentsByMessageId
    && previousProps.selectedMessageIdSet === nextProps.selectedMessageIdSet
    && previousProps.highlightedMessageId === nextProps.highlightedMessageId
    && previousProps.isDirectChat === nextProps.isDirectChat
    && previousProps.currentUserId === nextProps.currentUserId
    && previousProps.user === nextProps.user
    && previousProps.serverMembers === nextProps.serverMembers
    && previousProps.serverRoles === nextProps.serverRoles
    && previousProps.selectionMode === nextProps.selectionMode
    && previousProps.onToggleSelection === nextProps.onToggleSelection
    && previousProps.onOpenContextMenu === nextProps.onOpenContextMenu
    && previousProps.onOpenUserContextMenu === nextProps.onOpenUserContextMenu
    && previousProps.onInsertMentionByUserId === nextProps.onInsertMentionByUserId
    && previousProps.onOpenMediaPreview === nextProps.onOpenMediaPreview
    && previousProps.onToggleReaction === nextProps.onToggleReaction
    && previousProps.onJumpToReply === nextProps.onJumpToReply
    && previousProps.onCancelLocalEchoUpload === nextProps.onCancelLocalEchoUpload
  );
}

TextChatMessageList.displayName = "TextChatMessageList";

export default memo(TextChatMessageList, areTextChatMessageListPropsEqual);
