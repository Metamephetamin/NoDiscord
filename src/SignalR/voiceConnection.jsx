import { HubConnectionBuilder, LogLevel } from "@microsoft/signalr";
import { VOICE_HUB_URL } from "../config/runtime";

let connection = null;

export const startVoiceConnection = (onUpdate) => {
  if (connection) {
    return connection;
  }

  connection = new HubConnectionBuilder()
    .withUrl(VOICE_HUB_URL, {
      withCredentials: true,
    })
    .configureLogging(LogLevel.Error)
    .withAutomaticReconnect()
    .build();

  connection.on("voice:update", (data) => {
    onUpdate(data);
  });

  connection
    .start()
    .catch((err) => console.error("SignalR error", err));

  return connection;
};

export const stopVoiceConnection = () => {
  if (connection) {
    connection.stop();
    connection = null;
  }
};
