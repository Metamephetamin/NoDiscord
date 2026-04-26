import AnimatedAvatar from "./AnimatedAvatar";
import PercentageSlider from "./PercentageSlider";

const DeviceSettingsButton = ({ settingsIcon, onClick }) => (
  <button type="button" className="device-menu__settings" onClick={onClick}>
    <span>Настройки голоса</span>
    <img src={settingsIcon} alt="" />
  </button>
);

const DeviceToggleButton = ({ active, title, onClick }) => (
  <button
    type="button"
    className={`device-menu__toggle ${active ? "device-menu__toggle--active" : ""}`}
    onClick={onClick}
    aria-pressed={active}
  >
    <span className="device-menu__label">{title}</span>
    <span className="device-menu__toggle-switch" aria-hidden="true">
      <span />
    </span>
  </button>
);

const MicMenuPanel = ({
  audioInputDevices,
  selectedInputDeviceId,
  deviceInputLabel,
  noiseProfileOptions,
  noiseSuppressionMode,
  noiseSuppressionStrength,
  activeNoiseProfile,
  echoCancellationEnabled,
  micVolume,
  activeMicMenuBars,
  settingsIcon,
  onInputDeviceChange,
  onNoiseProfileChange,
  onNoiseStrengthChange,
  onToggleEchoCancellation,
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

      <DeviceToggleButton
        active={echoCancellationEnabled}
        title="Эхоподавление"
        onClick={onToggleEchoCancellation}
      />
    </div>

    <div className="device-menu__slider">
      <span>Сила шумоподавления</span>
      <PercentageSlider
        min={0}
        max={100}
        value={noiseSuppressionStrength}
        onChange={(event) => onNoiseStrengthChange(Number(event.target.value))}
        ariaLabel="Сила шумоподавления"
      />
    </div>

    <div className="device-menu__slider">
      <span>Громкость микрофона</span>
      <PercentageSlider
        min={0}
        max={200}
        value={micVolume}
        onChange={(event) => onMicVolumeChange(Number(event.target.value))}
        ariaLabel="Громкость микрофона"
      />
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
      <PercentageSlider
        min={0}
        max={200}
        value={audioVolume}
        onChange={(event) => onAudioVolumeChange(Number(event.target.value))}
        ariaLabel="Громкость звука"
      />
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
  activityStatus,
  audioInputDevices,
  audioOutputDevices,
  selectedInputDeviceId,
  selectedOutputDeviceId,
  outputSelectionAvailable,
  deviceInputLabel,
  deviceOutputLabel,
  noiseProfileOptions,
  noiseSuppressionMode,
  noiseSuppressionStrength,
  activeNoiseProfile,
  echoCancellationEnabled,
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
  onNoiseStrengthChange,
  onToggleEchoCancellation,
  onMicVolumeChange,
  onAudioVolumeChange,
  onSuppressTooltip,
  onRestoreTooltip,
  leaveVoiceActionLabel = "Отключиться",
  leaveVoiceActionAriaLabel = "Отключиться от голосового канала",
  directCallPanel = null,
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
            <button type="button" className="profile__quick-button profile__quick-button--danger ui-tooltip-anchor" onClick={onLeaveVoiceChannel} aria-label={leaveVoiceActionAriaLabel} data-tooltip={leaveVoiceActionLabel}>
              <span className="profile__quick-glyph profile__quick-glyph--disconnect" aria-hidden="true" />
            </button>
          </div>
        </div>
      ) : null}

      {directCallPanel}

      <div className={`menu__profile menu__profile--discordish ${currentVoiceChannel ? "menu__profile--voice-connected" : ""}`}>
        <div className="profile__identity-row">
          <button type="button" className="profile__identity" onClick={onOpenProfileSettings}>
            <span className={`avatar-shell ${currentVoiceChannel && isCurrentUserSpeaking ? "avatar-shell--speaking" : ""}`} aria-hidden="true">
              <AnimatedAvatar className="avatar" src={userAvatarSrc} alt="avatar" frame={userAvatarFrame} loading="eager" decoding="sync" />
            </span>
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
              {activityStatus ? <span className="profile__activity-status">{activityStatus}</span> : null}
            </div>
          </button>

          <div className="profile__identity-controls">
            <div className="device-menu device-menu--mic" ref={micMenuRef}>
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
              <button type="button" className="profile__mini-arrow ui-tooltip-anchor" onClick={(event) => { onSuppressTooltip(event); onToggleMicMenu(); }} onMouseLeave={onRestoreTooltip} aria-label="Настройки микрофона" data-tooltip="Настройки микрофона">
                <span className="profile__mini-chevron" aria-hidden="true" />
              </button>
              {showMicMenu ? (
                <MicMenuPanel
                  audioInputDevices={audioInputDevices}
                  selectedInputDeviceId={selectedInputDeviceId}
                  deviceInputLabel={deviceInputLabel}
                  noiseProfileOptions={noiseProfileOptions}
                  noiseSuppressionMode={noiseSuppressionMode}
                  noiseSuppressionStrength={noiseSuppressionStrength}
                  activeNoiseProfile={activeNoiseProfile}
                  echoCancellationEnabled={echoCancellationEnabled}
                  micVolume={micVolume}
                  activeMicMenuBars={activeMicMenuBars}
                  settingsIcon={icons.settings}
                  onInputDeviceChange={onInputDeviceChange}
                  onNoiseProfileChange={onNoiseProfileChange}
                  onNoiseStrengthChange={onNoiseStrengthChange}
                  onToggleEchoCancellation={onToggleEchoCancellation}
                  onMicVolumeChange={onMicVolumeChange}
                  onOpenVoiceSettings={onOpenVoiceSettings}
                />
              ) : null}
            </div>

            <div className="device-menu device-menu--sound" ref={soundMenuRef}>
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
              <button type="button" className="profile__mini-arrow ui-tooltip-anchor" onClick={(event) => { onSuppressTooltip(event); onToggleSoundMenu(); }} onMouseLeave={onRestoreTooltip} aria-label="Настройки звука" data-tooltip="Настройки звука">
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

            <button type="button" className="profile__mini-icon ui-tooltip-anchor" onClick={(event) => { onSuppressTooltip(event); onOpenVoiceSettings(); }} onMouseLeave={onRestoreTooltip} aria-label="Голос и видео" data-tooltip="Голос и видео">
              <span className="profile__mini-glyph profile__mini-glyph--settings" aria-hidden="true" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
