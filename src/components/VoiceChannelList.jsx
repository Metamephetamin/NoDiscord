import React, { useState, useEffect } from "react";
import { Room, createLocalAudioTrack } from "livekit-client";
import "../css/ListChannels.css";


const VoiceChannelList = ({ channels, user, room, setRoom }) => {
  const [activeChannel, setActiveChannel] = useState(null);
  const [participantsMap, setParticipantsMap] = useState({});

  // Обновление списка участников
  const updateParticipants = (channelName, roomInstance) => {
    if (!roomInstance || !roomInstance.participants) return;

    const list = Array.from(roomInstance.participants.values()).map((p) => {
      let meta = {};
      try {
        meta = p.metadata ? JSON.parse(p.metadata) : {};
      } catch (e) {
        console.warn("Ошибка парсинга metadata:", p.metadata);
      }
      return {
        sid: p.sid,
        name: meta.name || "Unknown",
        avatar: meta.avatar || "../image/avatar.jpg",
      };
    });

    setParticipantsMap((prev) => ({ ...prev, [channelName]: list }));
  };

  const joinChannel = async (channelName) => {
    if (!user) return;

    let newRoom = null;
    try {
      if (room) {
        await room.disconnect();
        setRoom(null);
      }

      const res = await fetch(
        `https://localhost:7031/api/livekit/join?roomName=${channelName}&userId=${user.id}&userName=${user.firstName}`
      );
      if (!res.ok) throw new Error("Не удалось получить токен LiveKit");
      const data = await res.json();

      newRoom = new Room();

      await newRoom.connect("ws://localhost:7880", data.token, {
        autoSubscribe: true,
        audio: true,
        video: false,
      });

      const localTrack = await createLocalAudioTrack();
      await newRoom.localParticipant.publishTrack(localTrack);

      // Устанавливаем метаданные локального участника
      const meta = { name: user.firstName, avatar: user.avatarUrl };
      newRoom.localParticipant.metadata = JSON.stringify(meta);

      newRoom.on("participantConnected", () => updateParticipants(channelName, newRoom));
      newRoom.on("participantDisconnected", () => updateParticipants(channelName, newRoom));

      // Подписка на аудио треки других участников
      newRoom.on("trackSubscribed", (track) => {
        if (track.kind === "audio") {
          const audioEl = document.createElement("audio");
          audioEl.autoplay = true;
          audioEl.srcObject = new MediaStream([track.mediaStreamTrack]);
          document.body.appendChild(audioEl);
        }
      });

      // Обновляем список участников сразу после подключения
      updateParticipants(channelName, newRoom);

      setRoom(newRoom);
      setActiveChannel(channelName);
    } catch (err) {
      console.error("Ошибка подключения к LiveKit:", err);
      if (newRoom) newRoom.disconnect();
    }
  };

  const leaveChannel = async () => {
    if (room) {
      await room.disconnect();
      setRoom(null);
    }
    setActiveChannel(null);
  };

  return (
    <ul>
      {channels.map((c) => (
        <li
          key={c}
          className="list__items"
          style={{
            backgroundColor: activeChannel === c ? "#b053f7f4" : "transparent",
            borderRadius: "5px",
            cursor: "pointer",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <strong onClick={() => joinChannel(c)}>{c}</strong>
            {activeChannel === c && (
              <button
                onClick={leaveChannel}
                style={{
                  marginLeft: "100px",
                  background: "#c74749f4",
                  color: "white",
                  border: "none",
                  borderRadius: "4px",
                  cursor: "pointer",
                  padding: "2px 6px",
                  fontSize: "12px",
                }}
              >
                Выйти
              </button>
            )}
          </div>

          {activeChannel === c &&
            participantsMap[c] &&
            participantsMap[c].map((p) => (
              <div
                key={p.sid}
                style={{ display: "flex", alignItems: "center", marginTop: "4px" }}
              >
                <img
                  src={p.avatar}
                  alt={p.name}
                  style={{
                    width: "24px",
                    height: "24px",
                    borderRadius: "50%",
                    marginRight: "5px",
                  }}
                />
                <span>{p.name}</span>
              </div>
            ))}
        </li>
      ))}
    </ul>
  );
};

export default VoiceChannelList;
