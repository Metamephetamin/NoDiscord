import { useEffect, useRef, useState } from "react";
import chatConnection, { startChatConnection } from "../SignalR/ChatConnect";
import "../css/TextChat.css";
import { API_URL } from "../config/runtime";
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

export default function TextChat({ serverId, channelId, user }) {
  const [message, setMessage] = useState("");
  const [messagesByChannel, setMessagesByChannel] = useState({});
  const [selectedFile, setSelectedFile] = useState(null);
  const [uploadingFile, setUploadingFile] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const messagesEndRef = useRef(null);
  const textareaRef = useRef(null);
  const fileInputRef = useRef(null);
  const scopedChannelId = getScopedChatChannelId(serverId, channelId);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messagesByChannel, scopedChannelId]);

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const minHeight = 48;
    const maxHeight = 140;

    textarea.style.height = `${minHeight}px`;
    const nextHeight = Math.min(Math.max(textarea.scrollHeight, minHeight), maxHeight);
    textarea.style.height = `${nextHeight}px`;
    textarea.style.overflowY = textarea.scrollHeight > maxHeight ? "auto" : "hidden";
  }, [message]);

  function formatTimestamp(ts) {
    const date = new Date(ts);
    const now = new Date();
    const isToday =
      date.getDate() === now.getDate() &&
      date.getMonth() === now.getMonth() &&
      date.getFullYear() === now.getFullYear();
    const isYesterday =
      date.getDate() === now.getDate() - 1 &&
      date.getMonth() === now.getMonth() &&
      date.getFullYear() === now.getFullYear();
    const hours = date.getHours().toString().padStart(2, "0");
    const minutes = date.getMinutes().toString().padStart(2, "0");

    if (isToday) return `Сегодня в ${hours}:${minutes}`;
    if (isYesterday) return `Вчера в ${hours}:${minutes}`;
    return `${date.getDate()}.${(date.getMonth() + 1).toString().padStart(2, "0")}.${date.getFullYear()} в ${hours}:${minutes}`;
  }

  useEffect(() => {
    if (!scopedChannelId) return;

    const init = async () => {
      try {
        await startChatConnection();

        chatConnection.off("ReceiveMessage");
        chatConnection.off("MessageDeleted");

        const initialMessages = await chatConnection.invoke("JoinChannel", scopedChannelId);
        setMessagesByChannel((prev) => ({ ...prev, [scopedChannelId]: initialMessages }));

        chatConnection.on("ReceiveMessage", (nextMessage) => {
          setMessagesByChannel((prev) => {
            const channelMessages = prev[scopedChannelId] || [];
            return { ...prev, [scopedChannelId]: [...channelMessages, nextMessage] };
          });
        });

        chatConnection.on("MessageDeleted", (deletedId) => {
          setMessagesByChannel((prev) => {
            const channelMessages = prev[scopedChannelId] || [];
            return {
              ...prev,
              [scopedChannelId]: channelMessages.filter((item) => item.id !== deletedId),
            };
          });
        });
      } catch (err) {
        console.error("SignalR connection error:", err);
      }
    };

    init();

    return () => {
      chatConnection.invoke("LeaveChannel", scopedChannelId).catch(console.error);
    };
  }, [scopedChannelId]);

  const uploadAttachment = async (file) => {
    const formData = new FormData();
    formData.append("file", file);
    formData.append("userId", String(user?.id || user?.email || "guest"));

    const response = await fetch(`${API_URL}/api/chat-files/upload`, {
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
    if (!message.trim() && !selectedFile) return;

    const avatar = user?.avatarUrl || user?.avatar || DEFAULT_AVATAR;

    try {
      setErrorMessage("");
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
    } catch (err) {
      console.error("SendMessage error:", err);
      setErrorMessage(err.message || "Не удалось отправить сообщение");
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
  const currentUserName = getUserName(user).toLowerCase();

  return (
    <div className="textchat-container">
      <div className="messages-list">
        {messages.map((messageItem) => (
          <div key={messageItem.id} className="message-item">
            <img src={resolveMediaUrl(messageItem.photoUrl, DEFAULT_AVATAR)} alt="avatar" className="msg-avatar" />

            <div className="msg-content">
              <div className="message-author">
                {messageItem.username}
                <span className="message-time">{formatTimestamp(messageItem.timestamp)}</span>
              </div>

              {messageItem.message ? <div className="message-text">{messageItem.message}</div> : null}

              {messageItem.attachmentUrl ? (
                <a
                  className="message-attachment"
                  href={resolveMediaUrl(messageItem.attachmentUrl, messageItem.attachmentUrl)}
                  target="_blank"
                  rel="noreferrer"
                >
                  {isImageAttachment(messageItem) ? (
                    <img
                      className="message-attachment__preview"
                      src={resolveMediaUrl(messageItem.attachmentUrl, messageItem.attachmentUrl)}
                      alt={messageItem.attachmentName || "attachment"}
                    />
                  ) : (
                    <span className="message-attachment__icon" aria-hidden="true" />
                  )}
                  <span className="message-attachment__meta">
                    <span className="message-attachment__name">{messageItem.attachmentName || "Файл"}</span>
                    <span className="message-attachment__size">{formatFileSize(messageItem.attachmentSize)}</span>
                  </span>
                </a>
              ) : null}
            </div>

            {messageItem.username?.toLowerCase() === currentUserName && (
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
        ))}
        <div ref={messagesEndRef}></div>
      </div>

      <div className="input-area">
        <div className="input-area__editor">
          {selectedFile ? (
            <div className="chat-file-pill">
              <span className="chat-file-pill__name">{selectedFile.name}</span>
              <span className="chat-file-pill__size">{formatFileSize(selectedFile.size)}</span>
              <button type="button" className="chat-file-pill__remove" onClick={() => setSelectedFile(null)}>
                ×
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
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Введите сообщение..."
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  send();
                }
              }}
            />
            <button type="button" className="send-button" onClick={send} disabled={uploadingFile}>
              {uploadingFile ? "Загрузка..." : "Отправить"}
            </button>
          </div>
        </div>
      </div>

      {errorMessage ? <div className="chat-error">{errorMessage}</div> : null}
    </div>
  );
}
