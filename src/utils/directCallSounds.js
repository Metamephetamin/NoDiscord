import { resolveStaticAssetUrl } from "./media";

const DIRECT_CALL_TONE_CONFIG = {
  outgoing: {
    path: resolveStaticAssetUrl("/sounds/direct-call-outgoing.wav"),
    volume: 0.42,
  },
  incoming: {
    path: resolveStaticAssetUrl("/sounds/direct-call-incoming.wav"),
    volume: 0.5,
  },
};

const directCallAudioCache = new Map();

const normalizeToneVolumeScale = (value) => {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) {
    return 1;
  }

  return Math.max(0, Math.min(1, numericValue));
};

const stopHtmlAudio = (audio) => {
  if (!audio) {
    return;
  }

  try {
    audio.pause();
    audio.currentTime = 0;
  } catch {
    // ignore cleanup failures
  }
};

const getDirectCallAudioElement = (kind) => {
  if (typeof window === "undefined" || typeof Audio === "undefined") {
    return null;
  }

  if (directCallAudioCache.has(kind)) {
    return directCallAudioCache.get(kind);
  }

  const toneConfig = DIRECT_CALL_TONE_CONFIG[kind];
  if (!toneConfig?.path) {
    return null;
  }

  try {
    const audio = new Audio(toneConfig.path);
    audio.preload = "auto";
    audio.loop = true;
    audio.playsInline = true;
    audio.load();
    directCallAudioCache.set(kind, audio);
    return audio;
  } catch {
    return null;
  }
};

const startLoopingAudioTone = async (kind, volumeScale = 1) => {
  if (typeof window === "undefined" || typeof Audio === "undefined") {
    return null;
  }

  const toneConfig = DIRECT_CALL_TONE_CONFIG[kind];
  if (!toneConfig?.path) {
    return null;
  }

  try {
    const audio = getDirectCallAudioElement(kind);
    if (!audio) {
      return null;
    }

    audio.loop = true;
    audio.volume = Math.max(0, Math.min(1, toneConfig.volume * normalizeToneVolumeScale(volumeScale)));
    audio.currentTime = 0;

    await audio.play();

    return () => {
      stopHtmlAudio(audio);
    };
  } catch {
    return null;
  }
};

export const startDirectCallTone = async (kind = "outgoing", options = {}) => {
  if (typeof window === "undefined") {
    return () => {};
  }

  const volumeScale = normalizeToneVolumeScale(options.volumeScale);
  if (options.enabled === false || volumeScale <= 0) {
    return () => {};
  }

  const htmlAudioStop = await startLoopingAudioTone(kind, volumeScale);
  if (htmlAudioStop) {
    return () => {
      htmlAudioStop?.();
    };
  }

  return () => {};
};
