import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getScopedUserStorageScope } from "../../utils/menuMainModel";
import { readSystemSoundVolumeRatio } from "../../utils/systemSoundVolume";
import { buildWaveformSamplesFromChannelData, normalizeWaveformSamples } from "./soundboardWaveform.mjs";

const SOUNDBOARD_STORAGE_PREFIX = "nd:soundboard";
const SOUNDBOARD_VOLUME_STORAGE_PREFIX = "nd:soundboard-volume";
const SOUNDBOARD_MAX_DURATION_SECONDS = 20;
const SOUNDBOARD_MAX_ITEMS = 48;

const createSoundboardStorageKey = (user) => `${SOUNDBOARD_STORAGE_PREFIX}:${getScopedUserStorageScope(user)}`;
const createSoundboardVolumeStorageKey = (user) => `${SOUNDBOARD_VOLUME_STORAGE_PREFIX}:${getScopedUserStorageScope(user)}`;

const clampNumber = (value, min, max, fallback = min) => {
  const numberValue = Number(value);

  if (!Number.isFinite(numberValue)) {
    return fallback;
  }

  return Math.min(max, Math.max(min, numberValue));
};

const clampSoundVolume = (value) => Math.round(clampNumber(value, 0, 100, 100));

const normalizeSoundEmoji = (value) => String(value || "🔊").trim().slice(0, 8) || "🔊";

const normalizeSound = (sound) => {
  const id = String(sound?.id || "").trim();
  const name = String(sound?.name || "").trim();
  const dataUrl = String(sound?.dataUrl || "").trim();
  const storedDurationSeconds = Number(sound?.durationSeconds || 0);
  const trimStartSeconds = Math.max(0, Number(sound?.trimStartSeconds || 0) || 0);
  const trimEndSeconds = Math.max(trimStartSeconds, Number(sound?.trimEndSeconds || 0) || 0);
  const durationSeconds = storedDurationSeconds > 0
    ? storedDurationSeconds
    : Math.max(0, trimEndSeconds - trimStartSeconds);

  if (!id || !name || !dataUrl) {
    return null;
  }

  return {
    id,
    name,
    emoji: normalizeSoundEmoji(sound?.emoji),
    dataUrl,
    durationSeconds: Number.isFinite(durationSeconds) && durationSeconds > 0 ? durationSeconds : 0,
    sourceDurationSeconds: Number(sound?.sourceDurationSeconds || 0) || 0,
    trimStartSeconds,
    trimEndSeconds,
    volume: clampSoundVolume(sound?.volume ?? 100),
    waveformSamples: normalizeWaveformSamples(sound?.waveformSamples),
    createdAt: Number(sound?.createdAt || Date.now()),
  };
};

const readStoredSoundboardSounds = (storageKey) => {
  if (typeof window === "undefined" || !storageKey) {
    return [];
  }

  try {
    const parsed = JSON.parse(window.localStorage.getItem(storageKey) || "[]");
    return (Array.isArray(parsed) ? parsed : [])
      .map(normalizeSound)
      .filter(Boolean)
      .slice(0, SOUNDBOARD_MAX_ITEMS);
  } catch {
    return [];
  }
};

const writeStoredSoundboardSounds = (storageKey, sounds) => {
  if (typeof window === "undefined" || !storageKey) {
    return;
  }

  window.localStorage.setItem(storageKey, JSON.stringify((Array.isArray(sounds) ? sounds : []).slice(0, SOUNDBOARD_MAX_ITEMS)));
};

const readStoredSoundboardVolume = (storageKey) => {
  if (typeof window === "undefined" || !storageKey) {
    return 100;
  }

  try {
    return clampSoundVolume(window.localStorage.getItem(storageKey) ?? 100);
  } catch {
    return 100;
  }
};

const writeStoredSoundboardVolume = (storageKey, value) => {
  if (typeof window === "undefined" || !storageKey) {
    return;
  }

  window.localStorage.setItem(storageKey, String(clampSoundVolume(value)));
};

const getSoundFileName = (file) => {
  const fileName = String(file?.name || "").trim();
  const nameWithoutExtension = fileName.replace(/\.[^/.]+$/, "").trim();
  return nameWithoutExtension || fileName || "Звук";
};

const isSupportedAudioFile = (file) => {
  const fileType = String(file?.type || "").toLowerCase();
  const lowerName = String(file?.name || "").toLowerCase();

  return (
    fileType.startsWith("audio/") ||
    lowerName.endsWith(".mp3") ||
    lowerName.endsWith(".wav") ||
    lowerName.endsWith(".ogg") ||
    lowerName.endsWith(".m4a") ||
    lowerName.endsWith(".webm")
  );
};

const readAudioMetadata = (file) => {
  const objectUrl = URL.createObjectURL(file);

  return new Promise((resolve, reject) => {
    const audio = new Audio();
    audio.preload = "metadata";
    audio.onloadedmetadata = () => {
      const duration = Number(audio.duration || 0);
      URL.revokeObjectURL(objectUrl);

      if (!Number.isFinite(duration) || duration <= 0) {
        reject(new Error("Не удалось определить длительность звука."));
        return;
      }

      resolve({
        durationSeconds: duration,
        trimEndSeconds: audio.duration > SOUNDBOARD_MAX_DURATION_SECONDS
          ? SOUNDBOARD_MAX_DURATION_SECONDS
          : duration,
      });
    };
    audio.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("Не удалось прочитать выбранный аудиофайл."));
    };
    audio.src = objectUrl;
  });
};

const readFileAsDataUrl = (file) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("Не удалось сохранить выбранный аудиофайл."));
    reader.readAsDataURL(file);
  });

const decodeSoundWaveform = async (file) => {
  const AudioContextConstructor = window.AudioContext || window.webkitAudioContext;

  if (typeof AudioContextConstructor !== "function" || typeof file?.arrayBuffer !== "function") {
    return normalizeWaveformSamples([]);
  }

  const audioContext = new AudioContextConstructor();

  try {
    const audioBuffer = await audioContext.decodeAudioData(await file.arrayBuffer());
    return buildWaveformSamplesFromChannelData(audioBuffer.getChannelData(0));
  } catch {
    return normalizeWaveformSamples([]);
  } finally {
    audioContext.close?.();
  }
};

const createSoundDraftFromFile = async (file) => {
  if (!isSupportedAudioFile(file)) {
    throw new Error("Можно загрузить только аудиофайл.");
  }

  const metadata = await readAudioMetadata(file);
  const waveformSamples = await decodeSoundWaveform(file);
  const dataUrl = await readFileAsDataUrl(file);

  return {
    id: `sound-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    name: getSoundFileName(file),
    emoji: "🔊",
    dataUrl,
    sourceDurationSeconds: metadata.durationSeconds,
    trimStartSeconds: 0,
    trimEndSeconds: metadata.trimEndSeconds,
    durationSeconds: metadata.trimEndSeconds,
    volume: 100,
    waveformSamples,
    createdAt: Date.now(),
  };
};

export default function useMenuMainSoundboard({
  user,
  voiceClientRef,
}) {
  const storageKey = useMemo(() => createSoundboardStorageKey(user), [user]);
  const volumeStorageKey = useMemo(() => createSoundboardVolumeStorageKey(user), [user]);
  const soundboardInputRef = useRef(null);
  const activeAudioRef = useRef(null);
  const [soundboardStorageState, setSoundboardStorageState] = useState(() => ({
    storageKey,
    sounds: readStoredSoundboardSounds(storageKey),
  }));
  const [soundboardQuery, setSoundboardQuery] = useState("");
  const [soundboardStatus, setSoundboardStatus] = useState("");
  const [soundboardActiveSoundId, setSoundboardActiveSoundId] = useState("");
  const [soundboardEditor, setSoundboardEditor] = useState(null);
  const [soundboardVolume, setSoundboardVolumeState] = useState(() => readStoredSoundboardVolume(volumeStorageKey));
  const soundboardSounds = soundboardStorageState.storageKey === storageKey
    ? soundboardStorageState.sounds
    : readStoredSoundboardSounds(storageKey);

  useEffect(() => {
    setSoundboardVolumeState(readStoredSoundboardVolume(volumeStorageKey));
  }, [volumeStorageKey]);

  const setSoundboardVolume = useCallback((value) => {
    const nextVolume = clampSoundVolume(value);
    setSoundboardVolumeState(nextVolume);
    writeStoredSoundboardVolume(volumeStorageKey, nextVolume);
  }, [volumeStorageKey]);

  const stopSoundboardSound = useCallback(() => {
    if (activeAudioRef.current) {
      activeAudioRef.current.pause();
      activeAudioRef.current.currentTime = 0;
      activeAudioRef.current = null;
    }

    setSoundboardActiveSoundId("");
  }, []);

  useEffect(() => () => stopSoundboardSound(), [stopSoundboardSound]);

  const playSoundboardSound = useCallback((sound, { broadcast = false } = {}) => {
    if (!sound?.dataUrl) {
      return;
    }

    stopSoundboardSound();

    const audio = new Audio(sound.dataUrl);
    const trimStartSeconds = Math.max(0, Number(sound.trimStartSeconds || 0) || 0);
    const trimEndSeconds = Math.max(trimStartSeconds, Number(sound.trimEndSeconds || sound.durationSeconds || 0) || 0);
    audio.volume = Math.max(0, Math.min(1, Number(readSystemSoundVolumeRatio(user)) || 0))
      * (soundboardVolume / 100)
      * (clampSoundVolume(sound.volume ?? 100) / 100);
    audio.preload = "auto";
    activeAudioRef.current = audio;
    setSoundboardActiveSoundId(sound.id);
    setSoundboardStatus("");

    const finishPlayback = () => {
      if (activeAudioRef.current === audio) {
        activeAudioRef.current = null;
        setSoundboardActiveSoundId("");
      }
    };
    const handlePlaybackBlocked = () => {
      if (activeAudioRef.current === audio) {
        activeAudioRef.current = null;
        setSoundboardActiveSoundId("");
      }
      setSoundboardStatus("Браузер заблокировал воспроизведение звука.");
    };
    const startPlayback = () => {
      try {
        audio.currentTime = trimStartSeconds;
      } catch {
        // Some browsers only allow seeking after enough data is buffered.
      }

      audio.play().catch(handlePlaybackBlocked);
    };
    const stopAtTrimEnd = () => {
      if (trimEndSeconds > trimStartSeconds && audio.currentTime >= trimEndSeconds) {
        audio.pause();
        audio.currentTime = trimStartSeconds;
        finishPlayback();
      }
    };

    audio.ontimeupdate = stopAtTrimEnd;
    audio.onended = finishPlayback;
    audio.onerror = () => {
      if (activeAudioRef.current === audio) {
        activeAudioRef.current = null;
        setSoundboardActiveSoundId("");
      }
      setSoundboardStatus("Не удалось воспроизвести звук.");
    };

    if (audio.readyState >= 1) {
      startPlayback();
    } else {
      audio.onloadedmetadata = startPlayback;
    }

    if (broadcast) {
      voiceClientRef?.current?.playSoundboardSound?.(sound, { volumePercent: soundboardVolume }).catch((error) => {
        setSoundboardStatus(error?.message || "Не удалось отправить звук в голосовой канал.");
      });
    }
  }, [soundboardVolume, stopSoundboardSound, user, voiceClientRef]);

  const handleSoundboardUpload = useCallback(async (event) => {
    const files = Array.from(event?.target?.files || []);

    if (event?.target) {
      event.target.value = "";
    }

    if (!files.length) {
      return;
    }

    setSoundboardStatus("");

    try {
      const draft = await createSoundDraftFromFile(files[0]);
      setSoundboardEditor(draft);
      setSoundboardStatus(files.length > 1 ? "Открыл первый звук. Остальные добавь по одному." : "");
    } catch (error) {
      setSoundboardStatus(error?.message || "Не удалось загрузить звук.");
    }
  }, []);

  const updateSoundboardEditor = useCallback((patch) => {
    setSoundboardEditor((previous) => {
      if (!previous) {
        return previous;
      }

      const next = { ...previous, ...patch };
      const sourceDurationSeconds = Math.max(0, Number(next.sourceDurationSeconds || 0) || 0);
      const maxTrimEndSeconds = Math.min(sourceDurationSeconds || SOUNDBOARD_MAX_DURATION_SECONDS, SOUNDBOARD_MAX_DURATION_SECONDS);
      const trimStartSeconds = clampNumber(next.trimStartSeconds, 0, Math.max(0, maxTrimEndSeconds - 0.1), 0);
      const trimEndSeconds = clampNumber(next.trimEndSeconds, trimStartSeconds + 0.1, maxTrimEndSeconds, maxTrimEndSeconds);

      return {
        ...next,
        name: String(next.name || "").slice(0, 60),
        emoji: normalizeSoundEmoji(next.emoji),
        trimStartSeconds,
        trimEndSeconds,
        durationSeconds: Math.max(0.1, trimEndSeconds - trimStartSeconds),
        volume: clampSoundVolume(next.volume),
      };
    });
  }, []);

  const closeSoundboardEditor = useCallback(() => {
    setSoundboardEditor(null);
  }, []);

  const saveSoundboardEditor = useCallback(() => {
    if (!soundboardEditor) {
      return;
    }

    const normalizedSound = normalizeSound({
      ...soundboardEditor,
      name: String(soundboardEditor.name || "").trim() || "Звук",
      durationSeconds: Math.max(0.1, Number(soundboardEditor.trimEndSeconds || 0) - Number(soundboardEditor.trimStartSeconds || 0)),
      createdAt: Date.now(),
    });

    if (!normalizedSound) {
      setSoundboardStatus("Не удалось сохранить звук.");
      return;
    }

    const existingSoundIndex = soundboardSounds.findIndex((sound) => sound.id === normalizedSound.id);
    const nextSounds = existingSoundIndex >= 0
      ? soundboardSounds.map((sound, index) => (index === existingSoundIndex ? normalizedSound : sound))
      : [normalizedSound, ...soundboardSounds].slice(0, SOUNDBOARD_MAX_ITEMS);

    try {
      writeStoredSoundboardSounds(storageKey, nextSounds);
      setSoundboardStorageState({
        storageKey,
        sounds: nextSounds,
      });
      setSoundboardEditor(null);
      setSoundboardStatus("Звук загружен.");
    } catch {
      setSoundboardStatus("Не удалось сохранить звук.");
    }
  }, [soundboardEditor, soundboardSounds, storageKey]);

  const removeSoundboardSound = useCallback((soundId) => {
    const nextSounds = soundboardSounds.filter((sound) => sound.id !== soundId);

    try {
      writeStoredSoundboardSounds(storageKey, nextSounds);
      setSoundboardStorageState({
        storageKey,
        sounds: nextSounds,
      });
    } catch {
      setSoundboardStatus("Не удалось сохранить изменения.");
    }

    if (soundboardActiveSoundId === soundId) {
      stopSoundboardSound();
    }
  }, [soundboardActiveSoundId, soundboardSounds, stopSoundboardSound, storageKey]);

  const filteredSoundboardSounds = useMemo(() => {
    const query = soundboardQuery.trim().toLowerCase();

    if (!query) {
      return soundboardSounds;
    }

    return soundboardSounds.filter((sound) => sound.name.toLowerCase().includes(query));
  }, [soundboardQuery, soundboardSounds]);

  return {
    soundboardInputRef,
    soundboardSounds,
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
    stopSoundboardSound,
    removeSoundboardSound,
  };
}
