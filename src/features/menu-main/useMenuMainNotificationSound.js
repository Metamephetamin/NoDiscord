import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getDirectMessageSoundOptions } from "../../utils/directMessageSounds";
import { NOTIFICATION_SOUND_OPTIONS } from "../../utils/menuMainModel";

const DEFAULT_NOTIFICATION_SOUND_ID = NOTIFICATION_SOUND_OPTIONS[0].id;

const getDefaultDirectMessageSoundId = (kind) => getDirectMessageSoundOptions(kind)[0]?.id || "classic";

const createDefaultSoundState = () => ({
  notificationSoundEnabled: true,
  notificationSoundId: DEFAULT_NOTIFICATION_SOUND_ID,
  customNotificationSoundData: "",
  customNotificationSoundName: "",
  notificationSoundError: "",
  directMessageSoundEnabled: true,
  directMessageSendSoundId: getDefaultDirectMessageSoundId("send"),
  directMessageReceiveSoundId: getDefaultDirectMessageSoundId("receive"),
});

function readStoredSoundState(user, keys) {
  const defaults = createDefaultSoundState();

  if (!user) {
    return defaults;
  }

  try {
    const notificationSoundId = localStorage.getItem(keys.notificationSoundStorageKey);
    const directMessageSendSoundId = localStorage.getItem(keys.directMessageSendSoundStorageKey);
    const directMessageReceiveSoundId = localStorage.getItem(keys.directMessageReceiveSoundStorageKey);

    return {
      ...defaults,
      notificationSoundEnabled: localStorage.getItem(keys.notificationSoundEnabledStorageKey) !== "false",
      notificationSoundId:
        notificationSoundId === "custom" || NOTIFICATION_SOUND_OPTIONS.some((option) => option.id === notificationSoundId)
          ? notificationSoundId
          : DEFAULT_NOTIFICATION_SOUND_ID,
      customNotificationSoundData: localStorage.getItem(keys.notificationSoundCustomDataStorageKey) || "",
      customNotificationSoundName: localStorage.getItem(keys.notificationSoundCustomNameStorageKey) || "",
      directMessageSoundEnabled: localStorage.getItem(keys.directMessageSoundEnabledStorageKey) !== "false",
      directMessageSendSoundId: getDirectMessageSoundOptions("send").some((option) => option.id === directMessageSendSoundId)
        ? directMessageSendSoundId
        : getDefaultDirectMessageSoundId("send"),
      directMessageReceiveSoundId: getDirectMessageSoundOptions("receive").some((option) => option.id === directMessageReceiveSoundId)
        ? directMessageReceiveSoundId
        : getDefaultDirectMessageSoundId("receive"),
    };
  } catch {
    return defaults;
  }
}

function writeStoredSoundState(user, keys, state) {
  if (!user) {
    return;
  }

  try {
    localStorage.setItem(keys.notificationSoundEnabledStorageKey, String(state.notificationSoundEnabled));
    localStorage.setItem(keys.directMessageSoundEnabledStorageKey, String(state.directMessageSoundEnabled));
    localStorage.setItem(keys.directMessageSendSoundStorageKey, state.directMessageSendSoundId);
    localStorage.setItem(keys.directMessageReceiveSoundStorageKey, state.directMessageReceiveSoundId);
    localStorage.setItem(keys.notificationSoundStorageKey, state.notificationSoundId);

    if (state.customNotificationSoundData) {
      localStorage.setItem(keys.notificationSoundCustomDataStorageKey, state.customNotificationSoundData);
    } else {
      localStorage.removeItem(keys.notificationSoundCustomDataStorageKey);
    }

    if (state.customNotificationSoundName) {
      localStorage.setItem(keys.notificationSoundCustomNameStorageKey, state.customNotificationSoundName);
    } else {
      localStorage.removeItem(keys.notificationSoundCustomNameStorageKey);
    }
  } catch {
    // ignore storage failures
  }
}

function playSoundPath(soundPath, volume = 0.42) {
  if (!soundPath) {
    return;
  }

  try {
    const audio = new Audio(soundPath);
    audio.volume = volume;
    audio.preload = "auto";
    audio.play().catch(() => {});
  } catch {
    // ignore sound failures
  }
}

async function validateCustomNotificationSound(file) {
  const fileName = String(file?.name || "").trim();
  const lowerName = fileName.toLowerCase();
  const fileType = String(file?.type || "").toLowerCase();
  const isSupportedType =
    lowerName.endsWith(".mp3") ||
    lowerName.endsWith(".wav") ||
    fileType === "audio/mpeg" ||
    fileType === "audio/mp3" ||
    fileType === "audio/wav" ||
    fileType === "audio/x-wav";

  if (!isSupportedType) {
    throw new Error("Можно выбрать только MP3 или WAV файл.");
  }

  const objectUrl = URL.createObjectURL(file);

  try {
    const durationSeconds = await new Promise((resolve, reject) => {
      const audio = new Audio();
      audio.preload = "metadata";
      audio.onloadedmetadata = () => {
        const duration = Number(audio.duration || 0);
        if (!Number.isFinite(duration) || duration <= 0) {
          reject(new Error("Не удалось определить длительность звука."));
          return;
        }

        resolve(duration);
      };
      audio.onerror = () => reject(new Error("Не удалось прочитать выбранный аудиофайл."));
      audio.src = objectUrl;
    });

    if (durationSeconds > 3) {
      throw new Error("Звук уведомления должен быть не длиннее 3 секунд.");
    }
  } finally {
    URL.revokeObjectURL(objectUrl);
  }

  const dataUrl = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("Не удалось сохранить выбранный аудиофайл."));
    reader.readAsDataURL(file);
  });

  return {
    name: fileName || "custom-notification-sound",
    dataUrl,
  };
}

export default function useMenuMainNotificationSound({
  user,
  directMessageSoundEnabledStorageKey,
  directMessageSendSoundStorageKey,
  directMessageReceiveSoundStorageKey,
  notificationSoundEnabledStorageKey,
  notificationSoundStorageKey,
  notificationSoundCustomDataStorageKey,
  notificationSoundCustomNameStorageKey,
}) {
  const keys = useMemo(() => ({
    directMessageSoundEnabledStorageKey,
    directMessageSendSoundStorageKey,
    directMessageReceiveSoundStorageKey,
    notificationSoundEnabledStorageKey,
    notificationSoundStorageKey,
    notificationSoundCustomDataStorageKey,
    notificationSoundCustomNameStorageKey,
  }), [
    directMessageReceiveSoundStorageKey,
    directMessageSendSoundStorageKey,
    directMessageSoundEnabledStorageKey,
    notificationSoundCustomDataStorageKey,
    notificationSoundCustomNameStorageKey,
    notificationSoundEnabledStorageKey,
    notificationSoundStorageKey,
  ]);
  const storageSignature = useMemo(
    () => `${user?.id || "guest"}:${Object.values(keys).join("|")}`,
    [keys, user?.id]
  );
  const skipPersistSignatureRef = useRef("");
  const notificationSoundInputRef = useRef(null);
  const [soundState, setSoundState] = useState(() => readStoredSoundState(user, keys));

  useEffect(() => {
    skipPersistSignatureRef.current = storageSignature;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSoundState(readStoredSoundState(user, keys));
  }, [keys, storageSignature, user]);

  useEffect(() => {
    if (skipPersistSignatureRef.current === storageSignature) {
      skipPersistSignatureRef.current = "";
      return;
    }

    writeStoredSoundState(user, keys, soundState);
  }, [keys, soundState, storageSignature, user]);

  const setSoundField = useCallback((field, value) => {
    setSoundState((previous) => ({
      ...previous,
      [field]: typeof value === "function" ? value(previous[field]) : value,
    }));
  }, []);

  const notificationSoundOptions = useMemo(() => {
    if (!soundState.customNotificationSoundData && soundState.notificationSoundId !== "custom") {
      return NOTIFICATION_SOUND_OPTIONS;
    }

    return [
      ...NOTIFICATION_SOUND_OPTIONS,
      {
        id: "custom",
        label: soundState.customNotificationSoundName ? `Свой файл: ${soundState.customNotificationSoundName}` : "Свой файл",
        path: soundState.customNotificationSoundData,
      },
    ];
  }, [soundState.customNotificationSoundData, soundState.customNotificationSoundName, soundState.notificationSoundId]);

  const activeNotificationSoundPath = useMemo(
    () => notificationSoundOptions.find((option) => option.id === soundState.notificationSoundId)?.path || notificationSoundOptions[0]?.path || "",
    [notificationSoundOptions, soundState.notificationSoundId]
  );
  const directMessageReceiveSoundPath = useMemo(
    () => getDirectMessageSoundOptions("receive").find((option) => option.id === soundState.directMessageReceiveSoundId)?.path || "",
    [soundState.directMessageReceiveSoundId]
  );

  const playNotificationSound = useCallback(() => {
    if (!soundState.notificationSoundEnabled || !activeNotificationSoundPath) {
      return;
    }

    playSoundPath(activeNotificationSoundPath);
  }, [activeNotificationSoundPath, soundState.notificationSoundEnabled]);

  const playDirectMessageReceiveSound = useCallback(() => {
    if (!soundState.directMessageSoundEnabled || !directMessageReceiveSoundPath) {
      return;
    }

    playSoundPath(directMessageReceiveSoundPath, 0.4);
  }, [directMessageReceiveSoundPath, soundState.directMessageSoundEnabled]);

  const handleCustomNotificationSoundChange = useCallback(async (event) => {
    const file = event.target.files?.[0] || null;
    event.target.value = "";

    if (!file) {
      return;
    }

    try {
      setSoundField("notificationSoundError", "");
      const validatedSound = await validateCustomNotificationSound(file);
      setSoundState((previous) => ({
        ...previous,
        customNotificationSoundData: validatedSound.dataUrl,
        customNotificationSoundName: validatedSound.name,
        notificationSoundId: "custom",
      }));
    } catch (error) {
      setSoundField("notificationSoundError", error.message || "Не удалось применить выбранный звук уведомления.");
    }
  }, [setSoundField]);

  return {
    notificationSoundEnabled: soundState.notificationSoundEnabled,
    setNotificationSoundEnabled: (value) => setSoundField("notificationSoundEnabled", value),
    notificationSoundId: soundState.notificationSoundId,
    setNotificationSoundId: (value) => setSoundField("notificationSoundId", value),
    notificationSoundOptions,
    customNotificationSoundData: soundState.customNotificationSoundData,
    setCustomNotificationSoundData: (value) => setSoundField("customNotificationSoundData", value),
    customNotificationSoundName: soundState.customNotificationSoundName,
    setCustomNotificationSoundName: (value) => setSoundField("customNotificationSoundName", value),
    notificationSoundError: soundState.notificationSoundError,
    setNotificationSoundError: (value) => setSoundField("notificationSoundError", value),
    notificationSoundInputRef,
    directMessageSoundEnabled: soundState.directMessageSoundEnabled,
    setDirectMessageSoundEnabled: (value) => setSoundField("directMessageSoundEnabled", value),
    directMessageSendSoundId: soundState.directMessageSendSoundId,
    setDirectMessageSendSoundId: (value) => setSoundField("directMessageSendSoundId", value),
    directMessageReceiveSoundId: soundState.directMessageReceiveSoundId,
    setDirectMessageReceiveSoundId: (value) => setSoundField("directMessageReceiveSoundId", value),
    handleCustomNotificationSoundChange,
    playNotificationSound,
    playDirectMessageReceiveSound,
  };
}
