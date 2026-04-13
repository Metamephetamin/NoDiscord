import AnimatedAvatar from "./AnimatedAvatar";
import MediaFrameEditorModal from "./MediaFrameEditorModal";
import QuickSwitcherModal from "./QuickSwitcherModal";
import ScreenShareButton from "./ScreenShareButton";

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
                <AnimatedAvatar className="settings-shell__profile-avatar" src={userAvatarSrc} alt={displayName} frame={userAvatarFrame} />
                <div>
                  <strong>{displayName}</strong>
                  <button type="button" className="settings-shell__profile-link" onClick={() => onSelectSettingsTab("personal_profile")}>
                    Редактировать профиль...
                  </button>
                </div>
              </div>
              <input className="settings-shell__search" type="text" placeholder="Поиск" />

              {Object.entries(settingsNavSections).map(([section, items]) => (
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
            disabled={!currentVoiceChannel || (!hasPreview && !isCameraShareActive)}
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

export const MediaFrameEditorOverlay = ({
  state,
  defaultServerIcon,
  fallbackProfileBackground,
  fallbackAvatar,
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
    onCancel={onCancel}
    onConfirm={onConfirm}
  />
);

export const DirectToastStack = ({ toasts, onOpenToast, onDismiss, getAvatar, getDisplayName }) => {
  if (!toasts.length) {
    return null;
  }

  return (
    <div className="direct-toast-stack">
      {toasts.map((toast) => (
        <div key={toast.id} className="direct-toast">
          <button type="button" className="direct-toast__main" onClick={() => onOpenToast(toast)}>
            <AnimatedAvatar className="direct-toast__avatar" src={getAvatar(toast.friend)} alt={getDisplayName(toast.friend)} />
            <span className="direct-toast__content">
              <span className="direct-toast__title">{getDisplayName(toast.friend)}</span>
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
