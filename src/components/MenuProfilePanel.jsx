import { useState } from "react";
import AnimatedAvatar from "./AnimatedAvatar";
import PercentageSlider from "./PercentageSlider";
import { getProfileCustomizationClassName } from "../utils/profileCustomization";

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

const STREAM_PROFILE_LABELS = {
  excellent: "отлично",
  good: "хорошо",
  constrained: "сжато",
  poor: "слабо",
};

const STREAM_LIMIT_LABELS = {
  cpu: "Лимит CPU",
  bandwidth: "Лимит сети",
  other: "Лимит захвата",
};

const formatStreamBitrate = (value) => {
  const bitrate = Number(value || 0);
  if (!Number.isFinite(bitrate) || bitrate <= 0) {
    return "";
  }

  return bitrate >= 1_000_000
    ? `${(bitrate / 1_000_000).toFixed(1)} Мбит/с`
    : `${Math.round(bitrate / 1000)} Кбит/с`;
};

const getStreamDiagnosticsItems = (diagnostics) => {
  if (!diagnostics) {
    return [];
  }

  const items = [];
  if (Number.isFinite(Number(diagnostics.rttMs)) && Number(diagnostics.rttMs) > 0) {
    items.push(`RTT ${Math.round(Number(diagnostics.rttMs))} мс`);
  }

  const outgoingBitrate = formatStreamBitrate(diagnostics.outgoingBitrateBps);
  if (outgoingBitrate) {
    items.push(`Аплинк ${outgoingBitrate}`);
  }

  if (Number.isFinite(Number(diagnostics.actualFps)) && Number(diagnostics.actualFps) > 0) {
    items.push(`Факт ${Math.round(Number(diagnostics.actualFps))} FPS`);
  }

  if (diagnostics.qualityLimitationReason) {
    items.push(STREAM_LIMIT_LABELS[diagnostics.qualityLimitationReason] || `Лимит ${diagnostics.qualityLimitationReason}`);
  }

  if (Number.isFinite(Number(diagnostics.videoRetransmitPercent)) && Number(diagnostics.videoRetransmitPercent) >= 1) {
    items.push(`Повторы ${Number(diagnostics.videoRetransmitPercent).toFixed(1)}%`);
  }

  if (diagnostics.routeType && diagnostics.routeType !== "unknown") {
    items.push(diagnostics.routeType === "relay" ? "Через TURN" : "Прямой маршрут");
  }

  if (diagnostics.profile) {
    items.push(`Профиль ${STREAM_PROFILE_LABELS[diagnostics.profile] || diagnostics.profile}`);
  }

  if (Number.isFinite(Number(diagnostics.audioBitrateKbps)) && Number(diagnostics.audioBitrateKbps) > 0) {
    items.push(`Голос ${Math.round(Number(diagnostics.audioBitrateKbps))} Кбит/с`);
  }

  return items;
};

const StreamStatusBanner = ({
  isScreenShareActive,
  isCameraShareActive,
  resolution,
  fps,
  diagnostics = null,
  resolutionOptions = [],
  fpsOptions = [],
  onOpenPreview = () => {},
  onResolutionChange = () => {},
  onFpsChange = () => {},
}) => {
  const [showSettings, setShowSettings] = useState(false);
  const isActive = isScreenShareActive || isCameraShareActive;
  const streamTitle = isScreenShareActive && isCameraShareActive
    ? "Экран и камера в эфире"
    : isCameraShareActive
      ? "Камера в эфире"
      : "Стрим запущен";
  const normalizedFps = Number(fps) || 30;
  const settingsOpen = isActive && showSettings;
  const diagnosticsItems = getStreamDiagnosticsItems(diagnostics);
  const latencyLabel =
    Number.isFinite(Number(diagnostics?.rttMs)) && Number(diagnostics.rttMs) > 0
      ? ` · ${Math.round(Number(diagnostics.rttMs))} мс`
      : "";

  if (!isActive) {
    return null;
  }

  return (
    <div className="profile__stream-banner">
      <div className="profile__stream-banner-main">
        <span className="profile__stream-live-dot" aria-hidden="true" />
        <div className="profile__stream-copy">
          <span className="profile__stream-title">{streamTitle}</span>
          <span className="profile__stream-meta">{resolution} · {normalizedFps} FPS{latencyLabel}</span>
        </div>
      </div>
      <button
        type="button"
        className="profile__stream-settings-button ui-tooltip-anchor"
        onClick={() => setShowSettings((previous) => !previous)}
        aria-label="Качество стрима"
        aria-expanded={settingsOpen}
        data-tooltip="Качество стрима"
      >
        <span className="profile__quick-glyph profile__quick-glyph--settings" aria-hidden="true" />
      </button>

      {settingsOpen ? (
        <div className="profile__stream-settings" role="group" aria-label="Настройки качества стрима">
          <div className="profile__stream-field">
            <span>Качество</span>
            <div className="profile__stream-choice-row profile__stream-choice-row--quality">
              {resolutionOptions.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  className={`profile__stream-choice ${resolution === option.value ? "is-active" : ""}`}
                  onClick={() => onResolutionChange(option.value)}
                  aria-pressed={resolution === option.value}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
          <div className="profile__stream-field">
            <span>FPS</span>
            <div className="profile__stream-choice-row profile__stream-choice-row--fps">
              {fpsOptions.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  className={`profile__stream-choice ${normalizedFps === option.value ? "is-active" : ""}`}
                  onClick={() => onFpsChange(option.value)}
                  aria-pressed={normalizedFps === option.value}
                >
                  {option.value}
                </button>
              ))}
            </div>
          </div>
          <button type="button" className="profile__stream-preview" onClick={onOpenPreview}>
            Предпросмотр
          </button>
          {diagnosticsItems.length > 0 ? (
            <div className="profile__stream-diagnostics" aria-label="Диагностика стрима">
              {diagnosticsItems.map((item) => (
                <span key={item}>{item}</span>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
};

const MicMenuPanel = ({
  audioInputDevices,
  selectedInputDeviceId,
  deviceInputLabel,
  noiseProfileOptions,
  noiseSuppressionMode,
  activeNoiseProfile,
  echoCancellationEnabled,
  micVolume,
  activeMicMenuBars,
  settingsIcon,
  onInputDeviceChange,
  onNoiseProfileChange,
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
  streamResolution,
  streamFps,
  streamDiagnostics,
  streamResolutionOptions,
  streamFpsOptions,
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
  profileCustomization,
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
  echoCancellationEnabled,
  micVolume,
  audioVolume,
  activeMicMenuBars,
  icons,
  onOpenProfileSettings,
  onOpenVoiceSettings,
  onScreenShareAction,
  onOpenCamera,
  onStopCameraShare,
  onOpenLocalSharePreview,
  onStreamResolutionChange,
  onStreamFpsChange,
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
  onToggleEchoCancellation,
  onMicVolumeChange,
  onAudioVolumeChange,
  onSuppressTooltip,
  onRestoreTooltip,
  leaveVoiceActionLabel = "Отключиться",
  leaveVoiceActionAriaLabel = "Отключиться от голосового канала",
  directCallPanel = null,
}) {
  const profileCardClassName = getProfileCustomizationClassName(profileCustomization, "profileCard");
  const voiceCardClassName = getProfileCustomizationClassName(profileCustomization, "voiceCard");
  const wrapperClassName = [
    "menu__profile-wrapper",
    currentVoiceChannel ? "menu__profile-wrapper--voice-connected" : "",
    currentVoiceChannel && (profileCardClassName || voiceCardClassName) ? "menu__profile-wrapper--customized" : "",
    currentVoiceChannel ? (voiceCardClassName || profileCardClassName) : "",
  ].filter(Boolean).join(" ");

  return (
    <div className={wrapperClassName}>
      {currentVoiceChannel ? (
        <div className={`profile__voice-stack ${voiceCardClassName}`}>
          <StreamStatusBanner
            isScreenShareActive={isScreenShareActive}
            isCameraShareActive={isCameraShareActive}
            resolution={streamResolution}
            fps={streamFps}
            diagnostics={streamDiagnostics}
            resolutionOptions={streamResolutionOptions}
            fpsOptions={streamFpsOptions}
            onOpenPreview={onOpenLocalSharePreview}
            onResolutionChange={onStreamResolutionChange}
            onFpsChange={onStreamFpsChange}
          />

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
              onClick={isCameraShareActive ? onStopCameraShare : onOpenCamera}
              aria-label={isCameraShareActive ? "Остановить камеру" : "Открыть камеру"}
              data-tooltip={isCameraShareActive ? "Остановить камеру" : "Открыть камеру"}
            >
              <span className={`profile__quick-glyph ${isCameraShareActive ? "profile__quick-glyph--close" : "profile__quick-glyph--camera"}`} aria-hidden="true" />
            </button>
            <button type="button" className="profile__quick-button profile__quick-button--danger ui-tooltip-anchor" onClick={onLeaveVoiceChannel} aria-label={leaveVoiceActionAriaLabel} data-tooltip={leaveVoiceActionLabel}>
              <span className="profile__quick-glyph profile__quick-glyph--disconnect" aria-hidden="true" />
            </button>
          </div>
        </div>
      ) : null}

      {directCallPanel}

      <div className={`menu__profile menu__profile--discordish ${profileCardClassName} ${currentVoiceChannel ? "menu__profile--voice-connected" : ""}`}>
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
              {activityStatus ? (
                <span className="profile__activity-status">
                  <svg className="profile__activity-note" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
                    <path d="M10.5 2.25V10.1C10.5 11.42 9.28 12.5 7.78 12.5C6.57 12.5 5.75 11.9 5.75 11.02C5.75 10.1 6.68 9.38 7.9 9.38C8.43 9.38 8.9 9.5 9.25 9.72V4.25L13.75 5.38V7L10.5 6.18V10.1" />
                  </svg>
                  <span className="profile__activity-marquee" title={activityStatus}>
                    <span key={activityStatus} className="profile__activity-track">
                      <span className="profile__activity-text">{activityStatus}</span>
                      <span className="profile__activity-text" aria-hidden="true">{activityStatus}</span>
                    </span>
                  </span>
                </span>
              ) : null}
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
                  activeNoiseProfile={activeNoiseProfile}
                  echoCancellationEnabled={echoCancellationEnabled}
                  micVolume={micVolume}
                  activeMicMenuBars={activeMicMenuBars}
                  settingsIcon={icons.settings}
                  onInputDeviceChange={onInputDeviceChange}
                  onNoiseProfileChange={onNoiseProfileChange}
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
