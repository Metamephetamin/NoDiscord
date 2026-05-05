import { API_URL } from "../config/runtime";

const STATIC_ASSET_BASE_URL = import.meta.env.BASE_URL || "/";
const MISSING_MEDIA_CACHE_KEY = "nodiscord.missing-internal-media.v1";
export const MISSING_MEDIA_EVENT = "nodiscord:missing-internal-media";
const MISSING_MEDIA_CACHE_TTL_MS = 30 * 60_000;
const MISSING_CHAT_FILE_CACHE_TTL_MS = 2 * 60_000;
let missingInternalMediaCache = null;

export function resolveStaticAssetUrl(value) {
  if (!value) {
    return "";
  }

  if (
    value.startsWith("http://") ||
    value.startsWith("https://") ||
    value.startsWith("data:") ||
    value.startsWith("blob:") ||
    value.startsWith("file:")
  ) {
    return value;
  }

  if (!value.startsWith("/")) {
    return value;
  }

  return `${STATIC_ASSET_BASE_URL}${value.slice(1)}`;
}

export const DEFAULT_AVATAR = "";
export const DEFAULT_SERVER_ICON = resolveStaticAssetUrl("/image/image.png");

const LEGACY_DEFAULT_AVATAR_PATHS = new Set([
  "/image/avatar.jpg",
  "/image/avatar.jpeg",
  "/image/avatar.png",
  "image/avatar.jpg",
  "image/avatar.jpeg",
  "image/avatar.png",
]);

function isLegacyDefaultAvatarUrl(value) {
  const normalizedValue = String(value || "").trim().toLowerCase().split(/[?#]/, 1)[0];
  if (!normalizedValue) {
    return false;
  }

  if (LEGACY_DEFAULT_AVATAR_PATHS.has(normalizedValue)) {
    return true;
  }

  try {
    const parsed = new URL(normalizedValue, typeof window !== "undefined" ? window.location.origin : API_URL);
    return LEGACY_DEFAULT_AVATAR_PATHS.has(String(parsed.pathname || "").toLowerCase());
  } catch {
    return false;
  }
}

const INTERNAL_MEDIA_PREFIXES = [
  "/avatars/",
  "/profile-backgrounds/",
  "/api/profile-backgrounds/",
  "/server-icons/",
  "/chat-files/",
];

const CACHEABLE_MISSING_MEDIA_PREFIXES = [
  "/avatars/",
  "/profile-backgrounds/",
  "/api/profile-backgrounds/",
  "/server-icons/",
  "/chat-files/",
];

function getInternalMediaPath(value) {
  const normalizedValue = String(value || "").trim();
  if (!normalizedValue) {
    return "";
  }

  const directMatch = INTERNAL_MEDIA_PREFIXES.find((prefix) => normalizedValue.startsWith(prefix));
  if (directMatch) {
    return normalizedValue;
  }

  try {
    const parsed = new URL(normalizedValue, typeof window !== "undefined" ? window.location.origin : API_URL);
    const parsedPath = String(parsed.pathname || "").trim();
    return INTERNAL_MEDIA_PREFIXES.find((prefix) => parsedPath.startsWith(prefix)) ? parsedPath : "";
  } catch {
    return "";
  }
}

function readMissingInternalMediaCache() {
  if (missingInternalMediaCache instanceof Map) {
    return missingInternalMediaCache;
  }

  missingInternalMediaCache = new Map();
  if (typeof window === "undefined") {
    return missingInternalMediaCache;
  }

  try {
    const parsed = JSON.parse(window.sessionStorage.getItem(MISSING_MEDIA_CACHE_KEY) || "{}");
    Object.entries(parsed || {}).forEach(([path, expiresAt]) => {
      const normalizedPath = String(path || "").trim();
      const normalizedExpiresAt = Number(expiresAt || 0);
      if (normalizedPath && normalizedExpiresAt > Date.now()) {
        missingInternalMediaCache.set(normalizedPath, normalizedExpiresAt);
      }
    });
  } catch {
    // Ignore cache parse failures.
  }

  return missingInternalMediaCache;
}

function writeMissingInternalMediaCache(cache) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.sessionStorage.setItem(MISSING_MEDIA_CACHE_KEY, JSON.stringify(Object.fromEntries(cache)));
  } catch {
    // Ignore storage quota/privacy-mode failures.
  }
}

function getCacheableMissingMediaPath(value) {
  const internalPath = getInternalMediaPath(value);
  if (!internalPath) {
    return "";
  }

  return CACHEABLE_MISSING_MEDIA_PREFIXES.some((prefix) => internalPath.startsWith(prefix))
    ? internalPath
    : "";
}

function getMissingMediaCacheTtlMs(internalPath) {
  return String(internalPath || "").startsWith("/chat-files/")
    ? MISSING_CHAT_FILE_CACHE_TTL_MS
    : MISSING_MEDIA_CACHE_TTL_MS;
}

export function markMediaUrlMissing(value) {
  const internalPath = getCacheableMissingMediaPath(value);
  if (!internalPath) {
    return false;
  }

  const cache = readMissingInternalMediaCache();
  const expiresAt = Date.now() + getMissingMediaCacheTtlMs(internalPath);
  cache.set(internalPath, expiresAt);
  writeMissingInternalMediaCache(cache);
  if (typeof window !== "undefined") {
    try {
      window.dispatchEvent(new CustomEvent(MISSING_MEDIA_EVENT, { detail: { path: internalPath, expiresAt } }));
    } catch {
      // Ignore event dispatch failures in restricted runtimes.
    }
  }
  return true;
}

export function isMediaUrlKnownMissing(value) {
  const internalPath = getCacheableMissingMediaPath(value);
  if (!internalPath) {
    return false;
  }

  const cache = readMissingInternalMediaCache();
  const expiresAt = Number(cache.get(internalPath) || 0);
  if (expiresAt > Date.now()) {
    return true;
  }

  if (expiresAt) {
    cache.delete(internalPath);
    writeMissingInternalMediaCache(cache);
  }

  return false;
}

export function resolveMediaUrl(value, fallback = DEFAULT_AVATAR) {
  if (!value) return fallback;

  const normalizedValue = String(value).trim();
  if (!normalizedValue) {
    return fallback;
  }

  if (isLegacyDefaultAvatarUrl(normalizedValue)) {
    return fallback;
  }

  if (isMediaUrlKnownMissing(normalizedValue)) {
    return fallback === normalizedValue ? "" : fallback;
  }

  if (
    normalizedValue.startsWith("http://") ||
    normalizedValue.startsWith("https://") ||
    normalizedValue.startsWith("data:") ||
    normalizedValue.startsWith("blob:") ||
    normalizedValue.startsWith("file:")
  ) {
    return normalizedValue;
  }

  if (
    normalizedValue.startsWith("avatars/") ||
    normalizedValue.startsWith("api/profile-backgrounds/") ||
    normalizedValue.startsWith("profile-backgrounds/") ||
    normalizedValue.startsWith("chat-files/") ||
    normalizedValue.startsWith("server-icons/")
  ) {
    return `${API_URL}/${normalizedValue.replace(/^\/+/, "")}`;
  }

  if (normalizedValue.startsWith("/")) {
    if (
      normalizedValue.startsWith("/avatars/")
      || normalizedValue.startsWith("/api/profile-backgrounds/")
      || normalizedValue.startsWith("/profile-backgrounds/")
      || normalizedValue.startsWith("/chat-files/")
      || normalizedValue.startsWith("/server-icons/")
    ) {
      return `${API_URL}${normalizedValue}`;
    }

    return resolveStaticAssetUrl(normalizedValue);
  }

  return normalizedValue;
}

export function resolveOptimizedMediaUrl(
  value,
  {
    width = 128,
    height = width,
    fit = "cover",
    animated = true,
  } = {}
) {
  const internalPath = getInternalMediaPath(value);
  if (!internalPath) {
    return resolveMediaUrl(value, "");
  }

  if (isMediaUrlKnownMissing(internalPath)) {
    return "";
  }

  const params = new URLSearchParams();
  params.set("src", internalPath);
  params.set("w", String(Math.max(16, Math.min(1024, Math.round(Number(width) || 128)))));
  params.set("h", String(Math.max(16, Math.min(1024, Math.round(Number(height) || width || 128)))));
  params.set("fit", fit === "contain" ? "contain" : "cover");
  if (!animated) {
    params.set("animated", "false");
  }

  return `${API_URL}/api/media/render?${params.toString()}`;
}

export function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error || new Error("Failed to read file"));
    reader.readAsDataURL(file);
  });
}
