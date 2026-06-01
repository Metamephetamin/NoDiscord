import { resolveStaticAssetUrl } from "./media";
import { createPreferredAudioContext } from "../webrtc/voiceClientUtils";

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

const createOscillatorBurst = (audioContext, destination, {
  frequency,
  type = "sine",
  startAt,
  attack = 0.015,
  duration = 0.18,
  release = 0.16,
  volume = 0.08,
  volumeScale = 1,
}) => {
  const oscillator = audioContext.createOscillator();
  const gainNode = audioContext.createGain();

  oscillator.type = type;
  oscillator.frequency.setValueAtTime(frequency, startAt);

  gainNode.gain.setValueAtTime(0.0001, startAt);
  gainNode.gain.linearRampToValueAtTime(volume * normalizeToneVolumeScale(volumeScale), startAt + attack);
  gainNode.gain.exponentialRampToValueAtTime(0.0001, startAt + attack + duration + release);

  oscillator.connect(gainNode);
  gainNode.connect(destination);
  oscillator.start(startAt);
  oscillator.stop(startAt + attack + duration + release + 0.03);
};

const scheduleOutgoingLoop = (audioContext, volumeScale = 1) => {
  const startedAt = audioContext.currentTime + 0.02;
  createOscillatorBurst(audioContext, audioContext.destination, {
    frequency: 392,
    type: "square",
    startAt: startedAt,
    duration: 0.09,
    release: 0.08,
    volume: 0.03,
    volumeScale,
  });
  createOscillatorBurst(audioContext, audioContext.destination, {
    frequency: 392,
    type: "square",
    startAt: startedAt + 0.34,
    duration: 0.09,
    release: 0.08,
    volume: 0.03,
    volumeScale,
  });
};

const scheduleIncomingLoop = (audioContext, volumeScale = 1) => {
  const startedAt = audioContext.currentTime + 0.02;
  createOscillatorBurst(audioContext, audioContext.destination, {
    frequency: 523.25,
    startAt: startedAt,
    duration: 0.18,
    release: 0.2,
    volume: 0.045,
    volumeScale,
  });
  createOscillatorBurst(audioContext, audioContext.destination, {
    frequency: 659.25,
    startAt: startedAt + 0.22,
    duration: 0.2,
    release: 0.22,
    volume: 0.04,
    volumeScale,
  });
  createOscillatorBurst(audioContext, audioContext.destination, {
    frequency: 783.99,
    startAt: startedAt + 0.44,
    duration: 0.16,
    release: 0.2,
    volume: 0.03,
    volumeScale,
  });
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

const startSynthTone = async (kind = "outgoing", volumeScale = 1) => {
  const audioContext = createPreferredAudioContext();
  if (!audioContext) {
    return () => {};
  }

  try {
    if (audioContext.state === "suspended") {
      await audioContext.resume();
    }
  } catch {
    // ignore autoplay resume failures
  }

  const playLoop = () => {
    if (kind === "incoming") {
      scheduleIncomingLoop(audioContext, volumeScale);
      return;
    }

    scheduleOutgoingLoop(audioContext, volumeScale);
  };

  playLoop();
  const loopIntervalMs = kind === "incoming" ? 2400 : 1800;
  const intervalId = window.setInterval(playLoop, loopIntervalMs);

  return () => {
    window.clearInterval(intervalId);
    audioContext.close().catch(() => {});
  };
};

export const startDirectCallTone = async (kind = "outgoing", options = {}) => {
  if (typeof window === "undefined") {
    return () => {};
  }

  const volumeScale = normalizeToneVolumeScale(options.volumeScale);
  if (options.enabled === false || volumeScale <= 0) {
    return () => {};
  }

  const fallbackDelayMs = kind === "incoming" ? 140 : 180;
  let stopped = false;
  let htmlToneActive = false;
  let synthStop = null;
  let fallbackTimerId = 0;

  const ensureSynthTone = async () => {
    if (stopped || htmlToneActive || synthStop) {
      return synthStop || (() => {});
    }

    synthStop = await startSynthTone(kind, volumeScale);
    if (stopped || htmlToneActive) {
      synthStop?.();
      synthStop = null;
      return () => {};
    }

    return synthStop;
  };

  const synthStartPromise = new Promise((resolve) => {
    fallbackTimerId = window.setTimeout(() => {
      void ensureSynthTone().then(resolve);
    }, fallbackDelayMs);
  });

  const htmlAudioStop = await startLoopingAudioTone(kind, volumeScale);
  if (htmlAudioStop) {
    htmlToneActive = true;
    stopped = false;
    window.clearTimeout(fallbackTimerId);
    synthStop?.();
    synthStop = null;
    return () => {
      stopped = true;
      htmlToneActive = false;
      window.clearTimeout(fallbackTimerId);
      synthStop?.();
      synthStop = null;
      htmlAudioStop?.();
    };
  }

  window.clearTimeout(fallbackTimerId);
  if (!synthStop) {
    synthStop = await Promise.race([
      synthStartPromise,
      ensureSynthTone(),
    ]);
  }

  return () => {
    stopped = true;
    htmlToneActive = false;
    window.clearTimeout(fallbackTimerId);
    synthStop?.();
    synthStop = null;
  };
};
