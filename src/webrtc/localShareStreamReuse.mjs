export const getReusableVideoTrack = (stream, expectedDeviceId = "") => {
  const [track] = stream?.getVideoTracks?.() || [];
  if (!track || track.readyState !== "live") {
    return null;
  }

  const normalizedExpectedDeviceId = String(expectedDeviceId || "").trim();
  if (!normalizedExpectedDeviceId || normalizedExpectedDeviceId.startsWith("camera-")) {
    return track;
  }

  const activeDeviceId = String(track.getSettings?.().deviceId || "").trim();
  return !activeDeviceId || activeDeviceId === normalizedExpectedDeviceId ? track : null;
};

export const canReuseVideoStream = (stream, expectedDeviceId = "") =>
  Boolean(getReusableVideoTrack(stream, expectedDeviceId));
