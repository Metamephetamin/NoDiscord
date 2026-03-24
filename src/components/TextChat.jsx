import { useEffect, useRef, useState } from "react";
import chatConnection, { startChatConnection } from "../SignalR/ChatConnect";
import "../css/TextChat.css";
import { DEFAULT_AVATAR, resolveMediaUrl } from "../utils/media";

const getUserName = (user) => user?.firstName || user?.first_name || user?.name || "User";

export default function TextChat({ channelId, user }) {
  const [message, setMessage] = useState("");
  const [messagesByChannel, setMessagesByChannel] = useState({});
  const messagesEndRef = useRef(null);
  const textareaRef = useRef(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messagesByChannel, channelId]);

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const minHeight = 44;
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
    if (!channelId) return;

    const init = async () => {
      try {
        await startChatConnection();

        chatConnection.off("ReceiveMessage");
        chatConnection.off("MessageDeleted");

        const initialMessages = await chatConnection.invoke("JoinChannel", channelId.toString());
        setMessagesByChannel((prev) => ({ ...prev, [channelId]: initialMessages }));

        chatConnection.on("ReceiveMessage", (nextMessage) => {
          setMessagesByChannel((prev) => {
            const channelMessages = prev[channelId] || [];
            return { ...prev, [channelId]: [...channelMessages, nextMessage] };
          });
        });

        chatConnection.on("MessageDeleted", (deletedId) => {
          setMessagesByChannel((prev) => {
            const channelMessages = prev[channelId] || [];
            return { ...prev, [channelId]: channelMessages.filter((item) => item.id !== deletedId) };
          });
        });
      } catch (err) {
        console.error("SignalR connection error:", err);
      }
    };

    init();

    return () => {
      chatConnection.invoke("LeaveChannel", channelId.toString()).catch(console.error);
    };
  }, [channelId]);

  const send = async () => {
    if (!message.trim()) return;
    const avatar = user?.avatarUrl || user?.avatar || DEFAULT_AVATAR;
    try {
      await chatConnection.invoke("SendMessage", channelId.toString(), getUserName(user), message, avatar);
      setMessage("");
    } catch (err) {
      console.error("SendMessage error:", err);
    }
  };

  const messages = messagesByChannel[channelId] || [];
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
              <div className="message-text">{messageItem.message}</div>
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
        <button type="button" className="send-button" onClick={send}>
          Отправить
        </button>
      </div>
    </div>
  );
}
