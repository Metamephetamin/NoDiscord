const DEFAULT_FRAME = Object.freeze({
  x: 50,
  y: 50,
  zoom: 1,
});

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

const normalizeNumericValue = (value, fallback) => {
  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? numericValue : fallback;
};

export function getDefaultMediaFrame() {
  return { ...DEFAULT_FRAME };
}

export function normalizeMediaFrame(value, { allowNull = false } = {}) {
  if (!value) {
    return allowNull ? null : getDefaultMediaFrame();
  }

  const nextFrame = {
    x: clamp(normalizeNumericValue(value.x ?? value.X, DEFAULT_FRAME.x), 0, 100),
    y: clamp(normalizeNumericValue(value.y ?? value.Y, DEFAULT_FRAME.y), 0, 100),
    zoom: clamp(normalizeNumericValue(value.zoom ?? value.Zoom, DEFAULT_FRAME.zoom), 1, 3),
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
    transform: frame.zoom > 1.001 ? `scale(${frame.zoom})` : "scale(1)",
    transformOrigin: "center center",
    ...additionalStyle,
  };

  if (style.transform === "scale(1)") {
    delete style.transform;
  }

  return style;
}
