import { API_URL } from "../config/runtime";

export const DEFAULT_AVATAR = "/image/avatar.jpg";
export const DEFAULT_SERVER_ICON = "/image/image.png";

export function resolveMediaUrl(value, fallback = DEFAULT_AVATAR) {
  if (!value) return fallback;

  if (
    value.startsWith("http://") ||
    value.startsWith("https://") ||
    value.startsWith("data:") ||
    value.startsWith("blob:")
  ) {
    return value;
  }

  if (value.startsWith("/")) {
    if (value.startsWith("/avatars/")) {
      return `${API_URL}${value}`;
    }

    return value;
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
