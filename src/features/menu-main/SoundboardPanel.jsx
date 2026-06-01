import "../../css/SoundboardPanel.css";
import useMenuMainSoundboard from "./useMenuMainSoundboard";

const formatDuration = (durationSeconds) => {
  const totalSeconds = Math.max(0, Math.round(Number(durationSeconds) || 0));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = String(totalSeconds % 60).padStart(2, "0");
  return `${minutes}:${seconds}`;
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

function SoundboardTileIcon({ active }) {
  return (
    <span className={`soundboard-panel__tile-icon ${active ? "soundboard-panel__tile-icon--active" : ""}`} aria-hidden="true">
      <svg viewBox="0 0 24 24" focusable="false">
        <path d="M5 9.5h3.1l4.35-3.8c.6-.52 1.55-.1 1.55.7v11.2c0 .8-.95 1.22-1.55.7L8.1 14.5H5a1 1 0 0 1-1-1v-3a1 1 0 0 1 1-1Zm11.2-.85a1 1 0 0 1 1.4.17 5.35 5.35 0 0 1 0 6.36 1 1 0 0 1-1.57-1.24 3.35 3.35 0 0 0 0-3.88 1 1 0 0 1 .17-1.41Z" />
      </svg>
    </span>
  );
}

export default function SoundboardPanel({
  u,
  c,
}) {
  const close = () => c(false);
  const {
    soundboardInputRef,
    filteredSoundboardSounds,
    soundboardQuery,
    setSoundboardQuery,
    soundboardStatus,
    soundboardActiveSoundId,
    handleSoundboardUpload,
    playSoundboardSound,
    removeSoundboardSound,
  } = useMenuMainSoundboard({
    user: u,
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
          <button type="button" className="soundboard-panel__volume" aria-label="Громкость системных звуков">
            <SoundboardVolumeIcon />
          </button>
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
                      onClick={() => playSoundboardSound(sound)}
                      aria-label={`Воспроизвести ${sound.name}`}
                    >
                      <SoundboardTileIcon active={active} />
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
      </section>
    </div>
  );
}
