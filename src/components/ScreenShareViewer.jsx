import { useEffect, useRef } from "react";
import AnimatedAvatar from "./AnimatedAvatar";
import "../css/ScreenShareViewer.css";

const getResolutionBadge = ({ width, height, fps }) => {
  const normalizedHeight = Number(height || 0);
  const normalizedFps = Number(fps || 0);

  if (!Number(width || 0) || !normalizedHeight) {
    return "";
  }

  const quality = normalizedHeight >= 1080 ? "1080p" : normalizedHeight >= 720 ? "720p" : `${normalizedHeight}p`;
  return normalizedFps > 0 ? `${quality} ${Math.round(normalizedFps)} кадров в секунду` : quality;
};

const getOwnerNameFromTitle = (title = "") =>
  String(title || "")
    .replace(/^Трансляция\s+/i, "")
    .trim();

function StreamViewerIcon({ name, className = "stream-viewer__control-icon" }) {
  const commonProps = {
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "1.9",
    strokeLinecap: "round",
    strokeLinejoin: "round",
    "aria-hidden": "true",
    className,
  };

  switch (name) {
    case "mic":
      return (
        <svg {...commonProps}>
          <path d="M12 4a3 3 0 0 1 3 3v5a3 3 0 0 1-6 0V7a3 3 0 0 1 3-3Z" />
          <path d="M6.5 11.5a5.5 5.5 0 0 0 11 0" />
          <path d="M12 17v3" />
          <path d="M9 20h6" />
        </svg>
      );
    case "headphones":
      return (
        <svg {...commonProps}>
          <path d="M4 13a8 8 0 0 1 16 0" />
          <path d="M5 13h2a2 2 0 0 1 2 2v2.5A1.5 1.5 0 0 1 7.5 19h-1A2.5 2.5 0 0 1 4 16.5V14a1 1 0 0 1 1-1Z" />
          <path d="M19 13h-2a2 2 0 0 0-2 2v2.5a1.5 1.5 0 0 0 1.5 1.5h1a2.5 2.5 0 0 0 2.5-2.5V14a1 1 0 0 0-1-1Z" />
        </svg>
      );
    case "volume":
      return (
        <svg {...commonProps}>
          <path d="M4 9v6h4l5 4V5L8 9H4Z" />
          <path d="M16 9.5a4 4 0 0 1 0 5" />
          <path d="M18.5 7a7 7 0 0 1 0 10" />
        </svg>
      );
    case "users-add":
      return (
        <svg {...commonProps}>
          <path d="M8.5 12.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z" />
          <path d="M2.8 20a5.8 5.8 0 0 1 11.4 0" />
          <path d="M17 8v6" />
          <path d="M14 11h6" />
          <path d="M16.8 17.5c1.9.2 3.4 1.1 4.2 2.5" />
        </svg>
      );
    case "chat":
      return (
        <svg {...commonProps}>
          <path d="M6 7.5h12a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H11l-4 3v-3H6a2 2 0 0 1-2-2v-6a2 2 0 0 1 2-2Z" />
        </svg>
      );
    case "screen":
      return (
        <svg {...commonProps}>
          <rect x="4" y="5" width="16" height="11" rx="2" />
          <path d="M10 11.5h5" />
          <path d="m13 9 2 2.5-2 2.5" />
          <path d="M9 19h6" />
          <path d="M12 16v3" />
        </svg>
      );
    case "camera":
      return (
        <svg {...commonProps}>
          <path d="M8 8h7a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2v-6a2 2 0 0 1 2-2Z" />
          <path d="m17 11 3-2v8l-3-2" />
        </svg>
      );
    case "screen-stop":
      return (
        <svg {...commonProps}>
          <rect x="4" y="5" width="16" height="11" rx="2" />
          <path d="m10 9 4 4" />
          <path d="m14 9-4 4" />
          <path d="M9 19h6" />
          <path d="M12 16v3" />
        </svg>
      );
    case "activities":
      return (
        <svg {...commonProps} fill="currentColor" stroke="none">
          <path d="M8.1 4.4a1.6 1.6 0 0 1 2.2 0l1.3 1.3a1.6 1.6 0 0 1 0 2.2l-1.3 1.3a1.6 1.6 0 0 1-2.2 0L6.8 7.9a1.6 1.6 0 0 1 0-2.2l1.3-1.3Z" />
          <path d="M15.4 5.1a1.4 1.4 0 0 1 2 0l1.1 1.1a1.4 1.4 0 0 1 0 2l-1.1 1.1a1.4 1.4 0 0 1-2 0l-1.1-1.1a1.4 1.4 0 0 1 0-2l1.1-1.1Z" />
          <path d="M5.7 13.9a1.4 1.4 0 0 1 2 0l1.1 1.1a1.4 1.4 0 0 1 0 2l-1.1 1.1a1.4 1.4 0 0 1-2 0L4.6 17a1.4 1.4 0 0 1 0-2l1.1-1.1Z" />
          <path d="M14 13.3a1.8 1.8 0 0 1 2.5 0l1.5 1.5a1.8 1.8 0 0 1 0 2.5l-1.5 1.5a1.8 1.8 0 0 1-2.5 0l-1.5-1.5a1.8 1.8 0 0 1 0-2.5l1.5-1.5Z" />
        </svg>
      );
    case "effects":
      return (
        <svg {...commonProps}>
          <path d="M6 18 8.8 6.8a2.2 2.2 0 0 1 3.8-.92l5.6 6.48a2.2 2.2 0 0 1-1.45 3.62L6 18Z" />
          <path d="M9.3 9.2 15 15" />
          <path d="M16.7 4.4 18 2.8" />
          <path d="M19 8.2h2.2" />
          <path d="M13.9 2.9l-.2-2" />
          <path d="M18.6 11.9l2 1" />
          <path d="M4 6.6 2.5 5.1" />
        </svg>
      );
    case "more":
      return (
        <svg {...commonProps} fill="currentColor" stroke="none">
          <circle cx="5.5" cy="12" r="1.8" />
          <circle cx="12" cy="12" r="1.8" />
          <circle cx="18.5" cy="12" r="1.8" />
        </svg>
      );
    case "popout":
      return (
        <svg {...commonProps}>
          <path d="M9 5H6.5A2.5 2.5 0 0 0 4 7.5v10A2.5 2.5 0 0 0 6.5 20h10a2.5 2.5 0 0 0 2.5-2.5V15" />
          <path d="M14 4h6v6" />
          <path d="m20 4-8 8" />
        </svg>
      );
    case "fullscreen":
      return (
        <svg {...commonProps}>
          <path d="M9 4H4v5" />
          <path d="m4 4 6 6" />
          <path d="M15 4h5v5" />
          <path d="m20 4-6 6" />
          <path d="M9 20H4v-5" />
          <path d="m4 20 6-6" />
          <path d="M15 20h5v-5" />
          <path d="m20 20-6-6" />
        </svg>
      );
    case "chevron-down":
      return (
        <svg {...commonProps} viewBox="0 0 16 16" strokeWidth="2.2">
          <path d="m4 6 4 4 4-4" />
        </svg>
      );
    case "close":
      return (
        <svg {...commonProps}>
          <path d="m7 7 10 10" />
          <path d="M17 7 7 17" />
        </svg>
      );
    case "leave":
      return (
        <svg
          viewBox="0 0 24 24"
          fill="currentColor"
          stroke="none"
          aria-hidden="true"
          className={className}
        >
          <path d="M20.82 14.38c.48.45.5 1.21.04 1.68l-2.08 2.13c-.46.47-1.2.5-1.7.08l-2.48-2.08a1.25 1.25 0 0 1-.4-1.29l.34-1.16a.48.48 0 0 0-.28-.58 7.18 7.18 0 0 0-4.52 0 .48.48 0 0 0-.28.58l.34 1.16c.14.47-.02.97-.4 1.29l-2.48 2.08c-.5.42-1.24.39-1.7-.08l-2.08-2.13a1.18 1.18 0 0 1 .04-1.68C5.62 10.84 8.55 9.75 12 9.75s6.38 1.09 8.82 4.63Z" />
        </svg>
      );
    default:
      return null;
  }
}

function StreamViewerControlButton({
  icon,
  label,
  onClick,
  active = false,
  danger = false,
  muted = false,
  slashed = false,
  menu = false,
  ghost = false,
  className = "",
  disabled = false,
}) {
  return (
    <button
      type="button"
      className={`stream-viewer__control-button ${active ? "stream-viewer__control-button--active" : ""} ${danger ? "stream-viewer__control-button--danger" : ""} ${muted ? "stream-viewer__control-button--muted" : ""} ${menu ? "stream-viewer__control-button--menu" : ""} ${ghost ? "stream-viewer__control-button--ghost" : ""} ${className}`.trim()}
      onClick={onClick}
      aria-label={label}
      disabled={disabled}
    >
      <span className={`stream-viewer__control-icon-shell ${muted || slashed ? "stream-viewer__control-icon-shell--slashed" : ""}`}>
        <StreamViewerIcon name={icon} />
      </span>
      {menu ? <StreamViewerIcon name="chevron-down" className="stream-viewer__control-chevron" /> : null}
    </button>
  );
}

export default function ScreenShareViewer({
  stream,
  videoSrc,
  imageSrc,
  muted = true,
  title,
  subtitle,
  channelName = "",
  ownerName = "",
  avatarSrc = "",
  streamTitle = "",
  qualityLabel = "",
  width = 0,
  height = 0,
  fps = 0,
  debugInfo,
  onClose,
  actionLabel,
  onAction,
  mirrored = false,
  secondaryStream = null,
  secondaryTitle = "",
  secondaryMirrored = false,
  isMicMuted = false,
  isSoundMuted = false,
  isScreenShareActive = false,
  isCameraShareActive = false,
  onToggleMic,
  onToggleSound,
  onOpenTextChat,
  onScreenShareAction,
  onOpenCamera,
  onStopCameraShare,
  onLeave,
}) {
  const videoRef = useRef(null);
  const secondaryVideoRef = useRef(null);
  const containerRef = useRef(null);

  useEffect(() => {
    if (!videoRef.current) {
      return;
    }

    const mediaElement = videoRef.current;
    mediaElement.srcObject = stream || null;
    mediaElement.src = stream ? "" : videoSrc || "";
    mediaElement.muted = muted;

    if (stream) {
      mediaElement.play().catch((error) => console.error("Ошибка запуска просмотра трансляции:", error));
    } else if (videoSrc) {
      mediaElement.play().catch((error) => console.error("Ошибка запуска видео трансляции:", error));
    }

    return () => {
      mediaElement.srcObject = null;
      mediaElement.src = "";
    };
  }, [muted, stream, videoSrc]);

  useEffect(() => {
    if (!secondaryVideoRef.current) {
      return;
    }

    const mediaElement = secondaryVideoRef.current;
    mediaElement.srcObject = secondaryStream || null;
    mediaElement.muted = true;

    if (secondaryStream) {
      mediaElement.play().catch((error) => console.error("Ошибка запуска второго окна трансляции:", error));
    }

    return () => {
      mediaElement.srcObject = null;
    };
  }, [secondaryStream]);

  useEffect(() => {
    if (!videoSrc || !videoRef.current) {
      return;
    }

    const mediaElement = videoRef.current;
    let intervalId = 0;
    const syncToLiveEdge = () => {
      if (
        !mediaElement ||
        mediaElement.seeking ||
        mediaElement.readyState < HTMLMediaElement.HAVE_CURRENT_DATA ||
        !mediaElement.buffered.length
      ) {
        return;
      }

      const liveEdge = mediaElement.buffered.end(mediaElement.buffered.length - 1);
      const lag = liveEdge - mediaElement.currentTime;

      if (lag > 1.2) {
        mediaElement.currentTime = Math.max(0, liveEdge - 0.12);
        mediaElement.playbackRate = 1;
        return;
      }

      if (lag > 0.55) {
        mediaElement.playbackRate = 1.06;
        return;
      }

      if (lag > 0.25) {
        mediaElement.playbackRate = 1.03;
        return;
      }

      mediaElement.playbackRate = 1;
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        if (intervalId) {
          window.clearInterval(intervalId);
          intervalId = 0;
        }
        return;
      }

      syncToLiveEdge();
      if (!intervalId) {
        intervalId = window.setInterval(syncToLiveEdge, 900);
      }
    };

    mediaElement.addEventListener("loadedmetadata", syncToLiveEdge);
    mediaElement.addEventListener("progress", syncToLiveEdge);
    mediaElement.addEventListener("timeupdate", syncToLiveEdge);
    mediaElement.addEventListener("playing", syncToLiveEdge);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    syncToLiveEdge();
    handleVisibilityChange();

    return () => {
      if (intervalId) {
        window.clearInterval(intervalId);
      }
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      mediaElement.removeEventListener("loadedmetadata", syncToLiveEdge);
      mediaElement.removeEventListener("progress", syncToLiveEdge);
      mediaElement.removeEventListener("timeupdate", syncToLiveEdge);
      mediaElement.removeEventListener("playing", syncToLiveEdge);
      if (mediaElement) {
        mediaElement.playbackRate = 1;
      }
    };
  }, [videoSrc]);

  const toggleFullscreen = async () => {
    try {
      if (document.fullscreenElement === containerRef.current) {
        await document.exitFullscreen?.();
        return;
      }

      await containerRef.current?.requestFullscreen?.();
    } catch (error) {
      console.error("Ошибка переключения полноэкранного режима:", error);
    }
  };

  const hasVideo = Boolean(stream || videoSrc || imageSrc);
  const resolvedOwnerName = ownerName || getOwnerNameFromTitle(title) || "Участник";
  const resolvedChannelName = channelName || subtitle || "Голосовой канал";
  const resolvedStreamTitle = streamTitle || (title ? title.replace(/^Трансляция\s+/i, "Экран ") : `Экран ${resolvedOwnerName}`);
  const resolvedQualityLabel = qualityLabel || getResolutionBadge({ width, height, fps });
  const cameraAction = isCameraShareActive ? onStopCameraShare : onOpenCamera;
  const stopStreamAction = onAction || onClose || onLeave;
  const stopStreamLabel = actionLabel || "Закрыть эфир";

  return (
    <div className="stream-viewer" ref={containerRef}>
      <div className="stream-viewer__topbar">
        <div className="stream-viewer__stream-meta">
          <StreamViewerIcon name="volume" className="stream-viewer__topbar-icon" />
          <strong className="stream-viewer__channel-name">{resolvedChannelName}</strong>
          <span className="stream-viewer__dot" aria-hidden="true" />
          <AnimatedAvatar className="stream-viewer__avatar" src={avatarSrc} alt={resolvedOwnerName} />
          <strong className="stream-viewer__stream-title">{resolvedStreamTitle}</strong>
        </div>

        <div className="stream-viewer__badges">
          <AnimatedAvatar className="stream-viewer__badge-avatar" src={avatarSrc} alt={resolvedOwnerName} />
          {resolvedQualityLabel ? <span className="stream-viewer__pill stream-viewer__pill--quality">{resolvedQualityLabel}</span> : null}
          <span className="stream-viewer__pill stream-viewer__pill--live">В ЭФИРЕ</span>
          <StreamViewerIcon name="chat" className="stream-viewer__topbar-chat" />
        </div>
      </div>

      <div className="stream-viewer__body">
        {hasVideo ? (
          <>
            {stream || videoSrc ? (
              <video
                ref={videoRef}
                className={`stream-viewer__video ${mirrored ? "stream-viewer__video--mirrored" : ""}`.trim()}
                autoPlay
                playsInline
              />
            ) : (
              <img src={imageSrc} alt={title} className="stream-viewer__image" />
            )}
            {debugInfo ? (
              <div className="stream-viewer__debug">
                <div>stream: {stream ? "yes" : videoSrc ? "mse" : "frame"}</div>
                <div>video tracks: {debugInfo.videoTracks}</div>
                <div>audio: {debugInfo.hasAudio ? "yes" : "no"}</div>
                <div>state: {debugInfo.readyState}</div>
                <div>frame updated: {debugInfo.updatedAt || "none"}</div>
              </div>
            ) : null}
            {secondaryStream ? (
              <div className="stream-viewer__secondary">
                <video
                  ref={secondaryVideoRef}
                  className={`stream-viewer__secondary-video ${secondaryMirrored ? "stream-viewer__video--mirrored" : ""}`.trim()}
                  autoPlay
                  playsInline
                  muted
                />
                <span>{secondaryTitle || "Камера"}</span>
              </div>
            ) : null}
          </>
        ) : (
          <div className="stream-viewer__empty">
            <div className="stream-viewer__empty-title">Ожидание трансляции</div>
            <div className="stream-viewer__empty-subtitle">
              Видео подключится автоматически, как только поток станет доступен.
            </div>
            {debugInfo ? (
              <div className="stream-viewer__debug">
                <div>stream: no</div>
                <div>live selected: {debugInfo.liveSelected ? "yes" : "no"}</div>
                <div>remote shares: {debugInfo.remoteSharesCount}</div>
                <div>watched user: {debugInfo.userId || "none"}</div>
              </div>
            ) : null}
          </div>
        )}
      </div>

      <div className="stream-viewer__controls">
        <div className="stream-viewer__control-layout">
          <div className="stream-viewer__control-side stream-viewer__control-side--left" aria-hidden="true">
            <StreamViewerIcon name="users-add" className="stream-viewer__side-icon" />
          </div>

          <div className="stream-viewer__control-center">
            {onToggleMic || cameraAction ? (
              <div className="stream-viewer__control-group" role="toolbar" aria-label="Управление звуком">
                {onToggleMic ? (
                  <StreamViewerControlButton
                    icon="mic"
                    label={isMicMuted ? "Включить микрофон" : "Выключить микрофон"}
                    onClick={onToggleMic}
                    muted={isMicMuted}
                    menu
                  />
                ) : null}
                {onToggleMic || cameraAction ? (
                  <StreamViewerControlButton
                    icon="camera"
                    label={isCameraShareActive ? "Остановить камеру" : "Включить камеру"}
                    onClick={cameraAction}
                    active={isCameraShareActive}
                    slashed={!isCameraShareActive}
                    menu
                    disabled={!cameraAction}
                  />
                ) : null}
              </div>
            ) : null}

            {onScreenShareAction || onOpenTextChat || onAction || hasVideo ? (
              <div className="stream-viewer__control-group" role="toolbar" aria-label="Управление трансляцией">
                <StreamViewerControlButton
                  icon="screen"
                  label={isScreenShareActive ? "Остановить трансляцию экрана" : "Начать трансляцию экрана"}
                  onClick={onScreenShareAction}
                  active={isScreenShareActive}
                  menu
                  disabled={!onScreenShareAction}
                />
                <StreamViewerControlButton
                  icon="activities"
                  label="Активности"
                  onClick={onOpenTextChat || (() => {})}
                />
                <StreamViewerControlButton
                  icon="effects"
                  label="Реакции"
                  onClick={() => {}}
                />
                <StreamViewerControlButton
                  icon="more"
                  label="Ещё"
                  onClick={() => {}}
                />
              </div>
            ) : null}

            {stopStreamAction ? (
              <StreamViewerControlButton
                icon="screen-stop"
                label={stopStreamLabel}
                onClick={stopStreamAction}
                danger
                className="stream-viewer__control-button--leave"
              />
            ) : null}
          </div>

          <div className="stream-viewer__control-side stream-viewer__control-side--right">
            <StreamViewerControlButton
              icon="volume"
              label={isSoundMuted ? "Включить звук" : "Отключить звук"}
              onClick={onToggleSound || (() => {})}
              muted={isSoundMuted}
              ghost
            />
            <StreamViewerControlButton
              icon="popout"
              label="Свернуть эфир"
              onClick={onClose || (() => {})}
              ghost
            />
            <StreamViewerControlButton
              icon="fullscreen"
              label="Открыть эфир на весь экран"
              onClick={toggleFullscreen}
              ghost
            />
          </div>
        </div>
      </div>
    </div>
  );
}
