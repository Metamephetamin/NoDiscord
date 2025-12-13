import React from "react";
import { Room, createLocalAudioTrack } from "livekit-client";

const VoiceChannelItem = ({ room, user, currentRoom, setCurrentRoom }) => {

  const joinChannel = async () => {
    if (!user) return;

    try {
      // Автовыход из предыдущей комнаты
      if (currentRoom?.roomObj) {
        currentRoom.roomObj.disconnect();
      }

      const res = await fetch(
        `https://localhost:7031/api/livekit/join?roomName=${room}&userId=${user.id}&userName=${user.firstName}`
      );
      if (!res.ok) throw new Error("Не удалось получить токен LiveKit");
      const data = await res.json();

      const roomObj = new Room();
      await roomObj.connect("ws://localhost:7880", data.token, {
        autoSubscribe: true,
        audio: true,
        video: false,
      });

      // Локальный микрофон
      const localTrack = await createLocalAudioTrack({
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
        sampleRate: 48000,
        channelCount: 1,
      });
      roomObj.localParticipant.publishTrack(localTrack);

      // Воспроизведение чужого аудио
      roomObj.on("trackSubscribed", (track, participant) => {
        if (track.kind === "audio") {
          const audioEl = document.createElement("audio");
          audioEl.autoplay = true;
          audioEl.srcObject = new MediaStream([track.mediaStreamTrack]);
          document.body.appendChild(audioEl);
        }
      });

      roomObj.on("participantConnected", p => console.log("Новый участник:", p.identity));
      roomObj.on("participantDisconnected", p => console.log("Участник вышел:", p.identity));

      setCurrentRoom({ name: room, roomObj }); // сохраняем текущую комнату

    } catch (e) {
      console.error("Ошибка при подключении:", e);
    }
  };

  const leaveChannel = () => {
    if (currentRoom?.roomObj) {
      currentRoom.roomObj.disconnect();
    }
    setCurrentRoom(null);
  };

  const handleClick = () => {
    if (currentRoom?.name === room) leaveChannel();
    else joinChannel();
  };

  const isJoined = currentRoom?.name === room;

  return (
    <li
      onClick={handleClick}
      style={{
        padding: "10px",
        marginBottom: "6px",
        borderRadius: "4px",
        cursor: "default",
        backgroundColor: isJoined ? "#8ee4861e" : "#303030ff"
        
      }}
    >
      #{room}
    </li>
  );
};

export default VoiceChannelItem;
