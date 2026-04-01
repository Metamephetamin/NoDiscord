import { useEffect, useMemo, useRef, useState } from "react";
import chatConnection, { startChatConnection } from "../SignalR/ChatConnect";
import "../css/TextChat.css";
import { API_URL } from "../config/runtime";
import { authFetch } from "../utils/auth";
import { DEFAULT_AVATAR, resolveMediaUrl } from "../utils/media";

const MAX_FILE_SIZE_BYTES = 100 * 1024 * 1024;
const MESSAGE_SEND_COOLDOWN_MS = 1500;

const getUserName = (user) => user?.firstName || user?.first_name || user?.name || "User";
const getScopedChatChannelId = (serverId, channelId) =>
  serverId && channelId ? `server:${serverId}::channel:${channelId}` : "";
const isDirectMessageChannelId = (channelId) => String(channelId || "").startsWith("dm:");

function formatFileSize(size) {
  if (!size) {
    return "0 B";
  }

  const units = ["B", "KB", "MB", "GB"];
  let value = size;
  let unitIndex = 0;

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }

  return `${value.toFixed(value >= 10 || unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
}

function isImageAttachment(messageItem) {
  return Boolean(messageItem?.attachmentContentType?.startsWith("image/"));
}

function isVideoAttachment(messageItem) {
  return Boolean(messageItem?.attachmentContentType?.startsWith("video/"));
}

function formatTime(timestamp) {
  const date = new Date(timestamp);
  const hours = date.getHours().toString().padStart(2, "0");
  const minutes = date.getMinutes().toString().padStart(2, "0");
  return `${hours}:${minutes}`;
}

function formatDayLabel(timestamp) {
  const date = new Date(timestamp);
  const now = new Date();
  const isToday =
    date.getDate() === now.getDate() &&
    date.getMonth() === now.getMonth() &&
    date.getFullYear() === now.getFullYear();
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  const isYesterday =
    date.getDate() === yesterday.getDate() &&
    date.getMonth() === yesterday.getMonth() &&
    date.getFullYear() === yesterday.getFullYear();

  if (isToday) {
    return "Сегодня";
  }

  if (isYesterday) {
    return "Вчера";
  }

  return date.toLocaleDateString("ru-RU", {
    day: "numeric",
    month: "long",
    year: now.getFullYear() === date.getFullYear() ? undefined : "numeric",
  });
}

function formatTimestamp(timestamp) {
  const date = new Date(timestamp);
  const now = new Date();
  const isToday =
    date.getDate() === now.getDate() &&
    date.getMonth() === now.getMonth() &&
    date.getFullYear() === now.getFullYear();
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  const isYesterday =
    date.getDate() === yesterday.getDate() &&
    date.getMonth() === yesterday.getMonth() &&
    date.getFullYear() === yesterday.getFullYear();
  const hours = date.getHours().toString().padStart(2, "0");
  const minutes = date.getMinutes().toString().padStart(2, "0");

  if (isToday) {
    return `Сегодня в ${hours}:${minutes}`;
  }

  if (isYesterday) {
    return `Вчера в ${hours}:${minutes}`;
  }

  return `${date.getDate()}.${(date.getMonth() + 1).toString().padStart(2, "0")}.${date.getFullYear()} в ${hours}:${minutes}`;
}

function getChatErrorMessage(error, fallbackMessage) {
  const rawMessage = String(error?.message || "").trim();
  if (!rawMessage) {
    return fallbackMessage;
  }

  if (rawMessage.includes("Forbidden")) {
    return "Нет доступа к этому чату.";
  }

  if (rawMessage.includes("Unauthorized")) {
    return "Сессия недействительна. Войдите снова.";
  }

  return rawMessage;
}

export default function TextChat({ serverId, channelId, user, resolvedChannelId = "", searchQuery = "" }) {
  const [message, setMessage] = useState("");
  const [messagesByChannel, setMessagesByChannel] = useState({});
  const [selectedFile, setSelectedFile] = useState(null);
  const [mediaPreview, setMediaPreview] = useState(null);
  const [uploadingFile, setUploadingFile] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [isChannelReady, setIsChannelReady] = useState(false);
  const [highlightedMessageId, setHighlightedMessageId] = useState("");
  const [floatingDateLabel, setFloatingDateLabel] = useState("");
  const messagesEndRef = useRef(null);
  const messagesListRef = useRef(null);
  const textareaRef = useRef(null);
  const joinedChannelRef = useRef("");
  const messageRefs = useRef(new Map());
  const lastSendAtRef = useRef(0);
  const previousChannelIdRef = useRef("");
  const forceScrollToBottomRef = useRef(false);
  const scopedChannelId = resolvedChannelId || getScopedChatChannelId(serverId, channelId);
  const currentUserId = String(user?.id || "");
  const isDirectChat = isDirectMessageChannelId(scopedChannelId);
  const messages = messagesByChannel[scopedChannelId] || [];

  useEffect(() => {
    if (!isDirectChat) {
      setFloatingDateLabel("");
      return;
    }

    const updateFloatingDate = () => {
      const list = messagesListRef.current;
      if (!list || messages.length === 0) {
        setFloatingDateLabel("");
        return;
      }

      const scrollTop = list.scrollTop;
      const probeLine = scrollTop + 24;
      let nextVisibleMessage = messages[0];

      for (const messageItem of messages) {
        const node = messageRefs.current.get(messageItem.id);
        if (!node) {
          continue;
        }

        const nodeBottom = node.offsetTop + node.offsetHeight;
        if (nodeBottom >= probeLine) {
          nextVisibleMessage = messageItem;
          break;
        }
      }

      const nextLabel = nextVisibleMessage?.timestamp ? formatDayLabel(nextVisibleMessage.timestamp) : "";
      setFloatingDateLabel((current) => (current === nextLabel ? current : nextLabel));
    };

    updateFloatingDate();
    const list = messagesListRef.current;
    if (!list) {
      return undefined;
    }

    list.addEventListener("scroll", updateFloatingDate, { passive: true });
    window.addEventListener("resize", updateFloatingDate);

    return () => {
      list.removeEventListener("scroll", updateFloatingDate);
      window.removeEventListener("resize", updateFloatingDate);
    };
  }, [isDirectChat, messages, scopedChannelId]);

  useEffect(() => {
    const list = messagesListRef.current;
    const end = messagesEndRef.current;
    if (!list || !end) {
      previousChannelIdRef.current = scopedChannelId;
      return;
    }

    const channelChanged = previousChannelIdRef.current !== scopedChannelId;
    previousChannelIdRef.current = scopedChannelId;

    if (channelChanged) {
      forceScrollToBottomRef.current = false;
      end.scrollIntoView({ behavior: "auto", block: "end" });
      return;
    }

    if (forceScrollToBottomRef.current) {
      forceScrollToBottomRef.current = false;
      end.scrollIntoView({ behavior: "smooth", block: "end" });
      return;
    }

    const distanceFromBottom = list.scrollHeight - list.scrollTop - list.clientHeight;
    const shouldStickToBottom = distanceFromBottom < 96;
    if (!shouldStickToBottom) {
      return;
    }

    end.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages.length, scopedChannelId]);

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) {
      return;
    }

    const minHeight = 48;
    const maxHeight = 140;

    textarea.style.height = `${minHeight}px`;
    const nextHeight = Math.min(Math.max(textarea.scrollHeight, minHeight), maxHeight);
    textarea.style.height = `${nextHeight}px`;
    textarea.style.overflowY = textarea.scrollHeight > maxHeight ? "auto" : "hidden";
  }, [message]);

  useEffect(() => {
    if (!mediaPreview) {
      return undefined;
    }

    const handleEscape = (event) => {
      if (event.key === "Escape") {
        setMediaPreview(null);
      }
    };

    window.addEventListener("keydown", handleEscape);
    return () => {
      window.removeEventListener("keydown", handleEscape);
    };
  }, [mediaPreview]);

  const ensureChannelJoined = async () => {
    const connection = await startChatConnection();
    if (!connection) {
      throw new Error("Сессия недействительна. Войдите снова.");
    }

    if (joinedChannelRef.current === scopedChannelId) {
      return;
    }

    const initialMessages = await chatConnection.invoke("JoinChannel", scopedChannelId);
    joinedChannelRef.current = scopedChannelId;
    setIsChannelReady(true);
    setMessagesByChannel((previous) => ({ ...previous, [scopedChannelId]: initialMessages }));

    if (isDirectChat) {
      chatConnection.invoke("MarkChannelRead", scopedChannelId).catch(() => {});
    }
  };

  useEffect(() => {
    if (!scopedChannelId) {
      setIsChannelReady(false);
      joinedChannelRef.current = "";
      return undefined;
    }

    let isMounted = true;

    const handleReceiveMessage = (nextMessage) => {
      if (String(nextMessage?.channelId || scopedChannelId) !== String(scopedChannelId)) {
        return;
      }

      setMessagesByChannel((previous) => {
        const channelMessages = previous[scopedChannelId] || [];
        return { ...previous, [scopedChannelId]: [...channelMessages, nextMessage] };
      });

      if (isDirectChat && String(nextMessage?.authorUserId || "") !== String(currentUserId)) {
        chatConnection.invoke("MarkChannelRead", scopedChannelId).catch(() => {});
      }
    };

    const handleMessageDeleted = (deletedId) => {
      setMessagesByChannel((previous) => {
        const channelMessages = previous[scopedChannelId] || [];
        return {
          ...previous,
          [scopedChannelId]: channelMessages.filter((item) => item.id !== deletedId),
        };
      });
    };

    const handleMessagesRead = (payload) => {
      if (String(payload?.channelId || "") !== String(scopedChannelId)) {
        return;
      }

      const readMessageIds = new Set((payload?.messageIds || []).map((messageId) => String(messageId)));
      if (readMessageIds.size === 0) {
        return;
      }

      setMessagesByChannel((previous) => {
        const channelMessages = previous[scopedChannelId] || [];
        return {
          ...previous,
          [scopedChannelId]: channelMessages.map((messageItem) =>
            readMessageIds.has(String(messageItem.id))
              ? {
                  ...messageItem,
                  isRead: true,
                  readAt: payload?.readAt || messageItem.readAt || null,
                  readByUserId: payload?.readerUserId || messageItem.readByUserId || null,
                }
              : messageItem
          ),
        };
      });
    };

    const init = async () => {
      try {
        setErrorMessage("");
        setIsChannelReady(false);

        chatConnection.off("ReceiveMessage", handleReceiveMessage);
        chatConnection.off("MessageDeleted", handleMessageDeleted);
        chatConnection.off("MessagesRead", handleMessagesRead);
        chatConnection.on("ReceiveMessage", handleReceiveMessage);
        chatConnection.on("MessageDeleted", handleMessageDeleted);
        chatConnection.on("MessagesRead", handleMessagesRead);

        await ensureChannelJoined();
      } catch (error) {
        console.error("SignalR chat init error:", error);
        if (!isMounted) {
          return;
        }

        joinedChannelRef.current = "";
        setIsChannelReady(false);
        setMessagesByChannel((previous) => ({ ...previous, [scopedChannelId]: previous[scopedChannelId] || [] }));
        setErrorMessage(getChatErrorMessage(error, "Не удалось подключить чат."));
      }
    };

    init();

    return () => {
      isMounted = false;

      if (joinedChannelRef.current === scopedChannelId) {
        chatConnection.invoke("LeaveChannel", scopedChannelId).catch(() => {});
        joinedChannelRef.current = "";
      }

      chatConnection.off("ReceiveMessage", handleReceiveMessage);
      chatConnection.off("MessageDeleted", handleMessageDeleted);
      chatConnection.off("MessagesRead", handleMessagesRead);
    };
  }, [currentUserId, isDirectChat, scopedChannelId]);

  useEffect(() => {
    const handleProfileUpdated = (payload) => {
      const updatedUserId = String(payload?.userId || "");
      if (!updatedUserId) {
        return;
      }

      const nextFirstName = String(payload?.first_name || payload?.firstName || "").trim();
      const nextLastName = String(payload?.last_name || payload?.lastName || "").trim();
      const nextAvatar = String(payload?.avatar_url || payload?.avatarUrl || payload?.avatar || "").trim();
      const nextUsername = `${nextFirstName} ${nextLastName}`.trim();

      setMessagesByChannel((previous) =>
        Object.fromEntries(
          Object.entries(previous || {}).map(([channelKey, channelMessages]) => [
            channelKey,
            Array.isArray(channelMessages)
              ? channelMessages.map((messageItem) =>
                  String(messageItem?.authorUserId || "") === updatedUserId
                    ? {
                        ...messageItem,
                        username: nextUsername || messageItem.username || "User",
                        photoUrl: nextAvatar || messageItem.photoUrl || DEFAULT_AVATAR,
                      }
                    : messageItem
                )
              : channelMessages,
          ])
        )
      );
    };

    chatConnection.on("ProfileUpdated", handleProfileUpdated);

    return () => {
      chatConnection.off("ProfileUpdated", handleProfileUpdated);
    };
  }, []);

  const uploadAttachment = async (file) => {
    const formData = new FormData();
    formData.append("file", file);

    const response = await authFetch(`${API_URL}/api/chat-files/upload`, {
      method: "POST",
      body: formData,
    });

    const rawText = await response.text();
    let data = null;

    if (rawText) {
      try {
        data = JSON.parse(rawText);
      } catch {
        data = { message: rawText };
      }
    }

    if (!response.ok) {
      throw new Error(data?.message || "Не удалось загрузить файл");
    }

    return data;
  };

  const send = async () => {
    if ((!message.trim() && !selectedFile) || !scopedChannelId) {
      return;
    }

    const now = Date.now();
    const cooldownLeft = MESSAGE_SEND_COOLDOWN_MS - (now - lastSendAtRef.current);
    if (cooldownLeft > 0) {
      setErrorMessage("Подождите 1.5 секунды перед следующим сообщением.");
      return;
    }

    const avatar = user?.avatarUrl || user?.avatar || DEFAULT_AVATAR;

    try {
      setErrorMessage("");
      await ensureChannelJoined();

      let attachment = null;
      if (selectedFile) {
        setUploadingFile(true);
        attachment = await uploadAttachment(selectedFile);
      }

      await chatConnection.invoke(
        "SendMessage",
        scopedChannelId,
        getUserName(user),
        message.trim(),
        avatar,
        attachment?.fileUrl || null,
        attachment?.fileName || selectedFile?.name || null,
        attachment?.size || selectedFile?.size || null,
        attachment?.contentType || selectedFile?.type || null
      );

      forceScrollToBottomRef.current = true;
      lastSendAtRef.current = Date.now();
      setMessage("");
      setSelectedFile(null);
      setIsChannelReady(true);
    } catch (error) {
      console.error("SendMessage error:", error);
      joinedChannelRef.current = "";
      setIsChannelReady(false);
      setErrorMessage(getChatErrorMessage(error, "Не удалось отправить сообщение."));
    } finally {
      setUploadingFile(false);
    }
  };

  const handleFileChange = (event) => {
    const file = event.target.files?.[0] || null;
    event.target.value = "";

    if (!file) {
      return;
    }

    if (file.size > MAX_FILE_SIZE_BYTES) {
      setErrorMessage("Файл должен быть не больше 100 МБ.");
      return;
    }

    setErrorMessage("");
    setSelectedFile(file);
  };

  const normalizedSearchQuery = searchQuery.trim().toLowerCase();
  const searchResults = useMemo(() => {
    if (normalizedSearchQuery.length < 2) {
      return [];
    }

    return messages
      .filter((messageItem) => {
        const messageText = String(messageItem.message || "").toLowerCase();
        const attachmentName = String(messageItem.attachmentName || "").toLowerCase();
        return messageText.includes(normalizedSearchQuery) || attachmentName.includes(normalizedSearchQuery);
      })
      .map((messageItem) => ({
        id: messageItem.id,
        username: messageItem.username,
        timestamp: messageItem.timestamp,
        preview: String(messageItem.message || messageItem.attachmentName || "").trim(),
      }));
  }, [messages, normalizedSearchQuery]);

  const scrollToMessage = (messageId) => {
    const element = messageRefs.current.get(messageId);
    if (!element) {
      return;
    }

    setHighlightedMessageId(String(messageId));
    element.scrollIntoView({ behavior: "smooth", block: "center" });
    window.setTimeout(() => {
      setHighlightedMessageId((current) => (current === String(messageId) ? "" : current));
    }, 2200);
  };

  const openMediaPreview = (type, url, name) => {
    if (!url) {
      return;
    }

    setMediaPreview({
      type,
      url,
      name: name || (type === "image" ? "Изображение" : "Видео"),
    });
  };

  return (
    <div className="textchat-container">
      {normalizedSearchQuery.length >= 2 ? (
        <div className="message-search-panel">
          <div className="message-search-panel__header">
            <strong>Результаты поиска</strong>
            <span>{searchResults.length ? `${searchResults.length} найдено` : "Совпадений нет"}</span>
          </div>
          {searchResults.length ? (
            <div className="message-search-panel__list">
              {searchResults.slice(0, 8).map((result) => (
                <button key={result.id} type="button" className="message-search-panel__item" onClick={() => scrollToMessage(result.id)}>
                  <strong>{result.username || "User"}</strong>
                  <span>{result.preview || "Сообщение без текста"}</span>
                  <small>{formatTimestamp(result.timestamp)}</small>
                </button>
              ))}
            </div>
          ) : (
            <div className="message-search-panel__empty">В текущем канале ничего не найдено.</div>
          )}
        </div>
      ) : null}

      {isDirectChat && floatingDateLabel ? <div className="messages-floating-date">{floatingDateLabel}</div> : null}

      <div ref={messagesListRef} className="messages-list">
        {messages.map((messageItem) => {
          const attachmentUrl = messageItem.attachmentUrl
            ? resolveMediaUrl(messageItem.attachmentUrl, messageItem.attachmentUrl)
            : "";
          const isOwnMessage =
            String(messageItem.authorUserId || "") === currentUserId ||
            (!messageItem.authorUserId && messageItem.username?.toLowerCase() === getUserName(user).toLowerCase());

          return (
            <div
              key={messageItem.id}
              ref={(node) => {
                if (node) {
                  messageRefs.current.set(messageItem.id, node);
                } else {
                  messageRefs.current.delete(messageItem.id);
                }
              }}
              className={`message-item ${isDirectChat ? "message-item--dm" : ""} ${isDirectChat && isOwnMessage ? "message-item--dm-own" : ""} ${isDirectChat && !isOwnMessage ? "message-item--dm-incoming" : ""} ${String(messageItem.id) === highlightedMessageId ? "message-item--highlighted" : ""}`}
            >
              <img src={resolveMediaUrl(messageItem.photoUrl, DEFAULT_AVATAR)} alt="avatar" className="msg-avatar" />

              <div className={`msg-content ${isDirectChat ? "msg-content--dm" : ""} ${isDirectChat && isOwnMessage ? "msg-content--dm-own" : ""}`}>
                {!isDirectChat || !isOwnMessage ? (
                  <div className="message-author">
                    <span>{messageItem.username}</span>
                    {!isDirectChat ? (
                      <span className="message-meta">
                        <span className="message-time">{formatTimestamp(messageItem.timestamp)}</span>
                      </span>
                    ) : null}
                  </div>
                ) : null}

                {messageItem.message ? <div className="message-text">{messageItem.message}</div> : null}

                {attachmentUrl ? (
                  isImageAttachment(messageItem) ? (
                    <button
                      type="button"
                      className="message-media message-media--button"
                      onClick={() => openMediaPreview("image", attachmentUrl, messageItem.attachmentName)}
                      aria-label={`Открыть изображение ${messageItem.attachmentName || ""}`.trim()}
                    >
                      <img className="message-media__image" src={attachmentUrl} alt={messageItem.attachmentName || "image"} />
                    </button>
                  ) : isVideoAttachment(messageItem) ? (
                    <button
                      type="button"
                      className="message-media message-media--video message-media--button"
                      onClick={() => openMediaPreview("video", attachmentUrl, messageItem.attachmentName)}
                      aria-label={`Открыть видео ${messageItem.attachmentName || ""}`.trim()}
                    >
                      <video className="message-media__video" src={attachmentUrl} preload="metadata" playsInline muted />
                      <span className="message-media__play" aria-hidden="true" />
                    </button>
                  ) : (
                    <a className="message-attachment" href={attachmentUrl} target="_blank" rel="noreferrer">
                      <span className="message-attachment__icon" aria-hidden="true" />
                      <span className="message-attachment__meta">
                        <span className="message-attachment__name">{messageItem.attachmentName || "Файл"}</span>
                        <span className="message-attachment__size">{formatFileSize(messageItem.attachmentSize)}</span>
                      </span>
                    </a>
                  )
                ) : null}

                {isDirectChat ? (
                  <div className={`message-footer ${isOwnMessage ? "message-footer--own" : ""}`}>
                    <span className="message-time">{formatTime(messageItem.timestamp)}</span>
                    {isOwnMessage ? (
                      <span className={`message-read-status ${messageItem.isRead ? "message-read-status--read" : ""}`}>
                        <span className="message-read-status__check" />
                        <span className="message-read-status__check" />
                      </span>
                    ) : null}
                  </div>
                ) : null}
              </div>

              {isOwnMessage && (
                <button
                  type="button"
                  className="message-delete"
                  onClick={() => chatConnection.invoke("DeleteMessage", messageItem.id).catch(console.error)}
                  aria-label="Удалить сообщение"
                  title="Удалить сообщение"
                >
                  <span className="message-delete__icon" aria-hidden="true" />
                </button>
              )}
            </div>
          );
        })}
        <div ref={messagesEndRef} />
      </div>

      <div className="input-area">
        <div className="input-area__editor">
          {selectedFile ? (
            <div className="chat-file-pill">
              <span className="chat-file-pill__name">{selectedFile.name}</span>
              <span className="chat-file-pill__size">{formatFileSize(selectedFile.size)}</span>
              <button type="button" className="chat-file-pill__remove" onClick={() => setSelectedFile(null)}>
                x
              </button>
            </div>
          ) : null}

          <div className="input-area__controls">
            <div className="message-composer">
              <label className="attach-button" aria-label="Добавить файл" title="Добавить файл">
                <input type="file" className="attach-button__input" onChange={handleFileChange} />
                <span className="attach-button__icon" aria-hidden="true" />
              </label>
              <textarea
                ref={textareaRef}
                value={message}
                onChange={(event) => setMessage(event.target.value)}
                placeholder="Введите сообщение..."
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    send();
                  }
                }}
              />
            </div>
          </div>
        </div>
      </div>

      {!isChannelReady && scopedChannelId ? (
        <div className="chat-error">Чат переподключается. Если это личка, попробуйте отправить ещё раз через секунду.</div>
      ) : null}
      {errorMessage ? <div className="chat-error">{errorMessage}</div> : null}

      {mediaPreview ? (
        <div className="media-preview" onClick={() => setMediaPreview(null)} role="presentation">
          <div className="media-preview__dialog" onClick={(event) => event.stopPropagation()} role="dialog" aria-modal="true" aria-label={mediaPreview.name}>
            <button
              type="button"
              className="media-preview__close"
              onClick={() => setMediaPreview(null)}
              aria-label="Закрыть предпросмотр"
            >
              <span className="media-preview__close-icon" aria-hidden="true" />
            </button>
            <div className="media-preview__content">
              {mediaPreview.type === "image" ? (
                <img className="media-preview__image" src={mediaPreview.url} alt={mediaPreview.name} />
              ) : (
                <video className="media-preview__video" src={mediaPreview.url} controls autoPlay playsInline />
              )}
            </div>
            <div className="media-preview__caption">{mediaPreview.name}</div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

