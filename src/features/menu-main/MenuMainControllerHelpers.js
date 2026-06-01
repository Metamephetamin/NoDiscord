import {
  authFetch,
  getApiErrorMessage,
  parseApiResponse,
} from "../../utils/auth";
import { API_BASE_URL } from "../../config/runtime";
import { readCachedTextChatMessages } from "../../utils/textChatMessageCache";
import { SCREEN_SHARE_ALLOWED_FPS } from "../../webrtc/voiceClientUtils";
import { clampDeviceVolumePercent } from "./menuMainControllerUtils";

export const SHOW_DIRECT_CALL_IN_TITLEBAR = false;
export const MAX_CHAT_BACKGROUND_BYTES = 1.5 * 1024 * 1024;
export const CHAT_BACKGROUND_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

export const groupSettingsNavItems = (items) => items.reduce((sections, item) => {
  if (!sections[item.section]) {
    sections[item.section] = [];
  }

  sections[item.section].push(item);
  return sections;
}, {});

export const getAllowedStreamFps = (resolution) => SCREEN_SHARE_ALLOWED_FPS[resolution] || SCREEN_SHARE_ALLOWED_FPS["1080p"] || [30];

export const readVoiceDebugInfoEnabled = () => (
  typeof window !== "undefined" && window.localStorage?.getItem("ND_VOICE_DEBUG") === "1"
);

export const normalizeStreamFpsForResolution = (value, resolution) => {
  const allowedFps = getAllowedStreamFps(resolution);
  const requestedFps = Math.round(Number(value) || allowedFps[0] || 30);
  return allowedFps.includes(requestedFps) ? requestedFps : allowedFps[0] || 30;
};

const getValidDate = (value) => {
  if (!value) {
    return null;
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

const pluralRu = (value, one, few, many) => {
  const number = Math.abs(Number(value) || 0);
  const mod10 = number % 10;
  const mod100 = number % 100;

  if (mod10 === 1 && mod100 !== 11) {
    return one;
  }

  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) {
    return few;
  }

  return many;
};

export const formatCountLabel = (value, zeroLabel, one, few, many) => {
  const count = Math.max(0, Number(value) || 0);
  if (count === 0) {
    return zeroLabel;
  }

  return `${count} ${pluralRu(count, one, few, many)}`;
};

export const formatKnownSinceLabel = (value) => {
  const date = getValidDate(value);
  if (!date) {
    return "Неизвестно";
  }

  const now = new Date();
  const options = date.getFullYear() === now.getFullYear()
    ? { day: "numeric", month: "long" }
    : { day: "numeric", month: "long", year: "numeric" };

  return `с ${date.toLocaleDateString("ru-RU", options)}`;
};

export const formatLastDialogLabel = (value) => {
  const date = getValidDate(value);
  if (!date) {
    return "Сообщений нет";
  }

  const now = Date.now();
  const diffMs = Math.max(0, now - date.getTime());
  const minute = 60 * 1000;
  const hour = 60 * minute;
  const day = 24 * hour;

  if (diffMs < minute) {
    return "только что";
  }

  if (diffMs < hour) {
    const minutes = Math.floor(diffMs / minute);
    return `${minutes} ${pluralRu(minutes, "минуту", "минуты", "минут")} назад`;
  }

  if (diffMs < day) {
    const hours = Math.floor(diffMs / hour);
    return `${hours} ${pluralRu(hours, "час", "часа", "часов")} назад`;
  }

  const days = Math.floor(diffMs / day);
  if (days === 1) {
    return "вчера";
  }

  if (days < 31) {
    return `${days} ${pluralRu(days, "день", "дня", "дней")} назад`;
  }

  return date.toLocaleDateString("ru-RU", { day: "numeric", month: "short", year: "numeric" });
};

const getLatestCachedMessageAt = (currentUserId, channelId) => {
  if (!currentUserId || !channelId) {
    return "";
  }

  let latestTimestamp = 0;
  readCachedTextChatMessages(currentUserId, channelId).forEach((messageItem) => {
    const date = getValidDate(messageItem?.timestamp || messageItem?.Timestamp || messageItem?.createdAt || messageItem?.CreatedAt);
    if (date && date.getTime() > latestTimestamp) {
      latestTimestamp = date.getTime();
    }
  });

  return latestTimestamp > 0 ? new Date(latestTimestamp).toISOString() : "";
};

export const getLatestProfileDialogAt = (currentUserId, friend, directChannelId) => {
  const backendDate = getValidDate(friend?.lastDirectMessageAt || friend?.last_direct_message_at);
  const cachedDate = getValidDate(getLatestCachedMessageAt(currentUserId, directChannelId));

  if (backendDate && cachedDate) {
    return backendDate.getTime() >= cachedDate.getTime() ? backendDate.toISOString() : cachedDate.toISOString();
  }

  return backendDate?.toISOString() || cachedDate?.toISOString() || "";
};

const getFriendRelationsStorageKey = (userId) => `tend:friend-relations:${String(userId || "guest").trim() || "guest"}`;

export function normalizeRelationIds(value) {
  return Array.isArray(value)
    ? value.map((item) => String(item || "").trim()).filter(Boolean)
    : [];
}

export function readFriendRelations(userId) {
  if (typeof window === "undefined") {
    return { ignoredIds: [], blockedIds: [] };
  }

  try {
    const parsedValue = JSON.parse(window.localStorage.getItem(getFriendRelationsStorageKey(userId)) || "{}");
    return {
      ignoredIds: normalizeRelationIds(parsedValue?.ignoredIds),
      blockedIds: normalizeRelationIds(parsedValue?.blockedIds),
    };
  } catch {
    return { ignoredIds: [], blockedIds: [] };
  }
}

export function writeFriendRelations(userId, nextRelations) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(getFriendRelationsStorageKey(userId), JSON.stringify({
      ignoredIds: normalizeRelationIds(nextRelations?.ignoredIds),
      blockedIds: normalizeRelationIds(nextRelations?.blockedIds),
    }));
  } catch {
    // Local relationship flags are optional UI state.
  }
}

export async function requestFriendBlockState(targetUserId, shouldBlock) {
  const response = await authFetch(`${API_BASE_URL}/friends/${encodeURIComponent(String(targetUserId))}/block`, {
    method: shouldBlock ? "POST" : "DELETE",
  });
  const data = await parseApiResponse(response);

  if (!response.ok) {
    throw new Error(getApiErrorMessage(response, data, shouldBlock ? "Не удалось заблокировать пользователя." : "Не удалось разблокировать пользователя."));
  }

  return {
    isBlocked: Boolean(data?.isBlocked ?? data?.is_blocked),
    blockedYou: Boolean(data?.blockedYou ?? data?.blocked_you),
  };
}

export async function requestRemoveFriend(targetUserId) {
  const response = await authFetch(`${API_BASE_URL}/friends/${encodeURIComponent(String(targetUserId))}`, {
    method: "DELETE",
  });
  const data = await parseApiResponse(response);

  if (!response.ok) {
    throw new Error(getApiErrorMessage(response, data, "Не удалось удалить пользователя из друзей."));
  }

  return data;
}

export const buildNotificationRoute = (toast) => {
  if (!toast || typeof toast !== "object") {
    return "/";
  }

  if ((toast.kind === "direct" || toast.kind === "conversation") && toast.channelId) {
    return `/?chat=${encodeURIComponent(toast.channelId)}`;
  }

  if (toast.kind === "server" && toast.serverId && toast.channelId) {
    return `/?server=${encodeURIComponent(toast.serverId)}&channel=${encodeURIComponent(toast.channelId)}`;
  }

  return "/";
};

const getParticipantVolumeStorageKey = (user) => {
  const userId = String(user?.id || user?.userId || user?.email || "guest").trim() || "guest";
  return `nd:participant-volume:${userId}`;
};

export const readParticipantVolumeMap = (user) => {
  if (typeof window === "undefined") {
    return {};
  }

  try {
    const parsed = JSON.parse(window.localStorage.getItem(getParticipantVolumeStorageKey(user)) || "{}");
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {};
    }

    return Object.fromEntries(
      Object.entries(parsed)
        .map(([userId, value]) => [String(userId), clampDeviceVolumePercent(value)])
        .filter(([userId]) => userId)
    );
  } catch {
    return {};
  }
};

export const writeParticipantVolumeMap = (user, volumeMap) => {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(getParticipantVolumeStorageKey(user), JSON.stringify(volumeMap || {}));
  } catch {
    // Participant volumes are a local preference only.
  }
};
