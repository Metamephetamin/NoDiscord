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

export function resolveMediaUrl(value, fallback = DEFAULT_AVATAR) {
  if (!value) return fallback;

  if (
    value.startsWith("http://") ||
    value.startsWith("https://") ||
    value.startsWith("data:") ||
    value.startsWith("blob:") ||
    value.startsWith("file:")
  ) {
    return value;
  }

  if (value.startsWith("/")) {
    if (
      value.startsWith("/avatars/")
      || value.startsWith("/api/profile-backgrounds/")
      || value.startsWith("/profile-backgrounds/")
      || value.startsWith("/chat-files/")
      || value.startsWith("/server-icons/")
    ) {
      return `${API_URL}${value}`;
    }

    return resolveStaticAssetUrl(value);
  }

  return value;
}

export function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error || new Error("Failed to read file"));
    reader.readAsDataURL(file);
  });
}
