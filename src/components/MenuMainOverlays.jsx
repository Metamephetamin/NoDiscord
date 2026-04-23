import { useEffect, useMemo, useState } from "react";
import AnimatedAvatar from "./AnimatedAvatar";
import MediaFrameEditorModal from "./MediaFrameEditorModal";
import QuickSwitcherModal from "./QuickSwitcherModal";
import ScreenShareButton from "./ScreenShareButton";
import { formatTimestamp } from "../utils/textChatHelpers";

export const SettingsOverlay = ({
  open,
  isMobileViewport,
  popupRef,
  userAvatarSrc,
  userAvatarFrame,
  displayName,
  settingsNavSections,
  settingsTab,
  onClose,
  onSelectSettingsTab,
  renderMobileSettingsShell,
  renderSettingsContent,
}) => {
  const [searchQuery, setSearchQuery] = useState("");
  const normalizedSearchQuery = searchQuery.trim().toLowerCase();
  const filteredSections = useMemo(() => {
    if (!normalizedSearchQuery) {
      return Object.entries(settingsNavSections);
    }

    return Object.entries(settingsNavSections)
      .map(([section, items]) => {
        const matchedItems = items.filter((item) => {
          const itemLabel = String(item.label || "").toLowerCase();
          const sectionLabel = String(section || "").toLowerCase();
          return itemLabel.includes(normalizedSearchQuery) || sectionLabel.includes(normalizedSearchQuery);
        });
        return [section, matchedItems];
      })
      .filter(([, items]) => items.length > 0);
  }, [normalizedSearchQuery, settingsNavSections]);

  useEffect(() => {
    if (!normalizedSearchQuery) {
      return;
    }

    const hasActiveTab = filteredSections.some(([, items]) => items.some((item) => item.id === settingsTab));
    if (!hasActiveTab) {
      const firstMatch = filteredSections[0]?.[1]?.[0];
      if (firstMatch?.id) {
        onSelectSettingsTab(firstMatch.id);
      }
    }
  }, [filteredSections, normalizedSearchQuery, onSelectSettingsTab, settingsTab]);

  if (!open) {
    return null;
  }

  return (
    <div className="settings-backdrop" onClick={onClose}>
      <div
        ref={popupRef}
        className={`settings-popup settings-popup--shell ${isMobileViewport ? "settings-popup--mobile" : ""}`}
        onClick={(event) => event.stopPropagation()}
      >
        {isMobileViewport ? (
          renderMobileSettingsShell()
        ) : (
          <>
            <aside className="settings-shell__sidebar">
              <div className="settings-shell__profile">
                <AnimatedAvatar className="settings-shell__profile-avatar" src={userAvatarSrc} alt={displayName} frame={userAvatarFrame} loading="eager" decoding="sync" />
                <div>
                  <strong>{displayName}</strong>
                  <button type="button" className="settings-shell__profile-link" onClick={() => onSelectSettingsTab("personal_profile")}>
                    Редактировать профиль...
                  </button>
                </div>
              </div>
              <input
                className="settings-shell__search"
                type="text"
                placeholder="Поиск"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
              />

              {filteredSections.map(([section, items]) => (
                <div key={section} className="settings-shell__nav-group">
                  <span className="settings-shell__nav-label">{section}</span>
                  <div className="settings-shell__nav-list">
                    {items.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        className={`settings-shell__nav-item ${settingsTab === item.id ? "settings-shell__nav-item--active" : ""}`}
                        onClick={() => onSelectSettingsTab(item.id)}
                      >
                        {item.label}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
              {normalizedSearchQuery && filteredSections.length === 0 ? (
                <div className="settings-shell__search-empty">Ничего не найдено</div>
              ) : null}
            </aside>

            <div className="settings-shell__main">
              <div className="settings-shell__closebar">
                <button type="button" className="settings-popup__close" onClick={onClose}>x</button>
              </div>
              {renderSettingsContent()}
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export const CreateServerModal = ({
  open,
  name,
  icon,
  iconFrame,
  defaultServerIcon,
  error,
  onClose,
  onSubmit,
  onIconChange,
  onNameChange,
}) => {
  if (!open) {
    return null;
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <form className="create-server-modal" onSubmit={onSubmit} onClick={(event) => event.stopPropagation()}>
        <div className="create-server-modal__header">
          <div>
            <h3>Создать сервер</h3>
            <p>Задайте имя серверу и, если хотите, сразу поставьте для него иконку.</p>
          </div>
          <button type="button" className="stream-modal__close" onClick={onClose}>x</button>
        </div>

        <div className="create-server-modal__body">
          <label className="create-server-modal__cover">
            <input type="file" accept=".png,.jpg,.jpeg,.heif,.heic,.gif,.mp4,image/png,image/jpeg,image/heif,image/heic,image/gif,video/mp4" onChange={onIconChange} />
            <span className="create-server-modal__cover-frame">
              <AnimatedAvatar
                className="create-server-modal__icon-preview"
                src={icon || defaultServerIcon}
                fallback={defaultServerIcon}
                alt="Иконка сервера"
                frame={iconFrame}
                loading="eager"
                decoding="sync"
              />
            </span>
            <span className="create-server-modal__cover-text">
              {icon ? "Сменить изображение" : "Загрузить изображение"}
            </span>
          </label>

          <label className="stream-modal__field">
            <span>Название сервера</span>
            <input
              type="text"
              value={name}
              onChange={(event) => onNameChange(event.target.value)}
              placeholder="Например, Моя команда"
              maxLength={48}
              autoFocus
            />
          </label>

          {error ? <div className="create-server-modal__error">{error}</div> : null}
        </div>

        <div className="create-server-modal__actions">
          <button type="button" className="create-server-modal__secondary" onClick={onClose}>Отмена</button>
          <button type="submit" className="stream-modal__action">Создать сервер</button>
        </div>
      </form>
    </div>
  );
};

export const ScreenShareModal = ({
  open,
  isMobileViewport,
  resolution,
  fps,
  shareStreamAudio,
  resolutionOptions,
  fpsOptions,
  isScreenShareActive,
  isCameraShareActive,
  currentVoiceChannel,
  isScreenShareSupported,
  error,
  onClose,
  onResolutionChange,
  onFpsChange,
  onShareAudioChange,
  onStartScreenShare,
  onStopScreenShare,
  onOpenPreview,
}) => {
  if (!open) {
    return null;
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="stream-modal" onClick={(event) => event.stopPropagation()}>
        <div className="stream-modal__header">
          <div>
            <h3>{isMobileViewport ? "Стрим экрана" : "Настройки трансляции"}</h3>
            <p className="stream-modal__subtitle">
              {isMobileViewport
                ? "Подберите качество и запустите захват экрана прямо с телефона, если браузер это поддерживает."
                : "Подберите качество трансляции и запустите захват экрана."}
            </p>
          </div>
          <button type="button" className="stream-modal__close" onClick={onClose}>x</button>
        </div>

        <label className="stream-modal__field">
          <span>Разрешение</span>
          <select value={resolution} onChange={(event) => onResolutionChange(event.target.value)}>
            {resolutionOptions.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </label>

        <label className="stream-modal__field">
          <span>FPS</span>
          <select value={fps} onChange={(event) => onFpsChange(Number(event.target.value))}>
            {fpsOptions.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </label>

        <label className="stream-modal__check">
          <input type="checkbox" checked={shareStreamAudio} onChange={(event) => onShareAudioChange(event.target.checked)} />
          <span>Передавать звук экрана, если система это поддерживает</span>
        </label>

        <ScreenShareButton onStart={onStartScreenShare} onStop={onStopScreenShare} isActive={isScreenShareActive} disabled={!currentVoiceChannel || !isScreenShareSupported} />

        {isScreenShareActive ? (
          <button type="button" className="stream-modal__action stream-modal__action--secondary" onClick={onOpenPreview}>
            Открыть предпросмотр
          </button>
        ) : null}
        {!currentVoiceChannel ? <div className="stream-modal__hint">Сначала подключитесь к голосовому каналу.</div> : null}
        {!isScreenShareSupported ? <div className="stream-modal__hint">На этом устройстве браузер не поддерживает захват экрана.</div> : null}
        {isCameraShareActive ? <div className="stream-modal__hint">Сейчас у вас уже идет трансляция камеры. Запуск экрана заменит ее.</div> : null}
        {error ? <div className="stream-modal__error">{error}</div> : null}
      </div>
    </div>
  );
};

export const CameraModal = ({
  open,
  devices,
  selectedDeviceId,
  previewRef,
  hasPreview,
  error,
  isCameraShareActive,
  isScreenShareActive,
  currentVoiceChannel,
  onClose,
  onDeviceChange,
  onStartPreview,
  onOpenPreview,
  onStartCameraShare,
  onStopCameraShare,
}) => {
  if (!open) {
    return null;
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="camera-modal" onClick={(event) => event.stopPropagation()}>
        <div className="camera-modal__header">
          <div>
            <h3>Камера</h3>
            <p>Выберите веб-камеру или виртуальную камеру. Если установлен Camo, он появится здесь как обычное устройство.</p>
          </div>
          <button type="button" className="stream-modal__close" onClick={onClose}>x</button>
        </div>

        <label className="camera-modal__field">
          <span>Устройство камеры</span>
          <select value={selectedDeviceId} onChange={(event) => onDeviceChange(event.target.value)}>
            {devices.length > 0 ? devices.map((device) => (
              <option key={device.id} value={device.id}>{device.label}</option>
            )) : <option value="">Камера не найдена</option>}
          </select>
        </label>

        <div className="camera-modal__preview">
          <video ref={previewRef} className="camera-modal__video" autoPlay playsInline muted />
          {!hasPreview ? (
            <div className="camera-modal__placeholder">
              <span>
                {isCameraShareActive
                  ? "Камера уже транслируется в голосовой канал. Здесь можно выбрать другое устройство или остановить эфир."
                  : "Предпросмотр появится здесь после выбора камеры."}
              </span>
            </div>
          ) : null}
        </div>

        {error ? <div className="camera-modal__error">{error}</div> : null}

        <div className="camera-modal__actions">
          <button type="button" className="stream-modal__action" onClick={() => onStartPreview(selectedDeviceId)}>
            {hasPreview ? "Обновить предпросмотр" : "Включить предпросмотр"}
          </button>
          {isCameraShareActive ? (
            <button type="button" className="stream-modal__action stream-modal__action--secondary" onClick={onOpenPreview}>
              Открыть предпросмотр эфира
            </button>
          ) : null}
          <button
            type="button"
            className={`stream-modal__action ${isCameraShareActive ? "stream-modal__action--danger" : ""}`}
            onClick={isCameraShareActive ? onStopCameraShare : onStartCameraShare}
            disabled={!currentVoiceChannel || (!isCameraShareActive && devices.length === 0)}
          >
            {isCameraShareActive ? "Остановить трансляцию камеры" : "Начать трансляцию камеры"}
          </button>
        </div>

        <div className="stream-modal__status">
          {isCameraShareActive
            ? "Камера уже идет в эфир и видна участникам голосового канала."
            : currentVoiceChannel
              ? "После запуска камера появится в голосовом канале как обычная LIVE-трансляция."
              : "Сначала подключитесь к голосовому каналу."}
        </div>
        {isScreenShareActive ? <div className="stream-modal__hint">Запуск камеры заменит текущую трансляцию экрана.</div> : null}
      </div>
    </div>
  );
};

export const DirectCallOverlay = ({
  call,
  isMicMuted,
  isSoundMuted = false,
  onAccept,
  onDecline,
  onEnd,
  onToggleMic,
}) => {
  if (!call || call.status === "idle") {
    return null;
  }

  const isIncoming = call.status === "incoming";
  const isConnected = call.status === "connected";
  const isConnecting = call.status === "connecting";
  const isEffectiveMicMuted = Boolean(isMicMuted || isSoundMuted);
  const callTitle = call.peerName || "Пользователь";
  const statusLabel =
    call.statusLabel
    || (isIncoming
      ? "Входящий звонок"
      : isConnected
        ? "Идёт разговор"
        : isConnecting
          ? "Подключаем звонок"
          : "Ожидаем ответ");

  return (
    <div className="direct-call-overlay">
      <div className="direct-call-overlay__backdrop" />
      <div className="direct-call-overlay__workspace" role="dialog" aria-modal="true" aria-label={`Звонок с ${callTitle.toLowerCase()}`}>
        <div className="direct-call-overlay__header">
          <div className="direct-call-overlay__header-copy">
            <span className="direct-call-overlay__eyebrow">{isConnected ? "Личный разговор" : "Личный звонок"}</span>
            <strong>{callTitle}</strong>
            <span>{statusLabel}</span>
          </div>
        </div>

        <div className="direct-call-overlay__stage">
          <div className="direct-call-overlay__pulse" aria-hidden="true" />
          <div className="direct-call-overlay__stage-surface" />
          <AnimatedAvatar
            className={`direct-call-overlay__avatar ${isConnected ? "direct-call-overlay__avatar--connected" : ""}`}
            src={call.peerAvatar || ""}
            alt={callTitle}
            frame={call.peerAvatarFrame}
            loading="eager"
            decoding="sync"
          />
          <div className="direct-call-overlay__copy">
            <strong>{callTitle}</strong>
            <span>{statusLabel}</span>
          </div>
          <div className="direct-call-overlay__hint">
            {isIncoming
              ? "Ответьте на звонок или отклоните его."
              : isConnected
                ? "Разговор идёт в отдельном пространстве и не выглядит как маленькое всплывающее окно."
                : "Ждём, пока второй пользователь подключится к разговору."}
          </div>
        </div>

        <div className="direct-call-overlay__dock">
          <div className="direct-call-overlay__dock-meta">
            <span className="direct-call-overlay__dock-label">Режим</span>
            <strong>{isConnected ? "Голосовой разговор" : "Подготовка звонка"}</strong>
          </div>
          <div className="direct-call-overlay__actions">
          {isIncoming ? (
            <>
              <button type="button" className="direct-call-overlay__button direct-call-overlay__button--decline" onClick={onDecline}>
                Отклонить
              </button>
              <button type="button" className="direct-call-overlay__button direct-call-overlay__button--accept" onClick={onAccept}>
                Ответить
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                className={`direct-call-overlay__button direct-call-overlay__button--mute ${isEffectiveMicMuted ? "direct-call-overlay__button--active" : ""}`}
                onClick={onToggleMic}
                disabled={!isConnected}
              >
                {isEffectiveMicMuted ? "Микрофон выкл" : "Микрофон"}
              </button>
              <button
                type="button"
                className="direct-call-overlay__button direct-call-overlay__button--decline"
                onClick={isConnected ? onEnd : onDecline}
              >
                {isConnected ? "Завершить" : "Отменить"}
              </button>
            </>
          )}
          </div>
        </div>
      </div>
    </div>
  );
};

export const DirectCallOverlayView = ({
  call,
  history = [],
  isMicMuted,
  isSoundMuted = false,
  selfName = "Вы",
  selfAvatar = "",
  selfAvatarFrame = null,
  audioInputDevices = [],
  audioOutputDevices = [],
  selectedInputDeviceId = "",
  selectedOutputDeviceId = "",
  outputSelectionSupported = false,
  isScreenShareActive = false,
  isCameraShareActive = false,
  isScreenShareSupported = true,
  onAccept,
  onDecline,
  onEnd,
  onToggleMic,
  onToggleSound,
  onScreenShareAction,
  onOpenCamera,
  onSelectInputDevice,
  onSelectOutputDevice,
  onToggleMiniMode,
  onDismiss,
  onRetry,
  onRedialHistoryItem,
  embedded = false,
  compact = false,
}) => {
  if (!call || call.phase === "idle") {
    return null;
  }

  const isIncoming = call.phase === "incoming";
  const isConnected = call.phase === "connected";
  const isConnecting = call.phase === "connecting" || call.phase === "reconnecting";
  const isFinished = call.phase === "ended" || call.phase === "declined" || call.phase === "disconnected";
  const isMiniMode = !embedded && Boolean(call.isMiniMode) && !isIncoming;
  const isEffectiveMicMuted = Boolean(isMicMuted || isSoundMuted);
  const callTitle = call.peerName || "Пользователь";
  const statusLabel =
    call.statusLabel
    || (isIncoming
      ? "Входящий звонок"
      : isConnected
        ? "Идёт разговор"
        : isConnecting
          ? "Подключаем звонок"
          : "Ожидаем ответ");
  const qualityLabel =
    call.connectionQuality === "weak"
      ? "Соединение слабое"
      : call.connectionQuality === "reconnecting"
        ? "Переподключение"
        : call.connectionQuality === "stable"
          ? "Связь стабильная"
          : "Качество неизвестно";
  const recentHistory = history
    .filter((entry) => String(entry?.peerUserId || "") === String(call.peerUserId || ""))
    .slice(0, 4);

  const compactCallCard = (
      <section className={`direct-call-inline ${compact ? "direct-call-inline--floating" : ""} ${isConnected ? "direct-call-inline--connected" : ""} ${isIncoming ? "direct-call-inline--incoming" : ""} ${isFinished ? "direct-call-inline--finished" : ""}`}>
        <div className="direct-call-inline__header">
          <div className="direct-call-inline__copy">
            <span>{isIncoming ? "Входящий звонок" : isConnected ? "Личный разговор" : isFinished ? "Звонок завершён" : "Личный звонок"}</span>
            <strong>{callTitle}</strong>
            <small>{statusLabel}</small>
          </div>
          <div className="direct-call-inline__quality">
            <span className={`direct-call-inline__quality-dot direct-call-inline__quality-dot--${call.connectionQuality || "unknown"}`} />
            {qualityLabel}
          </div>
        </div>

        <div className="direct-call-inline__participants" aria-label="Участники личного звонка">
          <div className="direct-call-inline__participant">
            <AnimatedAvatar
              className="direct-call-inline__avatar"
              src={selfAvatar || ""}
              alt={selfName}
              frame={selfAvatarFrame}
              loading="eager"
              decoding="sync"
            />
            <span>{selfName}</span>
          </div>
          <div className="direct-call-inline__link direct-call-inline__voice-wave" aria-hidden="true">
            <svg viewBox="0 0 76 34" focusable="false">
              <path className="direct-call-inline__voice-wave-path direct-call-inline__voice-wave-path--one" d="M2 17 C9 9 16 25 23 17 S37 9 44 17 S58 25 74 13" />
              <path className="direct-call-inline__voice-wave-path direct-call-inline__voice-wave-path--two" d="M2 18 C11 4 19 31 28 18 S46 5 55 18 S68 28 74 19" />
              <path className="direct-call-inline__voice-wave-path direct-call-inline__voice-wave-path--three" d="M2 16 C13 12 16 22 27 17 S44 8 53 17 S64 24 74 15" />
              <path className="direct-call-inline__voice-wave-path direct-call-inline__voice-wave-path--four" d="M2 19 C12 2 18 32 31 16 S49 4 58 19 S69 30 74 17" />
            </svg>
          </div>
          <div className="direct-call-inline__participant">
            <AnimatedAvatar
              className="direct-call-inline__avatar"
              src={call.peerAvatar || ""}
              alt={callTitle}
              frame={call.peerAvatarFrame}
              loading="eager"
              decoding="sync"
            />
            <span>{callTitle}</span>
          </div>
        </div>

        <div className="direct-call-inline__actions">
          {isIncoming ? (
            <>
              <button type="button" className="direct-call-inline__button direct-call-inline__button--icon direct-call-inline__button--danger" onClick={onDecline} aria-label="Отклонить">
                <span className="direct-call-inline__icon direct-call-inline__icon--phone" aria-hidden="true" />
              </button>
              <button type="button" className="direct-call-inline__button direct-call-inline__button--icon direct-call-inline__button--accept" onClick={onAccept} aria-label="Принять">
                <span className="direct-call-inline__icon direct-call-inline__icon--phone" aria-hidden="true" />
              </button>
            </>
          ) : isFinished ? (
            <>
              {call.canRetry ? (
                <button type="button" className="direct-call-inline__button direct-call-inline__button--icon direct-call-inline__button--accept" onClick={onRetry} aria-label="Перезвонить">
                  <span className="direct-call-inline__icon direct-call-inline__icon--phone" aria-hidden="true" />
                </button>
              ) : null}
              <button type="button" className="direct-call-inline__button direct-call-inline__button--icon direct-call-inline__button--danger" onClick={onDismiss} aria-label="Закрыть">
                <span className="direct-call-inline__icon direct-call-inline__icon--close" aria-hidden="true" />
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                className={`direct-call-inline__button direct-call-inline__button--icon ${isEffectiveMicMuted ? "direct-call-inline__button--muted" : ""}`}
                onClick={onToggleMic}
                disabled={!isConnected}
                aria-label={isMicMuted ? "Включить микрофон" : "Выключить микрофон"}
              >
                <span className="direct-call-inline__icon direct-call-inline__icon--mic" aria-hidden="true" />
              </button>
              <button
                type="button"
                className={`direct-call-inline__button direct-call-inline__button--icon ${isSoundMuted ? "direct-call-inline__button--muted" : ""}`}
                onClick={onToggleSound}
                disabled={!isConnected}
                aria-label={isSoundMuted ? "Включить звук" : "Выключить звук"}
              >
                <span className="direct-call-inline__icon direct-call-inline__icon--headphones" aria-hidden="true" />
              </button>
              <button
                type="button"
                className={`direct-call-inline__button direct-call-inline__button--icon ${isScreenShareActive ? "direct-call-inline__button--active" : ""}`}
                onClick={onScreenShareAction}
                disabled={!isConnected || !isScreenShareSupported}
                aria-label={isScreenShareActive ? "Остановить стрим экрана" : "Показать экран"}
              >
                <span className="direct-call-inline__icon direct-call-inline__icon--screen" aria-hidden="true" />
              </button>
              <button
                type="button"
                className={`direct-call-inline__button direct-call-inline__button--icon ${isCameraShareActive ? "direct-call-inline__button--active" : ""}`}
                onClick={onOpenCamera}
                disabled={!isConnected}
                aria-label={isCameraShareActive ? "Управление камерой" : "Показать вебку"}
              >
                <span className="direct-call-inline__icon direct-call-inline__icon--camera" aria-hidden="true" />
              </button>
              <button
                type="button"
                className="direct-call-inline__button direct-call-inline__button--icon direct-call-inline__button--danger"
                onClick={isConnected ? onEnd : onDecline}
                aria-label={isConnected ? "Завершить звонок" : "Отменить звонок"}
              >
                <span className="direct-call-inline__icon direct-call-inline__icon--phone" aria-hidden="true" />
              </button>
            </>
          )}
        </div>
      </section>
  );

  if (embedded) {
    return compactCallCard;
  }

  if (compact) {
    return (
      <div className="direct-call-floating-layer">
        {compactCallCard}
      </div>
    );
  }

  return (
    <div className={`direct-call-overlay direct-call-overlay--v2 ${isMiniMode ? "direct-call-overlay--mini" : ""} ${embedded ? "direct-call-overlay--embedded" : ""}`}>
      {!isMiniMode && !embedded ? <div className="direct-call-overlay__backdrop" /> : null}
      <div
        className={`direct-call-overlay__workspace direct-call-overlay__workspace--v2 ${isMiniMode ? "direct-call-overlay__workspace--mini" : ""} ${embedded ? "direct-call-overlay__workspace--embedded" : ""}`}
        role="dialog"
        aria-modal={isMiniMode || embedded ? undefined : "true"}
        aria-label={`Звонок с ${callTitle.toLowerCase()}`}
      >
        <div className="direct-call-overlay__header">
          <div className="direct-call-overlay__header-copy">
            <span className="direct-call-overlay__eyebrow">
              {isIncoming ? "Входящий звонок" : isConnected ? "Личный разговор" : "Личный звонок"}
            </span>
            <strong>{callTitle}</strong>
            <span>{statusLabel}</span>
          </div>
          <div className="direct-call-overlay__header-actions">
            {!embedded && (isConnected || isFinished) ? (
              <button type="button" className="direct-call-overlay__ghost" onClick={() => onToggleMiniMode?.(!isMiniMode)}>
                {isMiniMode ? "Развернуть" : "Свернуть"}
              </button>
            ) : null}
            {isFinished ? (
              <button type="button" className="direct-call-overlay__ghost" onClick={onDismiss}>
                Закрыть
              </button>
            ) : null}
          </div>
        </div>

        <div className="direct-call-overlay__stage">
          <div className="direct-call-overlay__pulse" aria-hidden="true" />
          <div className="direct-call-overlay__stage-surface" />
          <AnimatedAvatar
            className={`direct-call-overlay__avatar ${isConnected ? "direct-call-overlay__avatar--connected" : ""}`}
            src={call.peerAvatar || ""}
            alt={callTitle}
            frame={call.peerAvatarFrame}
            loading="eager"
            decoding="sync"
          />
          <div className="direct-call-overlay__copy">
            <strong>{callTitle}</strong>
            <span>{statusLabel}</span>
          </div>
          <div className="direct-call-overlay__quality">
            <span className={`direct-call-overlay__quality-dot direct-call-overlay__quality-dot--${call.connectionQuality || "unknown"}`} />
            <strong>{qualityLabel}</strong>
          </div>
          {!isMiniMode ? (
            <div className="direct-call-overlay__hint">
              {isIncoming
                ? "Примите звонок или отклоните его."
                : isFinished
                  ? "Вызов завершён. Можно закрыть карточку или сразу перезвонить."
                  : isConnected
                    ? "Звонок можно свернуть поверх переписки и продолжать чат без потери контекста."
                    : "Соединяем звонок и держим переписку рядом, без ощущения другого приложения."}
            </div>
          ) : null}
        </div>

        <div className="direct-call-overlay__dock">
          {!isMiniMode ? (
            <div className="direct-call-overlay__dock-meta">
              <span className="direct-call-overlay__dock-label">Режим</span>
              <strong>{isConnected ? "Голосовой разговор 1 на 1" : isIncoming ? "Входящий звонок" : isFinished ? "История вызова" : "Подключение"}</strong>
            </div>
          ) : null}
          <div className="direct-call-overlay__actions">
            {isIncoming ? (
              <>
                <button type="button" className="direct-call-overlay__button direct-call-overlay__button--decline" onClick={onDecline}>
                  Отклонить
                </button>
                <button type="button" className="direct-call-overlay__button direct-call-overlay__button--accept" onClick={onAccept}>
                  Принять
                </button>
              </>
            ) : isFinished ? (
              <>
                {call.canRetry ? (
                  <button type="button" className="direct-call-overlay__button direct-call-overlay__button--accept" onClick={onRetry}>
                    Перезвонить
                  </button>
                ) : null}
                <button type="button" className="direct-call-overlay__button direct-call-overlay__button--decline" onClick={onDismiss}>
                  Закрыть
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  className={`direct-call-overlay__button direct-call-overlay__button--mute ${isEffectiveMicMuted ? "direct-call-overlay__button--active" : ""}`}
                  onClick={onToggleMic}
                  disabled={!isConnected}
                >
                  {isMicMuted ? "Микрофон выкл" : "Микрофон"}
                </button>
                <button
                  type="button"
                  className="direct-call-overlay__button"
                  onClick={() => onToggleMiniMode?.(!isMiniMode)}
                  disabled={!isConnected}
                >
                  {isMiniMode ? "Развернуть" : "Свернуть"}
                </button>
                <button
                  type="button"
                  className="direct-call-overlay__button direct-call-overlay__button--decline"
                  onClick={isConnected ? onEnd : onDecline}
                >
                  {isConnected ? "Завершить" : "Отменить"}
                </button>
              </>
            )}
          </div>
        </div>

        {!isMiniMode && !isIncoming && (audioInputDevices.length || (outputSelectionSupported && audioOutputDevices.length)) ? (
          <div className="direct-call-overlay__devices">
            <label className="direct-call-overlay__device-field">
              <span>Микрофон</span>
              <select value={selectedInputDeviceId} onChange={(event) => onSelectInputDevice?.(event.target.value)}>
                {audioInputDevices.map((device) => (
                  <option key={device.id} value={device.id}>{device.label}</option>
                ))}
              </select>
            </label>
            {outputSelectionSupported ? (
              <label className="direct-call-overlay__device-field">
                <span>Вывод</span>
                <select value={selectedOutputDeviceId} onChange={(event) => onSelectOutputDevice?.(event.target.value)}>
                  {audioOutputDevices.map((device) => (
                    <option key={device.id} value={device.id}>{device.label}</option>
                  ))}
                </select>
              </label>
            ) : null}
          </div>
        ) : null}

        {!isMiniMode && recentHistory.length ? (
          <div className="direct-call-overlay__history">
            <span className="direct-call-overlay__dock-label">Последние вызовы</span>
            <div className="direct-call-overlay__history-list">
              {recentHistory.map((entry) => (
                <button
                  key={entry.id}
                  type="button"
                  className="direct-call-overlay__history-item"
                  onClick={() => onRedialHistoryItem?.(entry.peerUserId)}
                >
                  <span className="direct-call-overlay__history-copy">
                    <strong>{entry.peerName}</strong>
                    <span>{formatTimestamp(entry.timestamp)} • {entry.outcome}</span>
                  </span>
                  <span className="direct-call-overlay__history-action">Перезвонить</span>
                </button>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
};

export const MediaFrameEditorOverlay = ({
  state,
  defaultServerIcon,
  fallbackProfileBackground,
  fallbackAvatar,
  avatarFrame,
  avatarAlt,
  onCancel,
  onConfirm,
}) => (
  <MediaFrameEditorModal
    open={Boolean(state)}
    source={state?.previewUrl || ""}
    fallback={
      state?.target === "serverIcon"
        ? defaultServerIcon
        : state?.target === "profileBackground"
          ? fallbackProfileBackground
          : fallbackAvatar
    }
    frame={state?.frame}
    target={state?.target || "avatar"}
    avatarSource={fallbackAvatar}
    avatarFrame={avatarFrame}
    avatarAlt={avatarAlt}
    mediaType={state?.file?.type || ""}
    onCancel={onCancel}
    onConfirm={onConfirm}
  />
);

export const DirectToastStack = ({ toasts, onOpenToast, onDismiss }) => {
  if (!toasts.length) {
    return null;
  }

  return (
    <div className="direct-toast-stack">
      {toasts.map((toast) => (
        <div key={toast.id} className="direct-toast">
          <button type="button" className="direct-toast__main" onClick={() => onOpenToast(toast)}>
            <AnimatedAvatar
              className="direct-toast__avatar"
              src={toast.avatarSrc || ""}
              alt={toast.title || "Уведомление"}
              loading="eager"
              decoding="sync"
            />
            <span className="direct-toast__content">
              <span className="direct-toast__title">{toast.title || "Уведомление"}</span>
              {toast.grouped ? <span className="direct-toast__subtitle">{`${toast.count} новых сообщений`}</span> : null}
              <span className="direct-toast__text">{toast.preview}</span>
            </span>
          </button>
          <button type="button" className="direct-toast__close" onClick={() => onDismiss(toast.id)} aria-label="Закрыть уведомление">
            x
          </button>
        </div>
      ))}
    </div>
  );
};

export const ServerToastStack = ({ toasts, onOpenToast, onDismiss }) => {
  if (!toasts.length) {
    return null;
  }

  return (
    <div className="direct-toast-stack direct-toast-stack--server">
      {toasts.map((toast) => (
        <div key={toast.id} className="direct-toast direct-toast--server">
          <button type="button" className="direct-toast__main" onClick={() => onOpenToast(toast)}>
            <span className="direct-toast__server-badge" aria-hidden="true">#</span>
            <span className="direct-toast__content">
              <span className="direct-toast__title">{toast.serverName}</span>
              <span className="direct-toast__subtitle">
                {toast.grouped ? `${toast.channelName} · ${toast.count} новых сообщений` : toast.channelName}
              </span>
              <span className="direct-toast__text">{`${toast.authorName}: ${toast.preview}`}</span>
            </span>
          </button>
          <button type="button" className="direct-toast__close" onClick={() => onDismiss(toast.id)} aria-label="Закрыть уведомление">
            x
          </button>
        </div>
      ))}
    </div>
  );
};

export { QuickSwitcherModal };
