const LOCATION_PAYLOAD_PREFIX = "📍 tend-location:";
const LEGACY_LOCATION_MESSAGE_PATTERN = /^\s*📍?\s*(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)(?:\s*\n\s*(https?:\/\/\S+))?\s*$/u;
const DEFAULT_LOCATION_ZOOM = 16;

export const clampLocationMessageZoom = (value) =>
  Math.max(3, Math.min(20, Math.round(Number(value) || DEFAULT_LOCATION_ZOOM)));

const normalizeCoordinate = (value) => {
  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? Number(numericValue.toFixed(4)) : Number.NaN;
};

const encodeBase64Url = (value) => {
  const base64 = typeof globalThis.btoa === "function"
    ? globalThis.btoa(value)
    : globalThis.Buffer.from(value, "utf8").toString("base64");

  return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
};

const decodeBase64Url = (value) => {
  const normalizedValue = String(value || "").replace(/-/g, "+").replace(/_/g, "/");
  const paddedValue = normalizedValue.padEnd(Math.ceil(normalizedValue.length / 4) * 4, "=");

  return typeof globalThis.atob === "function"
    ? globalThis.atob(paddedValue)
    : globalThis.Buffer.from(paddedValue, "base64").toString("utf8");
};

export function getLocationMapsUrl(latitude, longitude, zoom = DEFAULT_LOCATION_ZOOM) {
  return `https://www.google.com/maps?q=${latitude},${longitude}&z=${clampLocationMessageZoom(zoom)}`;
}

export function buildLocationMessageText({ latitude, longitude, zoom = DEFAULT_LOCATION_ZOOM } = {}) {
  const normalizedLatitude = normalizeCoordinate(latitude);
  const normalizedLongitude = normalizeCoordinate(longitude);
  if (!Number.isFinite(normalizedLatitude) || !Number.isFinite(normalizedLongitude)) {
    return "";
  }

  const payload = {
    lat: normalizedLatitude,
    lng: normalizedLongitude,
    z: clampLocationMessageZoom(zoom),
  };

  return `${LOCATION_PAYLOAD_PREFIX}${encodeBase64Url(JSON.stringify(payload))}`;
}

function parseLocationPayload(value) {
  const normalizedValue = String(value || "").trim();
  const payloadToken = normalizedValue.startsWith(LOCATION_PAYLOAD_PREFIX)
    ? normalizedValue.slice(LOCATION_PAYLOAD_PREFIX.length)
    : "";
  if (!payloadToken) {
    return null;
  }

  try {
    const payload = JSON.parse(decodeBase64Url(payloadToken));
    const latitude = Number(payload?.lat);
    const longitude = Number(payload?.lng);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      return null;
    }

    return {
      latitude,
      longitude,
      zoom: clampLocationMessageZoom(payload?.z),
      url: getLocationMapsUrl(latitude, longitude, payload?.z),
    };
  } catch {
    return null;
  }
}

function parseLegacyLocationMessage(value) {
  const match = String(value || "").trim().match(LEGACY_LOCATION_MESSAGE_PATTERN);
  if (!match) {
    return null;
  }

  const latitude = Number(match[1]);
  const longitude = Number(match[2]);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return null;
  }

  let zoom = DEFAULT_LOCATION_ZOOM;
  const sourceUrl = String(match[3] || "").trim();
  if (sourceUrl) {
    try {
      const parsedUrl = new URL(sourceUrl);
      zoom = clampLocationMessageZoom(parsedUrl.searchParams.get("z"));
    } catch {
      zoom = DEFAULT_LOCATION_ZOOM;
    }
  }

  return {
    latitude,
    longitude,
    zoom,
    url: sourceUrl || getLocationMapsUrl(latitude, longitude, zoom),
  };
}

export function parseLocationMessageText(value) {
  return parseLocationPayload(value) || parseLegacyLocationMessage(value);
}
