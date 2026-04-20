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

const CHAT_START_RETRY_DELAYS_MS = [2000, 5000, 10000, 20000, 30000];
const CHAT_START_ERROR_LOG_COOLDOWN_MS = 15000;

let isConnected = false;
let startPromise = null;
let reconnectTimerId = 0;
let reconnectAttempt = 0;
let lastLoggedStartErrorSignature = "";
let lastLoggedStartErrorAt = 0;
let isStoppingConnection = false;

const clearScheduledReconnect = () => {
  if (reconnectTimerId && typeof window !== "undefined") {
    window.clearTimeout(reconnectTimerId);
  }
  reconnectTimerId = 0;
};

const resetReconnectState = () => {
  clearScheduledReconnect();
  reconnectAttempt = 0;
};

const logStartFailureOnce = (error) => {
  const nextSignature = String(error?.message || error || "unknown_chat_connection_error");
  const now = Date.now();
  if (
    nextSignature === lastLoggedStartErrorSignature
    && now - lastLoggedStartErrorAt < CHAT_START_ERROR_LOG_COOLDOWN_MS
  ) {
    return;
  }

  lastLoggedStartErrorSignature = nextSignature;
  lastLoggedStartErrorAt = now;
  console.error("Failed to start SignalR connection:", error);
};

const scheduleReconnect = () => {
  if (
    typeof window === "undefined"
    || reconnectTimerId
    || !getStoredToken()
    || chatConnection.state !== signalR.HubConnectionState.Disconnected
  ) {
    return;
  }

  const delay = CHAT_START_RETRY_DELAYS_MS[Math.min(reconnectAttempt, CHAT_START_RETRY_DELAYS_MS.length - 1)];
  reconnectAttempt += 1;
  reconnectTimerId = window.setTimeout(() => {
    reconnectTimerId = 0;
    if (
      !getStoredToken()
      || startPromise
      || chatConnection.state !== signalR.HubConnectionState.Disconnected
    ) {
      return;
    }

    startChatConnection().catch(() => {});
  }, delay);
};

export const startChatConnection = async () => {
  if (!getStoredToken()) {
    resetReconnectState();
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
      resetReconnectState();
      return chatConnection;
    } catch (error) {
      isConnected = false;
      logStartFailureOnce(error);

      if (isUnauthorizedError(error)) {
        resetReconnectState();
        notifyUnauthorizedSession("chat_signalr_401");
        return null;
      }

      if (chatConnection.state === signalR.HubConnectionState.Disconnected) {
        scheduleReconnect();
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
  resetReconnectState();

  if (!isConnected) {
    return;
  }

  isStoppingConnection = true;
  try {
    await chatConnection.stop();
  } finally {
    isStoppingConnection = false;
    isConnected = false;
  }
};

chatConnection.onclose(() => {
  isConnected = false;
  startPromise = null;
  if (isStoppingConnection) {
    return;
  }
  scheduleReconnect();
});

chatConnection.onreconnecting(() => {
  isConnected = false;
  startPromise = null;
});

chatConnection.onreconnected(() => {
  isConnected = true;
  resetReconnectState();
});

export default chatConnection;
