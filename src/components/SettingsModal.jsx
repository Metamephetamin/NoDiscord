import React, { useEffect, useState } from "react";
import { Track } from "livekit-client";

export default function SettingsSmall({ room, onClose }) {
  const [micVolume, setMicVolume] = useState(100);
  const [remoteVolume, setRemoteVolume] = useState(100);

  // === МИКРОФОН ===
  const handleMicChange = (value) => {
    setMicVolume(value);

    const trackPub = room.localParticipant.getTrack(Track.Source.Microphone);

    if (trackPub && trackPub.audioTrack) {
      // громкость 0–1
      trackPub.audioTrack.setVolume(value / 100);
    }
  };

  // === ГРОМКОСТЬ СОБЕСЕДНИКОВ ===
  const handleRemoteChange = (value) => {
    setRemoteVolume(value);

    room.participants.forEach((p) => {
      p.setVolume(value / 100); // встроенный LiveKit-метод
    });
  };

  return (
    <div
      style={{
        position: "absolute",
        top: 0,
        right: 0,
        margin: 10,
        padding: 15,
        background: "#222",
        borderRadius: 10,
        color: "white",
        width: 240,
        zIndex: 999,
        boxShadow: "0 5px 20px rgba(0,0,0,0.4)",
      }}
    >
      <h4 style={{ marginBottom: 12 }}>Аудио настройки</h4>

      {/* Громкость других */}
      <label style={{ display: "block", marginBottom: 10 }}>
        Громкость других:
        <input
          type="range"
          min="0"
          max="100"
          value={remoteVolume}
          onChange={(e) => handleRemoteChange(Number(e.target.value))}
          style={{ width: "100%" }}
        />
      </label>

      {/* Микрофон */}
      <label style={{ display: "block", marginBottom: 10 }}>
        Громкость микрофона:
        <input
          type="range"
          min="0"
          max="100"
          value={micVolume}
          onChange={(e) => handleMicChange(Number(e.target.value))}
          style={{ width: "100%" }}
        />
      </label>

      <button
        style={{
          marginTop: 5,
          width: "100%",
          padding: 8,
          border: "none",
          borderRadius: 6,
          background: "#444",
          color: "#fff",
          cursor: "pointer",
        }}
        onClick={onClose}
      >
        Закрыть
      </button>
    </div>
  );
}
