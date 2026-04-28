import { DEFAULT_AVATAR } from "../utils/media";

const NOISE_SUPPRESSION_MODE_TRANSPARENT = "transparent";
const NOISE_SUPPRESSION_MODE_BROADCAST = "broadcast";
const NOISE_SUPPRESSION_MODE_HARD_GATE = "hard_gate";
const PREFERRED_AUDIO_SAMPLE_RATE = 48_000;
const SCREEN_SHARE_PRESETS = {
  "720p": { width: 1280, height: 720 },
  "1080p": { width: 1920, height: 1080 },
  "1440p": { width: 2560, height: 1440 },
  "2160p": { width: 3840, height: 2160 },
};
const SCREEN_SHARE_ALLOWED_FPS = {
  "720p": [30, 60],
  "1080p": [30, 60],
  "1440p": [30],
  "2160p": [30],
};

const getDisplayName = (user) =>
  user?.nickname || user?.firstName || user?.first_name || user?.name || user?.email || "User";

const getAvatar = (user) => user?.avatarUrl || user?.avatar || DEFAULT_AVATAR;

const normalizeParticipant = (participant = {}) => ({
  userId: participant.userId || participant.UserId || participant.fromUserId || participant.FromUserId || "",
  name: participant.name || participant.Name || participant.fromName || participant.FromName || "Unknown",
  avatar:
    participant.avatar || participant.Avatar || participant.fromAvatar || participant.FromAvatar || DEFAULT_AVATAR,
  isScreenSharing: Boolean(participant.isScreenSharing || participant.IsScreenSharing),
  isMicMuted: Boolean(participant.isMicMuted || participant.IsMicMuted),
  isDeafened: Boolean(participant.isDeafened || participant.IsDeafened),
  isMicForced: Boolean(participant.isMicForced || participant.IsMicForced),
  isDeafenedForced: Boolean(participant.isDeafenedForced || participant.IsDeafenedForced),
});

const normalizeParticipantsMap = (data) => {
  if (!data || typeof data !== "object") {
    return {};
  }

  return Object.fromEntries(
    Object.entries(data).map(([channelId, participants]) => [
      channelId,
      Array.isArray(participants) ? participants.map((participant) => normalizeParticipant(participant)) : [],
    ])
  );
};

const getScreenSharePreset = (resolution = "1080p", fps = 60) => {
  const preset = SCREEN_SHARE_PRESETS[resolution] || SCREEN_SHARE_PRESETS["1080p"];
  const allowedFps = SCREEN_SHARE_ALLOWED_FPS[resolution] || SCREEN_SHARE_ALLOWED_FPS["1080p"];
  const requestedFps = Math.round(Number(fps) || allowedFps[0] || 30);
  const normalizedFps = allowedFps.includes(requestedFps)
    ? requestedFps
    : allowedFps.reduce(
        (closest, current) =>
          Math.abs(current - requestedFps) < Math.abs(closest - requestedFps) ? current : closest,
        allowedFps[0] || 30
      );

  return {
    width: preset.width,
    height: preset.height,
    fps: normalizedFps,
  };
};

const getResolutionConstraints = (resolution, fps) => {
  const preset = getScreenSharePreset(resolution, fps);
  return {
    width: { ideal: preset.width, max: preset.width },
    height: { ideal: preset.height, max: preset.height },
    frameRate: { ideal: preset.fps, max: preset.fps },
  };
};

const getCameraConstraints = (deviceId, resolution, fps) => {
  const preset = getScreenSharePreset(resolution, fps);
  return {
    ...(deviceId && !String(deviceId).startsWith("camera-") ? { deviceId: { exact: deviceId } } : {}),
    width: { ideal: preset.width },
    height: { ideal: preset.height },
    frameRate: { ideal: preset.fps, max: preset.fps },
  };
};

const tuneDisplayStream = async (stream, resolution, fps) => {
  const track = stream?.getVideoTracks?.()?.[0];
  if (!track) {
    return stream;
  }

  track.contentHint = "detail";

  const constraints = getResolutionConstraints(resolution, fps);
  try {
    await track.applyConstraints({
      width: { exact: constraints.width.ideal },
      height: { exact: constraints.height.ideal },
      frameRate: { ideal: constraints.frameRate.ideal, max: constraints.frameRate.max },
    });
  } catch {
    try {
      await track.applyConstraints({
        width: constraints.width,
        height: constraints.height,
        frameRate: constraints.frameRate,
      });
    } catch {
      // ignore optional tuning failures
    }
  }

  return stream;
};

const buildElectronDisplayConstraints = (screenSourceId, resolution, fps, withAudio, strict = true) => {
  const preset = getScreenSharePreset(resolution, fps);
  return {
    audio: withAudio
      ? {
          mandatory: {
            chromeMediaSource: "desktop",
          },
        }
      : false,
    video: {
      mandatory: {
        chromeMediaSource: "desktop",
        chromeMediaSourceId: screenSourceId,
        minWidth: strict ? preset.width : Math.min(1280, preset.width),
        maxWidth: preset.width,
        minHeight: strict ? preset.height : Math.min(720, preset.height),
        maxHeight: preset.height,
        minFrameRate: strict ? Math.max(15, preset.fps) : Math.min(30, preset.fps),
        maxFrameRate: preset.fps,
      },
    },
  };
};

const getElectronDisplayStream = async (resolution, fps, withAudio = false) => {
  const screenCaptureApi = window.electronScreenCapture;
  if (!screenCaptureApi?.getSources) {
    return null;
  }

  const sources = await screenCaptureApi.getSources();
  const screenSource = sources.find((source) => String(source.id || "").startsWith("screen:")) || sources[0];

  if (!screenSource?.id) {
    throw new Error("Unable to get a screen capture source.");
  }

  let stream = null;
  try {
    stream = await navigator.mediaDevices.getUserMedia(
      buildElectronDisplayConstraints(screenSource.id, resolution, fps, withAudio, true)
    );
  } catch {
    stream = await navigator.mediaDevices.getUserMedia(
      buildElectronDisplayConstraints(screenSource.id, resolution, fps, withAudio, false)
    );
  }

  return tuneDisplayStream(stream, resolution, fps);
};

const createPreferredAudioContext = () => {
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) {
    return null;
  }

  try {
    return new AudioContextClass({
      sampleRate: PREFERRED_AUDIO_SAMPLE_RATE,
      latencyHint: "interactive",
    });
  } catch {
    try {
      return new AudioContextClass();
    } catch {
      return null;
    }
  }
};

export {
  DEFAULT_AVATAR,
  NOISE_SUPPRESSION_MODE_TRANSPARENT,
  NOISE_SUPPRESSION_MODE_BROADCAST,
  NOISE_SUPPRESSION_MODE_HARD_GATE,
  getAvatar,
  getCameraConstraints,
  getDisplayName,
  getElectronDisplayStream,
  getResolutionConstraints,
  normalizeParticipant,
  normalizeParticipantsMap,
  tuneDisplayStream,
  createPreferredAudioContext,
  SCREEN_SHARE_ALLOWED_FPS,
};
