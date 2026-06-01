import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getScopedUserStorageScope } from "../../utils/menuMainModel";

const SOUNDBOARD_STORAGE_PREFIX = "nd:soundboard";
const SOUNDBOARD_MAX_DURATION_SECONDS = 20;
const SOUNDBOARD_MAX_ITEMS = 48;

const createSoundboardStorageKey = (user) => `${SOUNDBOARD_STORAGE_PREFIX}:${getScopedUserStorageScope(user)}`;

const normalizeSound = (sound) => {
  const id = String(sound?.id || "").trim();
  const name = String(sound?.name || "").trim();
  const dataUrl = String(sound?.dataUrl || "").trim();
  const durationSeconds = Number(sound?.durationSeconds || 0);

  if (!id || !name || !dataUrl) {
    return null;
  }

  return {
    id,
    name,
    dataUrl,
    durationSeconds: Number.isFinite(durationSeconds) && durationSeconds > 0 ? durationSeconds : 0,
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

      if (audio.duration > SOUNDBOARD_MAX_DURATION_SECONDS) {
        reject(new Error("Звук должен быть не длиннее 20 секунд."));
        return;
      }

      resolve(duration);
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

const createSoundFromFile = async (file) => {
  if (!isSupportedAudioFile(file)) {
    throw new Error("Можно загрузить только аудиофайл.");
  }

  const durationSeconds = await readAudioMetadata(file);
  const dataUrl = await readFileAsDataUrl(file);

  return {
    id: `sound-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    name: getSoundFileName(file),
    dataUrl,
    durationSeconds,
    createdAt: Date.now(),
  };
};

export default function useMenuMainSoundboard({
  user,
  systemSoundVolumeRatio = 1,
}) {
  const storageKey = useMemo(() => createSoundboardStorageKey(user), [user]);
  const soundboardInputRef = useRef(null);
  const activeAudioRef = useRef(null);
  const [soundboardStorageState, setSoundboardStorageState] = useState(() => ({
    storageKey,
    sounds: readStoredSoundboardSounds(storageKey),
  }));
  const [soundboardQuery, setSoundboardQuery] = useState("");
  const [soundboardStatus, setSoundboardStatus] = useState("");
  const [soundboardActiveSoundId, setSoundboardActiveSoundId] = useState("");
  const soundboardSounds = soundboardStorageState.storageKey === storageKey
    ? soundboardStorageState.sounds
    : readStoredSoundboardSounds(storageKey);

  const stopSoundboardSound = useCallback(() => {
    if (activeAudioRef.current) {
      activeAudioRef.current.pause();
      activeAudioRef.current.currentTime = 0;
      activeAudioRef.current = null;
    }

    setSoundboardActiveSoundId("");
  }, []);

  useEffect(() => () => stopSoundboardSound(), [stopSoundboardSound]);

  const playSoundboardSound = useCallback((sound) => {
    if (!sound?.dataUrl) {
      return;
    }

    stopSoundboardSound();

    const audio = new Audio(sound.dataUrl);
    audio.volume = Math.max(0, Math.min(1, Number(systemSoundVolumeRatio) || 0));
    audio.preload = "auto";
    activeAudioRef.current = audio;
    setSoundboardActiveSoundId(sound.id);
    setSoundboardStatus("");

    audio.onended = () => {
      if (activeAudioRef.current === audio) {
        activeAudioRef.current = null;
        setSoundboardActiveSoundId("");
      }
    };
    audio.onerror = () => {
      if (activeAudioRef.current === audio) {
        activeAudioRef.current = null;
        setSoundboardActiveSoundId("");
      }
      setSoundboardStatus("Не удалось воспроизвести звук.");
    };

    audio.play().catch(() => {
      if (activeAudioRef.current === audio) {
        activeAudioRef.current = null;
        setSoundboardActiveSoundId("");
      }
      setSoundboardStatus("Браузер заблокировал воспроизведение звука.");
    });
  }, [stopSoundboardSound, systemSoundVolumeRatio]);

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
      const createdSounds = [];

      for (const file of files) {
        createdSounds.push(await createSoundFromFile(file));
      }

      const nextSounds = [...createdSounds, ...soundboardSounds].slice(0, SOUNDBOARD_MAX_ITEMS);

      writeStoredSoundboardSounds(storageKey, nextSounds);
      setSoundboardStorageState({
        storageKey,
        sounds: nextSounds,
      });
      setSoundboardStatus(createdSounds.length > 1 ? "Звуки загружены." : "Звук загружен.");
    } catch (error) {
      setSoundboardStatus(error?.message || "Не удалось загрузить звук.");
    }
  }, [soundboardSounds, storageKey]);

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
    handleSoundboardUpload,
    playSoundboardSound,
    stopSoundboardSound,
    removeSoundboardSound,
  };
}
