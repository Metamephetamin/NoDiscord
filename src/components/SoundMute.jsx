// import { useState, useEffect } from "react";
// import { createLocalAudioTrack } from "livekit-client";

// export default function ProfileControls({ room }) {
//   const [micMuted, setMicMuted] = useState(false); // по дефолту включён
//   const [audioMuted, setAudioMuted] = useState(false);
//   const [localTrack, setLocalTrack] = useState(null);

//   // Создаём локальный аудиотрек, если его ещё нет
//   useEffect(() => {
//     if (!room || localTrack) return;

//     async function initAudio() {
//       const track = await createLocalAudioTrack();
//       await room.localParticipant.publishTrack(track);
//       setLocalTrack(track);

//       // Убедимся, что трек включён по дефолту
//       track.enabled = true;
//       setMicMuted(false);
//     }

//     initAudio();
//   }, [room, localTrack]);

//   // ===== Микрофон =====
//   const toggleMic = () => {
//     if (!localTrack) return;

//     localTrack.enabled = !localTrack.enabled;
//     setMicMuted(!localTrack.enabled); // true = замьючен
//     console.log("Микрофон", localTrack.enabled ? "включен" : "выключен");
//   };

//   // ===== Входящий звук =====
//   const toggleAudio = () => {
//     if (!room) return;

//     room.participants.forEach((participant) => {
//       participant.audioTracks.forEach((pub) => {
//         if (pub.track) pub.track.setVolume(audioMuted ? 1 : 0);
//       });
//     });

//     setAudioMuted(!audioMuted);
//     console.log("Звук", audioMuted ? "включен" : "выключен");
//   };

//   // Авто-мутация новых треков участников
//   useEffect(() => {
//     if (!room) return;

//     const handleTrackSubscribed = (track) => {
//       if (audioMuted && track.kind === "audio") {
//         track.setVolume(0);
//       }
//     };

//     room.on("trackSubscribed", handleTrackSubscribed);
//     return () => room.off("trackSubscribed", handleTrackSubscribed);
//   }, [room, audioMuted]);

//   return (
//     <div className="profile__controls">
//       <div className={`icon__wrap ${micMuted ? "active" : ""}`} onClick={toggleMic}>
//         <img className="icon icon-microphone" src="../../icons/microphone.png" alt="mic" />
//       </div>
//       <div className={`icon__wrap ${audioMuted ? "active" : ""}`} onClick={toggleAudio}>
//         <img className="icon icon-headphones" src="../../icons/headphones.png" alt="headphones" />
//       </div>
//     </div>
//   );
// }
