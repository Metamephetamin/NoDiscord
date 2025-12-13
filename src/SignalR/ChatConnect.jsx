import * as signalR from "@microsoft/signalr";

const chatConnection = new signalR.HubConnectionBuilder()
  .withUrl("https://localhost:7031/chatHub") // URL к твоему Hub
  .withAutomaticReconnect()
  .build();

let isConnected = false;

// Старт соединения один раз
export const startChatConnection = async () => {
  if (!isConnected) {
    try {
      await chatConnection.start();
      console.log("SignalR connected");
      isConnected = true;
    } catch (err) {
      console.error("Failed to start SignalR connection:", err);
      setTimeout(startChatConnection, 2000); // попытка переподключения
    }
  }
};

export default chatConnection;
