import React, { useEffect, useRef } from "react";

const config = { iceServers: [{ urls: "stun:stun.l.google.com:19302" }] };
let peerConnections = {};

export default function ScreenShare({ connection }) {
  const videoRef = useRef();

  useEffect(() => {
    let localStream;

    async function startShare() {
      try {
        // Запрашиваем экран
        localStream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
        videoRef.current.srcObject = localStream;

        // Подписка на события SignalR
        connection.on("ReceiveScreenOffer", async (fromId, sdp) => {
          const pc = new RTCPeerConnection(config);
          peerConnections[fromId] = pc;

          localStream.getTracks().forEach(track => pc.addTrack(track, localStream));

          pc.onicecandidate = event => {
            if (event.candidate) {
              connection.invoke("SendIceCandidate", fromId, JSON.stringify(event.candidate));
            }
          };

          await pc.setRemoteDescription({ type: "offer", sdp });
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          await connection.invoke("SendScreenAnswer", fromId, answer.sdp);
        });

        connection.on("ReceiveScreenAnswer", async (fromId, sdp) => {
          const pc = peerConnections[fromId];
          await pc.setRemoteDescription({ type: "answer", sdp });
        });

        connection.on("ReceiveIceCandidate", async (fromId, candidate) => {
          const pc = peerConnections[fromId];
          await pc.addIceCandidate(new RTCIceCandidate(JSON.parse(candidate)));
        });
      } catch (err) {
        console.error("Ошибка трансляции экрана:", err);
      }
    }

    startShare();

    return () => {
      localStream?.getTracks().forEach(track => track.stop());
      Object.values(peerConnections).forEach(pc => pc.close());
      peerConnections = {};
    };
  }, [connection]);

  return (
    <video
      ref={videoRef}
      autoPlay
      muted
      style={{ width: "400px", border: "1px solid black" }}
    />
  );
}
