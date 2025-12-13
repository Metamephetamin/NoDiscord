import React, { useState, useRef } from "react";
import { Room, LocalVideoTrack } from "livekit-client";
import streamIcon from "../../icons/translations.png";// путь к иконке стрима

export default function ScreenShareButton({ roomName, userId, userName, apiUrl, onRoomReady }) {
  const [streaming, setStreaming] = useState(false);
  const [room, setRoom] = useState(null);
  const localVideoRef = useRef(null);

  const startScreenShare = async () => {
    if (streaming) return;

    try {
      // 1. Запрашиваем токен с сервера
      const res = await fetch(
        `${apiUrl}/api/livekit/join?roomName=${roomName}&userId=${userId}&userName=${userName}`
      );
      const data = await res.json();
      const token = data.token;
      const liveKitUrl = "ws://localhost:7880"; // твой LiveKit сервер

      // 2. Подключаемся к LiveKit
      const r = new Room();
      setRoom(r);
      await r.connect(liveKitUrl, token);
      onRoomReady(r);

      // 3. Захватываем экран пользователя
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: { cursor: "always" },
        audio: true,
      });

      // 4. Создаем LocalVideoTrack и публикуем
      const videoTrack = new LocalVideoTrack(stream.getTracks()[0]);
      await r.localParticipant.publishTrack(videoTrack);

      // 5. Привязываем поток к видео элементу, если он уже рендерен
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
      }

      setStreaming(true);
    } catch (err) {
      console.error("Ошибка старта стрима:", err);
    }
  };

  return (
    <div>
      {/* Иконка трансляции */}
      <img
          src={streamIcon}
        alt="Start Stream"
        style={{ width: "30px", cursor: "pointer" }}
        onClick={startScreenShare}
      />

      {/* Локальное превью стрима */}
      {streaming && (
        <video
          ref={localVideoRef}
          autoPlay
          muted
          style={{
            width: "200px",
            height: "120px",
            marginTop: "10px",
            borderRadius: "5px",
            border: "1px solid #444",
          }}
        />
      )}
    </div>
  );
}
