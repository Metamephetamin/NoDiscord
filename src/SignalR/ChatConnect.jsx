import * as signalR from "@microsoft/signalr";
import { CHAT_HUB_URL } from "../config/runtime";
import { getStoredToken, isUnauthorizedError, notifyUnauthorizedSession } from "../utils/auth";

const chatConnection = new signalR.HubConnectionBuilder()
  .withUrl(CHAT_HUB_URL, {
    accessTokenFactory: () => getStoredToken(),
  })
  .withAutomaticReconnect([0, 2000, 5000, 10000])
  .build();

let isConnected = false;
let startPromise = null;

export const startChatConnection = async () => {
  if (!getStoredToken()) {
    throw new Error("Сессия не найдена. Войдите в аккаунт.");
  }

  if (chatConnection.state === signalR.HubConnectionState.Connected) {
    isConnected = true;
    return chatConnection;
  }

  if (startPromise) {
    return startPromise;
  }

  if (
    chatConnection.state === signalR.HubConnectionState.Connecting ||
    chatConnection.state === signalR.HubConnectionState.Reconnecting
  ) {
    return chatConnection;
  }

  startPromise = (async () => {
    try {
      await chatConnection.start();
      console.log("SignalR connected");
      isConnected = true;
      return chatConnection;
    } catch (error) {
      isConnected = false;
      console.error("Failed to start SignalR connection:", error);

      if (isUnauthorizedError(error)) {
        notifyUnauthorizedSession("chat_signalr_401");
        throw new Error("Сессия истекла. Войдите снова.");
      }

      if (chatConnection.state === signalR.HubConnectionState.Disconnected) {
        window.setTimeout(() => {
          if (getStoredToken()) {
            startChatConnection().catch(() => {});
          }
        }, 2000);
      }

      throw error;
    } finally {
      startPromise = null;
    }
  })();

  return startPromise;
};

export const stopChatConnection = async () => {
  startPromise = null;

  if (!isConnected) {
    return;
  }

  try {
    await chatConnection.stop();
  } finally {
    isConnected = false;
  }
};

chatConnection.onclose(() => {
  isConnected = false;
  startPromise = null;
});

export default chatConnection;
