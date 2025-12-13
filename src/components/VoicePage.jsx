import { useEffect, useState } from "react";
import { startVoiceConnection, stopVoiceConnection } from "../SignalR/voiceConnection";
import { joinVoiceChannel } from "../api/voiceApi";
import PeopleList from "../components/PeopleList";

const VoicePage = () => {
  const [participantsMap, setParticipantsMap] = useState({});

  const user = {
    id: "123",
    name: "Alex",
    avatar: "/avatar.jpg",
  };

  useEffect(() => {
    // 🔥 подключаем SignalR
    startVoiceConnection(setParticipantsMap);

    return () => {
      stopVoiceConnection();
    };
  }, []);

  const joinChannel = async (channel) => {
    await joinVoiceChannel({
      channel,
      userId: user.id,
      name: user.name,
      avatar: user.avatar,
    });
  };

  return (
    <div>
      <h2>Голосовые каналы</h2>

      <button onClick={() => joinChannel("general_voice")}>
        Войти в general
      </button>

      <button onClick={() => joinChannel("gaming")}>
        Войти в gaming
      </button>

      <button onClick={() => joinChannel("music-chat")}>
        Войти в music
      </button>

      <PeopleList participantsMap={participantsMap} />
    </div>
  );
};

export default VoicePage;
