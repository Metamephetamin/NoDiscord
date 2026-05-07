import { useEffect, useMemo, useRef, useState } from "react";
import { formatVoiceMessageDuration } from "../utils/voiceMessages";

const VOICE_PLAYBACK_RATES = [1, 2, 4];
const VOICE_WAVEFORM_BAR_COUNT = 64;
const VOICE_KEYBOARD_SEEK_SECONDS = 5;
const DEFAULT_WAVEFORM = [0.18, 0.2, 0.24, 0.22, 0.28, 0.34, 0.48, 0.62, 0.72, 0.68, 0.58, 0.5, 0.42, 0.46, 0.54, 0.6, 0.56, 0.44, 0.36, 0.32, 0.38, 0.5, 0.58, 0.52, 0.4, 0.34, 0.3, 0.28, 0.24, 0.22];

const formatPlaybackRate = (value) => (Number(value) === 1 ? "1x" : `${Number(value)}x`);

const buildDisplayWaveform = (samples) => {
  const source = Array.isArray(samples) && samples.length ? samples : DEFAULT_WAVEFORM;

  return Array.from({ length: VOICE_WAVEFORM_BAR_COUNT }, (_, index) => {
    const sourceIndex = Math.min(source.length - 1, Math.floor((index / VOICE_WAVEFORM_BAR_COUNT) * source.length));
    const baseValue = Math.max(0.08, Math.min(1, Number(source[sourceIndex]) || 0));
    const texture = 0.76 + Math.sin(index * 1.37) * 0.12 + Math.cos(index * 0.53) * 0.08;
    return Math.max(0.1, Math.min(1, baseValue * texture));
  });
};

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
  const [playbackRate, setPlaybackRate] = useState(1);

  const effectiveWaveform = useMemo(() => buildDisplayWaveform(waveform), [waveform]);
  const progressRatio = resolvedDurationMs > 0
    ? Math.max(0, Math.min(1, (currentTimeSeconds * 1000) / resolvedDurationMs))
    : 0;
  const displayTimeMs = currentTimeSeconds > 0 || isPlaying ? currentTimeSeconds * 1000 : resolvedDurationMs;
  const getBarFill = (index) => {
    const totalBars = Math.max(1, effectiveWaveform.length);
    const barStart = index / totalBars;
    const barEnd = (index + 1) / totalBars;
    const fill = (progressRatio - barStart) / (barEnd - barStart);
    return Math.max(0, Math.min(1, fill));
  };

  useEffect(() => () => {
    if (frameRef.current) {
      cancelAnimationFrame(frameRef.current);
    }
  }, []);

  useEffect(() => {
    setResolvedDurationMs(durationMs);
  }, [durationMs]);

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.playbackRate = playbackRate;
    }
  }, [playbackRate]);

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
        audio.playbackRate = playbackRate;
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

  const handleTogglePlaybackRate = () => {
    setPlaybackRate((currentRate) => {
      const currentIndex = VOICE_PLAYBACK_RATES.indexOf(currentRate);
      const nextRate = VOICE_PLAYBACK_RATES[(currentIndex + 1) % VOICE_PLAYBACK_RATES.length] || 1;
      if (audioRef.current) {
        audioRef.current.playbackRate = nextRate;
      }
      return nextRate;
    });
  };

  const seekToRatio = (ratio) => {
    if (!src || pending) {
      return;
    }

    const audio = audioRef.current;
    const durationSeconds = Math.max(
      0,
      Number(audio?.duration || 0) || (Number(resolvedDurationMs || 0) / 1000)
    );
    if (!audio || !Number.isFinite(durationSeconds) || durationSeconds <= 0) {
      return;
    }

    const nextTimeSeconds = Math.max(0, Math.min(durationSeconds, durationSeconds * ratio));
    audio.currentTime = nextTimeSeconds;
    setCurrentTimeSeconds(nextTimeSeconds);
  };

  const handleWaveformSeek = (event) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    const ratio = bounds.width > 0
      ? (event.clientX - bounds.left) / bounds.width
      : 0;
    seekToRatio(ratio);
  };

  const handleWaveformKeyDown = (event) => {
    if (!src || pending) {
      return;
    }

    const audio = audioRef.current;
    const durationSeconds = Math.max(
      0,
      Number(audio?.duration || 0) || (Number(resolvedDurationMs || 0) / 1000)
    );
    if (!audio || !Number.isFinite(durationSeconds) || durationSeconds <= 0) {
      return;
    }

    let nextTimeSeconds = Number(audio.currentTime || 0);
    if (event.key === "ArrowLeft") {
      nextTimeSeconds -= VOICE_KEYBOARD_SEEK_SECONDS;
    } else if (event.key === "ArrowRight") {
      nextTimeSeconds += VOICE_KEYBOARD_SEEK_SECONDS;
    } else if (event.key === "Home") {
      nextTimeSeconds = 0;
    } else if (event.key === "End") {
      nextTimeSeconds = durationSeconds;
    } else if (event.key === " " || event.key === "Enter") {
      handleTogglePlayback();
      event.preventDefault();
      return;
    } else {
      return;
    }

    event.preventDefault();
    nextTimeSeconds = Math.max(0, Math.min(durationSeconds, nextTimeSeconds));
    audio.currentTime = nextTimeSeconds;
    setCurrentTimeSeconds(nextTimeSeconds);
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
        <div
          className="voice-message__waveform"
          role="slider"
          tabIndex={!src || pending ? -1 : 0}
          aria-label="Перемотка голосового сообщения"
          aria-valuemin={0}
          aria-valuemax={Math.max(0, Math.round(resolvedDurationMs / 1000))}
          aria-valuenow={Math.max(0, Math.round(currentTimeSeconds))}
          aria-valuetext={formatVoiceMessageDuration(displayTimeMs)}
          onPointerDown={handleWaveformSeek}
          onKeyDown={handleWaveformKeyDown}
        >
          {effectiveWaveform.map((bar, index) => (
            <span
              key={`voice-bar-${index}`}
              className="voice-message__bar"
              style={{
                "--voice-bar-height": `${Math.round(5 + bar * 16)}px`,
                "--voice-bar-fill": getBarFill(index).toFixed(3),
              }}
            />
          ))}
        </div>

        <div className="voice-message__meta">
          <span className="voice-message__time">
            {formatVoiceMessageDuration(displayTimeMs)}
          </span>
          <button
            type="button"
            className="voice-message__speed"
            onClick={handleTogglePlaybackRate}
            disabled={!src || pending}
            aria-label={`Скорость ${formatPlaybackRate(playbackRate)}`}
            title="Скорость воспроизведения"
          >
            {formatPlaybackRate(playbackRate)}
          </button>
          {pending ? <span className="voice-message__duration">Подготавливаем...</span> : null}
        </div>
      </div>

      <audio
        ref={audioRef}
        src={src || undefined}
        preload="metadata"
        onLoadedMetadata={(event) => {
          const nextDurationSeconds = Number(event.currentTarget.duration || 0);
          event.currentTarget.playbackRate = playbackRate;
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
