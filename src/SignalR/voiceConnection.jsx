import { HubConnectionBuilder } from "@microsoft/signalr";
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
    .withAutomaticReconnect()
    .build();

  connection.on("voice:update", (data) => {
    onUpdate(data);
  });

  connection
    .start()
    .then(() => console.log("SignalR connected"))
    .catch((err) => console.error("SignalR error", err));

  return connection;
};

export const stopVoiceConnection = () => {
  if (connection) {
    connection.stop();
    connection = null;
  }
};
