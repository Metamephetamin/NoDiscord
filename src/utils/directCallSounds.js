import { createPreferredAudioContext } from "../webrtc/voiceClientUtils";

const createOscillatorBurst = (audioContext, destination, {
  frequency,
  type = "sine",
  startAt,
  attack = 0.015,
  duration = 0.18,
  release = 0.16,
  volume = 0.08,
}) => {
  const oscillator = audioContext.createOscillator();
  const gainNode = audioContext.createGain();

  oscillator.type = type;
  oscillator.frequency.setValueAtTime(frequency, startAt);

  gainNode.gain.setValueAtTime(0.0001, startAt);
  gainNode.gain.linearRampToValueAtTime(volume, startAt + attack);
  gainNode.gain.exponentialRampToValueAtTime(0.0001, startAt + attack + duration + release);

  oscillator.connect(gainNode);
  gainNode.connect(destination);
  oscillator.start(startAt);
  oscillator.stop(startAt + attack + duration + release + 0.03);
};

const scheduleOutgoingLoop = (audioContext) => {
  const startedAt = audioContext.currentTime + 0.02;
  createOscillatorBurst(audioContext, audioContext.destination, {
    frequency: 392,
    type: "square",
    startAt: startedAt,
    duration: 0.09,
    release: 0.08,
    volume: 0.03,
  });
  createOscillatorBurst(audioContext, audioContext.destination, {
    frequency: 392,
    type: "square",
    startAt: startedAt + 0.34,
    duration: 0.09,
    release: 0.08,
    volume: 0.03,
  });
};

const scheduleIncomingLoop = (audioContext) => {
  const startedAt = audioContext.currentTime + 0.02;
  createOscillatorBurst(audioContext, audioContext.destination, {
    frequency: 523.25,
    startAt: startedAt,
    duration: 0.18,
    release: 0.2,
    volume: 0.045,
  });
  createOscillatorBurst(audioContext, audioContext.destination, {
    frequency: 659.25,
    startAt: startedAt + 0.22,
    duration: 0.2,
    release: 0.22,
    volume: 0.04,
  });
  createOscillatorBurst(audioContext, audioContext.destination, {
    frequency: 783.99,
    startAt: startedAt + 0.44,
    duration: 0.16,
    release: 0.2,
    volume: 0.03,
  });
};

export const startDirectCallTone = async (kind = "outgoing") => {
  if (typeof window === "undefined") {
    return () => {};
  }

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
      scheduleIncomingLoop(audioContext);
      return;
    }

    scheduleOutgoingLoop(audioContext);
  };

  playLoop();
  const loopIntervalMs = kind === "incoming" ? 2400 : 1800;
  const intervalId = window.setInterval(playLoop, loopIntervalMs);

  return () => {
    window.clearInterval(intervalId);
    audioContext.close().catch(() => {});
  };
};
