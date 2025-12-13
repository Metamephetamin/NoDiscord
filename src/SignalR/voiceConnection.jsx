import { HubConnectionBuilder } from "@microsoft/signalr";

let connection = null;

export const startVoiceConnection = (onUpdate) => {
  connection = new HubConnectionBuilder()
    .withUrl("https://localhost:5001/voiceHub", {
      withCredentials: true,
    })
    .withAutomaticReconnect()
    .build();

  connection.on("voice:update", data => {
    onUpdate(data);
  });

  connection.start()
    .then(() => console.log("SignalR connected"))
    .catch(err => console.error("SignalR error", err));
};

export const stopVoiceConnection = () => {
  if (connection) {
    connection.stop();
    connection = null;
  }
};
