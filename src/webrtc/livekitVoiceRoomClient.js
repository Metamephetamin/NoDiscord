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
  NOISE_SUPPRESSION_MODE_AI,
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
const DEFAULT_CHANNEL_AUDIO_BITRATE_KBPS = 64;
const MIN_CHANNEL_AUDIO_BITRATE_KBPS = 8;
const MAX_CHANNEL_AUDIO_BITRATE_KBPS = 96;
const CHANNEL_VIDEO_QUALITY_VALUES = new Set(["auto", "720p", "1080p", "1440p"]);
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

function normalizeChannelAudioBitrateKbps(value = DEFAULT_CHANNEL_AUDIO_BITRATE_KBPS) {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) {
    return DEFAULT_CHANNEL_AUDIO_BITRATE_KBPS;
  }

  return Math.min(MAX_CHANNEL_AUDIO_BITRATE_KBPS, Math.max(MIN_CHANNEL_AUDIO_BITRATE_KBPS, Math.round(numericValue)));
}

function normalizeChannelVideoQuality(value = "auto") {
  const normalizedValue = String(value || "auto");
  return CHANNEL_VIDEO_QUALITY_VALUES.has(normalizedValue) ? normalizedValue : "auto";
}

function normalizeNoiseSuppressionStrength(value = 100) {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) {
    return 100;
  }

  return Math.max(0, Math.min(100, Math.round(numericValue)));
}

function createChannelAudioPreset(basePreset, bitrateKbps = DEFAULT_CHANNEL_AUDIO_BITRATE_KBPS) {
  return {
    ...basePreset,
    maxBitrate: normalizeChannelAudioBitrateKbps(bitrateKbps) * 1000,
  };
}

function getMicrophonePublishOptions(
  mode = NOISE_SUPPRESSION_MODE_TRANSPARENT,
  { echoCancellation = true, audioBitrateKbps = DEFAULT_CHANNEL_AUDIO_BITRATE_KBPS } = {}
) {
  const useSpeechPreset =
    echoCancellation || mode === NOISE_SUPPRESSION_MODE_AI || mode === NOISE_SUPPRESSION_MODE_HARD_GATE;
  const basePreset = useSpeechPreset ? VOICE_ISOLATION_MIC_AUDIO_PRESET : HIGH_QUALITY_MIC_AUDIO_PRESET;

  return {
    audioPreset: createChannelAudioPreset(basePreset, audioBitrateKbps),
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

  if (mode === NOISE_SUPPRESSION_MODE_AI) {
    return NOISE_SUPPRESSION_MODE_AI;
  }

  if (mode === LEGACY_NOISE_SUPPRESSION_MODE_VOICE_ISOLATION) {
    return NOISE_SUPPRESSION_MODE_HARD_GATE;
  }

  if (mode === LEGACY_NOISE_SUPPRESSION_MODE_RNNOISE || mode === LEGACY_NOISE_SUPPRESSION_MODE_KRISP) {
    return NOISE_SUPPRESSION_MODE_AI;
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

async function loadNoiseSuppressionProcessor(rnnoiseModulePromiseRef) {
  if (!rnnoiseModulePromiseRef.current) {
    rnnoiseModulePromiseRef.current = import("@shiguredo/noise-suppression")
      .then((module) => module?.NoiseSuppressionProcessor || null)
      .catch((error) => {
        rnnoiseModulePromiseRef.current = null;
        throw error;
      });
  }

  return rnnoiseModulePromiseRef.current;
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
  onVoicePingChanged,
  onIncomingDirectCall,
  onDirectCallAccepted,
  onDirectCallDeclined,
  onDirectCallEnded,
} = {}) {
  let signalConnection = null;
  let signalConnectPromise = null;
  let room = null;
  let roomConnectPromise = null;
  let roomConnectChannelName = "";
  let currentUser = null;
  let currentChannel = null;
  let localMicSourceStream = null;
  let localAudioProcessingStream = null;
  let localAudioStream = null;
  let localAudioPipelinePromise = null;
  let audioContext = null;
  let gainNode = null;
  let destinationNode = null;
  let localOutputAnalyser = null;
  let microphoneMonitorGainNode = null;
  let microphoneMonitorDestinationNode = null;
  let microphoneMonitorAudioElement = null;
  let microphoneMonitorActive = false;
  let localNoiseGateAnalyser = null;
  let localNoiseGateNode = null;
  let localNoiseGateMeter = null;
  let localNoiseGateState = null;
  let localVoiceDynamicsState = null;
  let localSpeakingMeter = null;
  let micVolume = 0.7;
  let remoteVolume = 0.7;
  let noiseSuppressionMode = NOISE_SUPPRESSION_MODE_TRANSPARENT;
  let noiseSuppressionStrength = 100;
  let echoCancellationEnabled = true;
  const rnnoiseModulePromiseRef = { current: null };
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
  let localShareOperationPromise = null;
  let localShareOperationKey = "";
  let isIntentionalRoomDisconnect = false;
  let isSelfMicMuted = false;
  let isSelfDeafened = false;
  let preferredRemoteShareUserId = "";
  let prewarmedSession = null;
  let voicePingPollIntervalId = 0;
  let voicePingPollInFlight = false;
  let lastVoicePingMs = null;
  let lastVoiceRouteSnapshot = null;
  let lastVoiceRouteSignature = "";
  let currentLiveKitServerUrl = "";
  let currentLiveKitRoomName = "";
  let currentVoiceChannelSettings = {
    audioBitrateKbps: DEFAULT_CHANNEL_AUDIO_BITRATE_KBPS,
    videoQuality: "auto",
  };

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
    liveKit: {
      serverUrl: currentLiveKitServerUrl,
      roomName: currentLiveKitRoomName,
    },
    voiceRoute: lastVoiceRouteSnapshot,
    localParticipant: {
      identity: room?.localParticipant?.identity || "",
      sid: room?.localParticipant?.sid || "",
    },
    localMic: {
      sourceTracks: localMicSourceStream?.getAudioTracks?.().map(getTrackDebugInfo) || [],
      processingTracks: localAudioProcessingStream?.getAudioTracks?.().map(getTrackDebugInfo) || [],
      outputTracks: localAudioStream?.getAudioTracks?.().map(getTrackDebugInfo) || [],
      audioContextState: audioContext?.state || "",
      rnnoiseActive: Boolean(rnnoiseProcessor?.isProcessing?.()),
      rnnoiseTrack: getTrackDebugInfo(rnnoiseProcessedTrack || null),
      micVolume,
      noiseSuppressionMode,
      noiseSuppressionStrength,
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
  const emitVoicePing = (nextPingMs) => {
    const normalizedPing =
      Number.isFinite(Number(nextPingMs)) && Number(nextPingMs) > 0
        ? Math.max(1, Math.round(Number(nextPingMs)))
        : null;

    if (lastVoicePingMs === normalizedPing) {
      return;
    }

    lastVoicePingMs = normalizedPing;
    onVoicePingChanged?.(normalizedPing);
  };
  const clearVoicePingPolling = ({ reset = true } = {}) => {
    if (voicePingPollIntervalId) {
      window.clearInterval(voicePingPollIntervalId);
      voicePingPollIntervalId = 0;
    }

    voicePingPollInFlight = false;
    if (reset) {
      emitVoicePing(null);
      emitVoiceRoute(null);
    }
  };
  const normalizeCandidateStats = (candidate) => {
    if (!candidate) {
      return null;
    }

    return {
      id: candidate.id || "",
      candidateType: candidate.candidateType || "",
      protocol: candidate.protocol || "",
      address: candidate.address || candidate.ip || "",
      port: candidate.port || "",
      networkType: candidate.networkType || "",
      relayProtocol: candidate.relayProtocol || "",
      url: candidate.url || "",
    };
  };
  const getCandidateAddress = (candidate) => {
    if (!candidate?.address) {
      return "";
    }

    return candidate.port ? `${candidate.address}:${candidate.port}` : candidate.address;
  };
  const getRouteType = (localCandidate, remoteCandidate) => {
    const localType = String(localCandidate?.candidateType || "").toLowerCase();
    const remoteType = String(remoteCandidate?.candidateType || "").toLowerCase();
    if (localType === "relay" || remoteType === "relay") {
      return "relay";
    }

    if (localType || remoteType) {
      return "direct";
    }

    return "unknown";
  };
  const emitVoiceRoute = (routeSnapshot) => {
    const normalizedSnapshot = routeSnapshot || null;
    const signature = JSON.stringify(normalizedSnapshot);
    if (signature === lastVoiceRouteSignature) {
      return;
    }

    lastVoiceRouteSignature = signature;
    lastVoiceRouteSnapshot = normalizedSnapshot;
    if (typeof window !== "undefined") {
      window.__ndVoiceRoute = normalizedSnapshot;
      window.__ndVoiceRouteDump = () => {
        console.info(`${VOICE_DEBUG_PREFIX} route`, window.__ndVoiceRoute || null);
        return window.__ndVoiceRoute || null;
      };
    }
  };
  const readTransportRoute = async (transport, label) => {
    if (!transport?.getStats) {
      return null;
    }

    const stats = await transport.getStats();
    let selectedCandidatePairId = "";
    let selectedCandidatePair = null;
    const candidatePairs = new Map();
    const localCandidates = new Map();
    const remoteCandidates = new Map();

    stats?.forEach((stat) => {
      if (stat?.type === "transport" && stat.selectedCandidatePairId) {
        selectedCandidatePairId = stat.selectedCandidatePairId;
      }

      if (stat?.type === "candidate-pair") {
        candidatePairs.set(stat.id, stat);
      } else if (stat?.type === "local-candidate") {
        localCandidates.set(stat.id, stat);
      } else if (stat?.type === "remote-candidate") {
        remoteCandidates.set(stat.id, stat);
      }
    });

    selectedCandidatePair =
      (selectedCandidatePairId && candidatePairs.get(selectedCandidatePairId))
      || Array.from(candidatePairs.values()).find((candidatePair) => candidatePair.selected)
      || Array.from(candidatePairs.values()).find((candidatePair) => candidatePair.nominated)
      || null;

    if (!selectedCandidatePair) {
      return null;
    }

    const localCandidate = normalizeCandidateStats(localCandidates.get(selectedCandidatePair.localCandidateId));
    const remoteCandidate = normalizeCandidateStats(remoteCandidates.get(selectedCandidatePair.remoteCandidateId));
    const rttMs =
      Number.isFinite(Number(selectedCandidatePair.currentRoundTripTime)) && Number(selectedCandidatePair.currentRoundTripTime) > 0
        ? Math.max(1, Math.round(Number(selectedCandidatePair.currentRoundTripTime) * 1000))
        : null;

    return {
      label,
      routeType: getRouteType(localCandidate, remoteCandidate),
      rttMs,
      candidatePairId: selectedCandidatePair.id || "",
      state: selectedCandidatePair.state || "",
      selected: Boolean(selectedCandidatePair.selected),
      nominated: Boolean(selectedCandidatePair.nominated),
      protocol: localCandidate?.protocol || remoteCandidate?.protocol || "",
      localCandidate,
      remoteCandidate,
      localAddress: getCandidateAddress(localCandidate),
      remoteAddress: getCandidateAddress(remoteCandidate),
      availableOutgoingBitrate: Number.isFinite(Number(selectedCandidatePair.availableOutgoingBitrate))
        ? Math.round(Number(selectedCandidatePair.availableOutgoingBitrate))
        : null,
      bytesSent: Number.isFinite(Number(selectedCandidatePair.bytesSent)) ? Math.round(Number(selectedCandidatePair.bytesSent)) : null,
      bytesReceived: Number.isFinite(Number(selectedCandidatePair.bytesReceived)) ? Math.round(Number(selectedCandidatePair.bytesReceived)) : null,
    };
  };
  const sampleVoicePing = async () => {
    if (voicePingPollInFlight || !room?.engine?.pcManager) {
      return;
    }

    voicePingPollInFlight = true;
    try {
      const publisherTransport = room.engine.pcManager.publisher;
      const subscriberTransport = room.engine.pcManager.subscriber;
      const [publisherRoute, subscriberRoute] = await Promise.all([
        readTransportRoute(publisherTransport, "publisher").catch(() => null),
        readTransportRoute(subscriberTransport, "subscriber").catch(() => null),
      ]);

      const routes = [publisherRoute, subscriberRoute].filter(Boolean);
      const samples = routes.map((route) => route.rttMs).filter((value) => Number.isFinite(Number(value)) && Number(value) > 0);
      emitVoiceRoute({
        routeType: routes.some((route) => route.routeType === "relay")
          ? "relay"
          : routes.some((route) => route.routeType === "direct")
            ? "direct"
            : "unknown",
        rttMs: samples.length ? Math.max(...samples) : null,
        serverUrl: currentLiveKitServerUrl,
        roomName: currentLiveKitRoomName,
        sampledAt: new Date().toISOString(),
        transports: routes,
      });
      emitVoicePing(samples.length ? Math.max(...samples) : null);
    } finally {
      voicePingPollInFlight = false;
    }
  };
  const startVoicePingPolling = () => {
    clearVoicePingPolling({ reset: false });
    void sampleVoicePing().catch(() => {});
    voicePingPollIntervalId = window.setInterval(() => {
      void sampleVoicePing().catch(() => {});
    }, 5000);
  };
  const createRoomInstance = () => new Room({
    adaptiveStream: true,
    dynacast: true,
    disconnectOnPageLeave: false,
    stopLocalTrackOnUnpublish: false,
  });
  const prepareLiveKitConnection = (session) => {
    if (!session?.serverUrl || !session?.participantToken) {
      return;
    }

    try {
      const preparedRoom = createRoomInstance();
      preparedRoom.prepareConnection(session.serverUrl, session.participantToken);
    } catch (error) {
      logVoiceDebug("livekit-session:prepare-failed", {
        errorName: error?.name || "",
        error: error?.message || String(error),
      });
    }
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

  const getSupportedMediaConstraints = () => {
    try {
      return navigator.mediaDevices?.getSupportedConstraints?.() || {};
    } catch {
      return {};
    }
  };

  const buildPreferredSampleSizeConstraints = (relaxed = false) => {
    if (relaxed) {
      return {};
    }

    const advanced = [
      { sampleSize: MAX_PREFERRED_AUDIO_SAMPLE_SIZE },
      { sampleSize: PREFERRED_AUDIO_SAMPLE_SIZE },
      { sampleSize: 16 },
    ];

    if (echoCancellationEnabled) {
      advanced.unshift(
        {
          echoCancellation: true,
          googEchoCancellation: true,
          googEchoCancellation2: true,
          googDAEchoCancellation: true,
          googExperimentalEchoCancellation: true,
          googEchoCancellation3: true,
        },
        {
          autoGainControl: false,
          googAutoGainControl: false,
          googExperimentalAutoGainControl: false,
        }
      );
    }

    return {
      sampleSize: { ideal: PREFERRED_AUDIO_SAMPLE_SIZE },
      advanced,
    };
  };

  const usesModelNoiseSuppression = (mode = noiseSuppressionMode) => (
    mode === NOISE_SUPPRESSION_MODE_AI || mode === NOISE_SUPPRESSION_MODE_HARD_GATE
  );

  const buildMicConstraints = ({ deviceId = selectedInputDeviceId, relaxed = false } = {}) => ({
    deviceId:
      deviceId && deviceId !== "default"
        ? { exact: deviceId }
        : undefined,
    echoCancellation: echoCancellationEnabled ? { ideal: true } : false,
    ...(echoCancellationEnabled && getSupportedMediaConstraints().echoCancellationType
      ? { echoCancellationType: { ideal: "system" } }
      : {}),
    noiseSuppression: usesModelNoiseSuppression() ? false : true,
    autoGainControl: false,
    voiceIsolation: undefined,
    googEchoCancellation: echoCancellationEnabled,
    googEchoCancellation2: echoCancellationEnabled,
    googDAEchoCancellation: echoCancellationEnabled,
    googExperimentalEchoCancellation: echoCancellationEnabled,
    googEchoCancellation3: echoCancellationEnabled,
    googAutoGainControl: false,
    googExperimentalAutoGainControl: false,
    googNoiseSuppression: usesModelNoiseSuppression() ? false : true,
    googNoiseSuppression2: usesModelNoiseSuppression() ? false : true,
    googHighpassFilter: usesModelNoiseSuppression() ? false : true,
    googTypingNoiseDetection: true,
    channelCount: relaxed ? undefined : 1,
    sampleRate: relaxed ? undefined : AUDIO_SAMPLE_RATE,
    latency: relaxed ? undefined : 0.01,
    ...buildPreferredSampleSizeConstraints(relaxed),
  });

  const getMicConstraints = () => buildMicConstraints();

  const getRelaxedMicConstraints = () => buildMicConstraints({ relaxed: true, deviceId: "" });

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

  const createNoiseSuppressedInputTrack = async (track) => {
    await stopRnnoiseNoiseSuppression();

    if (!track) {
      return track;
    }

    if (noiseSuppressionMode !== NOISE_SUPPRESSION_MODE_AI && noiseSuppressionMode !== NOISE_SUPPRESSION_MODE_HARD_GATE) {
      return track;
    }

    try {
      const NoiseSuppressionProcessor = await loadNoiseSuppressionProcessor(rnnoiseModulePromiseRef);
      if (!NoiseSuppressionProcessor?.isSupported?.()) {
        logVoiceDebug("local-audio:rnnoise-unsupported", {
          track: getTrackDebugInfo(track),
        });
        return track;
      }

      rnnoiseProcessor = new NoiseSuppressionProcessor();
      rnnoiseProcessedTrack = await rnnoiseProcessor.startProcessing(track);

      if (rnnoiseProcessedTrack) {
        rnnoiseProcessedTrack.contentHint = "speech";
      }

      logVoiceDebug("local-audio:rnnoise-started", {
        originalTrack: getTrackDebugInfo(track),
        processedTrack: getTrackDebugInfo(rnnoiseProcessedTrack || null),
      });

      return rnnoiseProcessedTrack || track;
    } catch (error) {
      logVoiceDebug("local-audio:rnnoise-start-failed", {
        errorName: error?.name || "",
        error: error?.message || String(error),
        track: getTrackDebugInfo(track),
      });
      await stopRnnoiseNoiseSuppression();
      return track;
    }
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

  const dbToLinearGain = (dbValue) => Math.pow(10, Number(dbValue || 0) / 20);

  const readAnalyserRms = (analyser, data) => {
    if (!analyser || !data) {
      return 0;
    }

    analyser.getByteTimeDomainData(data);
    let sumSquares = 0;
    for (const value of data) {
      const centered = (value - 128) / 128;
      sumSquares += centered * centered;
    }

    return Math.sqrt(sumSquares / Math.max(1, data.length));
  };

  const createTransientState = (profile) => ({
    baseline: 0.0008,
    holdUntil: 0,
    minRms: profile.minRms || 0.003,
  });

  const resolveVoiceDynamicsProfile = (mode = noiseSuppressionMode) => {
    if (mode === NOISE_SUPPRESSION_MODE_HARD_GATE) {
      return {
        highPassFrequency: 120,
        highPassQ: 0.82,
        highPassStages: 2,
        lowBump: {
          triggerDb: 12,
          attackTime: 0.002,
          holdMs: 54,
          releaseTime: 0.12,
          reductionDb: -20,
          minRms: 0.008,
        },
        transient: {
          triggerDb: 12,
          attackTime: 0.001,
          holdMs: 12,
          releaseTime: 0.06,
          reductionDb: -6,
          minRms: 0.006,
        },
        deEsser: {
          triggerDb: 10,
          attackTime: 0.001,
          holdMs: 18,
          releaseTime: 0.09,
          reductionDb: -2.5,
          minRms: 0.005,
        },
        compressor: {
          threshold: -28,
          knee: 12,
          ratio: 2.8,
          attack: 0.012,
          release: 0.11,
        },
        makeupGainDb: 14,
      };
    }

    if (mode === NOISE_SUPPRESSION_MODE_AI) {
      return {
        highPassFrequency: 110,
        highPassQ: 0.78,
        highPassStages: 2,
        lowBump: {
          triggerDb: 12,
          attackTime: 0.002,
          holdMs: 48,
          releaseTime: 0.12,
          reductionDb: -16,
          minRms: 0.008,
        },
        transient: {
          triggerDb: 12,
          attackTime: 0.001,
          holdMs: 12,
          releaseTime: 0.065,
          reductionDb: -5,
          minRms: 0.006,
        },
        deEsser: {
          triggerDb: 10,
          attackTime: 0.001,
          holdMs: 18,
          releaseTime: 0.09,
          reductionDb: -2,
          minRms: 0.005,
        },
        compressor: {
          threshold: -28,
          knee: 12,
          ratio: 2.6,
          attack: 0.014,
          release: 0.12,
        },
        makeupGainDb: 12,
      };
    }

    if (mode === NOISE_SUPPRESSION_MODE_BROADCAST) {
      return {
        highPassFrequency: 115,
        highPassQ: 0.78,
        highPassStages: 2,
        lowBump: {
          triggerDb: 12,
          attackTime: 0.002,
          holdMs: 52,
          releaseTime: 0.12,
          reductionDb: -18,
          minRms: 0.007,
        },
        transient: {
          triggerDb: 11,
          attackTime: 0.001,
          holdMs: 16,
          releaseTime: 0.07,
          reductionDb: -9,
          minRms: 0.0045,
        },
        deEsser: {
          triggerDb: 9,
          attackTime: 0.0015,
          holdMs: 24,
          releaseTime: 0.09,
          reductionDb: -4.5,
          minRms: 0.0035,
        },
        compressor: {
          threshold: -20,
          knee: 10,
          ratio: 2.1,
          attack: 0.018,
          release: 0.14,
        },
        makeupGainDb: 6,
      };
    }

    return {
      highPassFrequency: 100,
      highPassQ: 0.72,
      highPassStages: 2,
      lowBump: {
        triggerDb: 14,
        attackTime: 0.003,
        holdMs: 42,
        releaseTime: 0.14,
        reductionDb: -12,
        minRms: 0.008,
      },
      transient: {
        triggerDb: 12,
        attackTime: 0.0015,
        holdMs: 12,
        releaseTime: 0.08,
        reductionDb: -6,
        minRms: 0.005,
      },
      deEsser: {
        triggerDb: 10,
        attackTime: 0.002,
        holdMs: 20,
        releaseTime: 0.1,
        reductionDb: -3,
        minRms: 0.004,
      },
      compressor: {
        threshold: -21,
        knee: 12,
        ratio: 1.8,
        attack: 0.02,
        release: 0.15,
      },
      makeupGainDb: 3,
    };
  };

  const getNoiseSuppressionStrengthRatio = () => normalizeNoiseSuppressionStrength(noiseSuppressionStrength) / 100;

  const getNoiseGateProfile = (mode = noiseSuppressionMode) => {
    if (mode === NOISE_SUPPRESSION_MODE_AI) {
      return {
        openThreshold: 0.008,
        closeThreshold: 0.004,
        floorGain: 0.12,
        attackTime: 0.002,
        releaseTime: 0.16,
        holdMs: 260,
        adaptiveOpenRatio: 1.45,
        adaptiveCloseRatio: 1.12,
        maxAdaptiveOpenThreshold: 0.026,
      };
    }

    if (mode === NOISE_SUPPRESSION_MODE_HARD_GATE) {
      return {
        openThreshold: 0.01,
        closeThreshold: 0.005,
        floorGain: 0.075,
        attackTime: 0.0015,
        releaseTime: 0.14,
        holdMs: 280,
        adaptiveOpenRatio: 1.55,
        adaptiveCloseRatio: 1.16,
        maxAdaptiveOpenThreshold: 0.032,
      };
    }

    if (mode === NOISE_SUPPRESSION_MODE_BROADCAST) {
      return {
        openThreshold: 0.02,
        closeThreshold: 0.011,
        floorGain: 0.055,
        attackTime: 0.01,
        releaseTime: 0.12,
        holdMs: 150,
        adaptiveOpenRatio: 2.15,
        adaptiveCloseRatio: 1.35,
        maxAdaptiveOpenThreshold: 0.064,
      };
    }

    return {
      openThreshold: 0.014,
      closeThreshold: 0.007,
      floorGain: 0.1,
      attackTime: 0.016,
      releaseTime: 0.16,
      holdMs: 140,
      adaptiveOpenRatio: 1.9,
      adaptiveCloseRatio: 1.25,
      maxAdaptiveOpenThreshold: 0.046,
    };
  };

  const startVoiceDynamicsMetering = ({
    gateAnalyser,
    gateNode,
    gateProfile,
    lowBumpAnalyser,
    lowBumpGainNode,
    transientAnalyser,
    transientGainNode,
    deEsserAnalyser,
    deEsserGainNode,
    dynamicsProfile,
  }) => {
    if (!gateAnalyser || !gateNode || typeof window === "undefined") {
      return;
    }

    const gateData = new Uint8Array(gateAnalyser.fftSize);
    const lowBumpData = lowBumpAnalyser ? new Uint8Array(lowBumpAnalyser.fftSize) : null;
    const transientData = transientAnalyser ? new Uint8Array(transientAnalyser.fftSize) : null;
    const deEsserData = deEsserAnalyser ? new Uint8Array(deEsserAnalyser.fftSize) : null;
    const lowBumpProfile = dynamicsProfile.lowBump || {};
    const transientProfile = dynamicsProfile.transient || {};
    const deEsserProfile = dynamicsProfile.deEsser || {};
    localNoiseGateState = {
      isOpen: false,
      holdUntil: 0,
      noiseFloor: gateProfile.closeThreshold * 0.65,
    };
    localVoiceDynamicsState = {
      lowBump: createTransientState(lowBumpProfile),
      transient: createTransientState(transientProfile),
      deEsser: createTransientState(deEsserProfile),
    };

    gateNode.gain.value = gateProfile.floorGain;
    if (lowBumpGainNode) {
      lowBumpGainNode.gain.value = 1;
    }
    if (transientGainNode) {
      transientGainNode.gain.value = 1;
    }
    if (deEsserGainNode) {
      deEsserGainNode.gain.value = 1;
    }

    const updateTransientSuppressor = (kind, analyser, data, gainNodeToUpdate, profile) => {
      if (!analyser || !data || !gainNodeToUpdate || !profile) {
        return;
      }

      const rms = readAnalyserRms(analyser, data);
      const now = performance.now();
      const state = localVoiceDynamicsState?.[kind] || createTransientState(profile);
      const previousBaseline = Number.isFinite(state.baseline) ? state.baseline : 0.0008;

      if (rms < previousBaseline * dbToLinearGain((profile.triggerDb || 10) * 0.72)) {
        state.baseline = Math.max(0.0002, previousBaseline * 0.965 + rms * 0.035);
      } else {
        state.baseline = Math.max(0.0002, previousBaseline * 0.992 + rms * 0.008);
      }

      const triggerRatio = dbToLinearGain(profile.triggerDb || 10);
      const shouldReduce = rms >= (profile.minRms || state.minRms || 0.004) && rms >= state.baseline * triggerRatio;
      if (shouldReduce) {
        state.holdUntil = now + (profile.holdMs || 24);
      }

      if (localVoiceDynamicsState) {
        localVoiceDynamicsState[kind] = state;
      }

      const activeStrengthRatio = getNoiseSuppressionStrengthRatio();
      const targetGain = now <= state.holdUntil ? dbToLinearGain((profile.reductionDb || -8) * activeStrengthRatio) : 1;
      const transitionTime = targetGain < 1 ? (profile.attackTime || 0.001) : (profile.releaseTime || 0.08);
      gainNodeToUpdate.gain.setTargetAtTime(targetGain, audioContext.currentTime, transitionTime);
    };

    localNoiseGateMeter = window.setInterval(() => {
      const rms = readAnalyserRms(gateAnalyser, gateData);
      const now = performance.now();
      const nextState = localNoiseGateState || {
        isOpen: false,
        holdUntil: 0,
        noiseFloor: gateProfile.closeThreshold * 0.65,
      };
      const previousNoiseFloor = Number.isFinite(nextState.noiseFloor)
        ? nextState.noiseFloor
        : gateProfile.closeThreshold * 0.65;

      if (!nextState.isOpen || rms < gateProfile.closeThreshold) {
        nextState.noiseFloor = previousNoiseFloor * 0.94 + rms * 0.06;
      }

      const adaptiveOpenThreshold = Math.min(
        gateProfile.maxAdaptiveOpenThreshold || gateProfile.openThreshold,
        Math.max(gateProfile.openThreshold, nextState.noiseFloor * (gateProfile.adaptiveOpenRatio || 1))
      );
      const adaptiveCloseThreshold = Math.max(
        gateProfile.closeThreshold,
        Math.min(adaptiveOpenThreshold * 0.82, nextState.noiseFloor * (gateProfile.adaptiveCloseRatio || 1))
      );

      if (rms >= adaptiveOpenThreshold) {
        nextState.isOpen = true;
        nextState.holdUntil = now + gateProfile.holdMs;
      } else if (nextState.isOpen && rms >= adaptiveCloseThreshold) {
        nextState.holdUntil = now + gateProfile.holdMs;
      } else if (nextState.isOpen && now >= nextState.holdUntil && rms < adaptiveCloseThreshold) {
        nextState.isOpen = false;
      }

      localNoiseGateState = nextState;
      const activeStrengthRatio = getNoiseSuppressionStrengthRatio();
      const targetGain = nextState.isOpen ? 1 : 1 - ((1 - gateProfile.floorGain) * activeStrengthRatio);
      const transitionTime = nextState.isOpen ? gateProfile.attackTime : gateProfile.releaseTime;
      gateNode.gain.setTargetAtTime(targetGain, audioContext.currentTime, transitionTime);
      updateTransientSuppressor("lowBump", lowBumpAnalyser, lowBumpData, lowBumpGainNode, lowBumpProfile);
      updateTransientSuppressor("transient", transientAnalyser, transientData, transientGainNode, transientProfile);
      updateTransientSuppressor("deEsser", deEsserAnalyser, deEsserData, deEsserGainNode, deEsserProfile);
    }, 36);
  };

  const buildSpeechPolishChain = (
    sourceNode,
    {
      highPassFrequency = 92,
      highPassQ = 0.75,
      highPassStages = 2,
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
      noiseGateProfile = getNoiseGateProfile(),
      dynamicsProfile = resolveVoiceDynamicsProfile(),
    } = {}
  ) => {
    const highPassFilters = Array.from({ length: Math.max(1, Math.min(4, Math.round(highPassStages) || 1)) }, () => {
      const highPassFilter = audioContext.createBiquadFilter();
      highPassFilter.type = "highpass";
      highPassFilter.frequency.value = highPassFrequency;
      highPassFilter.Q.value = highPassQ;
      return highPassFilter;
    });

    const lowBumpDetectorFilter = audioContext.createBiquadFilter();
    lowBumpDetectorFilter.type = "lowpass";
    lowBumpDetectorFilter.frequency.value = 220;
    lowBumpDetectorFilter.Q.value = 0.8;

    const lowBumpAnalyser = audioContext.createAnalyser();
    lowBumpAnalyser.fftSize = 128;
    lowBumpAnalyser.smoothingTimeConstant = 0.38;

    const lowBumpGainNode = audioContext.createGain();
    lowBumpGainNode.gain.value = 1;

    const transientDetectorFilter = audioContext.createBiquadFilter();
    transientDetectorFilter.type = "bandpass";
    transientDetectorFilter.frequency.value = 5600;
    transientDetectorFilter.Q.value = 0.72;

    const transientAnalyser = audioContext.createAnalyser();
    transientAnalyser.fftSize = 128;
    transientAnalyser.smoothingTimeConstant = 0.28;

    const transientGainNode = audioContext.createGain();
    transientGainNode.gain.value = 1;

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

    const noiseGateNode = audioContext.createGain();
    const noiseGateAnalyser = audioContext.createAnalyser();
    noiseGateAnalyser.fftSize = 256;
    noiseGateAnalyser.smoothingTimeConstant = 0.82;

    const deEsserDetectorFilter = audioContext.createBiquadFilter();
    deEsserDetectorFilter.type = "bandpass";
    deEsserDetectorFilter.frequency.value = 6500;
    deEsserDetectorFilter.Q.value = 1.05;

    const deEsserAnalyser = audioContext.createAnalyser();
    deEsserAnalyser.fftSize = 128;
    deEsserAnalyser.smoothingTimeConstant = 0.36;

    const deEsserGainNode = audioContext.createGain();
    deEsserGainNode.gain.value = 1;

    const compressorNode = audioContext.createDynamicsCompressor();
    compressorNode.threshold.value = dynamicsProfile.compressor?.threshold ?? -20;
    compressorNode.knee.value = dynamicsProfile.compressor?.knee ?? 10;
    compressorNode.ratio.value = dynamicsProfile.compressor?.ratio ?? 2;
    compressorNode.attack.value = dynamicsProfile.compressor?.attack ?? 0.018;
    compressorNode.release.value = dynamicsProfile.compressor?.release ?? 0.14;

    const makeupGainNode = audioContext.createGain();
    makeupGainNode.gain.value = dbToLinearGain(dynamicsProfile.makeupGainDb ?? 1);

    const limiterNode = audioContext.createDynamicsCompressor();
    limiterNode.threshold.value = -1;
    limiterNode.knee.value = 0;
    limiterNode.ratio.value = 20;
    limiterNode.attack.value = 0.001;
    limiterNode.release.value = 0.06;

    sourceNode.connect(highPassFilters[0]);
    sourceNode.connect(lowBumpDetectorFilter);
    lowBumpDetectorFilter.connect(lowBumpAnalyser);

    highPassFilters.forEach((highPassFilter, index) => {
      const nextFilter = highPassFilters[index + 1];
      if (nextFilter) {
        highPassFilter.connect(nextFilter);
      }
    });

    const lastHighPassFilter = highPassFilters[highPassFilters.length - 1];
    lastHighPassFilter.connect(lowBumpGainNode);
    lastHighPassFilter.connect(transientDetectorFilter);
    transientDetectorFilter.connect(transientAnalyser);

    lowBumpGainNode.connect(transientGainNode);
    transientGainNode.connect(mudCutFilter);
    mudCutFilter.connect(boxCutFilter);
    boxCutFilter.connect(presenceFilter);
    presenceFilter.connect(airFilter);
    airFilter.connect(lowPassFilter);
    lowPassFilter.connect(noiseGateNode);
    lowPassFilter.connect(noiseGateAnalyser);
    noiseGateNode.connect(deEsserGainNode);
    noiseGateNode.connect(deEsserDetectorFilter);
    deEsserDetectorFilter.connect(deEsserAnalyser);
    deEsserGainNode.connect(compressorNode);
    compressorNode.connect(makeupGainNode);
    makeupGainNode.connect(limiterNode);

    localNoiseGateNode = noiseGateNode;
    localNoiseGateAnalyser = noiseGateAnalyser;
    startVoiceDynamicsMetering({
      gateAnalyser: noiseGateAnalyser,
      gateNode: noiseGateNode,
      gateProfile: noiseGateProfile,
      lowBumpAnalyser,
      lowBumpGainNode,
      transientAnalyser,
      transientGainNode,
      deEsserAnalyser,
      deEsserGainNode,
      dynamicsProfile,
    });

    return limiterNode;
  };

  const buildBroadcastVoiceChain = (sourceNode) => {
    return buildSpeechPolishChain(sourceNode, {
      highPassFrequency: 88,
      highPassStages: 2,
      mudCutFrequency: 250,
      mudCutGain: -2.4,
      boxCutFrequency: 520,
      boxCutGain: -1.4,
      presenceFrequency: 2650,
      presenceGain: 2.0,
      airFrequency: 5400,
      airGain: 0.35,
      lowPassFrequency: 8000,
      noiseGateProfile: getNoiseGateProfile(NOISE_SUPPRESSION_MODE_BROADCAST),
      dynamicsProfile: resolveVoiceDynamicsProfile(NOISE_SUPPRESSION_MODE_BROADCAST),
    });
  };

  const buildTransparentVoiceChain = (sourceNode) => buildSpeechPolishChain(sourceNode, {
    highPassFrequency: 84,
    highPassStages: 2,
    mudCutFrequency: 235,
    mudCutGain: -1.6,
    boxCutFrequency: 520,
    boxCutGain: -0.9,
    presenceFrequency: 2650,
    presenceGain: 1.6,
    airFrequency: 5800,
    airGain: 0.25,
    lowPassFrequency: 9000,
    noiseGateProfile: getNoiseGateProfile(NOISE_SUPPRESSION_MODE_TRANSPARENT),
    dynamicsProfile: resolveVoiceDynamicsProfile(NOISE_SUPPRESSION_MODE_TRANSPARENT),
  });

  const buildHardGateVoiceChain = (sourceNode) => buildSpeechPolishChain(sourceNode, {
    highPassFrequency: 120,
    highPassQ: 0.82,
    highPassStages: 2,
    mudCutFrequency: 285,
    mudCutQ: 1.12,
    mudCutGain: -2.8,
    boxCutFrequency: 720,
    boxCutQ: 1.2,
    boxCutGain: -1.6,
    presenceFrequency: 2550,
    presenceQ: 1.05,
    presenceGain: 2.6,
    airFrequency: 5200,
    airGain: 0.4,
    lowPassFrequency: 8500,
    lowPassQ: 0.8,
    noiseGateProfile: getNoiseGateProfile(NOISE_SUPPRESSION_MODE_HARD_GATE),
    dynamicsProfile: resolveVoiceDynamicsProfile(NOISE_SUPPRESSION_MODE_HARD_GATE),
  });

  const buildAiNoiseSuppressionVoiceChain = (sourceNode) => buildSpeechPolishChain(sourceNode, {
    highPassFrequency: 110,
    highPassQ: 0.78,
    highPassStages: 2,
    mudCutFrequency: 265,
    mudCutQ: 1.05,
    mudCutGain: -2.2,
    boxCutFrequency: 650,
    boxCutQ: 1.1,
    boxCutGain: -1.2,
    presenceFrequency: 2500,
    presenceQ: 1.0,
    presenceGain: 2.2,
    airFrequency: 5200,
    airGain: 0.2,
    lowPassFrequency: 8800,
    lowPassQ: 0.78,
    noiseGateProfile: getNoiseGateProfile(NOISE_SUPPRESSION_MODE_AI),
    dynamicsProfile: resolveVoiceDynamicsProfile(NOISE_SUPPRESSION_MODE_AI),
  });

  const connectLocalAudioGraph = (sourceNode) => {
    let inputNode = sourceNode;
    if (noiseSuppressionMode === NOISE_SUPPRESSION_MODE_AI) {
      inputNode = buildAiNoiseSuppressionVoiceChain(sourceNode);
    } else if (noiseSuppressionMode === NOISE_SUPPRESSION_MODE_BROADCAST) {
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

  const disconnectMicrophoneMonitor = () => {
    if (microphoneMonitorAudioElement) {
      try {
        microphoneMonitorAudioElement.pause();
      } catch {
        // Ignore pause failures for disposed local monitor elements.
      }
      microphoneMonitorAudioElement.srcObject = null;
      microphoneMonitorAudioElement = null;
    }

    if (!microphoneMonitorGainNode) {
      microphoneMonitorDestinationNode = null;
      return;
    }

    try {
      microphoneMonitorGainNode.disconnect();
    } catch {
      // Ignore disconnect failures for already detached local monitor nodes.
    }
    microphoneMonitorGainNode = null;
    microphoneMonitorDestinationNode = null;
  };

  const connectMicrophoneMonitor = async () => {
    if (!microphoneMonitorActive || !audioContext || !gainNode) {
      return;
    }

    if (audioContext.state === "suspended") {
      await audioContext.resume();
    }

    if (microphoneMonitorGainNode) {
      return;
    }

    microphoneMonitorGainNode = audioContext.createGain();
    microphoneMonitorDestinationNode = audioContext.createMediaStreamDestination();
    microphoneMonitorGainNode.gain.value = 1;
    gainNode.connect(microphoneMonitorGainNode);
    microphoneMonitorGainNode.connect(microphoneMonitorDestinationNode);

    microphoneMonitorAudioElement = document.createElement("audio");
    microphoneMonitorAudioElement.autoplay = true;
    microphoneMonitorAudioElement.muted = false;
    microphoneMonitorAudioElement.volume = 1;
    microphoneMonitorAudioElement.srcObject = microphoneMonitorDestinationNode.stream;
    await applyOutputDeviceToElement(microphoneMonitorAudioElement).catch(() => {});
    await microphoneMonitorAudioElement.play().catch((error) => {
      disconnectMicrophoneMonitor();
      throw error;
    });
    logVoiceDebug("local-audio:monitor-started", {
      noiseSuppressionMode,
      echoCancellationEnabled,
      micVolume,
      selectedOutputDeviceId,
    });
  };

  const stopLocalMic = () => {
    void stopRnnoiseNoiseSuppression().catch(() => {});
    logVoiceDebug("local-mic:stop", {
      sourceTracks: localMicSourceStream?.getAudioTracks?.().map(getTrackDebugInfo) || [],
      processingTracks: localAudioProcessingStream?.getAudioTracks?.().map(getTrackDebugInfo) || [],
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
    disconnectMicrophoneMonitor();
    localMicSourceStream = null;
    localAudioProcessingStream = null;
    localAudioStream = null;
    localAudioPipelinePromise = null;
    localOutputAnalyser = null;
    localNoiseGateAnalyser = null;
    localNoiseGateNode = null;
    localNoiseGateState = null;
    localVoiceDynamicsState = null;
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

      const processingTrack = await createNoiseSuppressedInputTrack(capturedMicTrack);
      localAudioProcessingStream = processingTrack
        ? new MediaStream([processingTrack])
        : localMicSourceStream;

      audioContext = createPreferredAudioContext();
      if (!audioContext) {
        throw new Error("Unable to initialize audio context.");
      }

      const sourceNode = audioContext.createMediaStreamSource(localAudioProcessingStream || localMicSourceStream);
      gainNode = audioContext.createGain();
      destinationNode = audioContext.createMediaStreamDestination();
      gainNode.gain.value = micVolume;
      connectLocalAudioGraph(sourceNode);
      localAudioStream = destinationNode.stream;

      startLocalMetering(localOutputAnalyser);
      await connectMicrophoneMonitor();

      logVoiceDebug("local-audio:pipeline-create:success", {
        sourceTracks: localMicSourceStream.getAudioTracks?.().map(getTrackDebugInfo) || [],
        processingTracks: localAudioProcessingStream?.getAudioTracks?.().map(getTrackDebugInfo) || [],
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
        processingTracks: localAudioProcessingStream?.getAudioTracks?.().map(getTrackDebugInfo) || [],
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
      clearVoicePingPolling();
      if (!preserveChannel) {
        currentChannel = null;
        onChannelChanged?.(null);
      }
      return;
    }

    const activeRoom = room;
    clearVoicePingPolling();
    room = null;
    roomConnectPromise = null;
    currentLiveKitServerUrl = "";
    currentLiveKitRoomName = "";
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

  const runLocalShareOperation = async (operationKey, operation) => {
    if (localShareOperationPromise) {
      if (localShareOperationKey === operationKey) {
        return localShareOperationPromise;
      }

      await localShareOperationPromise.catch(() => {});
    }

    localShareOperationKey = operationKey;
    const operationPromise = Promise.resolve().then(operation);
    localShareOperationPromise = operationPromise;

    try {
      return await operationPromise;
    } finally {
      if (localShareOperationPromise === operationPromise) {
        localShareOperationPromise = null;
        localShareOperationKey = "";
      }
    }
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
      nextTrack.contentHint = "speech";
      await micPublication.track.replaceTrack(nextTrack, true);
      await applyPublishedAudioState();
      logVoiceDebug("local-audio:track-replaced", {
        publicationSid: micPublication.trackSid,
        track: getTrackDebugInfo(nextTrack),
      });
      publishVoiceDebugSnapshot("local-audio:track-replaced:snapshot");
      return;
    }

    nextTrack.contentHint = "speech";
    micPublication = await room.localParticipant.publishTrack(nextTrack, {
      source: Track.Source.Microphone,
      name: MICROPHONE_TRACK_NAME,
      ...getMicrophonePublishOptions(noiseSuppressionMode, {
        echoCancellation: echoCancellationEnabled,
        audioBitrateKbps: currentVoiceChannelSettings.audioBitrateKbps,
      }),
    });
    await applyPublishedAudioState();
    logVoiceDebug("local-audio:published", {
      publicationSid: micPublication?.trackSid || "",
      publicationMuted: micPublication?.isMuted,
      track: getTrackDebugInfo(nextTrack),
    });
    publishVoiceDebugSnapshot("local-audio:published:snapshot");
  };

  const rebuildLocalAudioPipeline = async () => {
    const hadMicTrack = Boolean(localMicSourceStream || localAudioStream);
    stopLocalMic();

    if (!hadMicTrack) {
      return null;
    }

    const nextStream = await ensureAudioPipeline();
    const nextTrack = nextStream?.getAudioTracks?.()?.[0] || null;

    if (nextTrack && micPublication?.track?.replaceTrack) {
      nextTrack.contentHint = "speech";
      await micPublication.track.replaceTrack(nextTrack, true);
      logVoiceDebug("local-audio:rebuild-replaced-track", {
        track: getTrackDebugInfo(nextTrack),
      });
    } else if (nextTrack && room && currentChannel) {
      nextTrack.contentHint = "speech";
      micPublication = await room.localParticipant.publishTrack(nextTrack, {
        source: Track.Source.Microphone,
        name: MICROPHONE_TRACK_NAME,
        ...getMicrophonePublishOptions(noiseSuppressionMode, {
          echoCancellation: echoCancellationEnabled,
          audioBitrateKbps: currentVoiceChannelSettings.audioBitrateKbps,
        }),
      });
      logVoiceDebug("local-audio:rebuild-published-track", {
        publicationSid: micPublication?.trackSid || "",
        track: getTrackDebugInfo(nextTrack),
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
    prepareLiveKitConnection(nextSession);
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
      startVoicePingPolling();
      syncAllRemoteShares();
      emitRoomParticipants();
    });

    nextRoom.on(RoomEvent.Reconnected, () => {
      logVoiceDebug("room:event:reconnected", {
        roomState: nextRoom.state,
        remoteParticipants: nextRoom.remoteParticipants.size,
      });
      startVoicePingPolling();
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

      clearVoicePingPolling();
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
      if (roomConnectChannelName === channelName) {
        return roomConnectPromise;
      }

      await roomConnectPromise.catch(() => {});
      if (room && currentChannel === channelName) {
        return room;
      }
    }

    roomConnectChannelName = channelName;
    const activeRoomConnectPromise = (async () => {
      if (room) {
        await stopRoom({ preserveChannel: true });
      }

      const session = await fetchLiveKitSession(channelName, user);
      let nextRoom = null;
      try {
        nextRoom = createRoomInstance();
        bindRoomEvents(nextRoom);
        currentLiveKitServerUrl = session.serverUrl || "";
        currentLiveKitRoomName = session.roomName || channelName || "";

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
        startVoicePingPolling();
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
        clearVoicePingPolling();
        if (room === nextRoom) {
          room = null;
        }
        if (currentChannel === channelName) {
          currentChannel = null;
          currentLiveKitServerUrl = "";
          currentLiveKitRoomName = "";
          onRoomParticipantsChanged?.({ channel: "", participants: [] });
        }
        await nextRoom?.disconnect?.().catch(() => {});
        throw error;
      }
    })();
    roomConnectPromise = activeRoomConnectPromise;

    try {
      return await activeRoomConnectPromise;
    } finally {
      if (roomConnectPromise === activeRoomConnectPromise) {
        roomConnectPromise = null;
        roomConnectChannelName = "";
      }
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

    async joinChannel(channelName, user, channelSettings = {}) {
      currentVoiceChannelSettings = {
        ...currentVoiceChannelSettings,
        ...channelSettings,
        audioBitrateKbps: normalizeChannelAudioBitrateKbps(channelSettings.audioBitrateKbps),
        videoQuality: normalizeChannelVideoQuality(channelSettings.videoQuality),
      };
      logVoiceDebug("join:start", {
        channelName,
        userId: user?.id || "",
        hasExistingRoom: Boolean(room),
        currentChannel,
        audioBitrateKbps: currentVoiceChannelSettings.audioBitrateKbps,
      });
      await ensureSignalConnection(user);

      if (currentChannel === channelName && room) {
        publishVoiceDebugSnapshot("join:already-connected");
        return;
      }

      if (currentChannel && currentChannel !== channelName) {
        await this.leaveChannel();
      }

      const sessionPrewarmPromise = prewarmLiveKitSession(channelName, user).catch((error) => {
        logVoiceDebug("livekit-session:prewarm-on-join-failed", {
          channelName,
          errorName: error?.name || "",
          error: error?.message || String(error),
        });
        return null;
      });
      void ensureAudioPipeline().catch((error) => {
        logVoiceDebug("local-audio:prewarm-on-join-failed", {
          channelName,
          errorName: error?.name || "",
          error: error?.message || String(error),
        });
      });

      const joinResponse = await signalConnection.invoke(
        "JoinChannel",
        channelName,
        String(user.id),
        getDisplayName(user),
        getAvatar(user)
      );

      try {
        await sessionPrewarmPromise;
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
      return runLocalShareOperation("start-screen", async () => {
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
        await stopScreenShareInternal();
        throw new Error("Display capture did not return a video track.");
      }

      try {
        videoTrack.contentHint = "detail";
        videoTrack.onended = () => {
          runLocalShareOperation("stop-share", () => stopScreenShareInternal())
            .catch((error) => console.error("Failed to stop screen share:", error));
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
      } catch (error) {
        await stopScreenShareInternal();
        throw error;
      }
      });
    },

    async startCameraShare({ deviceId = "", resolution = "auto", fps = 30 } = {}) {
      return runLocalShareOperation("start-camera", async () => {
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

      const channelVideoQuality = normalizeChannelVideoQuality(currentVoiceChannelSettings.videoQuality);
      const effectiveResolution =
        normalizeChannelVideoQuality(resolution) !== "auto"
          ? resolution
          : channelVideoQuality !== "auto"
            ? channelVideoQuality
            : "720p";

      localScreenStream = await navigator.mediaDevices.getUserMedia({
        video: getCameraConstraints(deviceId, effectiveResolution, fps),
        audio: false,
      });

      const [cameraTrack] = localScreenStream.getVideoTracks();
      if (!cameraTrack) {
        await stopScreenShareInternal();
        throw new Error("Camera access did not return a video track.");
      }

      try {
        cameraTrack.contentHint = "motion";
        cameraTrack.onended = () => {
          runLocalShareOperation("stop-share", () => stopScreenShareInternal())
            .catch((error) => console.error("Failed to stop camera share:", error));
        };

        const cameraPublishOptions = getCameraPublishOptions(effectiveResolution, fps);
        localShareVideoPublication = await room.localParticipant.publishTrack(cameraTrack, {
          source: Track.Source.Camera,
          name: CAMERA_TRACK_NAME,
          ...cameraPublishOptions,
        });

        localLiveShareMode = "camera";
        emitLocalScreenState();
        await updateScreenShareStatus(true);
      } catch (error) {
        await stopScreenShareInternal();
        throw error;
      }
      });
    },

    async stopScreenShare() {
      await runLocalShareOperation("stop-share", () => stopScreenShareInternal());
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
      if (microphoneMonitorAudioElement) {
        await applyOutputDeviceToElement(microphoneMonitorAudioElement);
      }
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

    async startMicrophoneTestPlayback() {
      microphoneMonitorActive = true;
      await ensureAudioPipeline();
      await connectMicrophoneMonitor();
    },

    async stopMicrophoneTestPlayback() {
      microphoneMonitorActive = false;
      disconnectMicrophoneMonitor();
      logVoiceDebug("local-audio:monitor-stopped");
    },

    async setNoiseSuppressionMode(mode) {
      const nextMode = normalizeNoiseSuppressionMode(mode);

      if (noiseSuppressionMode === nextMode) {
        return;
      }

      noiseSuppressionMode = nextMode;
      await rebuildLocalAudioPipeline();
    },

    async setNoiseSuppressionStrength(value) {
      const nextStrength = normalizeNoiseSuppressionStrength(value);
      if (noiseSuppressionStrength === nextStrength) {
        return;
      }

      noiseSuppressionStrength = nextStrength;
      logVoiceDebug("local-audio:noise-strength-set", { noiseSuppressionStrength });
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
