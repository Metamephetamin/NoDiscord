import React, { useEffect, useRef, useState } from "react";

const config = { iceServers: [{ urls: "stun:stun.l.google.com:19302" }] };

export default function MultiScreenShare({ connection }) {
  const [remoteVideos, setRemoteVideos] = useState({});
  const localVideoRef = useRef();
  const peerConnections = useRef({}); // храним все RTCPeerConnection по id
  const localStreamRef = useRef();

  useEffect(() => {
    async function startScreenShare() {
      try {
        // 1️⃣ Получаем экран
        const localStream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
        localStreamRef.current = localStream;
        localVideoRef.current.srcObject = localStream;

        // 2️⃣ Слушаем приглашения от других пользователей
        connection.on("ReceiveScreenOffer", async (fromId, sdp) => {
          const pc = new RTCPeerConnection(config);
          peerConnections.current[fromId] = pc;

          // Добавляем свои треки
          localStream.getTracks().forEach(track => pc.addTrack(track, localStream));

          pc.onicecandidate = event => {
            if (event.candidate) {
              connection.invoke("SendIceCandidate", fromId, JSON.stringify(event.candidate));
            }
          };

          pc.ontrack = event => {
            setRemoteVideos(prev => ({
              ...prev,
              [fromId]: event.streams[0]
            }));
          };

          await pc.setRemoteDescription({ type: "offer", sdp });
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          await connection.invoke("SendScreenAnswer", fromId, answer.sdp);
        });

        connection.on("ReceiveScreenAnswer", async (fromId, sdp) => {
          const pc = peerConnections.current[fromId];
          if (pc) await pc.setRemoteDescription({ type: "answer", sdp });
        });

        connection.on("ReceiveIceCandidate", async (fromId, candidate) => {
          const pc = peerConnections.current[fromId];
          if (pc) await pc.addIceCandidate(new RTCIceCandidate(JSON.parse(candidate)));
        });

        // Можно отправить сигнал другим участникам, что мы начали трансляцию
        await connection.invoke("BroadcastScreenAvailable");

      } catch (err) {
        console.error("Ошибка трансляции экрана:", err);
      }
    }

    startScreenShare();

    return () => {
      // Очистка
      localStreamRef.current?.getTracks().forEach(track => track.stop());
      Object.values(peerConnections.current).forEach(pc => pc.close());
      peerConnections.current = {};
    };
  }, [connection]);

  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: "10px" }}>
      <div>
        <p>Моя трансляция:</p>
        <video ref={localVideoRef} autoPlay muted style={{ width: "300px", border: "1px solid black" }} />
      </div>

      {Object.entries(remoteVideos).map(([id, stream]) => (
        <div key={id}>
          <p>Участник {id}:</p>
          <video
            autoPlay
            playsInline
            srcObject={stream} // через ref нельзя напрямую, поэтому нужно будет через effect
            style={{ width: "300px", border: "1px solid black" }}
            ref={video => { if (video) video.srcObject = stream; }}
          />
        </div>
      ))}
    </div>
  );
}
