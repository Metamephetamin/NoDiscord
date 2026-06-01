const SYSTEM_SOUND_EVENTS_STORAGE_KEY = "nd_system_sound_events";

export const SYSTEM_SOUND_EVENT_OPTIONS = [
  {
    id: "join",
    label: "Вход в голосовой канал",
    description: "Короткий сигнал при подключении к голосовому каналу.",
  },
  {
    id: "leave",
    label: "Выход из голосового канала",
    description: "Короткий сигнал при отключении от голосового канала.",
  },
  {
    id: "shareStart",
    label: "Начало стрима",
    description: "Сигнал, когда вы или другой участник начали трансляцию.",
  },
  {
    id: "shareStop",
    label: "Окончание стрима",
    description: "Сигнал, когда трансляция была остановлена.",
  },
  {
    id: "mute",
    label: "Выключение микрофона/звука",
    description: "Сигнал при локальном мьюте микрофона или звука.",
  },
  {
    id: "unmute",
    label: "Включение микрофона/звука",
    description: "Сигнал при обратном включении микрофона или звука.",
  },
  {
    id: "directCallIncoming",
    label: "Входящий звонок",
    description: "Рингтон входящего личного звонка.",
  },
  {
    id: "directCallOutgoing",
    label: "Исходящий звонок",
    description: "Гудок ожидания при исходящем личном звонке.",
  },
];

export const DEFAULT_SYSTEM_SOUND_EVENTS = SYSTEM_SOUND_EVENT_OPTIONS.reduce((state, option) => ({
  ...state,
  [option.id]: true,
}), {});

const getSystemSoundScope = (user) => String(user?.id || user?.email || "guest").trim() || "guest";

export function getSystemSoundEventsStorageKey(user) {
  return `${SYSTEM_SOUND_EVENTS_STORAGE_KEY}:${getSystemSoundScope(user)}`;
}

export function normalizeSystemSoundEvents(value) {
  const source = value && typeof value === "object" && !Array.isArray(value) ? value : {};

  return SYSTEM_SOUND_EVENT_OPTIONS.reduce((state, option) => ({
    ...state,
    [option.id]: source[option.id] !== false,
  }), {});
}

export function isSystemSoundEventEnabled(events, eventId) {
  if (!SYSTEM_SOUND_EVENT_OPTIONS.some((option) => option.id === eventId)) {
    return true;
  }

  return normalizeSystemSoundEvents(events)[eventId] !== false;
}
