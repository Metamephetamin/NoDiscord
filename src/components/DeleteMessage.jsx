import React, { useEffect, useState } from "react";
import * as signalR from "@microsoft/signalr";

const DeleteMessage = ({ currentUser }) => {
  const [messages, setMessages] = useState([]);

const hubConnection = new signalR.HubConnectionBuilder()
    .withUrl("https://localhost:7031/chatHub") // совпадает с launchSettings.json
    .withAutomaticReconnect()
    .build();

  useEffect(() => {
    hubConnection.start().catch(err => console.error(err));

    hubConnection.on("ReceiveMessage", m => {
      setMessages(prev => [...prev, m]);
    });

    hubConnection.on("MessageDeleted", id => {
      setMessages(prev => prev.filter(m => m.Id !== id));
    });

    return () => {
      hubConnection.stop();
    };
  }, []);

  const handleDelete = (id) => {
    hubConnection.invoke("DeleteMessage", id).catch(err => console.error(err));
  };

  return (
    <div>
      {messages.map(msg => (
        <div key={m.Id} style={{ marginBottom: "10px" }}>
          <span><strong>{msg.Username}:</strong> {msg.Message}</span>
          
          {/* Кнопка удаления только для своих сообщений */}
          {msg.Username === currentUser.username && (
            <button 
              style={{ color: "green", marginLeft: "10px" }} 
              onClick={() => handleDelete(msg.Id)}
            >
              Удалить
            </button>
          )}
        </div>
      ))}
    </div>
  );
};

export default DeleteMessage;
