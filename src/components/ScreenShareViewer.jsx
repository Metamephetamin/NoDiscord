import { useEffect, useRef } from "react";

export default function ScreenShareViewer({
  stream,
  videoSrc,
  imageSrc,
  title,
  subtitle,
  debugInfo,
}) {
  const videoRef = useRef(null);
  const containerRef = useRef(null);

  useEffect(() => {
    if (!videoRef.current) {
      return;
    }

    const mediaElement = videoRef.current;
    mediaElement.srcObject = stream || null;
    mediaElement.src = stream ? "" : videoSrc || "";
    mediaElement.muted = true;

    if (stream) {
      mediaElement.play().catch((error) => console.error("Ошибка запуска просмотра трансляции:", error));
    } else if (videoSrc) {
      mediaElement.play().catch((error) => console.error("Ошибка запуска видео трансляции:", error));
    }

    return () => {
      mediaElement.srcObject = null;
      mediaElement.src = "";
    };
  }, [stream, videoSrc]);

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

  const requestFullscreen = async () => {
    try {
      await containerRef.current?.requestFullscreen?.();
    } catch (error) {
      console.error("Ошибка перехода в полноэкранный режим:", error);
    }
  };

  const hasVideo = Boolean(stream || videoSrc || imageSrc);

  return (
    <div className="stream-viewer" ref={containerRef}>
      <div className="stream-viewer__header">
        <div>
          <h1>{title}</h1>
          <span className="chat__subtitle">{subtitle}</span>
        </div>

        <div className="stream-viewer__actions">
          <button type="button" className="stream-viewer__fullscreen" onClick={requestFullscreen}>
            На весь экран
          </button>
        </div>
      </div>

      <div className="stream-viewer__body">
        {hasVideo ? (
          <>
            {stream || videoSrc ? (
              <video ref={videoRef} className="stream-viewer__video" autoPlay playsInline />
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
    </div>
  );
}
