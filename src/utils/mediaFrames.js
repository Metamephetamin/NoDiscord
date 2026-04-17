const DEFAULT_FRAME = Object.freeze({
  x: 50,
  y: 50,
  zoom: 1,
});
const MIN_MEDIA_FRAME_ZOOM = 0.2;
const MAX_MEDIA_FRAME_ZOOM = 5;
const MEDIA_FRAME_TRAVEL_MULTIPLIER = 160;

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

const normalizeNumericValue = (value, fallback) => {
  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? numericValue : fallback;
};

export function getDefaultMediaFrame() {
  return { ...DEFAULT_FRAME };
}

export function getMediaFramePositionBounds(zoomValue = DEFAULT_FRAME.zoom) {
  const zoom = clamp(normalizeNumericValue(zoomValue, DEFAULT_FRAME.zoom), MIN_MEDIA_FRAME_ZOOM, MAX_MEDIA_FRAME_ZOOM);
  const extraRange = Math.abs(zoom - 1) * MEDIA_FRAME_TRAVEL_MULTIPLIER;
  return {
    min: -extraRange,
    max: 100 + extraRange,
  };
}

export function normalizeMediaFrame(value, { allowNull = false } = {}) {
  if (!value) {
    return allowNull ? null : getDefaultMediaFrame();
  }

  const zoom = clamp(normalizeNumericValue(value.zoom ?? value.Zoom, DEFAULT_FRAME.zoom), MIN_MEDIA_FRAME_ZOOM, MAX_MEDIA_FRAME_ZOOM);
  const bounds = getMediaFramePositionBounds(zoom);

  const nextFrame = {
    x: clamp(normalizeNumericValue(value.x ?? value.X, DEFAULT_FRAME.x), bounds.min, bounds.max),
    y: clamp(normalizeNumericValue(value.y ?? value.Y, DEFAULT_FRAME.y), bounds.min, bounds.max),
    zoom,
  };

  if (allowNull && isDefaultMediaFrame(nextFrame)) {
    return null;
  }

  return nextFrame;
}

export function parseMediaFrame(...candidates) {
  for (const candidate of candidates) {
    if (!candidate) {
      continue;
    }

    if (typeof candidate === "string") {
      const trimmedCandidate = candidate.trim();
      if (!trimmedCandidate) {
        continue;
      }

      try {
        const parsed = JSON.parse(trimmedCandidate);
        const normalized = normalizeMediaFrame(parsed, { allowNull: true });
        if (normalized) {
          return normalized;
        }
      } catch {
        continue;
      }

      continue;
    }

    if (typeof candidate === "object") {
      const normalized = normalizeMediaFrame(candidate, { allowNull: true });
      if (normalized) {
        return normalized;
      }
    }
  }

  return getDefaultMediaFrame();
}

export function isDefaultMediaFrame(value) {
  if (!value || typeof value !== "object") {
    return true;
  }

  return (
    Math.abs(normalizeNumericValue(value.x ?? value.X, DEFAULT_FRAME.x) - DEFAULT_FRAME.x) < 0.01
    && Math.abs(normalizeNumericValue(value.y ?? value.Y, DEFAULT_FRAME.y) - DEFAULT_FRAME.y) < 0.01
    && Math.abs(normalizeNumericValue(value.zoom ?? value.Zoom, DEFAULT_FRAME.zoom) - DEFAULT_FRAME.zoom) < 0.01
  );
}

export function serializeMediaFrame(value, { allowNull = false } = {}) {
  const normalized = normalizeMediaFrame(value, { allowNull });
  return normalized ? { ...normalized } : null;
}

export function getMediaFrameStyle(value, additionalStyle = undefined) {
  const frame = normalizeMediaFrame(value);
  const style = {
    objectPosition: `${frame.x}% ${frame.y}%`,
    transform: Math.abs(frame.zoom - 1) > 0.001 ? `scale(${frame.zoom})` : "scale(1)",
    transformOrigin: "center center",
    ...additionalStyle,
  };

  if (style.transform === "scale(1)") {
    delete style.transform;
  }

  return style;
}
