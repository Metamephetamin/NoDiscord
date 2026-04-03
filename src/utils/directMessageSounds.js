const DIRECT_MESSAGE_SOUND_ENABLED_STORAGE_KEY = "nd_direct_message_sound_enabled";
const DIRECT_MESSAGE_SEND_SOUND_STORAGE_KEY = "nd_direct_message_send_sound";
const DIRECT_MESSAGE_RECEIVE_SOUND_STORAGE_KEY = "nd_direct_message_receive_sound";

const DIRECT_MESSAGE_SOUND_OPTIONS = {
  send: [
    { id: "classic", label: "iPhone Classic", path: "/sounds/iphone-send-w.mp3" },
    { id: "soft", label: "Soft Tap", path: "/sounds/dm-send-soft.ogg" },
  ],
  receive: [
    { id: "classic", label: "iPhone Classic", path: "/sounds/iphone-receive-w.mp3" },
    { id: "soft", label: "Soft Glass", path: "/sounds/dm-receive-soft.ogg" },
  ],
};

const DIRECT_MESSAGE_SOUND_DEFAULTS = {
  enabled: true,
  send: DIRECT_MESSAGE_SOUND_OPTIONS.send[0].id,
  receive: DIRECT_MESSAGE_SOUND_OPTIONS.receive[0].id,
};

function getUserStorageScope(user) {
  return String(user?.id || user?.email || "guest").trim() || "guest";
}

export function getDirectMessageSoundEnabledStorageKey(user) {
  return `${DIRECT_MESSAGE_SOUND_ENABLED_STORAGE_KEY}:${getUserStorageScope(user)}`;
}

export function getDirectMessageSendSoundStorageKey(user) {
  return `${DIRECT_MESSAGE_SEND_SOUND_STORAGE_KEY}:${getUserStorageScope(user)}`;
}

export function getDirectMessageReceiveSoundStorageKey(user) {
  return `${DIRECT_MESSAGE_RECEIVE_SOUND_STORAGE_KEY}:${getUserStorageScope(user)}`;
}

export function getDirectMessageSoundOptions(type) {
  return DIRECT_MESSAGE_SOUND_OPTIONS[type] || [];
}

export function readDirectMessageSoundSettings(user) {
  const enabledKey = getDirectMessageSoundEnabledStorageKey(user);
  const sendKey = getDirectMessageSendSoundStorageKey(user);
  const receiveKey = getDirectMessageReceiveSoundStorageKey(user);

  try {
    const storedEnabled = localStorage.getItem(enabledKey);
    const storedSend = localStorage.getItem(sendKey);
    const storedReceive = localStorage.getItem(receiveKey);

    return {
      enabled: storedEnabled === null ? DIRECT_MESSAGE_SOUND_DEFAULTS.enabled : storedEnabled !== "false",
      send: getDirectMessageSoundOptions("send").some((option) => option.id === storedSend)
        ? storedSend
        : DIRECT_MESSAGE_SOUND_DEFAULTS.send,
      receive: getDirectMessageSoundOptions("receive").some((option) => option.id === storedReceive)
        ? storedReceive
        : DIRECT_MESSAGE_SOUND_DEFAULTS.receive,
    };
  } catch {
    return { ...DIRECT_MESSAGE_SOUND_DEFAULTS };
  }
}

export function resolveDirectMessageSoundPath(user, type) {
  const settings = readDirectMessageSoundSettings(user);
  if (!settings.enabled) {
    return "";
  }

  const selectedId = settings[type];
  return getDirectMessageSoundOptions(type).find((option) => option.id === selectedId)?.path || "";
}
