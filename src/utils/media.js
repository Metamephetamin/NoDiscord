import { API_URL } from "../config/runtime";

const STATIC_ASSET_BASE_URL = import.meta.env.BASE_URL || "/";

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

export const DEFAULT_AVATAR = resolveStaticAssetUrl("/image/avatar.jpg");
export const DEFAULT_SERVER_ICON = resolveStaticAssetUrl("/image/image.png");

const INTERNAL_MEDIA_PREFIXES = [
  "/avatars/",
  "/profile-backgrounds/",
  "/api/profile-backgrounds/",
  "/server-icons/",
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

export function resolveMediaUrl(value, fallback = DEFAULT_AVATAR) {
  if (!value) return fallback;

  const normalizedValue = String(value).trim();
  if (!normalizedValue) {
    return fallback;
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

  const params = new URLSearchParams();
  params.set("src", internalPath);
  params.set("w", String(Math.max(16, Math.min(1024, Math.round(Number(width) || 128)))));
  params.set("h", String(Math.max(16, Math.min(1024, Math.round(Number(height) || width || 128)))));
  params.set("fit", fit === "contain" ? "contain" : "cover");
  if (!animated) {
    params.set("animated", "0");
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
