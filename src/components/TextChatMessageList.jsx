import { useEffect, useMemo, useState } from "react";
import AnimatedEmojiGlyph from "./AnimatedEmojiGlyph";
import AnimatedAvatar from "./AnimatedAvatar";
import VoiceMessageBubble from "./VoiceMessageBubble";
import useMobileLongPress from "../hooks/useMobileLongPress";
import { API_BASE_URL } from "../config/runtime";
import { authFetch, getApiErrorMessage, parseApiResponse } from "../utils/auth";
import { segmentMessageTextByMentions } from "../utils/messageMentions";
import { DEFAULT_SERVER_ICON, resolveMediaUrl } from "../utils/media";
import { extractInviteCode, getInviteRoute } from "../utils/serverInviteLinks";
import { formatFileSize, formatTime } from "../utils/textChatHelpers";
import {
  getAttachmentCacheKey,
  getUserName,
  isVoiceMessage,
  normalizeAttachmentItems,
  normalizeReactions,
} from "../utils/textChatModel";
import { normalizeVoiceMessageMetadata } from "../utils/voiceMessages";
import { parseMediaFrame } from "../utils/mediaFrames";

const URL_PATTERN = /(?:https?:\/\/|www\.)[^\s<]+[^\s<.,:;"')\]]/gi;

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

function MessageText({ text, mentions, currentUserId }) {
  return segmentMessageTextByMentions(text, mentions).map((segment, index) => {
    if (segment.isMention) {
      return (
        <span
          key={`mention-${index}-${segment.userId}`}
          className={`message-text__mention ${String(segment.userId || "") === currentUserId ? "message-text__mention--self" : ""}`}
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
}

function MessageInviteCard({ inviteCode }) {
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

function MessageAttachmentCard({
  messageItem,
  attachmentItem,
  galleryAttachments,
  selectionMode,
  onToggleSelection,
  onOpenMediaPreview,
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
    if (isAnimatedEmojiAttachment(messageItem, attachmentItem, galleryAttachments)) {
      return (
        <button
          type="button"
          className="message-inline-emoji message-inline-emoji--button"
          onClick={handlePreviewClick}
          aria-label={`Открыть смайлик ${attachmentItem.attachmentName || ""}`.trim()}
        >
          <img className="message-inline-emoji__image" src={attachmentItem.attachmentUrl} alt={attachmentItem.attachmentName || "emoji"} />
        </button>
      );
    }

    if (attachmentItem.isImage) {
      return (
        <button
          type="button"
          className="message-media message-media--button"
          onClick={handlePreviewClick}
          aria-label={`Открыть изображение ${attachmentItem.attachmentName || ""}`.trim()}
        >
          <img className="message-media__image" src={attachmentItem.attachmentUrl} alt={attachmentItem.attachmentName || "image"} />
        </button>
      );
    }

    if (attachmentItem.isVideo) {
      return (
        <button
          type="button"
          className="message-media message-media--video message-media--button"
          onClick={handlePreviewClick}
          aria-label={`Открыть видео ${attachmentItem.attachmentName || ""}`.trim()}
        >
          <video className="message-media__video" src={attachmentItem.attachmentUrl} preload="metadata" playsInline muted />
          <span className="message-media__play" aria-hidden="true" />
        </button>
      );
    }

    return (
      <a
        className="message-attachment"
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
        <span className="message-attachment__icon" aria-hidden="true" />
        <span className="message-attachment__meta">
          <span className="message-attachment__name">{attachmentItem.attachmentName || "Файл"}</span>
          <span className="message-attachment__size">{formatFileSize(attachmentItem.attachmentSize)}</span>
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

function MessageAttachmentCollection(props) {
  const { messageItem, attachments, galleryAttachments = attachments } = props;

  if (!attachments.length) {
    return null;
  }

  if (attachments.length === 1) {
    return <MessageAttachmentCard {...props} attachmentItem={attachments[0]} galleryAttachments={galleryAttachments} />;
  }

  const visualAttachments = attachments.filter((attachmentItem) => attachmentItem.isVoice || attachmentItem.isImage || attachmentItem.isVideo);
  const fileAttachments = attachments.filter((attachmentItem) => !attachmentItem.isVoice && !attachmentItem.isImage && !attachmentItem.isVideo);
  const hasThreeVisualTiles =
    visualAttachments.length === 3
    && !fileAttachments.length
    && visualAttachments.every((attachmentItem) => !attachmentItem.isVoice);

  return (
    <div className="message-attachments-stack">
      {visualAttachments.length ? (
        <div className={`message-attachment-grid ${hasThreeVisualTiles ? "message-attachment-grid--trio" : ""}`}>
          {visualAttachments.map((attachmentItem, attachmentIndex) => (
            <div
              key={`${messageItem.id}-${attachmentItem.attachmentIndex}`}
              className={`message-attachment-grid__item ${attachmentItem.isVoice ? "message-attachment-grid__item--voice" : ""} ${hasThreeVisualTiles && attachmentIndex === 0 ? "message-attachment-grid__item--trio-feature" : ""}`}
            >
              <MessageAttachmentCard {...props} attachmentItem={attachmentItem} galleryAttachments={galleryAttachments} />
            </div>
          ))}
        </div>
      ) : null}

      {fileAttachments.length ? (
        <div className="message-attachment-list">
          {fileAttachments.map((attachmentItem) => (
            <div key={`${messageItem.id}-${attachmentItem.attachmentIndex}`} className="message-attachment-list__item">
              <MessageAttachmentCard {...props} attachmentItem={attachmentItem} galleryAttachments={galleryAttachments} />
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export default function TextChatMessageList({
  messages,
  visibleMessages = messages,
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
  selectionMode,
  onToggleSelection,
  onOpenContextMenu,
  onOpenUserContextMenu,
  onOpenMediaPreview,
  onToggleReaction,
  onJumpToReply,
}) {
  const messageLongPress = useMobileLongPress();
  const avatarLongPress = useMobileLongPress();
  const [pressedMessageId, setPressedMessageId] = useState("");
  const [pressedAvatarMessageId, setPressedAvatarMessageId] = useState("");
  const messageIndexById = useMemo(
    () => new Map(messages.map((messageItem, index) => [String(messageItem.id), index])),
    [messages]
  );

  const resolveRenderedAttachments = (messageItem) =>
    normalizeAttachmentItems(messageItem).map((attachmentItem, attachmentIndex) => {
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
        voiceMessage,
        isImage: String(attachmentContentType).startsWith("image/"),
        isVideo: String(attachmentContentType).startsWith("video/"),
        isVoice: isVoiceMessage({
          attachmentUrl,
          attachmentEncryption: attachmentItem.attachmentEncryption,
          voiceMessage,
        }) && !attachmentUnavailable,
      };
    });

  return (
    <div className="messages-list-shell">
      {floatingDateLabel ? <div className="messages-floating-date">{floatingDateLabel}</div> : null}

      <div ref={messagesListRef} className="messages-list">
        {virtualizationEnabled && topSpacerHeight > 0 ? <div style={{ height: `${topSpacerHeight}px` }} aria-hidden="true" /> : null}
        {visibleMessages.map((messageItem) => {
          const messageIndex = messageIndexById.get(String(messageItem.id)) ?? -1;
          const previousMessage = messages[messageIndex - 1] || null;
          const nextMessage = messages[messageIndex + 1] || null;
          const attachments = resolveRenderedAttachments(messageItem);
          const hasRenderableAttachments = attachments.length > 0;
          const reactions = normalizeReactions(messageItem.reactions);
          const messageText = String(messageItem.message || "");
          const inviteCode = extractInviteCode(messageText);
          const messageMentions = Array.isArray(messageItem.mentions) ? messageItem.mentions : [];
          const isOwnMessage =
            String(messageItem.authorUserId || "") === currentUserId ||
            (!messageItem.authorUserId && messageItem.username?.toLowerCase() === getUserName(user).toLowerCase());
          const isSelectedMessage = selectedMessageIdSet.has(String(messageItem.id));
          const isForwardGroupFollow = areMessagesInSameForwardGroup(messageItem, previousMessage);
          const isForwardGroupStart = !isForwardGroupFollow && areMessagesInSameForwardGroup(messageItem, nextMessage);
          const isForwardGroupEnd = isForwardGroupFollow && !areMessagesInSameForwardGroup(messageItem, nextMessage);
          const isMediaOnlyMessage =
            !messageText.trim()
            && !inviteCode
            && hasRenderableAttachments
            && !reactions.length
            && !messageItem.forwardedFromUsername
            && !messageItem.replyToMessageId;
          const useInlineFooter = isDirectChat
            && Boolean(messageText.trim())
            && !hasRenderableAttachments
            && !reactions.length
            && !messageItem.forwardedFromUsername
            && !messageItem.replyToMessageId
            && !messageText.includes("\n")
            && messageText.trim().length <= 14;

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
              key={messageItem.id}
              ref={(node) => {
                registerMeasuredNode?.(messageItem.id, node);
                if (node) {
                  messageRefs.current.set(messageItem.id, node);
                } else {
                  messageRefs.current.delete(messageItem.id);
                }
              }}
              className={`message-item ${isDirectChat ? "message-item--dm" : ""} ${isDirectChat && isOwnMessage ? "message-item--dm-own" : ""} ${isDirectChat && !isOwnMessage ? "message-item--dm-incoming" : ""} ${String(messageItem.id) === highlightedMessageId ? "message-item--highlighted" : ""} ${isSelectedMessage ? "message-item--selected" : ""} ${selectionMode ? "message-item--selectable" : ""} ${isForwardGroupStart ? "message-item--forward-group-start" : ""} ${isForwardGroupFollow ? "message-item--forward-group-follow" : ""} ${isForwardGroupEnd ? "message-item--forward-group-end" : ""}`}
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
                className={`msg-content ${isDirectChat ? "msg-content--dm" : ""} ${isDirectChat && isOwnMessage ? "msg-content--dm-own" : ""} ${isMediaOnlyMessage ? "msg-content--media-only" : ""} ${hasRenderableAttachments ? "msg-content--attachments" : ""} ${pressedMessageId === String(messageItem.id) ? "msg-content--pressing" : ""}`}
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
                    <span>{messageItem.username || "User"}</span>
                    <span className="message-meta">
                      <span className="message-time">{formatTime(messageItem.timestamp)}</span>
                      <EditedBadge message={messageItem} />
                    </span>
                  </div>
                ) : null}

                {messageItem.forwardedFromUsername && !isForwardGroupFollow ? (
                  <div className="message-forwarded">
                    <span className="message-forwarded__label">Переслал</span>
                    <strong>{messageItem.username}</strong>
                    <span className="message-forwarded__label">Автор</span>
                    <strong>{messageItem.forwardedFromUsername}</strong>
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

                {messageText ? (
                  useInlineFooter ? (
                    <div className="message-text-row">
                      <div className="message-text">
                        <MessageText text={messageText} mentions={messageMentions} currentUserId={currentUserId} />
                      </div>
                      <div className={`message-footer message-footer--inline ${isOwnMessage ? "message-footer--own" : ""}`}>
                        <span className="message-time">{formatTime(messageItem.timestamp)}</span>
                        <EditedBadge message={messageItem} />
                        {isOwnMessage ? (
                          <span className={`message-read-status ${messageItem.isRead ? "message-read-status--read" : ""}`}>
                            <span className="message-read-status__check" />
                            <span className="message-read-status__check" />
                          </span>
                        ) : null}
                      </div>
                    </div>
                  ) : (
                    <div className="message-text">
                      <MessageText text={messageText} mentions={messageMentions} currentUserId={currentUserId} />
                    </div>
                  )
                ) : null}

                {inviteCode ? <MessageInviteCard inviteCode={inviteCode} /> : null}

                <MessageAttachmentCollection
                  messageItem={messageItem}
                  attachments={attachments}
                  selectionMode={selectionMode}
                  onToggleSelection={onToggleSelection}
                  onOpenMediaPreview={onOpenMediaPreview}
                />

                {((isDirectChat && !useInlineFooter) || reactions.length) ? (
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
                                <AnimatedEmojiGlyph emoji={reaction} className="message-reaction__glyph" />
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

                    {isDirectChat && !useInlineFooter ? (
                      <div className={`message-footer ${isOwnMessage ? "message-footer--own" : ""}`}>
                        <span className="message-time">{formatTime(messageItem.timestamp)}</span>
                        <EditedBadge message={messageItem} />
                        {isOwnMessage ? (
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
