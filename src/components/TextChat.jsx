import { useState, useEffect, useRef } from "react";
import chatConnection, { startChatConnection } from "../SignalR/ChatConnect";
import "../css/TextChat.css";

export default function TextChat({ channelId, user }) {
  const [message, setMessage] = useState("");
  const [messagesByChannel, setMessagesByChannel] = useState({});
  const messagesEndRef = useRef(null);

  // Автоскролл вниз при обновлении сообщений
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messagesByChannel, channelId]);

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
    return `${date.getDate()}.${(date.getMonth() + 1)
      .toString()
      .padStart(2, "0")}.${date.getFullYear()} в ${hours}:${minutes}`;
  }

  useEffect(() => {
    if (!channelId) return;

    const init = async () => {
      try {
        // Стартуем SignalR соединение
        await startChatConnection();

        // Отключаем старые обработчики
        chatConnection.off("ReceiveMessage");
        chatConnection.off("MessageDeleted");

        // Получаем последние 100 сообщений
        const initialMessages = await chatConnection.invoke("JoinChannel", channelId.toString());
        setMessagesByChannel((prev) => ({ ...prev, [channelId]: initialMessages }));

        // Подписка на новые сообщения
        chatConnection.on("ReceiveMessage", (msg) => {
          setMessagesByChannel((prev) => {
            const channelMsgs = prev[channelId] || [];
            return { ...prev, [channelId]: [...channelMsgs, msg] };
          });
        });

        // Подписка на удаление сообщений
        chatConnection.on("MessageDeleted", (deletedId) => {
          setMessagesByChannel((prev) => {
            const channelMsgs = prev[channelId] || [];
            return { ...prev, [channelId]: channelMsgs.filter(m => m.id !== deletedId) };
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
    try {
      await chatConnection.invoke(
        "SendMessage",
        channelId.toString(),
        user.firstName,
        message,
        user.avatar
      );
      setMessage("");
    } catch (err) {
      console.error("SendMessage error:", err);
    }
  };

  const messages = messagesByChannel[channelId] || [];

  return (
    <div className="textchat-container">
      <div className="messages-list">
        {messages.map((m) => (
          <div key={m.id} className="message-item">
            <img
              src={m.photoUrl || "/image/avatar.jpg"}
              alt="avatar"
              className="msg-avatar"
            />
            <div className="msg-content">
              <div className="message-author">
                {m.username} 
                <span className="message-time">{formatTimestamp(m.timestamp)}</span>
              </div>
              <div className="message-text">{m.message}</div>
            </div>

            {/* Кнопка удаления только для своих сообщений */}
            {m.username.toLowerCase() === user.firstName.toLowerCase() && (
              <button
                style={{ marginLeft: "10px" }}
                onClick={() => chatConnection.invoke("DeleteMessage", m.id).catch(console.error)}
              >
                Удалить
              </button>
            )}
          </div>
        ))}
        <div ref={messagesEndRef}></div>
      </div>

      <div className="input-area">
        <textarea
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
        <button onClick={send}>Отправить</button>
      </div>
    </div>
  );
}
