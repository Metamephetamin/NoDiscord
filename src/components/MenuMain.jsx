import React, { useState, useRef, useEffect } from "react";
import VoiceChannelList from "./VoiceChannelList";
import TextChat from "./TextChat";
import ScreenShareButton from "./ScreenShareButton";
import ScreenViewer from "./ScreenViewer";
import "../css/MenuMain.css";
import "../css/MenuProfile.css";
import "../css/ListChannels.css";

const textChannels = [
  { id: 1, name: "# general" },
  { id: 2, name: "#gaming" },
  { id: 3, name: "#music-chat" },
  { id: 4, name: "#off-topic" },
];

const LIVEKIT_URL = "ws://localhost:7880"; // Твой LiveKit URL
const API_URL = "https://localhost:7031"; // Твой API URL

const MenuMain = ({ user, setUser }) => {
  const [currentTextChannel, setCurrentTextChannel] = useState(1);
  const [room, setRoom] = useState(null);
  const [openSettings, setOpenSettings] = useState(false);
  const [micVolume, setMicVolume] = useState(70);
  const [audioVolume, setAudioVolume] = useState(70);
  const [streamers, setStreamers] = useState([]); // список активных стримеров
  const [currentStream, setCurrentStream] = useState(null); // выбранный стрим для просмотра
  const [showModal, setShowModal] = useState(false); // модалка настроек стрима
  const [resolution, setResolution] = useState("720p");
  const [fps, setFps] = useState(30);

  const popupRef = useRef(null);
  const fileInputRef = useRef(null);

  // ====== СМЕНА АВАТАРА ======
  const handleAvatarChange = async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    const formData = new FormData();
    formData.append("avatar", file);
    formData.append("userId", user.id);

    try {
      const res = await fetch(`${API_URL}/api/user/upload-avatar`, {
        method: "POST",
        body: formData,
      });
      if (!res.ok) throw new Error("Ошибка загрузки файла");
      const data = await res.json();
      setUser((prev) => ({ ...prev, avatarUrl: data.avatarUrl }));
    } catch (err) {
      console.error("Ошибка смены аватара:", err);
    }
  };

  // ====== КЛИК ВНЕ POPUP ======
  useEffect(() => {
    const handleClick = (e) => {
      if (popupRef.current && !popupRef.current.contains(e.target)) {
        setOpenSettings(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  // ====== MIC / AUDIO VOLUME ======
  const updateMicVolume = (value) => {
    setMicVolume(value);
    if (!room) return;
    room.localParticipant.audioTracks.forEach(pub => pub.track?.setVolume?.(value / 100));
    room.participants.forEach(p => p.audioTracks.forEach(pub => pub.track?.setVolume?.(value / 100)));
  };

  const updateAudioVolume = (value) => {
    setAudioVolume(value);
    if (!room) return;
    room.localParticipant.audioTracks.forEach(pub => pub.track?.setVolume?.(value / 100));
    room.participants.forEach(p => p.audioTracks.forEach(pub => pub.track?.setVolume?.(value / 100)));
  };

  if (!user) return <div>Загрузка пользователя...</div>;

  return (
    <div className="menu__main">
      {/* Левый блок */}
      <div className="sidebar__servers">
        <img className="btn__server" src="../../image/image.png" alt="server" />
        <img className="btn__create-server" src="../../icons/plus.png" alt="create" />
        <div className="logout">
          <img src="../../icons/logout.png" alt="logout" />
        </div>
      </div>

      {/* Центральный блок */}
      <div className="sidebar__channels">
        <div className="channels__top">
          {/* Текстовые каналы */}
          <div className="text__channel">
            <h1>Channels</h1>
            <h2>Text channels</h2>
            <ul>
              {textChannels.map((c) => (
                <li
                  key={c.id}
                  onClick={() => setCurrentTextChannel(c.id)}
                  className={currentTextChannel === c.id ? "active-channel" : ""}
                >
                  {c.name}
                </li>
              ))}
            </ul>
          </div>

          {/* Голосовые каналы */}
          <div className="voice__channels">
            <h2>Voice channels</h2>
            <VoiceChannelList
              channels={["general_voice", "gaming", "music-chat"]}
              user={user}
              room={room}
              setRoom={setRoom}
            />
          </div>
        </div>

        {/* Список Live Streams */}
        <div className="active-streamers">
          <h2>Live Streams</h2>
          {streamers.map((s) => (
            <div
              key={s.userId}
              className="streamer-item"
              onClick={() => setCurrentStream(s)}
              style={{
                cursor: "pointer",
                padding: "5px",
                background: currentStream?.userId === s.userId ? "#444" : "#222",
                marginBottom: "5px",
                borderRadius: "5px",
              }}
            >
              {s.userName}
            </div>
          ))}
        </div>

        {/* Видео стрима */}
        {currentStream && (
          <ScreenViewer
            roomName={currentStream.roomName}
            userId={user.id}
            userName={user.firstName}
            apiUrl={API_URL}
          />
        )}

        {/* Профиль */}
        <div className="menu__profile-wrapper">
          <div className="menu__profile">
            <div className="profile__top">
              <div className="profile__monitoring">
                <div className="wrap__wifi">
                  <img className="wifi" src="../../icons/wifi.png" alt="wifi" />
                </div>
                <div className="wrap__connect">
                  <span className="voice__monitoring">
                    {room ? `Подключено к: ${room.name}` : "Не подключено :("}
                  </span>
                </div>
              </div>

              <div className="profile__icons">
                <div className="wrap__icon" onClick={() => setOpenSettings((p) => !p)}>
                  <img src="../icons/settings.png" alt="settings" className="icon__settings" />
                </div>
                <div className="wrap__icon">
                  <img src="../icons/phone.png" alt="phone" className="icon__phone" />
                </div>
                <div className="wrap__icon">
                  <img src="../icons/volumespeacker.png" alt="vol" className="icon__volumespeacker" />
                </div>
                <div className="wrap__icon" onClick={() => setShowModal(true)}>
                  <img src="../icons/stream.png" alt="start stream" />
                </div>
              </div>
            </div>

            <div className="profile__bottom">
              <div className="profile__user">
                <img
                  className="avatar"
                  src={user.avatarUrl || "../image/avatar.jpg"}
                  alt="avatar"
                  style={{ cursor: "pointer" }}
                  onClick={() => fileInputRef.current.click()}
                />
                <input
                  type="file"
                  accept="image/*"
                  ref={fileInputRef}
                  style={{ display: "none" }}
                  onChange={handleAvatarChange}
                />
                <div className="profile__names">
                  <span>{user.firstName}</span>
                  <span className="status__profile">Статус: Online</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Чат */}
      <div className="chat__wrapper">
        <div className="chat__box">
          <h1>{textChannels.find((c) => c.id === currentTextChannel)?.name}</h1>
          <TextChat channelId={currentTextChannel} user={user} />
        </div>
      </div>

      {/* Popup настройки аудио */}
      {openSettings && (
        <div
          ref={popupRef}
          style={{
            position: "absolute",
            bottom: "90px",
            left: "220px",
            background: "#1e1e1e",
            padding: "15px",
            borderRadius: "10px",
            width: "240px",
            boxShadow: "0 8px 20px rgba(0,0,0,0.3)",
            zIndex: 999,
            color: "white",
          }}
        >
          <h3 style={{ marginTop: 0, marginBottom: 10 }}>Аудио настройки</h3>
          <label style={{ display: "block", marginBottom: 12 }}>
            Громкость микрофона: {micVolume}%
            <input
              type="range"
              min="0"
              max="100"
              value={micVolume}
              onChange={(e) => updateMicVolume(Number(e.target.value))}
              style={{ width: "100%" }}
            />
          </label>

          <label style={{ display: "block", marginBottom: 12 }}>
            Громкость всех участников: {audioVolume}%
            <input
              type="range"
              min="0"
              max="100"
              value={audioVolume}
              onChange={(e) => updateAudioVolume(Number(e.target.value))}
              style={{ width: "100%" }}
            />
          </label>
        </div>
      )}

      {/* Модалка настройки стрима */}
      {showModal && (
        <div className="stream-modal">
          <h3>Настройки трансляции</h3>
          <label>
            Разрешение:
            <select value={resolution} onChange={e => setResolution(e.target.value)}>
              <option value="720p">1280x720</option>
              <option value="1080p">1920x1080</option>
            </select>
          </label>
          <label>
            FPS:
            <input type="number" value={fps} onChange={e => setFps(Number(e.target.value))} />
          </label>
          <ScreenShareButton
            roomName={user.id}
            userId={user.id}
            userName={user.firstName}
            apiUrl={API_URL}
            resolution={resolution}
            fps={fps}
            onRoomReady={(roomInstance) => {
              setRoom(roomInstance);
              setStreamers(prev => [...prev, { userId: user.id, userName: user.firstName, roomName: user.id }]);
              setShowModal(false);
            }}
          />
        </div>
      )}
    </div>
  );
};

export default MenuMain;
