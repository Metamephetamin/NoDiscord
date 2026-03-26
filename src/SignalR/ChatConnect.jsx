import * as signalR from "@microsoft/signalr";
import { CHAT_HUB_URL } from "../config/runtime";
import { getStoredToken, isUnauthorizedError, notifyUnauthorizedSession } from "../utils/auth";

const chatConnection = new signalR.HubConnectionBuilder()
  .withUrl(CHAT_HUB_URL, {
    accessTokenFactory: () => getStoredToken(),
  })
  .configureLogging(signalR.LogLevel.Error)
  .withAutomaticReconnect([0, 2000, 5000, 10000])
  .build();

let isConnected = false;
let startPromise = null;

export const startChatConnection = async () => {
  if (!getStoredToken()) {
    notifyUnauthorizedSession("missing_chat_session");
    return null;
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
      isConnected = true;
      return chatConnection;
    } catch (error) {
      isConnected = false;
      console.error("Failed to start SignalR connection:", error);

      if (isUnauthorizedError(error)) {
        notifyUnauthorizedSession("chat_signalr_401");
        return null;
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
