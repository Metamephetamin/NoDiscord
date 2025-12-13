import React, { useEffect, useRef, useState } from "react";
import { Room } from "livekit-client";

export default function ScreenViewer({ roomName, userId, userName, apiUrl }) {
  const videoRef = useRef();
  const [room, setRoom] = useState(null);

  useEffect(() => {
    const init = async () => {
      try {
        const res = await fetch(`${apiUrl}/api/livekit/join?roomName=${roomName}&userId=${userId}&userName=${userName}`);
        const data = await res.json();
        const token = data.token;
        const liveKitUrl = "ws://localhost:7880";

        const r = new Room();
        setRoom(r);
        await r.connect(liveKitUrl, token);

        // Подписываемся на видео треки участников
        r.on("trackSubscribed", (track, publication, participant) => {
          if (track.kind === "video") {
            track.attach(videoRef.current);
          }
        });

        // Подключаем уже опубликованные треки участников
        r.participants.forEach(participant => {
          participant.videoTracks.forEach(pub => {
            if (pub.track) pub.track.attach(videoRef.current);
          });
        });

      } catch (err) {
        console.error("Ошибка подключения к просмотру:", err);
      }
    };

    init();

    return () => {
      if (room) room.disconnect();
    };
  }, [roomName, userId, userName, apiUrl]);

  return (
    <video
      ref={videoRef}
      autoPlay
      controls
      style={{
        width: "100%",
        height: "100%",
        borderRadius: "10px",
        background: "#000",
      }}
    />
  );
}
