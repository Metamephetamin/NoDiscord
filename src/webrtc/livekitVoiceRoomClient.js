import * as signalR from "@microsoft/signalr";
import { MessagePackHubProtocol } from "@microsoft/signalr-protocol-msgpack";
import { ExternalE2EEKeyProvider, Room, RoomEvent, Track, isE2EESupported } from "livekit-client";
import { API_BASE_URL, VOICE_HUB_URL, VOICE_RTC_CONFIGURATION } from "../config/runtime";
import { ensureDailySharedChannelKey, ensureE2eeDeviceIdentity } from "../e2ee/chatEncryption";
import { createVoiceChannelPassphrase, unwrapVoiceChannelPassphrase, wrapVoiceChannelPassphrase } from "../e2ee/voiceEncryption";
import {
  authFetch,
  getApiErrorMessage,
  getStoredToken,
  isUnauthorizedError,
  notifyUnauthorizedSession,
  parseApiResponse,
} from "../utils/auth";
import {
  DEFAULT_AVATAR,
  NOISE_SUPPRESSION_MODE_TRANSPARENT,
  NOISE_SUPPRESSION_MODE_VOICE_ISOLATION,
  createPreferredAudioContext,
  getAvatar,
  getCameraConstraints,
  getDisplayName,
  getElectronDisplayStream,
  getResolutionConstraints,
  normalizeParticipantsMap,
  tuneDisplayStream,
} from "./voiceClientUtils";

const RTC_CONFIGURATION = {
  ...VOICE_RTC_CONFIGURATION,
  iceServers: (VOICE_RTC_CONFIGURATION.iceServers || []).map((server) => ({ ...server })),
};
const MICROPHONE_TRACK_NAME = "microphone";
const SCREEN_VIDEO_TRACK_NAME = "screen-share";
const SCREEN_AUDIO_TRACK_NAME = "screen-share-audio";
const CAMERA_TRACK_NAME = "camera-share";
const AUDIO_SAMPLE_RATE = 48_000;

function bytesToBase64(value) {
  const bytes = value instanceof Uint8Array ? value : new Uint8Array(value);
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary);
}

export function createVoiceRoomClient({
  onParticipantsMapChanged,
  onChannelChanged,
  onRemoteScreenStreamsChanged,
  onLocalScreenShareChanged,
  onLocalLiveShareChanged,
  onLiveUsersChanged,
  onSpeakingUsersChanged,
  onSelfVoiceStateChanged,
  onMicLevelChanged,
  onAudioDevicesChanged,
} = {}) {
  let signalConnection = null;
  let signalConnectPromise = null;
  let room = null;
  let roomConnectPromise = null;
  let currentUser = null;
  let currentChannel = null;
  let localMicSourceStream = null;
  let localAudioStream = null;
  let audioContext = null;
  let gainNode = null;
  let destinationNode = null;
  let localOutputAnalyser = null;
  let localSpeakingMeter = null;
  let micVolume = 0.7;
  let remoteVolume = 0.7;
  let noiseSuppressionMode = NOISE_SUPPRESSION_MODE_TRANSPARENT;
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
  let currentVoiceChannelPassphrase = "";
  let currentVoiceChannelE2eeEnabled = false;
  let voiceE2eeWorker = null;
  let voiceE2eeKeyProvider = null;
  let pendingVoiceE2eeEnvelopeRequest = null;

  const remoteScreenShares = new Map();
  const remoteAudioElements = new Map();
  const remoteParticipantMedia = new Map();
  const roomActiveSpeakerIds = new Set();

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

  const emitLocalScreenState = () => {
    const isActive = Boolean(localScreenStream);
    onLocalScreenShareChanged?.(isActive);
    onLocalLiveShareChanged?.({
      isActive,
      mode: isActive ? localLiveShareMode || "screen" : "",
    });
  };

  const getOutputSelectionSupported = () =>
    typeof HTMLMediaElement !== "undefined" &&
    typeof HTMLMediaElement.prototype.setSinkId === "function";

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

  const getMicConstraints = (mode = noiseSuppressionMode) => ({
    deviceId:
      selectedInputDeviceId && selectedInputDeviceId !== "default"
        ? { exact: selectedInputDeviceId }
        : undefined,
    echoCancellation: mode === NOISE_SUPPRESSION_MODE_VOICE_ISOLATION,
    noiseSuppression: mode === NOISE_SUPPRESSION_MODE_VOICE_ISOLATION,
    autoGainControl: mode === NOISE_SUPPRESSION_MODE_VOICE_ISOLATION,
    channelCount: 1,
    sampleRate: AUDIO_SAMPLE_RATE,
  });

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

  const buildNoiseIsolationChain = (sourceNode) => {
    const highPassFilter = audioContext.createBiquadFilter();
    highPassFilter.type = "highpass";
    highPassFilter.frequency.value = 120;
    highPassFilter.Q.value = 0.82;

    const voicePresenceFilter = audioContext.createBiquadFilter();
    voicePresenceFilter.type = "peaking";
    voicePresenceFilter.frequency.value = 2200;
    voicePresenceFilter.Q.value = 1.15;
    voicePresenceFilter.gain.value = 3.2;

    const lowPassFilter = audioContext.createBiquadFilter();
    lowPassFilter.type = "lowpass";
    lowPassFilter.frequency.value = 7200;
    lowPassFilter.Q.value = 0.7;

    const compressor = audioContext.createDynamicsCompressor();
    compressor.threshold.value = -28;
    compressor.knee.value = 24;
    compressor.ratio.value = 12;
    compressor.attack.value = 0.003;
    compressor.release.value = 0.17;

    sourceNode.connect(highPassFilter);
    highPassFilter.connect(voicePresenceFilter);
    voicePresenceFilter.connect(lowPassFilter);
    lowPassFilter.connect(compressor);

    return compressor;
  };

  const connectLocalAudioGraph = (sourceNode) => {
    const inputNode =
      noiseSuppressionMode === NOISE_SUPPRESSION_MODE_VOICE_ISOLATION
        ? buildNoiseIsolationChain(sourceNode)
        : sourceNode;

    inputNode.connect(gainNode);
    gainNode.connect(destinationNode);

    localOutputAnalyser = audioContext.createAnalyser();
    localOutputAnalyser.fftSize = 256;
    gainNode.connect(localOutputAnalyser);
  };

  const stopLocalMic = () => {
    if (localSpeakingMeter) {
      window.clearInterval(localSpeakingMeter);
      localSpeakingMeter = null;
    }

    localMicSourceStream?.getTracks().forEach((track) => track.stop());
    localMicSourceStream = null;
    localAudioStream = null;
    localOutputAnalyser = null;
    onMicLevelChanged?.(0);

    if (audioContext) {
      audioContext.close().catch(() => {});
      audioContext = null;
    }

    gainNode = null;
    destinationNode = null;
  };

  const ensureAudioPipeline = async () => {
    if (localAudioStream) {
      if (audioContext?.state === "suspended") {
        await audioContext.resume();
      }
      return localAudioStream;
    }

    localMicSourceStream = await navigator.mediaDevices.getUserMedia({
      audio: getMicConstraints(),
    });
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

    return localAudioStream;
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
      await element.setSinkId(selectedOutputDeviceId);
    } catch {
      // ignore sink selection failures
    }
  };

  const removeRemoteAudioElement = (key) => {
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
  };

  const removeAllRemoteAudioElements = () => {
    Array.from(remoteAudioElements.keys()).forEach(removeRemoteAudioElement);
  };

  const attachRemoteAudioTrack = async (publication, participant) => {
    const audioTrack = publication?.audioTrack;
    if (!audioTrack) {
      return;
    }

    const key = `${participant.identity}:${publication.trackSid}`;
    removeRemoteAudioElement(key);

    const element = audioTrack.attach();
    element.autoplay = true;
    element.playsInline = true;
    element.volume = remoteVolume;
    element.style.display = "none";
    document.body.appendChild(element);

    await applyOutputDeviceToElement(element).catch(() => {});
    remoteAudioElements.set(key, element);
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
    });
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
    room = null;
    roomConnectPromise = null;
    micPublication = null;
    localShareVideoPublication = null;
    localShareAudioPublication = null;
    disposeVoiceEncryptionState();
    roomActiveSpeakerIds.clear();
    emitSpeakingUsers();
    clearRemoteScreens();
    removeAllRemoteAudioElements();
    remoteParticipantMedia.clear();

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

  const clearPendingVoiceE2eeEnvelopeRequest = (reason = "") => {
    if (!pendingVoiceE2eeEnvelopeRequest) {
      return;
    }

    const { timeoutId, reject } = pendingVoiceE2eeEnvelopeRequest;
    window.clearTimeout(timeoutId);
    pendingVoiceE2eeEnvelopeRequest = null;
    if (reason) {
      reject(new Error(reason));
    }
  };

  const disposeVoiceEncryptionState = ({ clearPassphrase = true } = {}) => {
    clearPendingVoiceE2eeEnvelopeRequest();

    if (voiceE2eeWorker) {
      voiceE2eeWorker.terminate();
      voiceE2eeWorker = null;
    }

    voiceE2eeKeyProvider = null;
    currentVoiceChannelE2eeEnabled = false;

    if (clearPassphrase) {
      currentVoiceChannelPassphrase = "";
    }
  };

  const createVoiceE2eeWorker = () =>
    new Worker(new URL("../workers/livekitE2ee.worker.js", import.meta.url), { type: "module" });

  const setupVoiceEncryptionOptions = async (passphrase) => {
    disposeVoiceEncryptionState({ clearPassphrase: false });
    const keyProvider = new ExternalE2EEKeyProvider();
    const worker = createVoiceE2eeWorker();
    await keyProvider.setKey(String(passphrase || ""));
    voiceE2eeWorker = worker;
    voiceE2eeKeyProvider = keyProvider;
    currentVoiceChannelPassphrase = String(passphrase || "");
    currentVoiceChannelE2eeEnabled = Boolean(passphrase);
    return {
      keyProvider,
      worker,
    };
  };

  const waitForVoiceE2eeEnvelope = (channelName, timeoutMs = 4000) =>
    new Promise((resolve, reject) => {
      clearPendingVoiceE2eeEnvelopeRequest();
      const timeoutId = window.setTimeout(() => {
        pendingVoiceE2eeEnvelopeRequest = null;
        reject(new Error("No encrypted LiveKit room key was received from current participants."));
      }, timeoutMs);

      pendingVoiceE2eeEnvelopeRequest = {
        channelName: String(channelName || ""),
        resolve,
        reject,
        timeoutId,
      };
    });

  const resolveVoiceChannelPassphrase = async (channelName, user, existingParticipants = []) => {
    if (!isE2EESupported()) {
      return "";
    }

    try {
      const sharedKey = await ensureDailySharedChannelKey({
        channelId: channelName,
        user,
        scope: "voice",
      });
      return bytesToBase64(sharedKey.rawKey);
    } catch (dailyKeyError) {
      console.warn("Voice daily E2EE fallback:", dailyKeyError?.message || dailyKeyError);
    }

    await ensureE2eeDeviceIdentity(user);

    if (!Array.isArray(existingParticipants) || existingParticipants.length === 0) {
      return createVoiceChannelPassphrase();
    }

    const envelopePromise = waitForVoiceE2eeEnvelope(channelName);
    await signalConnection.invoke("RequestVoiceE2eeKey", channelName);
    const envelope = await envelopePromise;
    return unwrapVoiceChannelPassphrase({ envelope, user });
  };

  const applyPublishedAudioState = async () => {
    const shouldMuteMicrophone = isSelfMicMuted || isSelfDeafened;
    const microphoneTrack = micPublication?.track;

    if (microphoneTrack?.mediaStreamTrack) {
      microphoneTrack.mediaStreamTrack.enabled = !shouldMuteMicrophone;
    }

    if (!micPublication) {
      return;
    }

    try {
      if (shouldMuteMicrophone && !micPublication.isMuted) {
        await micPublication.mute();
      } else if (!shouldMuteMicrophone && micPublication.isMuted) {
        await micPublication.unmute();
      }
    } catch {
      // ignore local mute synchronization failures
    }
  };

  const syncPublishedMicrophoneTrack = async () => {
    if (!room || !currentChannel) {
      return;
    }

    const micStream = await ensureAudioPipeline();
    const nextTrack = micStream?.getAudioTracks?.()?.[0] || null;
    if (!nextTrack) {
      return;
    }

    nextTrack.enabled = !(isSelfMicMuted || isSelfDeafened);

    if (micPublication?.track?.replaceTrack) {
      await micPublication.track.replaceTrack(nextTrack, true);
      await applyPublishedAudioState();
      return;
    }

    micPublication = await room.localParticipant.publishTrack(nextTrack, {
      source: Track.Source.Microphone,
      name: MICROPHONE_TRACK_NAME,
    });
    await applyPublishedAudioState();
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
      await micPublication.track.replaceTrack(nextTrack, true);
    } else if (nextTrack && room && currentChannel) {
      micPublication = await room.localParticipant.publishTrack(nextTrack, {
        source: Track.Source.Microphone,
        name: MICROPHONE_TRACK_NAME,
      });
    }

    await applyPublishedAudioState();

    return nextStream;
  };

  const fetchLiveKitSession = async (channelName, user) => {
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

      const state = getRemoteParticipantMediaState(String(participant.identity));
      if (publication.source === Track.Source.ScreenShare) {
        state.screenVideoPublication = publication;
      } else if (publication.source === Track.Source.Camera) {
        state.cameraPublication = publication;
      } else if (publication.source === Track.Source.ScreenShareAudio) {
        state.screenAudioPublication = publication;
        attachRemoteAudioTrack(publication, participant).catch(() => {});
      } else if (publication.source === Track.Source.Microphone) {
        state.microphonePublication = publication;
        attachRemoteAudioTrack(publication, participant).catch(() => {});
      }

      syncRemoteShareForParticipant(participant);
    });

    nextRoom.on(RoomEvent.TrackUnsubscribed, (track, publication, participant) => {
      const userId = String(participant?.identity || "");
      if (!userId) {
        return;
      }

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
    });

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
    });

    nextRoom.on(RoomEvent.Connected, () => {
      syncAllRemoteShares();
    });

    nextRoom.on(RoomEvent.Reconnected, () => {
      syncAllRemoteShares();
    });

    nextRoom.on(RoomEvent.Disconnected, async () => {
      if (isIntentionalRoomDisconnect) {
        return;
      }

      clearRemoteScreens();
      removeAllRemoteAudioElements();
      remoteParticipantMedia.clear();
      roomActiveSpeakerIds.clear();
      emitSpeakingUsers();

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
      let encryptionOptions = null;

      try {
        const voicePassphrase = await resolveVoiceChannelPassphrase(channelName, user, existingParticipants);
        if (voicePassphrase) {
          encryptionOptions = await setupVoiceEncryptionOptions(voicePassphrase);
        }
      } catch (error) {
        console.warn("Voice E2EE fallback:", error?.message || error);
        disposeVoiceEncryptionState();
      }

      try {
        const nextRoom = new Room({
          adaptiveStream: true,
          dynacast: true,
          disconnectOnPageLeave: false,
          stopLocalTrackOnUnpublish: false,
          ...(encryptionOptions ? { encryption: encryptionOptions } : {}),
        });
        bindRoomEvents(nextRoom);

        nextRoom.prepareConnection(session.serverUrl, session.participantToken);
        await nextRoom.connect(session.serverUrl, session.participantToken, {
          autoSubscribe: true,
          rtcConfig: RTC_CONFIGURATION,
        });

        if (encryptionOptions) {
          await nextRoom.setE2EEEnabled(true).catch(() => {});
        }

        await nextRoom.startAudio().catch(() => {});

        room = nextRoom;
        await syncPublishedMicrophoneTrack();
        syncAllRemoteShares();

        return nextRoom;
      } catch (error) {
        disposeVoiceEncryptionState();
        throw error;
      }
    })();

    try {
      return await roomConnectPromise;
    } finally {
      roomConnectPromise = null;
    }
  };

  const ensureSignalConnection = async (user) => {
    currentUser = user;

    if (!getStoredToken()) {
      throw new Error("Session is missing. Sign in again.");
    }

    if (!signalConnection) {
      signalConnection = new signalR.HubConnectionBuilder()
        .withUrl(VOICE_HUB_URL, {
          accessTokenFactory: () => getStoredToken(),
        })
        .configureLogging(signalR.LogLevel.Error)
        .withHubProtocol(new MessagePackHubProtocol())
        .withAutomaticReconnect([0, 1000, 3000, 5000])
        .build();

      signalConnection.on("voice:update", (data) => {
        emitParticipants(data);
      });

      signalConnection.on("voice:self-state", (payload) => {
        onSelfVoiceStateChanged?.({
          userId: payload?.userId || payload?.UserId || "",
          isMicMuted: Boolean(payload?.isMicMuted ?? payload?.IsMicMuted),
          isDeafened: Boolean(payload?.isDeafened ?? payload?.IsDeafened),
          isMicForced: Boolean(payload?.isMicForced ?? payload?.IsMicForced),
          isDeafenedForced: Boolean(payload?.isDeafenedForced ?? payload?.IsDeafenedForced),
        });
      });

      signalConnection.on("voice:e2ee-key-request", (payload) => {
        void (async () => {
          if (!currentUser?.id || !currentVoiceChannelPassphrase || !currentChannel || !currentVoiceChannelE2eeEnabled) {
            return;
          }

          const requesterUserId = String(payload?.requesterUserId || "");
          const requestedChannel = String(payload?.channel || "");
          const requesterPublicKeyJwk = String(payload?.requesterPublicKeyJwk || "");
          if (!requesterUserId || requesterUserId === String(currentUser.id) || requestedChannel !== currentChannel || !requesterPublicKeyJwk) {
            return;
          }

          try {
            const identity = await ensureE2eeDeviceIdentity(currentUser);
            const envelope = await wrapVoiceChannelPassphrase({
              passphrase: currentVoiceChannelPassphrase,
              recipientPublicKeyJwk: requesterPublicKeyJwk,
              senderIdentity: identity,
            });
            await signalConnection.invoke("SubmitVoiceE2eeEnvelope", requestedChannel, requesterUserId, {
              wrapIv: envelope.wrapIv,
              wrappedKey: envelope.wrappedKey,
            });
          } catch (error) {
            console.warn("Failed to share voice E2EE key:", error?.message || error);
          }
        })();
      });

      signalConnection.on("voice:e2ee-key-envelope", (payload) => {
        if (!pendingVoiceE2eeEnvelopeRequest) {
          return;
        }

        const requestedChannel = pendingVoiceE2eeEnvelopeRequest.channelName;
        if (String(payload?.channel || "") !== requestedChannel) {
          return;
        }

        const { resolve, timeoutId } = pendingVoiceE2eeEnvelopeRequest;
        window.clearTimeout(timeoutId);
        pendingVoiceE2eeEnvelopeRequest = null;
        resolve(payload);
      });

      signalConnection.onreconnected(async () => {
        if (!currentUser) {
          return;
        }

        await registerCurrentUser(currentUser);

        if (currentChannel) {
          await signalConnection.invoke(
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

      signalConnection.onclose(() => {
        signalConnectPromise = null;
      });
    }

    if (signalConnection.state === signalR.HubConnectionState.Disconnected) {
      if (!signalConnectPromise) {
        signalConnectPromise = (async () => {
          try {
            await signalConnection.start();
          } catch (error) {
            if (isUnauthorizedError(error)) {
              notifyUnauthorizedSession("voice_signalr_401");
              throw new Error("Session expired. Sign in again.");
            }

            throw error;
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

    async joinChannel(channelName, user) {
      await ensureSignalConnection(user);
      await ensureAudioPipeline();

      if (currentChannel === channelName && room) {
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

      currentChannel = channelName;
      onChannelChanged?.(channelName);

      try {
        await ensureRoomConnection(channelName, user, Array.isArray(joinResponse?.participants) ? joinResponse.participants : []);
      } catch (error) {
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

    async startScreenShare({ resolution = "1080p", fps = 60, shareAudio = false } = {}) {
      if (!currentChannel || !room) {
        throw new Error("Join a voice channel first.");
      }

      if (localScreenStream) {
        if (localLiveShareMode === "screen") {
          return;
        }

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

      localShareVideoPublication = await room.localParticipant.publishTrack(videoTrack, {
        source: Track.Source.ScreenShare,
        name: SCREEN_VIDEO_TRACK_NAME,
      });

      const [audioTrack] = localScreenStream.getAudioTracks();
      if (audioTrack) {
        localShareAudioPublication = await room.localParticipant.publishTrack(audioTrack, {
          source: Track.Source.ScreenShareAudio,
          name: SCREEN_AUDIO_TRACK_NAME,
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

      localShareVideoPublication = await room.localParticipant.publishTrack(cameraTrack, {
        source: Track.Source.Camera,
        name: CAMERA_TRACK_NAME,
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

    setMicrophoneVolume(value) {
      micVolume = value / 100;
      if (gainNode) {
        gainNode.gain.value = micVolume;
      }
    },

    setRemoteVolume(value) {
      remoteVolume = value / 100;
      for (const element of remoteAudioElements.values()) {
        element.volume = remoteVolume;
      }
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
      const nextMode =
        mode === NOISE_SUPPRESSION_MODE_VOICE_ISOLATION
          ? NOISE_SUPPRESSION_MODE_VOICE_ISOLATION
          : NOISE_SUPPRESSION_MODE_TRANSPARENT;

      if (noiseSuppressionMode === nextMode) {
        return;
      }

      noiseSuppressionMode = nextMode;
      await rebuildLocalAudioPipeline();
    },

    async updateSelfVoiceState({ isMicMuted = false, isDeafened = false } = {}) {
      isSelfMicMuted = Boolean(isMicMuted);
      isSelfDeafened = Boolean(isDeafened);
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

      if (signalConnection) {
        try {
          await signalConnection.stop();
        } catch {
          // ignore stop errors during shutdown
        }
      }

      if (hasDeviceChangeListener && navigator.mediaDevices?.removeEventListener) {
        navigator.mediaDevices.removeEventListener("devicechange", handleDeviceChange);
        hasDeviceChangeListener = false;
      }
    },
  };
}
