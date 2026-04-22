import * as signalR from "@microsoft/signalr";
import {
  AudioPresets,
  Room,
  RoomEvent,
  ScreenSharePresets,
  Track,
  VideoPreset,
  VideoQuality,
} from "livekit-client";
import { API_BASE_URL, VOICE_HUB_URL, VOICE_RTC_CONFIGURATION } from "../config/runtime";
import {
  authFetch,
  getApiErrorMessage,
  getStoredToken,
  isUnauthorizedError,
  notifyUnauthorizedSession,
  parseApiResponse,
} from "../utils/auth";
import { isDirectCallChannelId } from "../utils/directCallModel";
import {
  DEFAULT_AVATAR,
  NOISE_SUPPRESSION_MODE_BROADCAST,
  NOISE_SUPPRESSION_MODE_HARD_GATE,
  NOISE_SUPPRESSION_MODE_TRANSPARENT,
  createPreferredAudioContext,
  getAvatar,
  getCameraConstraints,
  getDisplayName,
  getElectronDisplayStream,
  getResolutionConstraints,
  normalizeParticipantsMap,
  tuneDisplayStream,
} from "./voiceClientUtils";
import { getDisplayCaptureSupportInfo } from "../utils/browserMediaSupport";

const RTC_CONFIGURATION = {
  ...VOICE_RTC_CONFIGURATION,
  iceServers: (VOICE_RTC_CONFIGURATION.iceServers || []).map((server) => ({ ...server })),
};
const MICROPHONE_TRACK_NAME = "microphone";
const SCREEN_VIDEO_TRACK_NAME = "screen-share";
const SCREEN_AUDIO_TRACK_NAME = "screen-share-audio";
const CAMERA_TRACK_NAME = "camera-share";
const VOICE_DEBUG_PREFIX = "[voice]";
const PREWARMED_SESSION_TTL_MS = 20_000;
const AUDIO_SAMPLE_RATE = 48_000;
const PREFERRED_AUDIO_SAMPLE_SIZE = 24;
const MAX_PREFERRED_AUDIO_SAMPLE_SIZE = 32;
const HIGH_QUALITY_MIC_AUDIO_PRESET = AudioPresets.musicHighQuality;
const VOICE_ISOLATION_MIC_AUDIO_PRESET = AudioPresets.speech;
const HIGH_QUALITY_SCREEN_AUDIO_PRESET = AudioPresets.musicHighQualityStereo;
const VIDEO_ENCODING_PRIORITY = "high";
const LEGACY_NOISE_SUPPRESSION_MODE_KRISP = "krisp";
const LEGACY_NOISE_SUPPRESSION_MODE_RNNOISE = "rnnoise";
const LEGACY_NOISE_SUPPRESSION_MODE_VOICE_ISOLATION = "voice_isolation";
const REMOTE_BACKGROUND_SHARE_TARGET = { width: 960, height: 540, fps: 15 };
const REMOTE_CAMERA_TARGET = { width: 640, height: 360, fps: 15 };
const CAMERA_VIDEO_QUALITY_TARGETS = {
  "720p": { width: 1280, height: 720, bitrate: { 30: 2_500_000, 60: 4_200_000 } },
  "1080p": { width: 1920, height: 1080, bitrate: { 30: 4_500_000, 60: 7_000_000 } },
  "1440p": { width: 2560, height: 1440, bitrate: { 30: 7_500_000, 60: 11_500_000 } },
  "2160p": { width: 3840, height: 2160, bitrate: { 30: 14_000_000, 60: 21_000_000 } },
};
const SCREEN_SHARE_QUALITY_TARGETS = {
  "720p": { width: 1280, height: 720, bitrate: { 30: 5_500_000, 60: 8_000_000 } },
  "1080p": { width: 1920, height: 1080, bitrate: { 30: 10_000_000, 60: 14_000_000 } },
  "1440p": { width: 2560, height: 1440, bitrate: { 30: 14_000_000 } },
  "2160p": { width: 3840, height: 2160, bitrate: { 30: 22_000_000 } },
};
const MAX_DEVICE_VOLUME_PERCENT = 200;

function normalizePublishFps(value, fallback = 30) {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) {
    return fallback;
  }

  return Math.max(15, Math.min(Math.round(numericValue), 60));
}

function resolveBitrate(targets, fps) {
  if (fps >= 60) {
    return targets[60] || targets[30];
  }

  return targets[30];
}

function createVideoPresetForQuality({ width, height, maxBitrate, maxFramerate }) {
  return new VideoPreset(width, height, maxBitrate, maxFramerate, VIDEO_ENCODING_PRIORITY);
}

function buildVideoEncodingOptions({ width, height, bitrate, fps }) {
  return {
    maxBitrate: bitrate,
    maxFramerate: fps,
    priority: VIDEO_ENCODING_PRIORITY,
    width,
    height,
  };
}

function getCameraPublishOptions(resolution = "720p", fps = 30) {
  const normalizedResolution = CAMERA_VIDEO_QUALITY_TARGETS[resolution] ? resolution : "720p";
  const normalizedFps = normalizePublishFps(fps, 30);
  const target = CAMERA_VIDEO_QUALITY_TARGETS[normalizedResolution];
  const maxBitrate = resolveBitrate(target.bitrate, normalizedFps);
  const videoEncoding = buildVideoEncodingOptions({
    width: target.width,
    height: target.height,
    bitrate: maxBitrate,
    fps: normalizedFps,
  });

  const lowLayer = createVideoPresetForQuality({
    width: 320,
    height: Math.max(180, Math.round((320 / target.width) * target.height)),
    maxBitrate: 180_000,
    maxFramerate: Math.min(24, normalizedFps),
  });
  const mediumLayer = createVideoPresetForQuality({
    width: 640,
    height: Math.max(360, Math.round((640 / target.width) * target.height)),
    maxBitrate: Math.max(500_000, Math.round(maxBitrate * 0.28)),
    maxFramerate: Math.min(30, normalizedFps),
  });

  return {
    simulcast: true,
    degradationPreference: "maintain-resolution",
    videoEncoding,
    videoSimulcastLayers: [lowLayer, mediumLayer],
  };
}

function getScreenSharePublishOptions(resolution = "1080p", fps = 60) {
  const normalizedResolution = SCREEN_SHARE_QUALITY_TARGETS[resolution] ? resolution : "1080p";
  const normalizedFps = normalizePublishFps(fps, 60);
  const target = SCREEN_SHARE_QUALITY_TARGETS[normalizedResolution];
  const maxBitrate = resolveBitrate(target.bitrate, normalizedFps);
  const screenShareEncoding = buildVideoEncodingOptions({
    width: target.width,
    height: target.height,
    bitrate: maxBitrate,
    fps: normalizedFps,
  });

  const lowLayer = ScreenSharePresets.h360fps15;
  const mediumLayer =
    normalizedResolution === "720p"
      ? ScreenSharePresets.h720fps15
      : createVideoPresetForQuality({
          width: 1280,
          height: 720,
          maxBitrate: Math.max(1_200_000, Math.round(maxBitrate * 0.32)),
          maxFramerate: Math.min(30, normalizedFps),
        });
  const screenShareSimulcastLayers =
    normalizedResolution === "720p"
      ? [lowLayer]
      : [lowLayer, mediumLayer];

  return {
    simulcast: true,
    degradationPreference: "maintain-resolution",
    screenShareEncoding,
    screenShareSimulcastLayers,
  };
}

function getMicrophonePublishOptions(mode = NOISE_SUPPRESSION_MODE_TRANSPARENT) {
  const useSpeechPreset = mode !== NOISE_SUPPRESSION_MODE_TRANSPARENT;

  return {
    audioPreset: useSpeechPreset ? VOICE_ISOLATION_MIC_AUDIO_PRESET : HIGH_QUALITY_MIC_AUDIO_PRESET,
    dtx: useSpeechPreset,
    red: true,
    forceStereo: false,
  };
}

function normalizeNoiseSuppressionMode(mode = NOISE_SUPPRESSION_MODE_TRANSPARENT) {
  if (mode === NOISE_SUPPRESSION_MODE_BROADCAST) {
    return NOISE_SUPPRESSION_MODE_BROADCAST;
  }

  if (mode === NOISE_SUPPRESSION_MODE_HARD_GATE) {
    return NOISE_SUPPRESSION_MODE_HARD_GATE;
  }

  if (mode === LEGACY_NOISE_SUPPRESSION_MODE_VOICE_ISOLATION) {
    return NOISE_SUPPRESSION_MODE_HARD_GATE;
  }

  if (mode === LEGACY_NOISE_SUPPRESSION_MODE_RNNOISE || mode === LEGACY_NOISE_SUPPRESSION_MODE_KRISP) {
    return NOISE_SUPPRESSION_MODE_BROADCAST;
  }

  return NOISE_SUPPRESSION_MODE_TRANSPARENT;
}

function getScreenShareAudioPublishOptions() {
  return {
    audioPreset: HIGH_QUALITY_SCREEN_AUDIO_PRESET,
    dtx: false,
    red: true,
    forceStereo: true,
  };
}

function bytesToBase64(value) {
  const bytes = value instanceof Uint8Array ? value : new Uint8Array(value);
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary);
}

function isVoiceDebugEnabled() {
  try {
    return typeof window !== "undefined" && window.localStorage?.getItem("ND_VOICE_DEBUG") !== "0";
  } catch {
    return true;
  }
}

function logVoiceDebug(eventName, payload = {}) {
  if (!isVoiceDebugEnabled()) {
    return;
  }

  try {
    console.info(`${VOICE_DEBUG_PREFIX} ${eventName}`, payload);
  } catch {
    // ignore debug logging failures
  }
}

function getTrackDebugInfo(track) {
  const mediaTrack = track?.mediaStreamTrack || track;
  return {
    kind: mediaTrack?.kind || track?.kind || "",
    id: mediaTrack?.id || track?.sid || "",
    label: mediaTrack?.label || "",
    enabled: mediaTrack?.enabled,
    muted: mediaTrack?.muted,
    readyState: mediaTrack?.readyState,
    settings: typeof mediaTrack?.getSettings === "function" ? mediaTrack.getSettings() : null,
  };
}

export function createVoiceRoomClient({
  onParticipantsMapChanged,
  onChannelChanged,
  onRemoteScreenStreamsChanged,
  onLocalScreenShareChanged,
  onLocalLiveShareChanged,
  onLocalPreviewStreamChanged,
  onLiveUsersChanged,
  onSpeakingUsersChanged,
  onRoomParticipantsChanged,
  onSelfVoiceStateChanged,
  onMicLevelChanged,
  onAudioDevicesChanged,
  onIncomingDirectCall,
  onDirectCallAccepted,
  onDirectCallDeclined,
  onDirectCallEnded,
} = {}) {
  let signalConnection = null;
  let signalConnectPromise = null;
  let room = null;
  let roomConnectPromise = null;
  let currentUser = null;
  let currentChannel = null;
  let localMicSourceStream = null;
  let localAudioStream = null;
  let localAudioPipelinePromise = null;
  let audioContext = null;
  let gainNode = null;
  let destinationNode = null;
  let localOutputAnalyser = null;
  let localNoiseGateAnalyser = null;
  let localNoiseGateNode = null;
  let localNoiseGateMeter = null;
  let localNoiseGateState = null;
  let localSpeakingMeter = null;
  let micVolume = 0.7;
  let remoteVolume = 0.7;
  let noiseSuppressionMode = NOISE_SUPPRESSION_MODE_TRANSPARENT;
  let echoCancellationEnabled = true;
  let rnnoiseModulePromise = null;
  let rnnoiseProcessor = null;
  let rnnoiseProcessedTrack = null;
  let localScreenStream = null;
  let localLiveShareMode = null;
  let selectedInputDeviceId = "";
  let selectedOutputDeviceId = "";
  let hasDeviceChangeListener = false;
  let micPublication = null;
  let localShareVideoPublication = null;
  let localShareAudioPublication = null;
  let isIntentionalRoomDisconnect = false;
  let isSelfMicMuted = false;
  let isSelfDeafened = false;
  let preferredRemoteShareUserId = "";
  let prewarmedSession = null;

  const remoteScreenShares = new Map();
  const remoteAudioElements = new Map();
  const remoteAudioNodes = new Map();
  const remoteParticipantMedia = new Map();
  const roomActiveSpeakerIds = new Set();

  const getVoiceDebugSnapshot = () => ({
    currentChannel,
    hasRoom: Boolean(room),
    roomState: room?.state || "",
    connectionState: room?.engine?.client?.connectionState || "",
    localParticipant: {
      identity: room?.localParticipant?.identity || "",
      sid: room?.localParticipant?.sid || "",
    },
    localMic: {
      sourceTracks: localMicSourceStream?.getAudioTracks?.().map(getTrackDebugInfo) || [],
      outputTracks: localAudioStream?.getAudioTracks?.().map(getTrackDebugInfo) || [],
      audioContextState: audioContext?.state || "",
      micVolume,
      isSelfMicMuted,
      isSelfDeafened,
      publicationSid: micPublication?.trackSid || "",
      publicationMuted: micPublication?.isMuted,
      publicationSubscribed: micPublication?.isSubscribed,
      publicationTrack: getTrackDebugInfo(micPublication?.track || null),
    },
    remoteAudioElements: Array.from(remoteAudioElements.entries()).map(([key, element]) => ({
      key,
      paused: element.paused,
      muted: element.muted,
      volume: element.volume,
      readyState: element.readyState,
      networkState: element.networkState,
      srcObjectTracks: element.srcObject?.getTracks?.().map(getTrackDebugInfo) || [],
    })),
    remoteParticipants: Array.from(room?.remoteParticipants?.values?.() || []).map((participant) => ({
      identity: participant.identity,
      sid: participant.sid,
      audioPublications: Array.from(participant.trackPublications?.values?.() || [])
        .filter((publication) => publication.source === Track.Source.Microphone || publication.source === Track.Source.ScreenShareAudio)
        .map((publication) => ({
          source: publication.source,
          trackSid: publication.trackSid,
          isSubscribed: publication.isSubscribed,
          isMuted: publication.isMuted,
          hasTrack: Boolean(publication.track || publication.audioTrack),
          track: getTrackDebugInfo(publication.track || publication.audioTrack || null),
        })),
    })),
  });

  const publishVoiceDebugSnapshot = (reason) => {
    const snapshot = getVoiceDebugSnapshot();
    if (typeof window !== "undefined") {
      window.__ndVoiceDebug = snapshot;
      window.__ndVoiceDebugDump = () => {
        const nextSnapshot = getVoiceDebugSnapshot();
        console.info(`${VOICE_DEBUG_PREFIX} dump`, nextSnapshot);
        return nextSnapshot;
      };
    }
    logVoiceDebug(reason, snapshot);
  };

  const emitSpeakingUsers = () => {
    onSpeakingUsersChanged?.(Array.from(roomActiveSpeakerIds.values()));
  };

  const emitParticipants = (data) => {
    onParticipantsMapChanged?.(normalizeParticipantsMap(data));
  };

  const emitRemoteScreens = () => {
    onRemoteScreenStreamsChanged?.(Array.from(remoteScreenShares.values()));
    onLiveUsersChanged?.(Array.from(remoteScreenShares.keys()));
  };

  const emitRoomParticipants = () => {
    if (!room || !currentChannel) {
      onRoomParticipantsChanged?.({ channel: "", participants: [] });
      return;
    }

    const participants = [];
    if (room.localParticipant) {
      participants.push({
        ...getParticipantSnapshot(room.localParticipant),
        userId: String(currentUser?.id || room.localParticipant.identity || ""),
        name: getDisplayName(currentUser || {}) || room.localParticipant.name || "Вы",
        avatar: getAvatar(currentUser || {}) || DEFAULT_AVATAR,
        isSelf: true,
      });
    }

    room.remoteParticipants.forEach((participant) => {
      participants.push(getParticipantSnapshot(participant));
    });

    onRoomParticipantsChanged?.({ channel: currentChannel, participants });
  };

  const emitLocalScreenState = () => {
    const isActive = Boolean(localScreenStream);
    onLocalScreenShareChanged?.(isActive);
    onLocalLiveShareChanged?.({
      isActive,
      mode: isActive ? localLiveShareMode || "screen" : "",
    });
    onLocalPreviewStreamChanged?.({
      stream: localScreenStream || null,
      mode: isActive ? localLiveShareMode || "screen" : "",
    });
  };

  const getOutputSelectionSupported = () =>
    typeof HTMLMediaElement !== "undefined" &&
    typeof HTMLMediaElement.prototype.setSinkId === "function";

  const clampDeviceVolumePercent = (value) => {
    const numericValue = Number(value);
    if (!Number.isFinite(numericValue)) {
      return 100;
    }

    return Math.max(0, Math.min(MAX_DEVICE_VOLUME_PERCENT, numericValue));
  };

  const normalizeDeviceLabel = (device, index, fallback) => {
    const label = String(device?.label || "").trim();
    if (label) {
      return label;
    }

    return `${fallback} ${index + 1}`;
  };

  const emitAudioDevices = async () => {
    if (!navigator.mediaDevices?.enumerateDevices) {
      const emptyState = {
        inputs: [],
        outputs: [],
        selectedInputDeviceId,
        selectedOutputDeviceId,
        outputSelectionSupported: false,
      };
      onAudioDevicesChanged?.(emptyState);
      return emptyState;
    }

    const devices = await navigator.mediaDevices.enumerateDevices();
    const inputs = devices
      .filter((device) => device.kind === "audioinput")
      .map((device, index) => ({
        id: device.deviceId || (index === 0 ? "default" : `input-${index}`),
        label: normalizeDeviceLabel(device, index, "Microphone"),
        groupId: device.groupId || "",
      }));
    const outputs = devices
      .filter((device) => device.kind === "audiooutput")
      .map((device, index) => ({
        id: device.deviceId || (index === 0 ? "default" : `output-${index}`),
        label: normalizeDeviceLabel(device, index, "Speaker"),
        groupId: device.groupId || "",
      }));

    if (!inputs.some((device) => device.id === selectedInputDeviceId)) {
      selectedInputDeviceId = inputs[0]?.id || "";
    }

    if (!outputs.some((device) => device.id === selectedOutputDeviceId)) {
      selectedOutputDeviceId = outputs[0]?.id || "";
    }

    const payload = {
      inputs,
      outputs,
      selectedInputDeviceId,
      selectedOutputDeviceId,
      outputSelectionSupported: getOutputSelectionSupported(),
    };
    onAudioDevicesChanged?.(payload);
    return payload;
  };

const handleDeviceChange = () => {
    emitAudioDevices().catch(() => {});
  };

  const buildPreferredSampleSizeConstraints = (relaxed = false) => (
    relaxed
      ? {}
      : {
          sampleSize: { ideal: PREFERRED_AUDIO_SAMPLE_SIZE },
          advanced: [
            { sampleSize: MAX_PREFERRED_AUDIO_SAMPLE_SIZE },
            { sampleSize: PREFERRED_AUDIO_SAMPLE_SIZE },
            { sampleSize: 16 },
          ],
        }
  );

  const buildMicConstraints = ({ deviceId = selectedInputDeviceId, mode = noiseSuppressionMode, relaxed = false } = {}) => ({
    deviceId:
      deviceId && deviceId !== "default"
        ? { exact: deviceId }
        : undefined,
    echoCancellation: echoCancellationEnabled,
    noiseSuppression: true,
    autoGainControl: mode !== NOISE_SUPPRESSION_MODE_TRANSPARENT,
    voiceIsolation:
      mode === NOISE_SUPPRESSION_MODE_HARD_GATE
        ? true
        : undefined,
    googEchoCancellation: echoCancellationEnabled,
    googEchoCancellation2: echoCancellationEnabled,
    googDAEchoCancellation: echoCancellationEnabled,
    googExperimentalEchoCancellation: echoCancellationEnabled,
    googAutoGainControl: mode !== NOISE_SUPPRESSION_MODE_TRANSPARENT,
    googNoiseSuppression: true,
    googNoiseSuppression2: true,
    googHighpassFilter: true,
    googTypingNoiseDetection: true,
    channelCount: relaxed ? undefined : 1,
    sampleRate: relaxed ? undefined : AUDIO_SAMPLE_RATE,
    latency: relaxed ? undefined : 0.01,
    ...buildPreferredSampleSizeConstraints(relaxed),
  });

  const getMicConstraints = (mode = noiseSuppressionMode) => buildMicConstraints({ mode });

  const getRelaxedMicConstraints = (mode = noiseSuppressionMode) => buildMicConstraints({ mode, relaxed: true, deviceId: "" });

  const isAudioCaptureStartError = (error) => {
    const errorName = String(error?.name || "").trim();
    return errorName === "NotReadableError" || errorName === "TrackStartError";
  };

  const buildMicrophoneAccessError = (error) => {
    const errorName = String(error?.name || "").trim();
    if (isAudioCaptureStartError(error)) {
      const nextError = new Error("Микрофон не удалось запустить. Закройте приложения, которые могут использовать микрофон, или выберите другой вход в настройках голоса.");
      nextError.name = errorName || "NotReadableError";
      nextError.cause = error;
      return nextError;
    }

    return error;
  };

  const requestLocalMicSourceStream = async () => {
    const preferredConstraints = getMicConstraints();
    try {
      return await navigator.mediaDevices.getUserMedia({ audio: preferredConstraints });
    } catch (error) {
      logVoiceDebug("local-audio:capture-failed", {
        errorName: error?.name || "",
        error: error?.message || String(error),
        selectedInputDeviceId,
        constraints: preferredConstraints,
      });

      if (!isAudioCaptureStartError(error)) {
        throw buildMicrophoneAccessError(error);
      }

      if (navigator.mediaDevices?.enumerateDevices) {
        try {
          const devices = await navigator.mediaDevices.enumerateDevices();
          const alternativeInputs = devices
            .filter((device) => device.kind === "audioinput")
            .map((device, index) => ({
              id: device.deviceId || (index === 0 ? "default" : `input-${index}`),
              label: normalizeDeviceLabel(device, index, "Microphone"),
            }))
            .filter((device) => device.id && device.id !== selectedInputDeviceId);

          for (const input of alternativeInputs) {
            const deviceConstraints = buildMicConstraints({ deviceId: input.id, relaxed: true });
            try {
              const fallbackStream = await navigator.mediaDevices.getUserMedia({ audio: deviceConstraints });
              selectedInputDeviceId = input.id;
              await emitAudioDevices().catch(() => {});
              logVoiceDebug("local-audio:capture-device-fallback-success", {
                selectedInputDeviceId,
                label: input.label,
                constraints: deviceConstraints,
                tracks: fallbackStream.getAudioTracks?.().map(getTrackDebugInfo) || [],
              });
              return fallbackStream;
            } catch (deviceError) {
              logVoiceDebug("local-audio:capture-device-fallback-failed", {
                attemptedDeviceId: input.id,
                label: input.label,
                errorName: deviceError?.name || "",
                error: deviceError?.message || String(deviceError),
              });
            }
          }
        } catch (enumerateError) {
          logVoiceDebug("local-audio:capture-enumerate-failed", {
            errorName: enumerateError?.name || "",
            error: enumerateError?.message || String(enumerateError),
          });
        }
      }

      const relaxedConstraints = getRelaxedMicConstraints();
      try {
        const fallbackStream = await navigator.mediaDevices.getUserMedia({ audio: relaxedConstraints });
        logVoiceDebug("local-audio:capture-fallback-success", {
          selectedInputDeviceId,
          constraints: relaxedConstraints,
          tracks: fallbackStream.getAudioTracks?.().map(getTrackDebugInfo) || [],
        });
        return fallbackStream;
      } catch (fallbackError) {
        logVoiceDebug("local-audio:capture-fallback-failed", {
          errorName: fallbackError?.name || "",
          error: fallbackError?.message || String(fallbackError),
          selectedInputDeviceId,
          constraints: relaxedConstraints,
        });
        throw buildMicrophoneAccessError(fallbackError);
      }
    }
  };

  const stopRnnoiseNoiseSuppression = async () => {
    try {
      rnnoiseProcessor?.stopProcessing?.();
    } catch (error) {
      logVoiceDebug("local-audio:rnnoise-stop-failed", {
        errorName: error?.name || "",
        error: error?.message || String(error),
      });
    }

    try {
      rnnoiseProcessedTrack?.stop?.();
    } catch {
      // ignore processed track cleanup failures
    }

    rnnoiseProcessor = null;
    rnnoiseProcessedTrack = null;
    logVoiceDebug("local-audio:rnnoise-stopped");
  };

  const applyRnnoiseToTrack = async (track) => {
    await stopRnnoiseNoiseSuppression();
    return track;
  };

  const startLocalMetering = (analyser) => {
    if (!analyser) {
      return;
    }

    const data = new Uint8Array(analyser.fftSize);
    localSpeakingMeter = window.setInterval(() => {
      analyser.getByteTimeDomainData(data);
      let sumSquares = 0;
      for (const value of data) {
        const centered = (value - 128) / 128;
        sumSquares += centered * centered;
      }

      const rms = Math.sqrt(sumSquares / Math.max(1, data.length));
      const normalizedLevel = Math.max(0, Math.min(1, rms * 8));
      onMicLevelChanged?.(normalizedLevel);
    }, 120);
  };

  const getNoiseGateProfile = (mode = noiseSuppressionMode) => {
    if (mode === NOISE_SUPPRESSION_MODE_HARD_GATE) {
      return {
        openThreshold: 0.043,
        closeThreshold: 0.027,
        floorGain: 0.00004,
        attackTime: 0.0025,
        releaseTime: 0.045,
        holdMs: 280,
      };
    }

    if (mode === NOISE_SUPPRESSION_MODE_BROADCAST) {
      return {
        openThreshold: 0.015,
        closeThreshold: 0.008,
        floorGain: 0.11,
        attackTime: 0.014,
        releaseTime: 0.14,
        holdMs: 160,
      };
    }

    return {
      openThreshold: 0.012,
      closeThreshold: 0.006,
      floorGain: 0.15,
      attackTime: 0.016,
      releaseTime: 0.16,
      holdMs: 140,
    };
  };

  const startNoiseGateMetering = (analyser, gateNode, profile) => {
    if (!analyser || !gateNode || typeof window === "undefined") {
      return;
    }

    const data = new Uint8Array(analyser.fftSize);
    localNoiseGateState = {
      isOpen: false,
      holdUntil: 0,
    };

    gateNode.gain.value = profile.floorGain;

    localNoiseGateMeter = window.setInterval(() => {
      analyser.getByteTimeDomainData(data);
      let sumSquares = 0;
      for (const value of data) {
        const centered = (value - 128) / 128;
        sumSquares += centered * centered;
      }

      const rms = Math.sqrt(sumSquares / Math.max(1, data.length));
      const now = performance.now();
      const nextState = localNoiseGateState || {
        isOpen: false,
        holdUntil: 0,
      };

      if (rms >= profile.openThreshold) {
        nextState.isOpen = true;
        nextState.holdUntil = now + profile.holdMs;
      } else if (nextState.isOpen && rms >= profile.closeThreshold) {
        nextState.holdUntil = now + profile.holdMs;
      } else if (nextState.isOpen && now >= nextState.holdUntil && rms < profile.closeThreshold) {
        nextState.isOpen = false;
      }

      localNoiseGateState = nextState;
      const targetGain = nextState.isOpen ? 1 : profile.floorGain;
      const transitionTime = nextState.isOpen ? profile.attackTime : profile.releaseTime;
      gateNode.gain.setTargetAtTime(targetGain, audioContext.currentTime, transitionTime);
    }, 36);
  };

  const buildSpeechPolishChain = (
    sourceNode,
    {
      highPassFrequency = 92,
      highPassQ = 0.75,
      mudCutFrequency = 240,
      mudCutQ = 1.05,
      mudCutGain = -2.2,
      boxCutFrequency = 560,
      boxCutQ = 1.15,
      boxCutGain = -1.2,
      presenceFrequency = 2550,
      presenceQ = 1.05,
      presenceGain = 2.3,
      airFrequency = 5600,
      airGain = 1.3,
      lowPassFrequency = 9000,
      lowPassQ = 0.7,
      threshold = -25,
      knee = 18,
      ratio = 4.8,
      attack = 0.004,
      release = 0.19,
      noiseGateProfile = getNoiseGateProfile(),
    } = {}
  ) => {
    const highPassFilter = audioContext.createBiquadFilter();
    highPassFilter.type = "highpass";
    highPassFilter.frequency.value = highPassFrequency;
    highPassFilter.Q.value = highPassQ;

    const mudCutFilter = audioContext.createBiquadFilter();
    mudCutFilter.type = "peaking";
    mudCutFilter.frequency.value = mudCutFrequency;
    mudCutFilter.Q.value = mudCutQ;
    mudCutFilter.gain.value = mudCutGain;

    const boxCutFilter = audioContext.createBiquadFilter();
    boxCutFilter.type = "peaking";
    boxCutFilter.frequency.value = boxCutFrequency;
    boxCutFilter.Q.value = boxCutQ;
    boxCutFilter.gain.value = boxCutGain;

    const presenceFilter = audioContext.createBiquadFilter();
    presenceFilter.type = "peaking";
    presenceFilter.frequency.value = presenceFrequency;
    presenceFilter.Q.value = presenceQ;
    presenceFilter.gain.value = presenceGain;

    const airFilter = audioContext.createBiquadFilter();
    airFilter.type = "highshelf";
    airFilter.frequency.value = airFrequency;
    airFilter.gain.value = airGain;

    const lowPassFilter = audioContext.createBiquadFilter();
    lowPassFilter.type = "lowpass";
    lowPassFilter.frequency.value = lowPassFrequency;
    lowPassFilter.Q.value = lowPassQ;

    const compressor = audioContext.createDynamicsCompressor();
    compressor.threshold.value = threshold;
    compressor.knee.value = knee;
    compressor.ratio.value = ratio;
    compressor.attack.value = attack;
    compressor.release.value = release;

    const noiseGateNode = audioContext.createGain();
    const noiseGateAnalyser = audioContext.createAnalyser();
    noiseGateAnalyser.fftSize = 256;
    noiseGateAnalyser.smoothingTimeConstant = 0.82;

    sourceNode.connect(highPassFilter);
    highPassFilter.connect(mudCutFilter);
    mudCutFilter.connect(boxCutFilter);
    boxCutFilter.connect(presenceFilter);
    presenceFilter.connect(airFilter);
    airFilter.connect(lowPassFilter);
    lowPassFilter.connect(compressor);
    compressor.connect(noiseGateNode);
    compressor.connect(noiseGateAnalyser);

    localNoiseGateNode = noiseGateNode;
    localNoiseGateAnalyser = noiseGateAnalyser;
    startNoiseGateMetering(noiseGateAnalyser, noiseGateNode, noiseGateProfile);

    return noiseGateNode;
  };

  const buildBroadcastVoiceChain = (sourceNode) => {
    return buildSpeechPolishChain(sourceNode, {
      highPassFrequency: 88,
      mudCutFrequency: 250,
      mudCutGain: -2.4,
      boxCutFrequency: 520,
      boxCutGain: -1.4,
      presenceFrequency: 2650,
      presenceGain: 3.0,
      airFrequency: 5850,
      airGain: 1.9,
      lowPassFrequency: 9200,
      threshold: -24,
      knee: 19,
      ratio: 4.3,
      attack: 0.003,
      release: 0.16,
      noiseGateProfile: getNoiseGateProfile(NOISE_SUPPRESSION_MODE_BROADCAST),
    });
  };

  const buildTransparentVoiceChain = (sourceNode) => buildSpeechPolishChain(sourceNode, {
    highPassFrequency: 84,
    mudCutFrequency: 235,
    mudCutGain: -1.6,
    boxCutFrequency: 520,
    boxCutGain: -0.9,
    presenceFrequency: 2650,
    presenceGain: 2.1,
    airFrequency: 6100,
    airGain: 1.1,
    lowPassFrequency: 9800,
    threshold: -22,
    knee: 18,
    ratio: 2.8,
    attack: 0.005,
    release: 0.18,
    noiseGateProfile: getNoiseGateProfile(NOISE_SUPPRESSION_MODE_TRANSPARENT),
  });

  const buildHardGateVoiceChain = (sourceNode) => buildSpeechPolishChain(sourceNode, {
    highPassFrequency: 175,
    highPassQ: 1.12,
    mudCutFrequency: 320,
    mudCutQ: 1.34,
    mudCutGain: -5.4,
    boxCutFrequency: 900,
    boxCutQ: 1.55,
    boxCutGain: -4.2,
    presenceFrequency: 2240,
    presenceQ: 1.34,
    presenceGain: 4.6,
    airFrequency: 4400,
    airGain: 0.3,
    lowPassFrequency: 5600,
    lowPassQ: 1.05,
    threshold: -34,
    knee: 6,
    ratio: 12,
    attack: 0.001,
    release: 0.08,
    noiseGateProfile: getNoiseGateProfile(NOISE_SUPPRESSION_MODE_HARD_GATE),
  });

  const connectLocalAudioGraph = (sourceNode) => {
    let inputNode = sourceNode;
    if (noiseSuppressionMode === NOISE_SUPPRESSION_MODE_BROADCAST) {
      inputNode = buildBroadcastVoiceChain(sourceNode);
    } else if (noiseSuppressionMode === NOISE_SUPPRESSION_MODE_HARD_GATE) {
      inputNode = buildHardGateVoiceChain(sourceNode);
    } else {
      inputNode = buildTransparentVoiceChain(sourceNode);
    }

    inputNode.connect(gainNode);
    gainNode.connect(destinationNode);

    localOutputAnalyser = audioContext.createAnalyser();
    localOutputAnalyser.fftSize = 256;
    gainNode.connect(localOutputAnalyser);
  };

  const stopLocalMic = () => {
    void stopRnnoiseNoiseSuppression().catch(() => {});
    logVoiceDebug("local-mic:stop", {
      sourceTracks: localMicSourceStream?.getAudioTracks?.().map(getTrackDebugInfo) || [],
      outputTracks: localAudioStream?.getAudioTracks?.().map(getTrackDebugInfo) || [],
      audioContextState: audioContext?.state || "",
    });

    if (localSpeakingMeter) {
      window.clearInterval(localSpeakingMeter);
      localSpeakingMeter = null;
    }

    if (localNoiseGateMeter) {
      window.clearInterval(localNoiseGateMeter);
      localNoiseGateMeter = null;
    }

    localMicSourceStream?.getTracks().forEach((track) => track.stop());
    localMicSourceStream = null;
    localAudioStream = null;
    localAudioPipelinePromise = null;
    localOutputAnalyser = null;
    localNoiseGateAnalyser = null;
    localNoiseGateNode = null;
    localNoiseGateState = null;
    onMicLevelChanged?.(0);

    if (audioContext) {
      audioContext.close().catch(() => {});
      audioContext = null;
    }

    gainNode = null;
    destinationNode = null;
  };

  const createLocalAudioPipeline = async () => {
    logVoiceDebug("local-audio:pipeline-create:start", {
      selectedInputDeviceId,
      noiseSuppressionMode,
      echoCancellationEnabled,
      micVolume,
    });

    try {
      localMicSourceStream = await requestLocalMicSourceStream();
      const [capturedMicTrack] = localMicSourceStream.getAudioTracks();
      if (capturedMicTrack) {
        capturedMicTrack.contentHint = "speech";
      }
      await emitAudioDevices().catch(() => {});

      audioContext = createPreferredAudioContext();
      if (!audioContext) {
        throw new Error("Unable to initialize audio context.");
      }

      const sourceNode = audioContext.createMediaStreamSource(localMicSourceStream);
      gainNode = audioContext.createGain();
      destinationNode = audioContext.createMediaStreamDestination();
      gainNode.gain.value = micVolume;
      connectLocalAudioGraph(sourceNode);
      localAudioStream = destinationNode.stream;

      startLocalMetering(localOutputAnalyser);

      logVoiceDebug("local-audio:pipeline-create:success", {
        sourceTracks: localMicSourceStream.getAudioTracks?.().map(getTrackDebugInfo) || [],
        outputTracks: localAudioStream.getAudioTracks?.().map(getTrackDebugInfo) || [],
        audioContextState: audioContext?.state || "",
        echoCancellationEnabled,
      });

      return localAudioStream;
    } catch (error) {
      stopLocalMic();
      throw error;
    }
  };

  const ensureAudioPipeline = async () => {
    if (localAudioStream) {
      if (audioContext?.state === "suspended") {
        await audioContext.resume();
      }
      logVoiceDebug("local-audio:pipeline-reuse", {
        outputTracks: localAudioStream.getAudioTracks?.().map(getTrackDebugInfo) || [],
        audioContextState: audioContext?.state || "",
      });
      return localAudioStream;
    }

    if (!localAudioPipelinePromise) {
      localAudioPipelinePromise = createLocalAudioPipeline().finally(() => {
        localAudioPipelinePromise = null;
      });
    } else {
      logVoiceDebug("local-audio:pipeline-create:await-existing", {
        selectedInputDeviceId,
        noiseSuppressionMode,
      });
    }

    return localAudioPipelinePromise;
  };

  const parseParticipantMetadata = (participant) => {
    try {
      return participant?.metadata ? JSON.parse(participant.metadata) : {};
    } catch {
      return {};
    }
  };

  const getParticipantSnapshot = (participant) => {
    const metadata = parseParticipantMetadata(participant);
    return {
      userId: String(participant?.identity || ""),
      name: participant?.name || metadata.displayName || "Unknown",
      avatar: metadata.avatarUrl || DEFAULT_AVATAR,
    };
  };

  const getRemoteParticipantMediaState = (userId) => {
    if (!remoteParticipantMedia.has(userId)) {
      remoteParticipantMedia.set(userId, {
        screenVideoPublication: null,
        cameraPublication: null,
        screenAudioPublication: null,
        microphonePublication: null,
      });
    }

    return remoteParticipantMedia.get(userId);
  };

  const applyOutputDeviceToElement = async (element) => {
    if (!element || !selectedOutputDeviceId || selectedOutputDeviceId === "default" || !getOutputSelectionSupported()) {
      return;
    }

    try {
      if (audioContext && typeof audioContext.setSinkId === "function") {
        await audioContext.setSinkId(selectedOutputDeviceId);
      }
      await element.setSinkId(selectedOutputDeviceId);
      logVoiceDebug("remote-audio:sink-applied", { selectedOutputDeviceId });
    } catch (error) {
      logVoiceDebug("remote-audio:sink-failed", {
        selectedOutputDeviceId,
        error: error?.message || String(error),
      });
    }
  };

  const removeRemoteAudioElement = (key) => {
    const nodeEntry = remoteAudioNodes.get(key);
    if (nodeEntry) {
      try {
        nodeEntry.gainNode?.disconnect();
      } catch {
        // Ignore disconnect failures for settled gain nodes.
      }

      try {
        nodeEntry.sourceNode?.disconnect();
      } catch {
        // Ignore disconnect failures for settled source nodes.
      }

      remoteAudioNodes.delete(key);
    }

    const element = remoteAudioElements.get(key);
    if (!element) {
      return;
    }

    try {
      element.srcObject = null;
      element.remove();
    } catch {
      // ignore element cleanup failures
    }

    remoteAudioElements.delete(key);
    logVoiceDebug("remote-audio:element-removed", { key, remaining: remoteAudioElements.size });
  };

  const removeAllRemoteAudioElements = () => {
    Array.from(remoteAudioElements.keys()).forEach(removeRemoteAudioElement);
  };

  const ensureAudioContextForPlayback = async () => {
    if (!audioContext) {
      audioContext = createPreferredAudioContext();
    }

    if (audioContext?.state === "suspended") {
      await audioContext.resume().catch(() => {});
    }

    return audioContext;
  };

  const applyRemoteAudioVolume = (element, key) => {
    if (!element) {
      return;
    }

    const normalizedRemoteVolume = Math.max(0, clampDeviceVolumePercent(remoteVolume * 100) / 100);
    const nodeEntry = remoteAudioNodes.get(key);
    element.volume = Math.min(1, normalizedRemoteVolume);

    if (nodeEntry?.gainNode) {
      nodeEntry.gainNode.gain.value = normalizedRemoteVolume;
    }
  };

  const attachRemoteAudioTrack = async (track, publication, participant) => {
    const audioTrack =
      track?.kind === "audio"
        ? track
        : publication?.audioTrack || publication?.track || null;
    if (!audioTrack) {
      logVoiceDebug("remote-audio:attach-skipped-no-track", {
        participant: participant?.identity || "",
        source: publication?.source || "",
        trackSid: publication?.trackSid || "",
        subscribed: publication?.isSubscribed,
      });
      return;
    }

    const key = `${participant.identity}:${publication?.trackSid || audioTrack?.sid || "audio"}`;
    removeRemoteAudioElement(key);
    logVoiceDebug("remote-audio:attach-start", {
      key,
      participant: participant?.identity || "",
      source: publication?.source || "",
      publicationMuted: publication?.isMuted,
      publicationSubscribed: publication?.isSubscribed,
      remoteVolume,
      track: getTrackDebugInfo(audioTrack),
    });

    const element = audioTrack.attach();
    element.autoplay = true;
    element.playsInline = true;
    element.defaultMuted = false;
    element.muted = false;
    element.volume = Math.min(1, remoteVolume);
    element.style.display = "none";
    document.body.appendChild(element);

    try {
      const playbackContext = await ensureAudioContextForPlayback();
      if (playbackContext && typeof playbackContext.createMediaElementSource === "function") {
        const sourceNode = playbackContext.createMediaElementSource(element);
        const gainNode = playbackContext.createGain();
        sourceNode.connect(gainNode);
        gainNode.connect(playbackContext.destination);
        remoteAudioNodes.set(key, { sourceNode, gainNode });
      }
    } catch (error) {
      logVoiceDebug("remote-audio:gain-chain-failed", {
        key,
        error: error?.message || String(error),
      });
    }

    applyRemoteAudioVolume(element, key);

    await applyOutputDeviceToElement(element).catch(() => {});
    const playPromise = element.play?.();
    if (typeof playPromise?.catch === "function") {
      playPromise
        .then(() => {
          logVoiceDebug("remote-audio:play-ok", {
            key,
            paused: element.paused,
            readyState: element.readyState,
            networkState: element.networkState,
            volume: element.volume,
            muted: element.muted,
          });
          publishVoiceDebugSnapshot("remote-audio:play-ok:snapshot");
        })
        .catch((error) => {
          logVoiceDebug("remote-audio:play-failed", {
            key,
            errorName: error?.name || "",
            error: error?.message || String(error),
            paused: element.paused,
            readyState: element.readyState,
            networkState: element.networkState,
            volume: element.volume,
            muted: element.muted,
          });
          publishVoiceDebugSnapshot("remote-audio:play-failed:snapshot");
        });
    }
    remoteAudioElements.set(key, element);
    publishVoiceDebugSnapshot("remote-audio:attached");
  };

  const attachExistingRemoteAudioTracks = (participant) => {
    if (!participant?.identity) {
      return;
    }

    logVoiceDebug("remote-audio:scan-existing", {
      participant: participant.identity,
      publications: Array.from(participant.trackPublications.values()).map((publication) => ({
        source: publication.source,
        trackSid: publication.trackSid,
        isSubscribed: publication.isSubscribed,
        isMuted: publication.isMuted,
        hasTrack: Boolean(publication.track || publication.audioTrack),
      })),
    });

    Array.from(participant.trackPublications.values()).forEach((publication) => {
      if (
        publication?.source === Track.Source.Microphone
        || publication?.source === Track.Source.ScreenShareAudio
      ) {
        attachRemoteAudioTrack(publication.track, publication, participant).catch(() => {});
      }
    });
  };

  const removeRemoteShare = (userId) => {
    const existing = remoteScreenShares.get(userId);
    if (existing?.stream) {
      existing.stream.getTracks().forEach((track) => {
        try {
          track.stop?.();
        } catch {
          // ignore cleanup failures for cloned tracks
        }
      });
    }

    remoteScreenShares.delete(userId);
    emitRemoteScreens();
  };

  const clearRemoteScreens = () => {
    Array.from(remoteScreenShares.keys()).forEach(removeRemoteShare);
  };

  const getPublicationVideoTarget = (publication, fallback = {}) => {
    const trackSettings = publication?.videoTrack?.mediaStreamTrack?.getSettings?.() || {};
    const width = Math.max(
      320,
      Math.round(
        Number(trackSettings.width)
        || Number(publication?.dimensions?.width)
        || Number(fallback.width)
        || REMOTE_BACKGROUND_SHARE_TARGET.width
      )
    );
    const height = Math.max(
      180,
      Math.round(
        Number(trackSettings.height)
        || Number(publication?.dimensions?.height)
        || Number(fallback.height)
        || REMOTE_BACKGROUND_SHARE_TARGET.height
      )
    );
    const fps = Math.max(
      15,
      Math.round(
        Number(trackSettings.frameRate)
        || Number(fallback.fps)
        || REMOTE_BACKGROUND_SHARE_TARGET.fps
      )
    );

    return { width, height, fps };
  };

  const applyRemotePublicationPreferences = (publication, options = {}) => {
    if (!publication?.isManualOperationAllowed?.()) {
      return;
    }

    const {
      enabled = true,
      subscribed = true,
      quality = VideoQuality.MEDIUM,
      width = 1280,
      height = 720,
      fps = 30,
    } = options;

    publication.setSubscribed(Boolean(subscribed));
    publication.setEnabled(Boolean(enabled));

    if (!enabled || !subscribed) {
      return;
    }

    publication.setVideoQuality(quality);
    publication.setVideoDimensions(Math.max(320, Math.round(width)), Math.max(180, Math.round(height)));
    publication.setVideoFPS(Math.max(15, Math.round(fps)));
  };

  const applyRemoteSharePreferences = () => {
    const activeVideoPublicationCount = Array.from(remoteParticipantMedia.values()).reduce(
      (count, state) => count + (state.screenVideoPublication || state.cameraPublication ? 1 : 0),
      0
    );
    const isSpecificRemoteShareFocused = Boolean(preferredRemoteShareUserId);

    remoteParticipantMedia.forEach((state, userId) => {
      const isFocused =
        (preferredRemoteShareUserId && String(preferredRemoteShareUserId) === String(userId))
        || (!preferredRemoteShareUserId && activeVideoPublicationCount === 1);
      const hasScreenShare = Boolean(state.screenVideoPublication);

      if (state.screenAudioPublication?.isManualOperationAllowed?.()) {
        const shouldSubscribeScreenAudio = !isSpecificRemoteShareFocused || isFocused;
        state.screenAudioPublication.setSubscribed(shouldSubscribeScreenAudio);
        state.screenAudioPublication.setEnabled(shouldSubscribeScreenAudio);
      }

      if (state.screenVideoPublication) {
        const focusedScreenTarget = getPublicationVideoTarget(state.screenVideoPublication, REMOTE_BACKGROUND_SHARE_TARGET);
        applyRemotePublicationPreferences(state.screenVideoPublication, {
          enabled: true,
          subscribed: true,
          quality: isFocused ? VideoQuality.HIGH : VideoQuality.LOW,
          width: isFocused ? focusedScreenTarget.width : Math.min(focusedScreenTarget.width, REMOTE_BACKGROUND_SHARE_TARGET.width),
          height: isFocused ? focusedScreenTarget.height : Math.min(focusedScreenTarget.height, REMOTE_BACKGROUND_SHARE_TARGET.height),
          fps: isFocused ? focusedScreenTarget.fps : Math.min(focusedScreenTarget.fps, REMOTE_BACKGROUND_SHARE_TARGET.fps),
        });
      }

      if (state.cameraPublication) {
        const focusedCameraTarget = getPublicationVideoTarget(state.cameraPublication, REMOTE_CAMERA_TARGET);
        const shouldSubscribeCamera = !isSpecificRemoteShareFocused;
        applyRemotePublicationPreferences(state.cameraPublication, {
          enabled: shouldSubscribeCamera,
          subscribed: shouldSubscribeCamera,
          quality: !hasScreenShare && isFocused ? VideoQuality.HIGH : VideoQuality.LOW,
          width: !hasScreenShare && isFocused ? focusedCameraTarget.width : Math.min(focusedCameraTarget.width, REMOTE_CAMERA_TARGET.width),
          height: !hasScreenShare && isFocused ? focusedCameraTarget.height : Math.min(focusedCameraTarget.height, REMOTE_CAMERA_TARGET.height),
          fps: !hasScreenShare && isFocused ? focusedCameraTarget.fps : Math.min(focusedCameraTarget.fps, REMOTE_CAMERA_TARGET.fps),
        });
      }
    });
  };

  const syncRemoteShareForParticipant = (participant) => {
    if (!participant?.identity) {
      return;
    }

    const userId = String(participant.identity);
    const state = getRemoteParticipantMediaState(userId);
    const preferredPublication =
      state.screenVideoPublication?.isSubscribed && state.screenVideoPublication?.videoTrack
        ? state.screenVideoPublication
        : state.cameraPublication?.isSubscribed && state.cameraPublication?.videoTrack
          ? state.cameraPublication
          : null;

    if (!preferredPublication?.videoTrack) {
      removeRemoteShare(userId);
      return;
    }

    const stream = new MediaStream();
    stream.addTrack(preferredPublication.videoTrack.mediaStreamTrack);

    const includeScreenAudio =
      preferredPublication.source === Track.Source.ScreenShare
      && state.screenAudioPublication?.isSubscribed
      && state.screenAudioPublication?.audioTrack;
    if (includeScreenAudio) {
      stream.addTrack(state.screenAudioPublication.audioTrack.mediaStreamTrack);
    }

    remoteScreenShares.set(userId, {
      ...getParticipantSnapshot(participant),
      stream,
      updatedAt: Date.now(),
      hasAudio: Boolean(includeScreenAudio),
      mode: preferredPublication.source === Track.Source.Camera ? "camera" : "screen",
      width: Number(preferredPublication.videoTrack.mediaStreamTrack?.getSettings?.().width || 0),
      height: Number(preferredPublication.videoTrack.mediaStreamTrack?.getSettings?.().height || 0),
      fps: Number(preferredPublication.videoTrack.mediaStreamTrack?.getSettings?.().frameRate || 0),
    });
    applyRemoteSharePreferences();
    emitRemoteScreens();
  };

  const syncAllRemoteShares = () => {
    if (!room) {
      clearRemoteScreens();
      return;
    }

    room.remoteParticipants.forEach((participant) => {
      syncRemoteShareForParticipant(participant);
    });
    applyRemoteSharePreferences();
  };

  const registerCurrentUser = async (user) => {
    if (!signalConnection || signalConnection.state !== signalR.HubConnectionState.Connected || !user?.id) {
      return;
    }

    currentUser = user;

    if (!hasDeviceChangeListener && navigator.mediaDevices?.addEventListener) {
      navigator.mediaDevices.addEventListener("devicechange", handleDeviceChange);
      hasDeviceChangeListener = true;
    }

    await signalConnection.invoke("Register", String(user.id), getDisplayName(user), getAvatar(user));
  };

  const stopRoom = async ({ preserveChannel = false } = {}) => {
    if (!room) {
      if (!preserveChannel) {
        currentChannel = null;
        onChannelChanged?.(null);
      }
      return;
    }

    const activeRoom = room;
    await stopRnnoiseNoiseSuppression().catch(() => {});
    room = null;
    roomConnectPromise = null;
    micPublication = null;
    localShareVideoPublication = null;
    localShareAudioPublication = null;
    roomActiveSpeakerIds.clear();
    emitSpeakingUsers();
    clearRemoteScreens();
    removeAllRemoteAudioElements();
    remoteParticipantMedia.clear();
    onRoomParticipantsChanged?.({ channel: preserveChannel ? currentChannel || "" : "", participants: [] });

    isIntentionalRoomDisconnect = true;
    try {
      await activeRoom.disconnect();
    } catch {
      // ignore disconnect errors during teardown
    } finally {
      isIntentionalRoomDisconnect = false;
    }

    if (!preserveChannel) {
      currentChannel = null;
      onChannelChanged?.(null);
    }
  };

  const updateScreenShareStatus = async (isSharing) => {
    if (!signalConnection || signalConnection.state !== signalR.HubConnectionState.Connected || !currentUser?.id) {
      return;
    }

    await signalConnection.invoke("UpdateScreenShareStatus", String(currentUser.id), Boolean(isSharing));
  };

  const stopScreenShareInternal = async () => {
    if (room && localShareVideoPublication?.track) {
      await room.localParticipant.unpublishTrack(localShareVideoPublication.track.mediaStreamTrack, false).catch(() => {});
    }
    if (room && localShareAudioPublication?.track) {
      await room.localParticipant.unpublishTrack(localShareAudioPublication.track.mediaStreamTrack, false).catch(() => {});
    }

    localShareVideoPublication = null;
    localShareAudioPublication = null;

    if (!localScreenStream) {
      localLiveShareMode = null;
      emitLocalScreenState();
      await updateScreenShareStatus(false).catch(() => {});
      return;
    }

    localScreenStream.getTracks().forEach((track) => {
      track.onended = null;
      try {
        track.stop();
      } catch {
        // ignore local share cleanup errors
      }
    });
    localScreenStream = null;
    localLiveShareMode = null;

    emitLocalScreenState();
    await updateScreenShareStatus(false).catch(() => {});
  };

  const applyPublishedAudioState = async () => {
    const shouldMuteMicrophone = isSelfMicMuted || (isSelfDeafened && !isDirectCallChannelId(currentChannel));
    const microphoneTrack = micPublication?.track;

    if (microphoneTrack?.mediaStreamTrack) {
      microphoneTrack.mediaStreamTrack.enabled = !shouldMuteMicrophone;
    }

    if (!micPublication) {
      logVoiceDebug("local-audio:state-no-publication", {
        shouldMuteMicrophone,
        isSelfMicMuted,
        isSelfDeafened,
      });
      return;
    }

    try {
      if (shouldMuteMicrophone && !micPublication.isMuted) {
        await micPublication.mute();
      } else if (!shouldMuteMicrophone && micPublication.isMuted) {
        await micPublication.unmute();
      }
      logVoiceDebug("local-audio:state-applied", {
        shouldMuteMicrophone,
        publicationMuted: micPublication.isMuted,
        track: getTrackDebugInfo(micPublication.track || null),
      });
    } catch (error) {
      logVoiceDebug("local-audio:state-failed", {
        shouldMuteMicrophone,
        error: error?.message || String(error),
      });
    }
  };

  const syncPublishedMicrophoneTrack = async () => {
    if (!room || !currentChannel) {
      logVoiceDebug("local-audio:publish-skipped-no-room", {
        hasRoom: Boolean(room),
        currentChannel,
      });
      return;
    }

    logVoiceDebug("local-audio:publish-start", {
      currentChannel,
      roomState: room.state,
      localParticipantIdentity: room.localParticipant?.identity || "",
      existingPublicationSid: micPublication?.trackSid || "",
      isSelfMicMuted,
      isSelfDeafened,
    });

    const micStream = await ensureAudioPipeline();
    const nextTrack = micStream?.getAudioTracks?.()?.[0] || null;
    if (!nextTrack) {
      logVoiceDebug("local-audio:publish-skipped-no-track", {
        streamTracks: micStream?.getTracks?.().map(getTrackDebugInfo) || [],
      });
      return;
    }

    nextTrack.enabled = !(isSelfMicMuted || isSelfDeafened);

    if (micPublication?.track?.replaceTrack) {
      const publishedTrack = await applyRnnoiseToTrack(nextTrack);
      await micPublication.track.replaceTrack(publishedTrack, true);
      await applyPublishedAudioState();
      logVoiceDebug("local-audio:track-replaced", {
        publicationSid: micPublication.trackSid,
        track: getTrackDebugInfo(publishedTrack),
      });
      publishVoiceDebugSnapshot("local-audio:track-replaced:snapshot");
      return;
    }

    const publishedTrack = await applyRnnoiseToTrack(nextTrack);
    micPublication = await room.localParticipant.publishTrack(publishedTrack, {
      source: Track.Source.Microphone,
      name: MICROPHONE_TRACK_NAME,
      ...getMicrophonePublishOptions(noiseSuppressionMode),
    });
    await applyPublishedAudioState();
    logVoiceDebug("local-audio:published", {
      publicationSid: micPublication?.trackSid || "",
      publicationMuted: micPublication?.isMuted,
      track: getTrackDebugInfo(publishedTrack),
    });
    publishVoiceDebugSnapshot("local-audio:published:snapshot");
  };

  const rebuildLocalAudioPipeline = async () => {
    const hadMicTrack = Boolean(localMicSourceStream || localAudioStream);
    await stopRnnoiseNoiseSuppression();
    stopLocalMic();

    if (!hadMicTrack) {
      return null;
    }

    const nextStream = await ensureAudioPipeline();
    const nextTrack = nextStream?.getAudioTracks?.()?.[0] || null;

    if (nextTrack && micPublication?.track?.replaceTrack) {
      const publishedTrack = await applyRnnoiseToTrack(nextTrack);
      await micPublication.track.replaceTrack(publishedTrack, true);
      logVoiceDebug("local-audio:rebuild-replaced-track", {
        track: getTrackDebugInfo(publishedTrack),
      });
    } else if (nextTrack && room && currentChannel) {
      const publishedTrack = await applyRnnoiseToTrack(nextTrack);
      micPublication = await room.localParticipant.publishTrack(publishedTrack, {
        source: Track.Source.Microphone,
        name: MICROPHONE_TRACK_NAME,
        ...getMicrophonePublishOptions(noiseSuppressionMode),
      });
      logVoiceDebug("local-audio:rebuild-published-track", {
        publicationSid: micPublication?.trackSid || "",
        track: getTrackDebugInfo(publishedTrack),
      });
    }

    await applyPublishedAudioState();
    publishVoiceDebugSnapshot("local-audio:rebuild-complete");

    return nextStream;
  };

  const getCachedPrewarmedSession = (channelName, user) => {
    if (!prewarmedSession) {
      return null;
    }

    const isExpired = Date.now() - prewarmedSession.createdAt > PREWARMED_SESSION_TTL_MS;
    const sameChannel = prewarmedSession.channelName === channelName;
    const sameUser = prewarmedSession.userId === String(user?.id || "");
    if (isExpired || !sameChannel || !sameUser) {
      prewarmedSession = null;
      return null;
    }

    const cachedValue = prewarmedSession.value;
    prewarmedSession = null;
    return cachedValue;
  };

  const fetchLiveKitSession = async (channelName, user, { preferPrewarmed = true } = {}) => {
    if (preferPrewarmed) {
      const cachedSession = getCachedPrewarmedSession(channelName, user);
      if (cachedSession) {
        logVoiceDebug("livekit-session:reuse-prewarmed", {
          channelName,
          userId: user?.id || "",
        });
        return cachedSession;
      }
    }

    const response = await authFetch(`${API_BASE_URL}/voice/livekit-session`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        channel: channelName,
        avatar: getAvatar(user),
      }),
    });
    const data = await parseApiResponse(response);

    if (!response.ok || !data?.participantToken || !data?.serverUrl) {
      throw new Error(getApiErrorMessage(response, data, "Failed to create a LiveKit session."));
    }

    return data;
  };

  const prewarmLiveKitSession = async (channelName, user) => {
    if (!channelName || !user?.id) {
      return null;
    }

    const nextSession = await fetchLiveKitSession(channelName, user, { preferPrewarmed: false });
    prewarmedSession = {
      channelName,
      userId: String(user.id || ""),
      createdAt: Date.now(),
      value: nextSession,
    };
    logVoiceDebug("livekit-session:prewarmed", {
      channelName,
      userId: user.id || "",
    });
    return nextSession;
  };

  const bindRoomEvents = (nextRoom) => {
    nextRoom.on(RoomEvent.ActiveSpeakersChanged, (speakers) => {
      roomActiveSpeakerIds.clear();
      speakers.forEach((participant) => {
        if (participant?.identity) {
          roomActiveSpeakerIds.add(String(participant.identity));
        }
      });
      emitSpeakingUsers();
    });

    nextRoom.on(RoomEvent.TrackSubscribed, (track, publication, participant) => {
      if (!participant?.identity) {
        return;
      }

      logVoiceDebug("room:event:track-subscribed", {
        participant: participant.identity,
        source: publication?.source || "",
        kind: track?.kind || "",
        trackSid: publication?.trackSid || "",
        publicationMuted: publication?.isMuted,
        publicationSubscribed: publication?.isSubscribed,
        track: getTrackDebugInfo(track),
      });

      const state = getRemoteParticipantMediaState(String(participant.identity));
      if (publication.source === Track.Source.ScreenShare) {
        state.screenVideoPublication = publication;
      } else if (publication.source === Track.Source.Camera) {
        state.cameraPublication = publication;
      } else if (publication.source === Track.Source.ScreenShareAudio) {
        state.screenAudioPublication = publication;
        attachRemoteAudioTrack(track, publication, participant).catch(() => {});
      } else if (publication.source === Track.Source.Microphone) {
        state.microphonePublication = publication;
        attachRemoteAudioTrack(track, publication, participant).catch(() => {});
      }

      syncRemoteShareForParticipant(participant);
      emitRoomParticipants();
    });

    nextRoom.on(RoomEvent.TrackUnsubscribed, (track, publication, participant) => {
      const userId = String(participant?.identity || "");
      if (!userId) {
        return;
      }

      logVoiceDebug("room:event:track-unsubscribed", {
        participant: userId,
        source: publication?.source || "",
        kind: track?.kind || "",
        trackSid: publication?.trackSid || "",
      });

      const state = getRemoteParticipantMediaState(userId);
      if (publication.source === Track.Source.ScreenShare) {
        state.screenVideoPublication = null;
      } else if (publication.source === Track.Source.Camera) {
        state.cameraPublication = null;
      } else if (publication.source === Track.Source.ScreenShareAudio) {
        state.screenAudioPublication = null;
      } else if (publication.source === Track.Source.Microphone) {
        state.microphonePublication = null;
      }

      removeRemoteAudioElement(`${userId}:${publication.trackSid}`);
      syncRemoteShareForParticipant(participant);
      emitRoomParticipants();
    });

    nextRoom.on(RoomEvent.TrackPublished, (publication, participant) => {
      if (!participant?.identity) {
        return;
      }

      logVoiceDebug("room:event:track-published", {
        participant: participant.identity,
        source: publication?.source || "",
        trackSid: publication?.trackSid || "",
        publicationMuted: publication?.isMuted,
        publicationSubscribed: publication?.isSubscribed,
      });

      const state = getRemoteParticipantMediaState(String(participant.identity));
      if (publication.source === Track.Source.ScreenShare) {
        state.screenVideoPublication = publication;
      } else if (publication.source === Track.Source.Camera) {
        state.cameraPublication = publication;
      } else if (publication.source === Track.Source.ScreenShareAudio) {
        state.screenAudioPublication = publication;
      } else if (publication.source === Track.Source.Microphone) {
        state.microphonePublication = publication;
      }

      if (publication.source === Track.Source.ScreenShare || publication.source === Track.Source.Camera) {
        applyRemotePublicationPreferences(publication, {
          enabled: true,
          subscribed: true,
          quality: publication.source === Track.Source.Camera ? VideoQuality.MEDIUM : VideoQuality.HIGH,
        });
      } else if (
        (publication.source === Track.Source.ScreenShareAudio || publication.source === Track.Source.Microphone)
        && publication?.isManualOperationAllowed?.()
      ) {
        publication.setSubscribed(true);
        publication.setEnabled(true);
      }

      syncRemoteShareForParticipant(participant);
      emitRoomParticipants();
    });

    nextRoom.on(RoomEvent.TrackUnpublished, (publication, participant) => {
      const userId = String(participant?.identity || "");
      if (!userId) {
        return;
      }

      logVoiceDebug("room:event:track-unpublished", {
        participant: userId,
        source: publication?.source || "",
        trackSid: publication?.trackSid || "",
      });

      const state = getRemoteParticipantMediaState(userId);
      if (publication.source === Track.Source.ScreenShare) {
        state.screenVideoPublication = null;
      } else if (publication.source === Track.Source.Camera) {
        state.cameraPublication = null;
      } else if (publication.source === Track.Source.ScreenShareAudio) {
        state.screenAudioPublication = null;
      } else if (publication.source === Track.Source.Microphone) {
        state.microphonePublication = null;
      }

      removeRemoteAudioElement(`${userId}:${publication.trackSid}`);
      syncRemoteShareForParticipant(participant);
      emitRoomParticipants();
    });

    nextRoom.on(RoomEvent.ParticipantConnected, () => {
      logVoiceDebug("room:event:participant-connected");
      emitRoomParticipants();
    });

    if (RoomEvent.ParticipantMetadataChanged) {
      nextRoom.on(RoomEvent.ParticipantMetadataChanged, () => {
        emitRoomParticipants();
      });
    }

    nextRoom.on(RoomEvent.TrackMuted, (publication, participant) => {
      if (publication?.source === Track.Source.ScreenShare || publication?.source === Track.Source.Camera) {
        syncRemoteShareForParticipant(participant);
      }
    });

    nextRoom.on(RoomEvent.TrackUnmuted, (publication, participant) => {
      if (publication?.source === Track.Source.ScreenShare || publication?.source === Track.Source.Camera) {
        syncRemoteShareForParticipant(participant);
      }
    });

    nextRoom.on(RoomEvent.ParticipantDisconnected, (participant) => {
      const userId = String(participant?.identity || "");
      if (!userId) {
        return;
      }

      removeRemoteShare(userId);
      Array.from(remoteAudioElements.keys())
        .filter((key) => key.startsWith(`${userId}:`))
        .forEach(removeRemoteAudioElement);
      remoteParticipantMedia.delete(userId);
      roomActiveSpeakerIds.delete(userId);
      emitSpeakingUsers();
      emitRoomParticipants();
    });

    nextRoom.on(RoomEvent.Connected, () => {
      logVoiceDebug("room:event:connected", {
        roomState: nextRoom.state,
        remoteParticipants: nextRoom.remoteParticipants.size,
      });
      syncAllRemoteShares();
      emitRoomParticipants();
    });

    nextRoom.on(RoomEvent.Reconnected, () => {
      logVoiceDebug("room:event:reconnected", {
        roomState: nextRoom.state,
        remoteParticipants: nextRoom.remoteParticipants.size,
      });
      syncAllRemoteShares();
      emitRoomParticipants();
    });

    nextRoom.on(RoomEvent.Disconnected, async () => {
      logVoiceDebug("room:event:disconnected", {
        intentional: isIntentionalRoomDisconnect,
        currentChannel,
      });
      if (isIntentionalRoomDisconnect) {
        return;
      }

      clearRemoteScreens();
      removeAllRemoteAudioElements();
      remoteParticipantMedia.clear();
      roomActiveSpeakerIds.clear();
      emitSpeakingUsers();
      onRoomParticipantsChanged?.({ channel: "", participants: [] });

      if (signalConnection && signalConnection.state === signalR.HubConnectionState.Connected && currentUser?.id) {
        try {
          await signalConnection.invoke("LeaveChannel", String(currentUser.id));
        } catch {
          // ignore control-plane cleanup failures after room disconnect
        }
      }

      currentChannel = null;
      onChannelChanged?.(null);
    });
  };

  const ensureRoomConnection = async (channelName, user, existingParticipants = []) => {
    if (room && currentChannel === channelName) {
      return room;
    }

    if (roomConnectPromise) {
      return roomConnectPromise;
    }

    roomConnectPromise = (async () => {
      if (room) {
        await stopRoom({ preserveChannel: true });
      }

      const session = await fetchLiveKitSession(channelName, user);
      let nextRoom = null;
      try {
        nextRoom = new Room({
          adaptiveStream: true,
          dynacast: true,
          disconnectOnPageLeave: false,
          stopLocalTrackOnUnpublish: false,
        });
        bindRoomEvents(nextRoom);

        nextRoom.prepareConnection(session.serverUrl, session.participantToken);
        await nextRoom.connect(session.serverUrl, session.participantToken, {
          autoSubscribe: true,
          rtcConfig: RTC_CONFIGURATION,
        });
        logVoiceDebug("room:connect-ok", {
          serverUrl: session.serverUrl,
          roomName: session.roomName || channelName,
          remoteParticipants: nextRoom.remoteParticipants.size,
          roomState: nextRoom.state,
        });

        await nextRoom.startAudio()
          .then(() => {
            logVoiceDebug("room:start-audio-ok", {
              roomState: nextRoom.state,
            });
          })
          .catch((error) => {
            logVoiceDebug("room:start-audio-failed", {
              errorName: error?.name || "",
              error: error?.message || String(error),
            });
          });

        room = nextRoom;
        currentChannel = channelName;
        emitRoomParticipants();
        void syncPublishedMicrophoneTrack().catch((error) => {
          logVoiceDebug("local-audio:publish-after-connect-failed", {
            errorName: error?.name || "",
            error: error?.message || String(error),
          });
        });
        Array.from(nextRoom.remoteParticipants.values()).forEach((participant) => {
          attachExistingRemoteAudioTracks(participant);
        });
        syncAllRemoteShares();
        emitRoomParticipants();

        return nextRoom;
      } catch (error) {
        if (room === nextRoom) {
          room = null;
        }
        if (currentChannel === channelName) {
          currentChannel = null;
          onRoomParticipantsChanged?.({ channel: "", participants: [] });
        }
        await nextRoom?.disconnect?.().catch(() => {});
        throw error;
      }
    })();

    try {
      return await roomConnectPromise;
    } finally {
      roomConnectPromise = null;
    }
  };

  const bindSignalConnectionEvents = (connection) => {
    connection.on("voice:update", (data) => {
      emitParticipants(data);
    });

    connection.on("voice:self-state", (payload) => {
      onSelfVoiceStateChanged?.({
        userId: payload?.userId || payload?.UserId || "",
        isMicMuted: Boolean(payload?.isMicMuted ?? payload?.IsMicMuted),
        isDeafened: Boolean(payload?.isDeafened ?? payload?.IsDeafened),
        isMicForced: Boolean(payload?.isMicForced ?? payload?.IsMicForced),
        isDeafenedForced: Boolean(payload?.isDeafenedForced ?? payload?.IsDeafenedForced),
      });
    });

    connection.on("voice:direct-call-incoming", (payload) => {
      onIncomingDirectCall?.({
        channelName: payload?.channelName || payload?.ChannelName || "",
        fromUserId: payload?.fromUserId || payload?.FromUserId || "",
        fromName: payload?.fromName || payload?.FromName || "",
        fromAvatar: payload?.fromAvatar || payload?.FromAvatar || "",
        reason: payload?.reason || payload?.Reason || "",
      });
    });

    connection.on("voice:direct-call-accepted", (payload) => {
      onDirectCallAccepted?.({
        channelName: payload?.channelName || payload?.ChannelName || "",
        fromUserId: payload?.fromUserId || payload?.FromUserId || "",
        fromName: payload?.fromName || payload?.FromName || "",
        fromAvatar: payload?.fromAvatar || payload?.FromAvatar || "",
      });
    });

    connection.on("voice:direct-call-declined", (payload) => {
      onDirectCallDeclined?.({
        channelName: payload?.channelName || payload?.ChannelName || "",
        fromUserId: payload?.fromUserId || payload?.FromUserId || "",
        fromName: payload?.fromName || payload?.FromName || "",
        reason: payload?.reason || payload?.Reason || "",
      });
    });

    connection.on("voice:direct-call-ended", (payload) => {
      onDirectCallEnded?.({
        channelName: payload?.channelName || payload?.ChannelName || "",
        fromUserId: payload?.fromUserId || payload?.FromUserId || "",
        fromName: payload?.fromName || payload?.FromName || "",
      });
    });

    connection.onreconnected(async () => {
      if (!currentUser) {
        return;
      }

      await registerCurrentUser(currentUser);

      if (currentChannel && connection.state === signalR.HubConnectionState.Connected) {
        await connection.invoke(
          "JoinChannel",
          currentChannel,
          String(currentUser.id),
          getDisplayName(currentUser),
          getAvatar(currentUser)
        );
      }

      if (localScreenStream && currentUser?.id) {
        await updateScreenShareStatus(true).catch(() => {});
      }
    });

    connection.onclose(() => {
      signalConnectPromise = null;
    });
  };

  const createSignalConnection = () => {
    const connection = new signalR.HubConnectionBuilder()
      .withUrl(VOICE_HUB_URL, {
        accessTokenFactory: () => getStoredToken(),
      })
      .configureLogging(signalR.LogLevel.Error)
      .withAutomaticReconnect([0, 1000, 3000, 5000])
      .build();

    bindSignalConnectionEvents(connection);
    return connection;
  };

  const stopSignalConnection = async (connection = signalConnection) => {
    if (!connection) {
      return;
    }

    if (signalConnection === connection) {
      signalConnection = null;
      signalConnectPromise = null;
    }

    try {
      if (connection.state !== signalR.HubConnectionState.Disconnected) {
        await connection.stop();
      }
    } catch {
      // ignore connection stop errors while rebuilding the socket
    }
  };

  const waitForSignalConnectionToSettle = async (timeoutMs = 5_000) => {
    const startedAt = Date.now();

    while (
      signalConnection
      && (signalConnection.state === signalR.HubConnectionState.Connecting
        || signalConnection.state === signalR.HubConnectionState.Reconnecting)
    ) {
      if (Date.now() - startedAt >= timeoutMs) {
        break;
      }

      await new Promise((resolve) => setTimeout(resolve, 160));
    }

    return signalConnection?.state === signalR.HubConnectionState.Connected;
  };

  const startSignalConnection = async ({ allowRetry = true } = {}) => {
    if (!signalConnection) {
      signalConnection = createSignalConnection();
    }

    const connection = signalConnection;

    try {
      await connection.start();
    } catch (error) {
      if (isUnauthorizedError(error)) {
        notifyUnauthorizedSession("voice_signalr_401");
        throw new Error("Session expired. Sign in again.");
      }

      logVoiceDebug("signal:start-failed", {
        state: connection.state,
        allowRetry,
        errorName: error?.name || "",
        error: error?.message || String(error),
      });

      await stopSignalConnection(connection);

      if (allowRetry) {
        signalConnection = createSignalConnection();
        return startSignalConnection({ allowRetry: false });
      }

      throw new Error(error?.message || "Не удалось установить сигнальное соединение.");
    }
  };

  const ensureSignalConnection = async (user) => {
    currentUser = user;

    if (!getStoredToken()) {
      throw new Error("Session is missing. Sign in again.");
    }

    if (!signalConnection) {
      signalConnection = createSignalConnection();
    }

    if (
      signalConnection.state === signalR.HubConnectionState.Connecting
      || signalConnection.state === signalR.HubConnectionState.Reconnecting
    ) {
      const didRecover = await waitForSignalConnectionToSettle();

      if (!didRecover && signalConnection && signalConnection.state !== signalR.HubConnectionState.Connected) {
        await stopSignalConnection(signalConnection);
        signalConnection = createSignalConnection();
      }
    }

    if (signalConnection.state !== signalR.HubConnectionState.Connected) {
      if (!signalConnectPromise) {
        signalConnectPromise = (async () => {
          try {
            await startSignalConnection({ allowRetry: true });
          } finally {
            signalConnectPromise = null;
          }
        })();
      }

      await signalConnectPromise;
    }

    await registerCurrentUser(user);
    await emitAudioDevices().catch(() => {});
  };

  return {
    async connect(user) {
      await ensureSignalConnection(user);
    },

    async prewarmChannel(channelName, user) {
      await ensureSignalConnection(user);
      await Promise.allSettled([
        prewarmLiveKitSession(channelName, user),
        ensureAudioPipeline(),
      ]);
    },

    async joinChannel(channelName, user) {
      logVoiceDebug("join:start", {
        channelName,
        userId: user?.id || "",
        hasExistingRoom: Boolean(room),
        currentChannel,
      });
      await ensureSignalConnection(user);

      if (currentChannel === channelName && room) {
        publishVoiceDebugSnapshot("join:already-connected");
        return;
      }

      if (currentChannel && currentChannel !== channelName) {
        await this.leaveChannel();
      }

      const joinResponse = await signalConnection.invoke(
        "JoinChannel",
        channelName,
        String(user.id),
        getDisplayName(user),
        getAvatar(user)
      );

      try {
        await ensureRoomConnection(channelName, user, Array.isArray(joinResponse?.participants) ? joinResponse.participants : []);
        currentChannel = channelName;
        onChannelChanged?.(channelName);
        publishVoiceDebugSnapshot("join:success");
      } catch (error) {
        logVoiceDebug("join:failed", {
          channelName,
          error: error?.message || String(error),
        });
        try {
          await signalConnection.invoke("LeaveChannel", String(user.id));
        } catch {
          // ignore control-plane cleanup failures after failed room connect
        }

        currentChannel = null;
        onChannelChanged?.(null);
        throw error;
      }
    },

    async leaveChannel() {
      await stopScreenShareInternal();
      await stopRoom({ preserveChannel: true });

      if (signalConnection && signalConnection.state === signalR.HubConnectionState.Connected && currentUser?.id) {
        await signalConnection.invoke("LeaveChannel", String(currentUser.id));
      }

      currentChannel = null;
      onChannelChanged?.(null);
    },

    async startDirectCall(targetUserId, channelName, user) {
      await ensureSignalConnection(user);
      await signalConnection.invoke(
        "StartDirectCall",
        String(targetUserId || ""),
        channelName,
        getAvatar(user)
      );
    },

    async acceptDirectCall(targetUserId, channelName, user) {
      await ensureSignalConnection(user);
      await signalConnection.invoke(
        "AcceptDirectCall",
        String(targetUserId || ""),
        channelName,
        getAvatar(user)
      );
    },

    async declineDirectCall(targetUserId, channelName, reason = "declined", user = currentUser) {
      await ensureSignalConnection(user);
      await signalConnection.invoke(
        "DeclineDirectCall",
        String(targetUserId || ""),
        channelName,
        reason
      );
    },

    async endDirectCall(targetUserId, channelName, user = currentUser) {
      await ensureSignalConnection(user);
      await signalConnection.invoke(
        "EndDirectCall",
        String(targetUserId || ""),
        channelName
      );
    },

    async startScreenShare({ resolution = "1080p", fps = 60, shareAudio = false } = {}) {
      if (!currentChannel || !room) {
        throw new Error("Join a voice channel first.");
      }

      const displayCaptureSupport = getDisplayCaptureSupportInfo();
      if (!displayCaptureSupport.supported) {
        throw new Error(displayCaptureSupport.subtitle || "Screen capture is not supported on this device.");
      }

      if (localScreenStream) {
        await stopScreenShareInternal();
      }

      try {
        localScreenStream =
          (await getElectronDisplayStream(resolution, fps, shareAudio)) ||
          (await tuneDisplayStream(
            await navigator.mediaDevices.getDisplayMedia({
              video: getResolutionConstraints(resolution, fps),
              audio: shareAudio,
            }),
            resolution,
            fps
          ));
      } catch (error) {
        if (!shareAudio) {
          throw error;
        }

        localScreenStream =
          (await getElectronDisplayStream(resolution, fps, false)) ||
          (await tuneDisplayStream(
            await navigator.mediaDevices.getDisplayMedia({
              video: getResolutionConstraints(resolution, fps),
              audio: false,
            }),
            resolution,
            fps
          ));
      }

      const [videoTrack] = localScreenStream.getVideoTracks();
      if (!videoTrack) {
        throw new Error("Display capture did not return a video track.");
      }

      videoTrack.contentHint = "detail";
      videoTrack.onended = () => {
        stopScreenShareInternal().catch((error) => console.error("Failed to stop screen share:", error));
      };

      const screenSharePublishOptions = getScreenSharePublishOptions(resolution, fps);
      localShareVideoPublication = await room.localParticipant.publishTrack(videoTrack, {
        source: Track.Source.ScreenShare,
        name: SCREEN_VIDEO_TRACK_NAME,
        ...screenSharePublishOptions,
      });

      const [audioTrack] = localScreenStream.getAudioTracks();
      if (audioTrack) {
        audioTrack.contentHint = "music";
        localShareAudioPublication = await room.localParticipant.publishTrack(audioTrack, {
          source: Track.Source.ScreenShareAudio,
          name: SCREEN_AUDIO_TRACK_NAME,
          ...getScreenShareAudioPublishOptions(),
        });
      }

      localLiveShareMode = "screen";
      emitLocalScreenState();
      await updateScreenShareStatus(true);
    },

    async startCameraShare({ deviceId = "", resolution = "720p", fps = 30 } = {}) {
      if (!currentChannel || !room) {
        throw new Error("Join a voice channel first.");
      }

      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error("Camera access is not available.");
      }

      if (localScreenStream) {
        if (localLiveShareMode === "camera") {
          return;
        }

        await stopScreenShareInternal();
      }

      localScreenStream = await navigator.mediaDevices.getUserMedia({
        video: getCameraConstraints(deviceId, resolution, fps),
        audio: false,
      });

      const [cameraTrack] = localScreenStream.getVideoTracks();
      if (!cameraTrack) {
        throw new Error("Camera access did not return a video track.");
      }

      cameraTrack.contentHint = "motion";
      cameraTrack.onended = () => {
        stopScreenShareInternal().catch((error) => console.error("Failed to stop camera share:", error));
      };

      const cameraPublishOptions = getCameraPublishOptions(resolution, fps);
      localShareVideoPublication = await room.localParticipant.publishTrack(cameraTrack, {
        source: Track.Source.Camera,
        name: CAMERA_TRACK_NAME,
        ...cameraPublishOptions,
      });

      localLiveShareMode = "camera";
      emitLocalScreenState();
      await updateScreenShareStatus(true);
    },

    async stopScreenShare() {
      await stopScreenShareInternal();
    },

    async requestScreenShare(targetUserId) {
      if (!targetUserId || !room) {
        return;
      }

      const participant = room.remoteParticipants.get(String(targetUserId));
      if (participant) {
        syncRemoteShareForParticipant(participant);
      }
    },

    setFocusedRemoteShareUser(targetUserId) {
      preferredRemoteShareUserId = String(targetUserId || "").trim();
      applyRemoteSharePreferences();
      if (room) {
        syncAllRemoteShares();
      }
    },

    setMicrophoneVolume(value) {
      micVolume = clampDeviceVolumePercent(value) / 100;
      if (gainNode) {
        gainNode.gain.value = micVolume;
      }
      logVoiceDebug("local-audio:volume-set", { value, micVolume });
    },

    setRemoteVolume(value) {
      remoteVolume = clampDeviceVolumePercent(value) / 100;
      for (const [key, element] of remoteAudioElements.entries()) {
        applyRemoteAudioVolume(element, key);
      }
      logVoiceDebug("remote-audio:volume-set", {
        value,
        remoteVolume,
        elements: remoteAudioElements.size,
      });
    },

    async getAudioDevices({ ensurePermission = false } = {}) {
      if (ensurePermission && navigator.mediaDevices?.getUserMedia) {
        try {
          const previewStream = await navigator.mediaDevices.getUserMedia({
            audio: getMicConstraints(),
          });
          previewStream.getTracks().forEach((track) => track.stop());
        } catch {
          // ignore device permission failures
        }
      }

      return emitAudioDevices();
    },

    async setInputDevice(deviceId) {
      selectedInputDeviceId = deviceId || "";
      await emitAudioDevices().catch(() => {});

      if (localMicSourceStream || localAudioStream) {
        await rebuildLocalAudioPipeline();
      }
    },

    async setOutputDevice(deviceId) {
      selectedOutputDeviceId = deviceId || "";
      await emitAudioDevices().catch(() => {});

      await Promise.all(Array.from(remoteAudioElements.values()).map((element) => applyOutputDeviceToElement(element)));
    },

    async ensureMicrophonePreview() {
      await ensureAudioPipeline();
      await emitAudioDevices().catch(() => {});
    },

    async releaseMicrophonePreview() {
      if (!currentChannel) {
        stopLocalMic();
      }
    },

    async setNoiseSuppressionMode(mode) {
      const nextMode = normalizeNoiseSuppressionMode(mode);

      if (noiseSuppressionMode === nextMode) {
        return;
      }

      noiseSuppressionMode = nextMode;
      await rebuildLocalAudioPipeline();
    },

    async setEchoCancellationEnabled(enabled) {
      const nextEnabled = Boolean(enabled);
      if (echoCancellationEnabled === nextEnabled) {
        return;
      }

      echoCancellationEnabled = nextEnabled;
      await rebuildLocalAudioPipeline();
    },

    async updateSelfVoiceState({ isMicMuted = false, isDeafened = false } = {}) {
      isSelfMicMuted = Boolean(isMicMuted);
      isSelfDeafened = Boolean(isDeafened);
      logVoiceDebug("local-audio:self-state-update", {
        isSelfMicMuted,
        isSelfDeafened,
      });
      await applyPublishedAudioState();

      if (!signalConnection || signalConnection.state !== signalR.HubConnectionState.Connected || !currentUser?.id) {
        return;
      }

      await signalConnection.invoke("UpdateVoiceState", String(currentUser.id), Boolean(isMicMuted), Boolean(isDeafened));
    },

    async updateParticipantVoiceState(targetUserId, { isMicMuted = false, isDeafened = false } = {}) {
      if (!targetUserId || !signalConnection || signalConnection.state !== signalR.HubConnectionState.Connected) {
        return;
      }

      await signalConnection.invoke("UpdateVoiceState", String(targetUserId), Boolean(isMicMuted), Boolean(isDeafened));
    },

    async disconnect() {
      await stopScreenShareInternal();
      await stopRoom({ preserveChannel: true });
      stopLocalMic();
      currentChannel = null;
      onChannelChanged?.(null);

      await stopSignalConnection();

      if (hasDeviceChangeListener && navigator.mediaDevices?.removeEventListener) {
        navigator.mediaDevices.removeEventListener("devicechange", handleDeviceChange);
        hasDeviceChangeListener = false;
      }
    },
  };
}
