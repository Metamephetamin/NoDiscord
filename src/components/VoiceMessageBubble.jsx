import { useEffect, useMemo, useRef, useState } from "react";
import { formatVoiceMessageDuration } from "../utils/voiceMessages";

export default function VoiceMessageBubble({
  src = "",
  waveform = [],
  durationMs = 0,
  fileName = "",
  pending = false,
}) {
  const audioRef = useRef(null);
  const frameRef = useRef(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTimeSeconds, setCurrentTimeSeconds] = useState(0);
  const [resolvedDurationMs, setResolvedDurationMs] = useState(durationMs);

  const effectiveWaveform = useMemo(
    () => (Array.isArray(waveform) && waveform.length ? waveform : [0.2, 0.42, 0.58, 0.34, 0.74, 0.28, 0.5, 0.26]),
    [waveform]
  );
  const progressRatio = resolvedDurationMs > 0
    ? Math.max(0, Math.min(1, (currentTimeSeconds * 1000) / resolvedDurationMs))
    : 0;
  const activeBars = Math.max(0, Math.round(progressRatio * effectiveWaveform.length));

  useEffect(() => () => {
    if (frameRef.current) {
      cancelAnimationFrame(frameRef.current);
    }
  }, []);

  useEffect(() => {
    setResolvedDurationMs(durationMs);
  }, [durationMs]);

  const syncPlaybackTime = () => {
    const audio = audioRef.current;
    if (!audio) {
      return;
    }

    setCurrentTimeSeconds(Number(audio.currentTime || 0));
    if (!audio.paused && !audio.ended) {
      frameRef.current = requestAnimationFrame(syncPlaybackTime);
    }
  };

  const handleTogglePlayback = async () => {
    if (!src || pending) {
      return;
    }

    const audio = audioRef.current;
    if (!audio) {
      return;
    }

    try {
      if (audio.paused) {
        await audio.play();
        setIsPlaying(true);
        frameRef.current = requestAnimationFrame(syncPlaybackTime);
      } else {
        audio.pause();
        setIsPlaying(false);
      }
    } catch {
      setIsPlaying(false);
    }
  };

  return (
    <div className={`voice-message ${pending ? "voice-message--pending" : ""}`}>
      <button
        type="button"
        className={`voice-message__play ${isPlaying ? "voice-message__play--playing" : ""}`}
        onClick={handleTogglePlayback}
        disabled={!src || pending}
        aria-label={isPlaying ? "Пауза" : "Воспроизвести"}
        title={fileName || "Голосовое сообщение"}
      >
        <span className="voice-message__play-icon" aria-hidden="true" />
      </button>

      <div className="voice-message__content">
        <div className="voice-message__waveform" aria-hidden="true">
          {effectiveWaveform.map((bar, index) => (
            <span
              key={`voice-bar-${index}`}
              className={`voice-message__bar ${index < activeBars ? "voice-message__bar--active" : ""}`}
              style={{ "--voice-bar-height": `${Math.round(12 + bar * 26)}px` }}
            />
          ))}
        </div>

        <div className="voice-message__meta">
          <span className="voice-message__time">
            {formatVoiceMessageDuration(currentTimeSeconds * 1000)}
          </span>
          <span className="voice-message__duration">
            {pending ? "Подготавливаем..." : formatVoiceMessageDuration(resolvedDurationMs)}
          </span>
        </div>
      </div>

      <audio
        ref={audioRef}
        src={src || undefined}
        preload="metadata"
        onLoadedMetadata={(event) => {
          const nextDurationSeconds = Number(event.currentTarget.duration || 0);
          if (Number.isFinite(nextDurationSeconds) && nextDurationSeconds > 0) {
            setResolvedDurationMs(nextDurationSeconds * 1000);
          }
        }}
        onPause={() => setIsPlaying(false)}
        onPlay={() => setIsPlaying(true)}
        onEnded={() => {
          setIsPlaying(false);
          setCurrentTimeSeconds(0);
        }}
      />
    </div>
  );
}
