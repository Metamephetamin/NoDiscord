export const MEDIA_PREVIEW_MIN_ZOOM = 1;
export const MEDIA_PREVIEW_MAX_ZOOM = 4;
export const MEDIA_PREVIEW_ZOOM_STEP = 0.25;
export const MAX_PINNED_MESSAGES = 8;
export const MAX_FORWARD_BATCH_SIZE = 30;

export function clampNumber(value, min, max) {
  return Math.max(min, Math.min(max, Number(value) || min));
}

export function formatFileSize(size) {
  if (!size) {
    return "0 B";
  }

  const units = ["B", "KB", "MB", "GB"];
  let value = size;
  let unitIndex = 0;

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }

  return `${value.toFixed(value >= 10 || unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
}

export function getExtensionFromContentType(contentType) {
  const normalized = String(contentType || "").toLowerCase();
  if (!normalized) {
    return "";
  }

  const extensionMap = {
    "image/jpeg": ".jpg",
    "image/jpg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
    "image/gif": ".gif",
    "image/heic": ".heic",
    "video/mp4": ".mp4",
    "video/webm": ".webm",
    "video/quicktime": ".mov",
    "video/x-matroska": ".mkv",
    "application/pdf": ".pdf",
  };

  return extensionMap[normalized] || "";
}

export function sanitizeDownloadFileName(name) {
  return Array.from(String(name || "").trim())
    .map((character) => {
      const code = character.charCodeAt(0);
      return '<>:"/\\|?*'.includes(character) || code < 32 ? "_" : character;
    })
    .join("");
}

export function buildDownloadFileName({ type, url, name, contentType }) {
  const normalizedName = sanitizeDownloadFileName(name);
  if (normalizedName) {
    return normalizedName;
  }

  try {
    const parsed = new URL(String(url || ""), window.location.href);
    const candidate = sanitizeDownloadFileName(decodeURIComponent(parsed.pathname.split("/").pop() || ""));
    if (candidate) {
      return candidate;
    }
  } catch {
    // ignore malformed URLs
  }

  const fallbackBaseName =
    type === "image"
      ? "photo"
      : type === "video"
        ? "video"
        : "file";

  return `${fallbackBaseName}${getExtensionFromContentType(contentType)}`;
}

export function shouldUseAuthenticatedDownload(url, apiUrl) {
  try {
    const parsed = new URL(String(url || ""), window.location.href);
    const apiOrigin = new URL(apiUrl).origin;
    return parsed.origin === apiOrigin;
  } catch {
    return false;
  }
}

export async function saveBlobWithBrowser(blob, fileName) {
  const objectUrl = URL.createObjectURL(blob);

  try {
    const link = document.createElement("a");
    link.href = objectUrl;
    link.download = fileName;
    link.rel = "noopener";
    document.body.append(link);
    link.click();
    link.remove();
  } finally {
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 0);
  }
}

export function getPinnedStorageKey(userId, channelId) {
  const normalizedUserId = String(userId || "").trim();
  const normalizedChannelId = String(channelId || "").trim();
  return normalizedUserId && normalizedChannelId ? `nd:pinned:${normalizedUserId}:${normalizedChannelId}` : "";
}

function getPinnedStorage() {
  try {
    return window?.sessionStorage || null;
  } catch {
    return null;
  }
}

export function readPinnedMessages(storageKey) {
  if (!storageKey) {
    return [];
  }

  try {
    const raw = getPinnedStorage()?.getItem(storageKey);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function writePinnedMessages(storageKey, pinnedMessages) {
  if (!storageKey) {
    return;
  }

  try {
    const storage = getPinnedStorage();
    if (!storage) {
      return;
    }

    storage.setItem(storageKey, JSON.stringify(Array.isArray(pinnedMessages) ? pinnedMessages : []));
  } catch {
    // ignore storage failures
  }
}

export function getTargetDisplayName(target) {
  const nickname = String(target?.nickname || target?.nick_name || "").trim();
  if (nickname) {
    return nickname;
  }

  const displayName = String(target?.name || "").trim();
  if (displayName) {
    return displayName;
  }

  const firstName = String(target?.firstName || target?.first_name || "").trim();
  const lastName = String(target?.lastName || target?.last_name || "").trim();
  return `${firstName} ${lastName}`.trim() || String(target?.email || "Без имени");
}

export function formatTime(timestamp) {
  const date = new Date(timestamp);
  const hours = date.getHours().toString().padStart(2, "0");
  const minutes = date.getMinutes().toString().padStart(2, "0");
  return `${hours}:${minutes}`;
}

export function formatDayLabel(timestamp) {
  const date = new Date(timestamp);
  const now = new Date();
  const isToday =
    date.getDate() === now.getDate() &&
    date.getMonth() === now.getMonth() &&
    date.getFullYear() === now.getFullYear();
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  const isYesterday =
    date.getDate() === yesterday.getDate() &&
    date.getMonth() === yesterday.getMonth() &&
    date.getFullYear() === yesterday.getFullYear();

  if (isToday) {
    return "Сегодня";
  }

  if (isYesterday) {
    return "Вчера";
  }

  return date.toLocaleDateString("ru-RU", {
    day: "numeric",
    month: "long",
    year: now.getFullYear() === date.getFullYear() ? undefined : "numeric",
  });
}

export function formatTimestamp(timestamp) {
  const date = new Date(timestamp);
  const now = new Date();
  const isToday =
    date.getDate() === now.getDate() &&
    date.getMonth() === now.getMonth() &&
    date.getFullYear() === now.getFullYear();
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  const isYesterday =
    date.getDate() === yesterday.getDate() &&
    date.getMonth() === yesterday.getMonth() &&
    date.getFullYear() === yesterday.getFullYear();
  const hours = date.getHours().toString().padStart(2, "0");
  const minutes = date.getMinutes().toString().padStart(2, "0");

  if (isToday) {
    return `Сегодня в ${hours}:${minutes}`;
  }

  if (isYesterday) {
    return `Вчера в ${hours}:${minutes}`;
  }

  return `${date.getDate()}.${(date.getMonth() + 1).toString().padStart(2, "0")}.${date.getFullYear()} в ${hours}:${minutes}`;
}
