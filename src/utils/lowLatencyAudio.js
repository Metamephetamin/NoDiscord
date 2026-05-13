const audioPools = new Map();

const getAudioCtor = () => {
  if (typeof Audio !== "undefined") {
    return Audio;
  }

  return globalThis?.Audio || null;
};

const normalizePoolSize = (poolSize) => {
  const parsed = Number(poolSize);
  if (!Number.isFinite(parsed)) {
    return 2;
  }

  return Math.max(1, Math.min(4, Math.floor(parsed)));
};

const createAudioElement = (soundPath, volume) => {
  const AudioCtor = getAudioCtor();
  if (!AudioCtor || !soundPath) {
    return null;
  }

  const audio = new AudioCtor(soundPath);
  audio.preload = "auto";
  audio.volume = volume;
  audio.playsInline = true;
  audio.load?.();
  return audio;
};

const getAudioPool = (soundPath, { volume = 0.42, poolSize = 2 } = {}) => {
  const normalizedPath = String(soundPath || "").trim();
  if (!normalizedPath) {
    return null;
  }

  const desiredPoolSize = normalizePoolSize(poolSize);
  let pool = audioPools.get(normalizedPath);
  if (!pool) {
    pool = { cursor: 0, items: [] };
    audioPools.set(normalizedPath, pool);
  }

  while (pool.items.length < desiredPoolSize) {
    const audio = createAudioElement(normalizedPath, volume);
    if (!audio) {
      break;
    }

    pool.items.push(audio);
  }

  return pool.items.length ? pool : null;
};

export const primeLowLatencyAudio = (soundPaths, options = {}) => {
  const paths = Array.isArray(soundPaths) ? soundPaths : [soundPaths];
  paths.forEach((soundPath) => {
    getAudioPool(soundPath, options);
  });
};

export const playLowLatencyAudio = (soundPath, { volume = 0.42, poolSize = 2 } = {}) => {
  const pool = getAudioPool(soundPath, { volume, poolSize });
  if (!pool) {
    return false;
  }

  const audio = pool.items[pool.cursor % pool.items.length];
  pool.cursor += 1;

  try {
    audio.pause?.();
    audio.currentTime = 0;
    audio.volume = volume;
    audio.play?.().catch?.(() => {});
    return true;
  } catch {
    return false;
  }
};

export const resetLowLatencyAudioCache = () => {
  audioPools.clear();
};
