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
  "image/heif-sequence",
  "image/heic-sequence",
  "image/gif",
  "video/mp4",
];

export function getAvatarFileExtension(fileName) {
  const normalizedName = String(fileName || "").toLowerCase().trim();
  const dotIndex = normalizedName.lastIndexOf(".");
  return dotIndex >= 0 ? normalizedName.slice(dotIndex) : "";
}

export function isVideoAvatarUrl(value) {
  const normalizedValue = String(value || "").trim();
  if (!normalizedValue) {
    return false;
  }

  const lowerValue = normalizedValue.toLowerCase();
  if (lowerValue.startsWith("data:video/mp4")) {
    return true;
  }

  try {
    const parsed = new URL(normalizedValue, typeof window !== "undefined" ? window.location.origin : "http://localhost");
    return parsed.pathname.toLowerCase().endsWith(".mp4");
  } catch {
    return lowerValue.split(/[?#]/, 1)[0].endsWith(".mp4");
  }
}

export function isAnimatedAvatarUrl(value) {
  const normalizedValue = String(value || "").trim();
  if (!normalizedValue) {
    return false;
  }

  const lowerValue = normalizedValue.toLowerCase();
  if (isVideoAvatarUrl(normalizedValue) || lowerValue.startsWith("data:image/gif")) {
    return true;
  }

  try {
    const parsed = new URL(normalizedValue, typeof window !== "undefined" ? window.location.origin : "http://localhost");
    return parsed.pathname.toLowerCase().endsWith(".gif");
  } catch {
    return lowerValue.split(/[?#]/, 1)[0].endsWith(".gif");
  }
}

function readLittleEndianWord(bytes, index) {
  return bytes[index] | (bytes[index + 1] << 8);
}

function readBigEndianWord(bytes, index) {
  return (bytes[index] << 24) | (bytes[index + 1] << 16) | (bytes[index + 2] << 8) | bytes[index + 3];
}

function readBigEndianLong(bytes, index) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return Number(view.getBigUint64(index, false));
}

function hasAsciiAt(bytes, index, signature) {
  if (index < 0 || index + signature.length > bytes.length) {
    return false;
  }

  for (let offset = 0; offset < signature.length; offset += 1) {
    if (bytes[index + offset] !== signature.charCodeAt(offset)) {
      return false;
    }
  }

  return true;
}

function findAsciiOffset(bytes, signature, startIndex = 0) {
  const normalizedStartIndex = Math.max(0, Number(startIndex) || 0);
  for (let index = normalizedStartIndex; index <= bytes.length - signature.length; index += 1) {
    if (hasAsciiAt(bytes, index, signature)) {
      return index;
    }
  }

  return -1;
}

export function parseGifDurationSeconds(arrayBuffer) {
  const bytes = new Uint8Array(arrayBuffer);
  let index = 0;
  let durationCentiseconds = 0;

  while (index < bytes.length - 1) {
    if (bytes[index] === 0x21 && bytes[index + 1] === 0xf9 && bytes[index + 2] === 0x04) {
      durationCentiseconds += readLittleEndianWord(bytes, index + 4);
      index += 8;
      continue;
    }

    index += 1;
  }

  return durationCentiseconds / 100;
}

function parseMp4MovieHeaderDuration(bytes, offset, length) {
  if (offset < 0 || length <= 0 || offset + length > bytes.length) {
    return 0;
  }

  const version = bytes[offset];
  if (version === 0) {
    if (length < 20) {
      return 0;
    }

    const timescale = readBigEndianWord(bytes, offset + 12) >>> 0;
    const duration = readBigEndianWord(bytes, offset + 16) >>> 0;
    return timescale > 0 && duration > 0 ? duration / timescale : 0;
  }

  if (version === 1) {
    if (length < 32) {
      return 0;
    }

    const timescale = readBigEndianWord(bytes, offset + 20) >>> 0;
    const duration = readBigEndianLong(bytes, offset + 24);
    return timescale > 0 && duration > 0 ? duration / timescale : 0;
  }

  return 0;
}

function parseMp4DurationRange(bytes, start, end) {
  let offset = start;

  while (offset + 8 <= end) {
    let atomSize = readBigEndianWord(bytes, offset) >>> 0;
    let headerSize = 8;

    if (!atomSize) {
      atomSize = end - offset;
    } else if (atomSize === 1) {
      if (offset + 16 > end) {
        return 0;
      }

      atomSize = readBigEndianLong(bytes, offset + 8);
      headerSize = 16;
    }

    if (!atomSize || offset + atomSize > end) {
      return 0;
    }

    if (hasAsciiAt(bytes, offset + 4, "moov")) {
      const nestedDuration = parseMp4DurationRange(bytes, offset + headerSize, offset + atomSize);
      if (nestedDuration > 0) {
        return nestedDuration;
      }
    } else if (hasAsciiAt(bytes, offset + 4, "mvhd")) {
      const duration = parseMp4MovieHeaderDuration(bytes, offset + headerSize, atomSize - headerSize);
      if (duration > 0) {
        return duration;
      }
    }

    offset += atomSize;
  }

  return 0;
}

export function parseMp4DurationSeconds(arrayBuffer) {
  const bytes = new Uint8Array(arrayBuffer);
  const parsedDuration = parseMp4DurationRange(bytes, 0, bytes.length);
  if (parsedDuration > 0) {
    return parsedDuration;
  }

  let typeOffset = findAsciiOffset(bytes, "mvhd");
  while (typeOffset >= 4) {
    const atomOffset = typeOffset - 4;
    let atomSize = readBigEndianWord(bytes, atomOffset) >>> 0;
    let headerSize = 8;

    if (atomSize === 1 && atomOffset + 16 <= bytes.length) {
      atomSize = readBigEndianLong(bytes, atomOffset + 8);
      headerSize = 16;
    } else if (atomSize === 0) {
      atomSize = bytes.length - atomOffset;
    }

    if (atomSize > 0 && atomOffset + atomSize <= bytes.length) {
      const duration = parseMp4MovieHeaderDuration(bytes, atomOffset + headerSize, atomSize - headerSize);
      if (duration > 0) {
        return duration;
      }
    }

    typeOffset = findAsciiOffset(bytes, "mvhd", typeOffset + 4);
  }

  return 0;
}

async function readBrowserVideoMetadataDuration(file) {
  if (
    typeof window === "undefined"
    || typeof document === "undefined"
    || typeof URL?.createObjectURL !== "function"
  ) {
    return 0;
  }

  const objectUrl = URL.createObjectURL(file);

  try {
    const duration = await new Promise((resolve) => {
      const video = document.createElement("video");
      let settled = false;
      let triedInfinitySeek = false;

      const finalize = (value) => {
        if (settled) {
          return;
        }

        settled = true;
        cleanup();
        resolve(value);
      };

      const resolveFromElement = () => {
        const nextDuration = Number(video.duration || 0);
        if (Number.isFinite(nextDuration) && nextDuration > 0) {
          finalize(nextDuration);
          return true;
        }

        if (!triedInfinitySeek && nextDuration === Number.POSITIVE_INFINITY) {
          triedInfinitySeek = true;
          try {
            video.currentTime = 1e101;
          } catch {
            // ignore seek bootstrap failures
          }
        }

        return false;
      };

      const cleanup = () => {
        window.clearTimeout(timeoutId);
        video.removeEventListener("loadedmetadata", handleMetadataReady);
        video.removeEventListener("durationchange", handleMetadataReady);
        video.removeEventListener("loadeddata", handleMetadataReady);
        video.removeEventListener("canplay", handleMetadataReady);
        video.removeEventListener("seeked", handleSeeked);
        video.removeEventListener("timeupdate", handleSeeked);
        video.removeEventListener("error", handleError);
        video.removeAttribute("src");
        video.load();
      };

      const handleMetadataReady = () => {
        resolveFromElement();
      };

      const handleSeeked = () => {
        if (resolveFromElement()) {
          return;
        }

        if (triedInfinitySeek) {
          try {
            video.currentTime = 0;
          } catch {
            // ignore reset failures
          }
        }
      };

      const handleError = () => finalize(0);
      const timeoutId = window.setTimeout(() => finalize(0), 8000);

      video.preload = "metadata";
      video.muted = true;
      video.playsInline = true;
      video.addEventListener("loadedmetadata", handleMetadataReady);
      video.addEventListener("durationchange", handleMetadataReady);
      video.addEventListener("loadeddata", handleMetadataReady);
      video.addEventListener("canplay", handleMetadataReady);
      video.addEventListener("seeked", handleSeeked);
      video.addEventListener("timeupdate", handleSeeked);
      video.addEventListener("error", handleError);
      video.src = objectUrl;
      video.load();
    });

    return Number.isFinite(duration) && duration > 0 ? duration : 0;
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
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

  const buffer = await file.arrayBuffer();
  const parsedDuration = parseMp4DurationSeconds(buffer);
  if (Number.isFinite(parsedDuration) && parsedDuration > 0) {
    return parsedDuration;
  }

  const metadataDuration = await readBrowserVideoMetadataDuration(file);
  return Number.isFinite(metadataDuration) && metadataDuration > 0 ? metadataDuration : 0;
}

export async function validateAvatarFile(file) {
  if (!file) {
    return "Р¤Р°Р№Р» Р°РІР°С‚Р°СЂР° РЅРµ РІС‹Р±СЂР°РЅ.";
  }

  const fileExtension = getAvatarFileExtension(file.name);
  const normalizedType = String(file.type || "").toLowerCase().trim();
  if (!ALLOWED_AVATAR_EXTENSIONS.includes(fileExtension) || (normalizedType && !ALLOWED_AVATAR_MIME_TYPES.includes(normalizedType))) {
    return "Р”Р»СЏ Р°РІР°С‚Р°СЂР° СЂР°Р·СЂРµС€РµРЅС‹ JPG, PNG, WEBP, GIF Рё MP4.";
  }

  if (file.size > MAX_AVATAR_SIZE_BYTES) {
    return "РђРІР°С‚Р°СЂ РґРѕР»Р¶РµРЅ Р±С‹С‚СЊ РЅРµ Р±РѕР»СЊС€Рµ 50 РњР‘.";
  }

  if (fileExtension === ".gif" || fileExtension === ".mp4") {
    const durationSeconds = await readAvatarMediaDuration(file);
    if (Number.isFinite(durationSeconds) && durationSeconds > MAX_AVATAR_DURATION_SECONDS) {
      return "РђРЅРёРјРёСЂРѕРІР°РЅРЅС‹Р№ Р°РІР°С‚Р°СЂ РґРѕР»Р¶РµРЅ Р±С‹С‚СЊ РЅРµ РґР»РёРЅРЅРµРµ 15 СЃРµРєСѓРЅРґ.";
    }
  }

  return "";
}

export async function validateServerIconFile(file) {
  if (!file) {
    return "Р¤Р°Р№Р» РёРєРѕРЅРєРё СЃРµСЂРІРµСЂР° РЅРµ РІС‹Р±СЂР°РЅ.";
  }

  const fileExtension = getAvatarFileExtension(file.name);
  const normalizedType = String(file.type || "").toLowerCase().trim();
  if (!ALLOWED_SERVER_ICON_EXTENSIONS.includes(fileExtension) || (normalizedType && !ALLOWED_SERVER_ICON_MIME_TYPES.includes(normalizedType))) {
    return "Р”Р»СЏ РёРєРѕРЅРєРё СЃРµСЂРІРµСЂР° СЂР°Р·СЂРµС€РµРЅС‹ PNG, JPG, JPEG, HEIF, GIF Рё MP4.";
  }

  const isAnimatedIcon = fileExtension === ".gif" || fileExtension === ".mp4";
  const maxAllowedSize = isAnimatedIcon ? MAX_ANIMATED_SERVER_ICON_SIZE_BYTES : MAX_STATIC_SERVER_ICON_SIZE_BYTES;

  if (file.size > maxAllowedSize) {
    return isAnimatedIcon
      ? "GIF РёР»Рё MP4 РґР»СЏ РёРєРѕРЅРєРё СЃРµСЂРІРµСЂР° РґРѕР»Р¶РЅС‹ Р±С‹С‚СЊ РЅРµ Р±РѕР»СЊС€Рµ 30 РњР‘."
      : "РЎС‚Р°С‚РёС‡РЅР°СЏ РёРєРѕРЅРєР° СЃРµСЂРІРµСЂР° РґРѕР»Р¶РЅР° Р±С‹С‚СЊ РЅРµ Р±РѕР»СЊС€Рµ 15 РњР‘.";
  }

  if (isAnimatedIcon) {
    const durationSeconds = await readAvatarMediaDuration(file);
    if (Number.isFinite(durationSeconds) && durationSeconds > MAX_SERVER_ICON_DURATION_SECONDS) {
      return "РђРЅРёРјРёСЂРѕРІР°РЅРЅР°СЏ РёРєРѕРЅРєР° СЃРµСЂРІРµСЂР° РґРѕР»Р¶РЅР° Р±С‹С‚СЊ РЅРµ РґР»РёРЅРЅРµРµ 5 СЃРµРєСѓРЅРґ.";
    }
  }

  return "";
}

