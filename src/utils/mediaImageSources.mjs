const DIRECT_IMAGE_UNSUPPORTED_EXTENSION_PATTERN = /\.(?:heic|heif)(?:[?#].*)?$/i;
const LOCAL_IMAGE_URL_PATTERN = /^(?:blob:|data:|file:)/i;

function getImageUrlPath(value) {
  const normalizedValue = String(value || "").trim();
  if (!normalizedValue) {
    return "";
  }

  if (LOCAL_IMAGE_URL_PATTERN.test(normalizedValue)) {
    return normalizedValue;
  }

  try {
    const parsed = new globalThis.URL(normalizedValue, "https://lanaya.local");
    return `${parsed.pathname || ""}${parsed.search || ""}`;
  } catch {
    return normalizedValue;
  }
}

export function canUseDirectImageMediaUrl(value) {
  const normalizedValue = String(value || "").trim();
  if (!normalizedValue) {
    return false;
  }

  if (LOCAL_IMAGE_URL_PATTERN.test(normalizedValue)) {
    return true;
  }

  return !DIRECT_IMAGE_UNSUPPORTED_EXTENSION_PATTERN.test(getImageUrlPath(normalizedValue));
}
