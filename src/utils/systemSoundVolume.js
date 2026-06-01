export const DEFAULT_SYSTEM_SOUND_VOLUME = 80;

const getSystemSoundVolumeScope = (user) => String(user?.id || user?.email || "guest").trim() || "guest";

export const getSystemSoundVolumeStorageKey = (user) => `nd:system-sound-volume:${getSystemSoundVolumeScope(user)}`;

export const normalizeSystemSoundVolume = (value) => {
  const numericValue = Number(value);
  return Number.isFinite(numericValue)
    ? Math.max(0, Math.min(100, Math.round(numericValue)))
    : DEFAULT_SYSTEM_SOUND_VOLUME;
};

export const readSystemSoundVolume = (user) => {
  if (typeof localStorage === "undefined") {
    return DEFAULT_SYSTEM_SOUND_VOLUME;
  }

  try {
    return normalizeSystemSoundVolume(localStorage.getItem(getSystemSoundVolumeStorageKey(user)));
  } catch {
    return DEFAULT_SYSTEM_SOUND_VOLUME;
  }
};

export const readSystemSoundVolumeRatio = (user) => readSystemSoundVolume(user) / 100;
