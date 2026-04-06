export const MAX_AVATAR_SIZE_BYTES = 50 * 1024 * 1024;
export const MAX_AVATAR_DURATION_SECONDS = 15;
export const ALLOWED_AVATAR_EXTENSIONS = [".jpg", ".jpeg", ".png", ".webp", ".gif", ".mp4"];
export const ALLOWED_AVATAR_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "video/mp4",
];
export const MAX_STATIC_SERVER_ICON_SIZE_BYTES = 15 * 1024 * 1024;
export const MAX_ANIMATED_SERVER_ICON_SIZE_BYTES = 30 * 1024 * 1024;
export const MAX_SERVER_ICON_DURATION_SECONDS = 5;
export const ALLOWED_SERVER_ICON_EXTENSIONS = [".png", ".jpg", ".jpeg", ".heif", ".heic", ".gif", ".mp4"];
export const ALLOWED_SERVER_ICON_MIME_TYPES = [
  "image/png",
  "image/jpeg",
  "image/heif",
  "image/heic",
  "image/gif",
  "video/mp4",
];

export function getAvatarFileExtension(fileName) {
  const normalizedName = String(fileName || "").toLowerCase().trim();
  const dotIndex = normalizedName.lastIndexOf(".");
  return dotIndex >= 0 ? normalizedName.slice(dotIndex) : "";
}

export function isVideoAvatarUrl(value) {
  const normalizedValue = String(value || "").trim().toLowerCase();
  return normalizedValue.endsWith(".mp4") || normalizedValue.startsWith("data:video/mp4");
}

export function isAnimatedAvatarUrl(value) {
  const normalizedValue = String(value || "").trim().toLowerCase();
  return isVideoAvatarUrl(normalizedValue) || normalizedValue.endsWith(".gif") || normalizedValue.startsWith("data:image/gif");
}

function readLittleEndianWord(bytes, index) {
  return bytes[index] | (bytes[index + 1] << 8);
}

export function parseGifDurationSeconds(arrayBuffer) {
  const bytes = new Uint8Array(arrayBuffer);
  let index = 0;
  let durationCentiseconds = 0;

  while (index < bytes.length - 1) {
    if (bytes[index] === 0x21 && bytes[index + 1] === 0xF9 && bytes[index + 2] === 0x04) {
      durationCentiseconds += readLittleEndianWord(bytes, index + 4);
      index += 8;
      continue;
    }

    index += 1;
  }

  return durationCentiseconds / 100;
}

export async function readAvatarMediaDuration(file) {
  const extension = getAvatarFileExtension(file?.name);
  if (extension === ".gif") {
    const buffer = await file.arrayBuffer();
    return parseGifDurationSeconds(buffer);
  }

  if (extension !== ".mp4") {
    return 0;
  }

  const objectUrl = URL.createObjectURL(file);

  try {
    return await new Promise((resolve, reject) => {
      const video = document.createElement("video");
      video.preload = "metadata";
      video.muted = true;
      video.onloadedmetadata = () => {
        const duration = Number(video.duration || 0);
        if (!Number.isFinite(duration) || duration <= 0) {
          reject(new Error("Не удалось определить длительность видеоаватара."));
          return;
        }

        resolve(duration);
      };
      video.onerror = () => reject(new Error("Не удалось прочитать выбранный видеоаватар."));
      video.src = objectUrl;
    });
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

export async function validateAvatarFile(file) {
  if (!file) {
    return "Файл аватара не выбран.";
  }

  const fileExtension = getAvatarFileExtension(file.name);
  if (!ALLOWED_AVATAR_EXTENSIONS.includes(fileExtension) || (file.type && !ALLOWED_AVATAR_MIME_TYPES.includes(file.type))) {
    return "Для аватара разрешены JPG, PNG, WEBP, GIF и MP4.";
  }

  if (file.size > MAX_AVATAR_SIZE_BYTES) {
    return "Аватар должен быть не больше 50 МБ.";
  }

  if (fileExtension === ".gif" || fileExtension === ".mp4") {
    const durationSeconds = await readAvatarMediaDuration(file);
    if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) {
      return "Не удалось определить длительность анимированного аватара.";
    }

    if (durationSeconds > MAX_AVATAR_DURATION_SECONDS) {
      return "Анимированный аватар должен быть не длиннее 15 секунд.";
    }
  }

  return "";
}

export async function validateServerIconFile(file) {
  if (!file) {
    return "Файл иконки сервера не выбран.";
  }

  const fileExtension = getAvatarFileExtension(file.name);
  const normalizedType = String(file.type || "").toLowerCase().trim();
  if (!ALLOWED_SERVER_ICON_EXTENSIONS.includes(fileExtension) || (normalizedType && !ALLOWED_SERVER_ICON_MIME_TYPES.includes(normalizedType))) {
    return "Для иконки сервера разрешены PNG, JPG, JPEG, HEIF, GIF и MP4.";
  }

  const isAnimatedIcon = fileExtension === ".gif" || fileExtension === ".mp4";
  const maxAllowedSize = isAnimatedIcon ? MAX_ANIMATED_SERVER_ICON_SIZE_BYTES : MAX_STATIC_SERVER_ICON_SIZE_BYTES;

  if (file.size > maxAllowedSize) {
    return isAnimatedIcon
      ? "GIF или MP4 для иконки сервера должны быть не больше 30 МБ."
      : "Статичная иконка сервера должна быть не больше 15 МБ.";
  }

  if (isAnimatedIcon) {
    const durationSeconds = await readAvatarMediaDuration(file);
    if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) {
      return "Не удалось определить длительность анимированной иконки сервера.";
    }

    if (durationSeconds > MAX_SERVER_ICON_DURATION_SECONDS) {
      return "Анимированная иконка сервера должна быть не длиннее 5 секунд.";
    }
  }

  return "";
}
