import { useEffect, useRef, useState } from "react";
import chatConnection, { startChatConnection } from "../SignalR/ChatConnect";
import "../css/TextChat.css";
import { API_URL } from "../config/runtime";
import { authFetch } from "../utils/auth";
import { DEFAULT_AVATAR, resolveMediaUrl } from "../utils/media";

const MAX_FILE_SIZE_BYTES = 100 * 1024 * 1024;

const getUserName = (user) => user?.firstName || user?.first_name || user?.name || "User";
const getScopedChatChannelId = (serverId, channelId) =>
  serverId && channelId ? `server:${serverId}::channel:${channelId}` : "";

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

export default function TextChat({ serverId, channelId, user, resolvedChannelId = "" }) {
  const [message, setMessage] = useState("");
  const [messagesByChannel, setMessagesByChannel] = useState({});
  const [selectedFile, setSelectedFile] = useState(null);
  const [uploadingFile, setUploadingFile] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [isChannelReady, setIsChannelReady] = useState(false);
  const messagesEndRef = useRef(null);
  const textareaRef = useRef(null);
  const fileInputRef = useRef(null);
  const joinedChannelRef = useRef("");
  const scopedChannelId = resolvedChannelId || getScopedChatChannelId(serverId, channelId);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messagesByChannel, scopedChannelId]);

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

    const init = async () => {
      try {
        setErrorMessage("");
        setIsChannelReady(false);

        chatConnection.off("ReceiveMessage", handleReceiveMessage);
        chatConnection.off("MessageDeleted", handleMessageDeleted);
        chatConnection.on("ReceiveMessage", handleReceiveMessage);
        chatConnection.on("MessageDeleted", handleMessageDeleted);

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
    };
  }, [scopedChannelId]);

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

  const messages = messagesByChannel[scopedChannelId] || [];
  const currentUserId = String(user?.id || "");

  return (
    <div className="textchat-container">
      <div className="messages-list">
        {messages.map((messageItem) => {
          const attachmentUrl = messageItem.attachmentUrl
            ? resolveMediaUrl(messageItem.attachmentUrl, messageItem.attachmentUrl)
            : "";

          return (
            <div key={messageItem.id} className="message-item">
              <img src={resolveMediaUrl(messageItem.photoUrl, DEFAULT_AVATAR)} alt="avatar" className="msg-avatar" />

              <div className="msg-content">
                <div className="message-author">
                  {messageItem.username}
                  <span className="message-time">{formatTimestamp(messageItem.timestamp)}</span>
                </div>

                {messageItem.message ? <div className="message-text">{messageItem.message}</div> : null}

                {attachmentUrl ? (
                  isImageAttachment(messageItem) ? (
                    <a className="message-media" href={attachmentUrl} target="_blank" rel="noreferrer">
                      <img className="message-media__image" src={attachmentUrl} alt={messageItem.attachmentName || "image"} />
                    </a>
                  ) : isVideoAttachment(messageItem) ? (
                    <div className="message-media message-media--video">
                      <video className="message-media__video" src={attachmentUrl} controls preload="metadata" playsInline />
                    </div>
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
              </div>

              {(String(messageItem.authorUserId || "") === currentUserId ||
                (!messageItem.authorUserId && messageItem.username?.toLowerCase() === getUserName(user).toLowerCase())) && (
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
            <button type="button" className="attach-button" onClick={() => fileInputRef.current?.click()}>
              <img src="/icons/plus.png" alt="" aria-hidden="true" />
            </button>
            <input ref={fileInputRef} type="file" className="hidden-input" onChange={handleFileChange} />
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
            <button type="button" className="send-button" onClick={send} disabled={uploadingFile || !scopedChannelId}>
              {uploadingFile ? "Загрузка..." : "Отправить"}
            </button>
          </div>
        </div>
      </div>

      {!isChannelReady && scopedChannelId ? (
        <div className="chat-error">Чат переподключается. Если это личка, попробуйте отправить ещё раз через секунду.</div>
      ) : null}
      {errorMessage ? <div className="chat-error">{errorMessage}</div> : null}
    </div>
  );
}
