import AnimatedAvatar from "./AnimatedAvatar";

const DeviceSettingsButton = ({ settingsIcon, onClick }) => (
  <button type="button" className="device-menu__settings" onClick={onClick}>
    <span>Настройки голоса</span>
    <img src={settingsIcon} alt="" />
  </button>
);

const MicMenuPanel = ({
  audioInputDevices,
  selectedInputDeviceId,
  deviceInputLabel,
  noiseProfileOptions,
  noiseSuppressionMode,
  activeNoiseProfile,
  micVolume,
  activeMicMenuBars,
  settingsIcon,
  onInputDeviceChange,
  onNoiseProfileChange,
  onMicVolumeChange,
  onOpenVoiceSettings,
}) => (
  <div className="device-menu__panel">
    <div className="device-menu__group">
      <label className="device-menu__field">
        <span className="device-menu__label">Устройство ввода</span>
        <select className="device-menu__select" value={selectedInputDeviceId} onChange={(event) => onInputDeviceChange(event.target.value)}>
          {audioInputDevices.length > 0 ? audioInputDevices.map((device) => (
            <option key={device.id} value={device.id}>{device.label}</option>
          )) : <option value="">Системный микрофон</option>}
        </select>
        <span className="device-menu__value">{deviceInputLabel}</span>
      </label>

      <label className="device-menu__field">
        <span className="device-menu__label">Профиль ввода</span>
        <select className="device-menu__select" value={noiseSuppressionMode} onChange={(event) => onNoiseProfileChange(event.target.value)}>
          {noiseProfileOptions.map((option) => (
            <option key={option.id} value={option.id}>{option.title}</option>
          ))}
        </select>
        <span className="device-menu__value">{activeNoiseProfile.description}</span>
      </label>
    </div>

    <div className="device-menu__slider">
      <span>Громкость микрофона</span>
      <input type="range" min="0" max="100" value={micVolume} onChange={(event) => onMicVolumeChange(Number(event.target.value))} />
      <div className="device-menu__meter" aria-hidden="true">
        {Array.from({ length: 24 }).map((_, index) => (
          <span key={index} className={index < activeMicMenuBars ? "is-active" : ""} />
        ))}
      </div>
    </div>

    <DeviceSettingsButton settingsIcon={settingsIcon} onClick={onOpenVoiceSettings} />
  </div>
);

const SoundMenuPanel = ({
  audioOutputDevices,
  selectedOutputDeviceId,
  outputSelectionAvailable,
  deviceOutputLabel,
  audioVolume,
  settingsIcon,
  onOutputDeviceChange,
  onAudioVolumeChange,
  onOpenVoiceSettings,
}) => (
  <div className="device-menu__panel">
    <div className="device-menu__group">
      <label className="device-menu__field">
        <span className="device-menu__label">Устройство вывода</span>
        <select className="device-menu__select" value={selectedOutputDeviceId} onChange={(event) => onOutputDeviceChange(event.target.value)} disabled={!outputSelectionAvailable}>
          {audioOutputDevices.length > 0 ? audioOutputDevices.map((device) => (
            <option key={device.id} value={device.id}>{device.label}</option>
          )) : <option value="">Системный вывод</option>}
        </select>
        <span className="device-menu__value">
          {outputSelectionAvailable ? deviceOutputLabel : "Переключение вывода недоступно в этой среде"}
        </span>
      </label>
    </div>

    <div className="device-menu__slider">
      <span>Громкость звука</span>
      <input type="range" min="0" max="100" value={audioVolume} onChange={(event) => onAudioVolumeChange(Number(event.target.value))} />
    </div>

    <DeviceSettingsButton settingsIcon={settingsIcon} onClick={onOpenVoiceSettings} />
  </div>
);

export default function MenuProfilePanel({
  currentVoiceChannel,
  currentVoiceChannelName,
  pingTone,
  pingTooltip,
  isCurrentUserSpeaking,
  isScreenShareActive,
  isCameraShareActive,
  isMicMuted,
  isSoundMuted,
  showMicMenu,
  showSoundMenu,
  micMenuRef,
  soundMenuRef,
  avatarInputRef,
  serverIconInputRef,
  userAvatarSrc,
  userAvatarFrame,
  displayName,
  audioInputDevices,
  audioOutputDevices,
  selectedInputDeviceId,
  selectedOutputDeviceId,
  outputSelectionAvailable,
  deviceInputLabel,
  deviceOutputLabel,
  noiseProfileOptions,
  noiseSuppressionMode,
  activeNoiseProfile,
  micVolume,
  audioVolume,
  activeMicMenuBars,
  icons,
  onOpenProfileSettings,
  onOpenVoiceSettings,
  onScreenShareAction,
  onOpenCamera,
  onLeaveVoiceChannel,
  onAvatarChange,
  onServerIconChange,
  onToggleMicMute,
  onToggleSoundMute,
  onToggleMicMenu,
  onToggleSoundMenu,
  onInputDeviceChange,
  onOutputDeviceChange,
  onNoiseProfileChange,
  onMicVolumeChange,
  onAudioVolumeChange,
  onSuppressTooltip,
  onRestoreTooltip,
}) {
  return (
    <div className={`menu__profile-wrapper ${currentVoiceChannel ? "menu__profile-wrapper--voice-connected" : ""}`}>
      {currentVoiceChannel ? (
        <div className="profile__voice-stack">
          <div className="profile__connection-card">
            <span
              className={`profile__ping-indicator ui-tooltip-anchor profile__ping-indicator--${pingTone}`}
              aria-label={pingTooltip}
              data-tooltip={pingTooltip}
            >
              <span className="profile__ping-icon" aria-hidden="true" />
            </span>
            <div className="profile__connection-copy">
              <span className="profile__connection-line">
                <span className="profile__connection-label">Подключено к</span>{" "}
                <span className="profile__connection-channel">{currentVoiceChannelName}</span>
              </span>
            </div>
            <div className="profile__connection-icons">
              <span className="profile__waveform profile__waveform--live" aria-hidden="true">
                <span />
                <span />
                <span />
                <span />
              </span>
            </div>
          </div>

          <div className="profile__quick-actions">
            <button type="button" className="profile__quick-button ui-tooltip-anchor" onClick={onOpenVoiceSettings} aria-label="Голос и видео" data-tooltip="Голос и видео">
              <span className="profile__quick-glyph profile__quick-glyph--settings" aria-hidden="true" />
            </button>
            <button
              type="button"
              className={`profile__quick-button ui-tooltip-anchor ${isScreenShareActive ? "profile__quick-button--active" : ""}`}
              onClick={onScreenShareAction}
              aria-label={isScreenShareActive ? "Остановить трансляцию экрана" : "Начать трансляцию экрана"}
              data-tooltip={isScreenShareActive ? "Остановить трансляцию экрана" : "Начать трансляцию экрана"}
            >
              <span className={`profile__quick-glyph ${isScreenShareActive ? "profile__quick-glyph--close" : "profile__quick-glyph--monitor"}`} aria-hidden="true" />
            </button>
            <button
              type="button"
              className={`profile__quick-button ui-tooltip-anchor ${isCameraShareActive ? "profile__quick-button--active" : ""}`}
              onClick={onOpenCamera}
              aria-label={isCameraShareActive ? "Управление камерой" : "Открыть камеру"}
              data-tooltip={isCameraShareActive ? "Управление камерой" : "Открыть камеру"}
            >
              <span className="profile__quick-glyph profile__quick-glyph--camera" aria-hidden="true" />
            </button>
            <button type="button" className="profile__quick-button profile__quick-button--danger ui-tooltip-anchor" onClick={onLeaveVoiceChannel} aria-label="Отключиться от голосового канала" data-tooltip="Отключиться">
              <span className="profile__quick-glyph profile__quick-glyph--disconnect" aria-hidden="true" />
            </button>
          </div>
        </div>
      ) : null}

      <div className={`menu__profile menu__profile--discordish ${currentVoiceChannel ? "menu__profile--voice-connected" : ""}`}>
        <div className="profile__identity-row">
          <button type="button" className="profile__identity" onClick={onOpenProfileSettings}>
            <AnimatedAvatar className={`avatar ${currentVoiceChannel && isCurrentUserSpeaking ? "avatar--speaking" : ""}`} src={userAvatarSrc} alt="avatar" frame={userAvatarFrame} />
            <input type="file" accept=".jpg,.jpeg,.png,.webp,.gif,.mp4,image/*,video/mp4" ref={avatarInputRef} className="hidden-input" onChange={onAvatarChange} />
            <input
              ref={serverIconInputRef}
              type="file"
              accept=".png,.jpg,.jpeg,.heif,.heic,.gif,.mp4,image/png,image/jpeg,image/heif,image/heic,image/gif,video/mp4"
              className="hidden-input"
              onChange={onServerIconChange}
            />
            <div className="profile__names">
              <span className="profile__username">{displayName}</span>
            </div>
          </button>

          <div className="profile__identity-controls">
            <div className="device-menu" ref={micMenuRef}>
              <button
                type="button"
                className={`profile__mini-icon profile__mini-icon--with-tooltip ${isMicMuted || isSoundMuted ? "profile__mini-icon--slashed" : ""}`}
                onClick={(event) => {
                  onSuppressTooltip(event);
                  onToggleMicMute();
                }}
                onMouseLeave={onRestoreTooltip}
                aria-label={isMicMuted ? "Включить микрофон" : "Выключить микрофон"}
              >
                <span className="profile__mini-glyph profile__mini-glyph--mic" aria-hidden="true" />
                <span className="profile__button-tooltip" aria-hidden="true">
                  {isMicMuted ? "Включить микрофон" : "Выключить микрофон"}
                </span>
              </button>
              <button type="button" className="profile__mini-arrow ui-tooltip-anchor" onClick={onToggleMicMenu} aria-label="Настройки микрофона" data-tooltip="Настройки микрофона">
                <span className="profile__mini-chevron" aria-hidden="true" />
              </button>
              {showMicMenu ? (
                <MicMenuPanel
                  audioInputDevices={audioInputDevices}
                  selectedInputDeviceId={selectedInputDeviceId}
                  deviceInputLabel={deviceInputLabel}
                  noiseProfileOptions={noiseProfileOptions}
                  noiseSuppressionMode={noiseSuppressionMode}
                  activeNoiseProfile={activeNoiseProfile}
                  micVolume={micVolume}
                  activeMicMenuBars={activeMicMenuBars}
                  settingsIcon={icons.settings}
                  onInputDeviceChange={onInputDeviceChange}
                  onNoiseProfileChange={onNoiseProfileChange}
                  onMicVolumeChange={onMicVolumeChange}
                  onOpenVoiceSettings={onOpenVoiceSettings}
                />
              ) : null}
            </div>

            <div className="device-menu" ref={soundMenuRef}>
              <button
                type="button"
                className={`profile__mini-icon profile__mini-icon--with-tooltip ${isSoundMuted ? "profile__mini-icon--slashed" : ""}`}
                onClick={(event) => {
                  onSuppressTooltip(event);
                  onToggleSoundMute();
                }}
                onMouseLeave={onRestoreTooltip}
                aria-label={isSoundMuted ? "Включить звук" : "Выключить звук"}
              >
                <span className="profile__mini-glyph profile__mini-glyph--headphones" aria-hidden="true" />
                <span className="profile__button-tooltip" aria-hidden="true">
                  {isSoundMuted ? "Включить звук" : "Выключить звук"}
                </span>
              </button>
              <button type="button" className="profile__mini-arrow ui-tooltip-anchor" onClick={onToggleSoundMenu} aria-label="Настройки звука" data-tooltip="Настройки звука">
                <span className="profile__mini-chevron" aria-hidden="true" />
              </button>
              {showSoundMenu ? (
                <SoundMenuPanel
                  audioOutputDevices={audioOutputDevices}
                  selectedOutputDeviceId={selectedOutputDeviceId}
                  outputSelectionAvailable={outputSelectionAvailable}
                  deviceOutputLabel={deviceOutputLabel}
                  audioVolume={audioVolume}
                  settingsIcon={icons.settings}
                  onOutputDeviceChange={onOutputDeviceChange}
                  onAudioVolumeChange={onAudioVolumeChange}
                  onOpenVoiceSettings={onOpenVoiceSettings}
                />
              ) : null}
            </div>

            <button type="button" className="profile__mini-icon ui-tooltip-anchor" onClick={onOpenVoiceSettings} aria-label="Голос и видео" data-tooltip="Голос и видео">
              <span className="profile__mini-glyph profile__mini-glyph--settings" aria-hidden="true" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
