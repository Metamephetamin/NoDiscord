import * as signalR from "@microsoft/signalr";
import { CHAT_HUB_URL } from "../config/runtime";

const chatConnection = new signalR.HubConnectionBuilder()
  .withUrl(CHAT_HUB_URL)
  .withAutomaticReconnect()
  .build();

let isConnected = false;

export const startChatConnection = async () => {
  if (!isConnected) {
    try {
      await chatConnection.start();
      console.log("SignalR connected");
      isConnected = true;
    } catch (err) {
      console.error("Failed to start SignalR connection:", err);
      setTimeout(startChatConnection, 2000);
    }
  }
};

export default chatConnection;
