import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import "../../css/SoundboardPanel.css";
import useMenuMainSoundboard from "./useMenuMainSoundboard";
import { normalizeWaveformSamples } from "./soundboardWaveform.mjs";

const SOUNDBOARD_EMOJI_OPTIONS = [
  "🔊",
  "🎵",
  "🎶",
  "📣",
  "🔔",
  "👏",
  "😂",
  "😱",
  "🔥",
  "✨",
  "💥",
  "✅",
  "❌",
  "👀",
  "🎉",
  "💀",
];

const formatDuration = (durationSeconds) => {
  const totalSeconds = Math.max(0, Math.round(Number(durationSeconds) || 0));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = String(totalSeconds % 60).padStart(2, "0");
  return `${minutes}:${seconds}`;
};

const formatTrimValue = (value) => {
  const numberValue = Math.max(0, Number(value || 0));
  return numberValue.toFixed(1);
};

function SoundboardSearchIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M10.8 4.2a6.6 6.6 0 1 1 0 13.2 6.6 6.6 0 0 1 0-13.2Zm0 2a4.6 4.6 0 1 0 0 9.2 4.6 4.6 0 0 0 0-9.2Zm5.2 9 4.1 4.1-1.4 1.4-4.1-4.1 1.4-1.4Z" />
    </svg>
  );
}

function SoundboardVolumeIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M4 9.2h3.4L12.2 5c.65-.56 1.65-.1 1.65.76v12.48c0 .86-1 1.32-1.65.76l-4.8-4.2H4a1.2 1.2 0 0 1-1.2-1.2v-3.2A1.2 1.2 0 0 1 4 9.2Zm12.2-.95a1 1 0 0 1 1.4.18 6 6 0 0 1 0 7.14 1 1 0 1 1-1.58-1.22 4 4 0 0 0 0-4.7 1 1 0 0 1 .18-1.4Zm2.64-2.2a1 1 0 0 1 1.41.1 9 9 0 0 1 0 11.7 1 1 0 0 1-1.51-1.31 7 7 0 0 0 0-9.08 1 1 0 0 1 .1-1.41Z" />
    </svg>
  );
}

function SoundboardPlayIcon() {
  return (
    <svg className="soundboard-editor-modal__play-icon bi bi-play-fill" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
      <path d="m11.596 8.697-6.363 3.692A.5.5 0 0 1 4.5 11.956V4.044a.5.5 0 0 1 .733-.433l6.363 3.692a.5.5 0 0 1 0 .864z" />
    </svg>
  );
}

function SoundboardEditorWaveform({
  sound,
  maxTrimSeconds,
  onChange,
  onPreview,
}) {
  const trackRef = useRef(null);
  const [activeHandle, setActiveHandle] = useState("");
  const waveformSamples = useMemo(
    () => normalizeWaveformSamples(sound?.waveformSamples),
    [sound?.waveformSamples],
  );
  const safeMaxTrimSeconds = Math.max(0.1, Number(maxTrimSeconds || 0) || 0.1);
  const trimStartSeconds = Math.max(0, Number(sound?.trimStartSeconds || 0) || 0);
  const trimEndSeconds = Math.min(
    safeMaxTrimSeconds,
    Math.max(trimStartSeconds + 0.1, Number(sound?.trimEndSeconds || safeMaxTrimSeconds) || safeMaxTrimSeconds),
  );
  const startPercent = (trimStartSeconds / safeMaxTrimSeconds) * 100;
  const endPercent = (trimEndSeconds / safeMaxTrimSeconds) * 100;

  const updateTrimFromPointer = useCallback((event, handle) => {
    const bounds = trackRef.current?.getBoundingClientRect?.();

    if (!bounds?.width) {
      return;
    }

    const ratio = Math.min(1, Math.max(0, (event.clientX - bounds.left) / bounds.width));
    const nextSeconds = Number((ratio * safeMaxTrimSeconds).toFixed(1));

    if (handle === "start") {
      onChange({ trimStartSeconds: Math.min(nextSeconds, trimEndSeconds - 0.1) });
      return;
    }

    onChange({ trimEndSeconds: Math.max(nextSeconds, trimStartSeconds + 0.1) });
  }, [onChange, safeMaxTrimSeconds, trimEndSeconds, trimStartSeconds]);

  useEffect(() => {
    if (!activeHandle) {
      return undefined;
    }

    const handlePointerMove = (event) => updateTrimFromPointer(event, activeHandle);
    const handlePointerUp = () => setActiveHandle("");

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp, { once: true });

    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };
  }, [activeHandle, updateTrimFromPointer]);

  const beginTrimDrag = (event, handle) => {
    event.preventDefault();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    setActiveHandle(handle);
    updateTrimFromPointer(event, handle);
  };

  return (
    <div className="soundboard-editor-modal__waveform">
      <button type="button" className="soundboard-editor-modal__play" onClick={() => onPreview(sound)} aria-label="Прослушать звук">
        <SoundboardPlayIcon />
      </button>
      <div className="soundboard-editor-modal__wave-track" ref={trackRef}>
        <div className="soundboard-editor-modal__bars" aria-hidden="true">
          {waveformSamples.map((level, index) => {
            const barPercent = (index / Math.max(1, waveformSamples.length - 1)) * 100;
            const isTrimmed = barPercent < startPercent || barPercent > endPercent;

            return (
              <span
                key={`${index}-${level}`}
                className={isTrimmed ? "soundboard-editor-modal__bar--trimmed" : ""}
                style={{ height: `${18 + level * 76}%` }}
              />
            );
          })}
        </div>
        <div
          className="soundboard-editor-modal__trim-selection"
          style={{ left: `${startPercent}%`, right: `${100 - endPercent}%` }}
          aria-hidden="true"
        />
        <button
          type="button"
          className="soundboard-editor-modal__trim-handle soundboard-editor-modal__trim-handle--start"
          style={{ left: `${startPercent}%` }}
          onPointerDown={(event) => beginTrimDrag(event, "start")}
          aria-label="Обрезать начало звука"
        />
        <button
          type="button"
          className="soundboard-editor-modal__trim-handle soundboard-editor-modal__trim-handle--end"
          style={{ left: `${endPercent}%` }}
          onPointerDown={(event) => beginTrimDrag(event, "end")}
          aria-label="Обрезать конец звука"
        />
      </div>
    </div>
  );
}

function SoundboardEditorModal({
  soundboardEditor,
  onChange,
  onPreview,
  onClose,
  onSave,
}) {
  const [emojiPickerOpen, setEmojiPickerOpen] = useState(false);

  if (!soundboardEditor) {
    return null;
  }

  const maxTrimSeconds = Math.min(
    Number(soundboardEditor.sourceDurationSeconds || 0) || 0,
    20,
  );

  return (
    <div className="soundboard-editor-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        className="soundboard-editor-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Редактировать звук"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="soundboard-editor-modal__head">
          <h2>Редактировать звук</h2>
          <button type="button" className="soundboard-editor-modal__close" onClick={onClose} aria-label="Закрыть редактор звука">
            ×
          </button>
        </div>

        <div className="soundboard-editor-modal__preview">
          <strong>Предпросмотр</strong>
          <SoundboardEditorWaveform
            sound={soundboardEditor}
            maxTrimSeconds={maxTrimSeconds}
            onChange={onChange}
            onPreview={onPreview}
          />
        </div>

        <div className="soundboard-editor-modal__fields">
          <label className="soundboard-editor-modal__field">
            <span>Название звука <b aria-hidden="true">*</b></span>
            <input
              value={soundboardEditor.name}
              maxLength={60}
              onChange={(event) => onChange({ name: event.target.value })}
            />
          </label>
          <label className="soundboard-editor-modal__field soundboard-editor-modal__field--emoji">
            <span>Соответствующее эмодзи</span>
            <div className="soundboard-editor-modal__emoji-wrap">
              <button
                type="button"
                className="soundboard-editor-modal__emoji-button"
                onClick={() => setEmojiPickerOpen((isOpen) => !isOpen)}
                aria-label="Выбрать эмодзи для звука"
                aria-expanded={emojiPickerOpen}
              >
                {soundboardEditor.emoji || "🔊"}
              </button>
              <input
                value={soundboardEditor.emoji}
                maxLength={8}
                onChange={(event) => onChange({ emoji: event.target.value })}
              />
              {emojiPickerOpen ? (
                <div className="soundboard-editor-modal__emoji-picker" role="menu" aria-label="Эмодзи звука">
                  {SOUNDBOARD_EMOJI_OPTIONS.map((emoji) => (
                    <button
                      key={emoji}
                      type="button"
                      onClick={() => {
                        onChange({ emoji });
                        setEmojiPickerOpen(false);
                      }}
                      aria-label={`Выбрать ${emoji}`}
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          </label>
        </div>

        <label className="soundboard-editor-modal__range">
          <span>Громкость звука</span>
          <input
            type="range"
            min="0"
            max="100"
            value={soundboardEditor.volume}
            onChange={(event) => onChange({ volume: event.target.value })}
          />
        </label>

        <div className="soundboard-editor-modal__trim">
          <strong>Обрезка звука</strong>
          <div className="soundboard-editor-modal__trim-grid">
            <label>
              <span>Начало</span>
              <input
                type="number"
                min="0"
                max={formatTrimValue(Math.max(0, soundboardEditor.trimEndSeconds - 0.1))}
                step="0.1"
                value={formatTrimValue(soundboardEditor.trimStartSeconds)}
                onChange={(event) => onChange({ trimStartSeconds: event.target.value })}
              />
            </label>
            <label>
              <span>Конец</span>
              <input
                type="number"
                min={formatTrimValue(soundboardEditor.trimStartSeconds + 0.1)}
                max={formatTrimValue(maxTrimSeconds)}
                step="0.1"
                value={formatTrimValue(soundboardEditor.trimEndSeconds)}
                onChange={(event) => onChange({ trimEndSeconds: event.target.value })}
              />
            </label>
            <span className="soundboard-editor-modal__duration">
              {formatDuration(soundboardEditor.durationSeconds)}
            </span>
          </div>
        </div>

        <div className="soundboard-editor-modal__actions">
          <button type="button" className="soundboard-editor-modal__secondary" onClick={onClose}>
            Ясно
          </button>
          <button type="button" className="soundboard-editor-modal__primary" onClick={onSave}>
            Сохранить
          </button>
        </div>
      </section>
    </div>
  );
}

export default function SoundboardPanel({
  u,
  c,
  voiceClientRef,
}) {
  const close = () => c(false);
  const [volumeMenuOpen, setVolumeMenuOpen] = useState(false);
  const {
    soundboardInputRef,
    filteredSoundboardSounds,
    soundboardQuery,
    setSoundboardQuery,
    soundboardStatus,
    soundboardActiveSoundId,
    soundboardEditor,
    soundboardVolume,
    setSoundboardVolume,
    handleSoundboardUpload,
    updateSoundboardEditor,
    closeSoundboardEditor,
    saveSoundboardEditor,
    playSoundboardSound,
    removeSoundboardSound,
  } = useMenuMainSoundboard({
    user: u,
    voiceClientRef,
  });

  return (
    <div className="soundboard-panel-backdrop" role="presentation" onMouseDown={close}>
      <section
        className="soundboard-panel"
        role="dialog"
        aria-modal="true"
        aria-label="Звуковая панель"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="soundboard-panel__search-row">
          <label className="soundboard-panel__search">
            <SoundboardSearchIcon />
            <input
              type="search"
              value={soundboardQuery}
              onChange={(event) => setSoundboardQuery(event.target.value)}
              placeholder="Найдите идеальный звук"
              autoFocus
            />
          </label>
          <div className="soundboard-panel__volume-wrap">
            <button
              type="button"
              className={`soundboard-panel__volume ${volumeMenuOpen ? "soundboard-panel__volume--active" : ""}`}
              onClick={() => setVolumeMenuOpen((isOpen) => !isOpen)}
              aria-label="Громкость soundpad"
              aria-expanded={volumeMenuOpen}
            >
              <SoundboardVolumeIcon />
            </button>
            {volumeMenuOpen ? (
              <div className="soundboard-panel__volume-popover" role="group" aria-label="Громкость soundpad">
                <span>{soundboardVolume}%</span>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={soundboardVolume}
                  onChange={(event) => setSoundboardVolume(event.target.value)}
                />
              </div>
            ) : null}
          </div>
          <button type="button" className="soundboard-panel__close" onClick={close} aria-label="Закрыть звуковую панель">
            ×
          </button>
        </div>

        <input
          ref={soundboardInputRef}
          type="file"
          accept="audio/mpeg,audio/wav,audio/ogg,audio/mp4,audio/webm,audio/*"
          className="hidden-input"
          multiple
          onChange={handleSoundboardUpload}
        />

        <div className="soundboard-panel__body">
          <div className="soundboard-panel__section-head">
            <strong>Мои звуки</strong>
            <button type="button" className="soundboard-panel__upload" onClick={() => soundboardInputRef.current?.click()}>
              Загрузить звук
            </button>
          </div>

          {filteredSoundboardSounds.length ? (
            <div className="soundboard-panel__grid">
              {filteredSoundboardSounds.map((sound) => {
                const active = soundboardActiveSoundId === sound.id;

                return (
                  <div key={sound.id} className={`soundboard-panel__tile-wrap ${active ? "soundboard-panel__tile-wrap--active" : ""}`}>
                    <button
                      type="button"
                      className="soundboard-panel__tile"
                      onClick={() => playSoundboardSound(sound, { broadcast: true })}
                      aria-label={`Воспроизвести ${sound.name}`}
                    >
                      <span className="soundboard-panel__tile-emoji" aria-hidden="true">{sound.emoji || "🔊"}</span>
                      <span className="soundboard-panel__tile-name">{sound.name}</span>
                      <span className="soundboard-panel__tile-duration">{formatDuration(sound.durationSeconds)}</span>
                    </button>
                    <button
                      type="button"
                      className="soundboard-panel__tile-remove"
                      onClick={() => removeSoundboardSound(sound.id)}
                      aria-label={`Удалить ${sound.name}`}
                    >
                      ×
                    </button>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="soundboard-panel__empty">
              <strong>Пока нет звуков</strong>
              <button type="button" className="soundboard-panel__upload soundboard-panel__upload--empty" onClick={() => soundboardInputRef.current?.click()}>
                Загрузить звук
              </button>
            </div>
          )}

          {soundboardStatus ? <div className="soundboard-panel__status" role="status">{soundboardStatus}</div> : null}
        </div>

        <SoundboardEditorModal
          soundboardEditor={soundboardEditor}
          onChange={updateSoundboardEditor}
          onPreview={playSoundboardSound}
          onClose={closeSoundboardEditor}
          onSave={saveSoundboardEditor}
        />
      </section>
    </div>
  );
}
