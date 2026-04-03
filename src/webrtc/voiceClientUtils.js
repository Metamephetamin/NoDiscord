const DEFAULT_AVATAR = "/image/avatar.jpg";
const NOISE_SUPPRESSION_MODE_TRANSPARENT = "transparent";
const NOISE_SUPPRESSION_MODE_VOICE_ISOLATION = "voice_isolation";
const PREFERRED_AUDIO_SAMPLE_RATE = 48_000;
const SCREEN_SHARE_PRESETS = {
  "720p": { width: 1280, height: 720 },
  "1080p": { width: 1920, height: 1080 },
  "1440p": { width: 2560, height: 1440 },
  "2160p": { width: 3840, height: 2160 },
};

const getDisplayName = (user) =>
  user?.firstName || user?.first_name || user?.name || user?.email || "User";

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
  const normalizedFps = Math.max(15, Math.min(Number(fps) || 30, 120));

  return {
    width: preset.width,
    height: preset.height,
    fps: normalizedFps,
  };
};

const getResolutionConstraints = (resolution, fps) => {
  const preset = getScreenSharePreset(resolution, fps);
  return {
    width: { ideal: preset.width },
    height: { ideal: preset.height },
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
      width: constraints.width,
      height: constraints.height,
      frameRate: constraints.frameRate,
    });
  } catch {
    // ignore optional tuning failures
  }

  return stream;
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

  const constraints = getResolutionConstraints(resolution, fps);

  const stream = await navigator.mediaDevices.getUserMedia({
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
        chromeMediaSourceId: screenSource.id,
        minWidth: 1280,
        maxWidth: constraints.width?.ideal || 1920,
        minHeight: 720,
        maxHeight: constraints.height?.ideal || 1080,
        minFrameRate: 15,
        maxFrameRate: constraints.frameRate?.ideal || fps,
      },
    },
  });

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
  NOISE_SUPPRESSION_MODE_VOICE_ISOLATION,
  getAvatar,
  getCameraConstraints,
  getDisplayName,
  getElectronDisplayStream,
  getResolutionConstraints,
  normalizeParticipant,
  normalizeParticipantsMap,
  tuneDisplayStream,
  createPreferredAudioContext,
};
