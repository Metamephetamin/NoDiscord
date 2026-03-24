import { useEffect, useRef, useState } from "react";

export default function ScreenShareViewer({
  stream,
  videoSrc,
  imageSrc,
  hasAudio = false,
  title,
  subtitle,
  onClose,
  debugInfo,
}) {
  const videoRef = useRef(null);
  const [isAudioEnabled, setIsAudioEnabled] = useState(false);

  useEffect(() => {
    setIsAudioEnabled(false);
  }, [stream, videoSrc, imageSrc]);

  useEffect(() => {
    if (!videoRef.current) {
      return;
    }

    videoRef.current.srcObject = stream || null;
    videoRef.current.src = stream ? "" : videoSrc || "";
    videoRef.current.muted = !isAudioEnabled;

    if (stream) {
      videoRef.current.play().catch((error) => console.error("Ошибка запуска просмотра трансляции:", error));
    } else if (videoSrc) {
      videoRef.current.play().catch((error) => console.error("Ошибка запуска видео трансляции:", error));
    }

    return () => {
      if (videoRef.current) {
        videoRef.current.srcObject = null;
        videoRef.current.src = "";
      }
    };
  }, [stream, videoSrc, isAudioEnabled]);

  useEffect(() => {
    if (!videoSrc || !videoRef.current) {
      return;
    }

    const mediaElement = videoRef.current;
    const syncToLiveEdge = () => {
      if (!mediaElement || mediaElement.seeking || !mediaElement.buffered.length) {
        return;
      }

      const liveEdge = mediaElement.buffered.end(mediaElement.buffered.length - 1);
      const lag = liveEdge - mediaElement.currentTime;

      if (lag > 1.8) {
        mediaElement.currentTime = Math.max(0, liveEdge - 0.18);
        mediaElement.playbackRate = 1;
        return;
      }

      if (lag > 0.9) {
        mediaElement.playbackRate = 1.08;
        return;
      }

      if (lag > 0.45) {
        mediaElement.playbackRate = 1.03;
        return;
      }

      mediaElement.playbackRate = 1;
    };

    const intervalId = window.setInterval(syncToLiveEdge, 350);
    syncToLiveEdge();

    return () => {
      window.clearInterval(intervalId);
      if (mediaElement) {
        mediaElement.playbackRate = 1;
      }
    };
  }, [videoSrc]);

  const hasVideo = Boolean(stream || videoSrc || imageSrc);

  return (
    <div className="stream-viewer">
      <div className="stream-viewer__header">
        <div>
          <h1>{title}</h1>
          <span className="chat__subtitle">{subtitle}</span>
        </div>

        <div className="stream-viewer__actions">
          <button
            type="button"
            className={`stream-viewer__audio ${isAudioEnabled ? "stream-viewer__audio--active" : ""}`}
            onClick={() => setIsAudioEnabled((previous) => !previous)}
            disabled={!hasAudio}
          >
            {isAudioEnabled ? "Выключить звук" : "Включить звук"}
          </button>
          <button type="button" className="stream-viewer__close" onClick={onClose}>
            Назад к чату
          </button>
        </div>
      </div>

      <div className="stream-viewer__body">
        {hasVideo ? (
          <>
            {stream ? (
              <video ref={videoRef} className="stream-viewer__video" autoPlay playsInline controls />
            ) : videoSrc ? (
              <video ref={videoRef} className="stream-viewer__video" autoPlay playsInline controls />
            ) : (
              <img src={imageSrc} alt={title} className="stream-viewer__image" />
            )}
            {debugInfo ? (
              <div className="stream-viewer__debug">
                <div>stream: {stream ? "yes" : videoSrc ? "mse" : "frame"}</div>
                <div>video tracks: {debugInfo.videoTracks}</div>
                <div>audio: {hasAudio ? "yes" : "no"}</div>
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
