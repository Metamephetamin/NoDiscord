export const areStringArraysEqual = (previousValue = [], nextValue = []) => {
  if (previousValue === nextValue) {
    return true;
  }

  if (previousValue.length !== nextValue.length) {
    return false;
  }

  for (let index = 0; index < previousValue.length; index += 1) {
    if (String(previousValue[index] || "") !== String(nextValue[index] || "")) {
      return false;
    }
  }

  return true;
};

export const areShallowObjectsEqual = (previousValue = {}, nextValue = {}) => {
  if (previousValue === nextValue) {
    return true;
  }

  const previousKeys = Object.keys(previousValue);
  const nextKeys = Object.keys(nextValue);

  if (previousKeys.length !== nextKeys.length) {
    return false;
  }

  for (const key of previousKeys) {
    if (previousValue[key] !== nextValue[key]) {
      return false;
    }
  }

  return true;
};

export const areObjectArraysEqual = (previousValue = [], nextValue = []) => {
  if (previousValue === nextValue) {
    return true;
  }

  if (previousValue.length !== nextValue.length) {
    return false;
  }

  for (let index = 0; index < previousValue.length; index += 1) {
    if (!areShallowObjectsEqual(previousValue[index], nextValue[index])) {
      return false;
    }
  }

  return true;
};

export const areParticipantMapsEqual = (previousValue = {}, nextValue = {}) => {
  if (previousValue === nextValue) {
    return true;
  }

  const previousKeys = Object.keys(previousValue);
  const nextKeys = Object.keys(nextValue);

  if (previousKeys.length !== nextKeys.length) {
    return false;
  }

  for (const key of previousKeys) {
    if (!Object.hasOwn(nextValue, key) || !areObjectArraysEqual(previousValue[key], nextValue[key])) {
      return false;
    }
  }

  return true;
};

export const areRemoteScreenSharesEqual = (previousValue = [], nextValue = []) => {
  if (previousValue === nextValue) {
    return true;
  }

  if (previousValue.length !== nextValue.length) {
    return false;
  }

  for (let index = 0; index < previousValue.length; index += 1) {
    const previousShare = previousValue[index] || {};
    const nextShare = nextValue[index] || {};

    if (
      String(previousShare.userId || "") !== String(nextShare.userId || "")
      || String(previousShare.name || "") !== String(nextShare.name || "")
      || String(previousShare.avatar || "") !== String(nextShare.avatar || "")
      || previousShare.stream !== nextShare.stream
      || String(previousShare.videoSrc || "") !== String(nextShare.videoSrc || "")
      || String(previousShare.imageSrc || "") !== String(nextShare.imageSrc || "")
      || Boolean(previousShare.hasAudio) !== Boolean(nextShare.hasAudio)
      || String(previousShare.mode || "") !== String(nextShare.mode || "")
      || Number(previousShare.width || 0) !== Number(nextShare.width || 0)
      || Number(previousShare.height || 0) !== Number(nextShare.height || 0)
      || Number(previousShare.fps || 0) !== Number(nextShare.fps || 0)
    ) {
      return false;
    }
  }

  return true;
};

export const normalizeMicLevel = (value) => Math.max(0, Math.min(1, Number(value) || 0));
