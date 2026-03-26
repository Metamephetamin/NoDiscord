import * as signalR from "@microsoft/signalr";
import { MessagePackHubProtocol } from "@microsoft/signalr-protocol-msgpack";
import { VOICE_HUB_URL, VOICE_RTC_CONFIGURATION } from "../config/runtime";
import { getStoredToken, isUnauthorizedError, notifyUnauthorizedSession } from "../utils/auth";

const DEFAULT_AVATAR = "/image/avatar.jpg";
const RTC_CONFIGURATION = {
  ...VOICE_RTC_CONFIGURATION,
  iceServers: (VOICE_RTC_CONFIGURATION.iceServers || []).map((server) => ({ ...server })),
};
const NOISE_SUPPRESSION_MODE_TRANSPARENT = "transparent";
const NOISE_SUPPRESSION_MODE_VOICE_ISOLATION = "voice_isolation";
const SCREEN_RECORDER_MIME_TYPES = [
  "video/webm;codecs=vp9",
  "video/webm;codecs=vp8",
  "video/webm",
];
const SCREEN_SHARE_PRESETS = {
  "720p": { width: 1280, height: 720, bitrate30: 3_500_000 },
  "1080p": { width: 1920, height: 1080, bitrate30: 6_500_000 },
  "1440p": { width: 2560, height: 1440, bitrate30: 10_000_000 },
  "2160p": { width: 3840, height: 2160, bitrate30: 16_000_000 },
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
  const fpsScale = normalizedFps >= 120 ? 1.9 : normalizedFps >= 60 ? 1.35 : 1;

  return {
    width: preset.width,
    height: preset.height,
    fps: normalizedFps,
    videoBitsPerSecond: Math.round(preset.bitrate30 * fpsScale),
    chunkTimeslice: normalizedFps >= 120 ? 70 : normalizedFps >= 60 ? 90 : 120,
  };
};

const getResolutionConstraints = (resolution, fps) => {
  const preset = getScreenSharePreset(resolution, fps);
  return {
    width: { ideal: preset.width },
    height: { ideal: preset.height },
    frameRate: { ideal: preset.fps },
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
      frameRate: { ideal: constraints.frameRate?.ideal, max: constraints.frameRate?.ideal || fps },
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
    throw new Error("Не удалось получить источник экрана");
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

const getSupportedScreenMimeType = () =>
  SCREEN_RECORDER_MIME_TYPES.find(
    (mimeType) => typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported?.(mimeType)
  ) || "video/webm";

const normalizeBinaryChunk = (value) => {
  if (!value) {
    return null;
  }

  if (value instanceof Uint8Array) {
    return value;
  }

  if (value instanceof ArrayBuffer) {
    return new Uint8Array(value);
  }

  if (Array.isArray(value)) {
    return new Uint8Array(value);
  }

  return null;
};

export function createVoiceRoomClient({
  onParticipantsMapChanged,
  onChannelChanged,
  onRemoteScreenStreamsChanged,
  onLocalScreenShareChanged,
  onLiveUsersChanged,
  onSpeakingUsersChanged,
  onSelfVoiceStateChanged,
} = {}) {
  let connection = null;
  let connectPromise = null;
  let currentUser = null;
  let currentChannel = null;
  let localMicSourceStream = null;
  let localAudioStream = null;
  let audioContext = null;
  let gainNode = null;
  let destinationNode = null;
  let localOutputAnalyser = null;
  let localSpeakingMeter = null;
  let localSpeakingTimeout = null;
  let micVolume = 0.7;
  let remoteVolume = 0.7;
  let noiseSuppressionMode = NOISE_SUPPRESSION_MODE_TRANSPARENT;
  let localScreenStream = null;
  let screenShareResolution = "720p";
  let screenShareFps = 30;
  let screenMediaRecorder = null;
  let isSendingScreenChunk = false;

  const peers = new Map();
  const queuedIceCandidatesByUser = new Map();
  const remoteScreenShares = new Map();
  const remoteScreenSessions = new Map();
  const speakingUsers = new Set();

  const emitSpeakingUsers = () => {
    onSpeakingUsersChanged?.(Array.from(speakingUsers.values()));
  };

  const emitParticipants = (data) => {
    onParticipantsMapChanged?.(normalizeParticipantsMap(data));
  };

  const emitRemoteScreens = () => {
    onRemoteScreenStreamsChanged?.(Array.from(remoteScreenShares.values()));
  };

  const emitLocalScreenState = () => {
    onLocalScreenShareChanged?.(Boolean(localScreenStream));
  };

  const getMicConstraints = (mode = noiseSuppressionMode) => ({
    echoCancellation: mode === NOISE_SUPPRESSION_MODE_VOICE_ISOLATION,
    noiseSuppression: mode === NOISE_SUPPRESSION_MODE_VOICE_ISOLATION,
    autoGainControl: mode === NOISE_SUPPRESSION_MODE_VOICE_ISOLATION,
    channelCount: 1,
    sampleRate: 48_000,
  });

  const startLocalSpeakingDetection = (analyser) => {
    if (!analyser || !currentUser?.id) {
      return;
    }

    const data = new Uint8Array(analyser.frequencyBinCount);
    localSpeakingMeter = window.setInterval(() => {
      analyser.getByteFrequencyData(data);
      const average = data.reduce((sum, value) => sum + value, 0) / Math.max(1, data.length);
      const isSpeaking = average > 18;

      if (isSpeaking) {
        speakingUsers.add(String(currentUser.id));
        emitSpeakingUsers();
        window.clearTimeout(localSpeakingTimeout);
        localSpeakingTimeout = window.setTimeout(() => {
          speakingUsers.delete(String(currentUser.id));
          emitSpeakingUsers();
        }, 320);
      }
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

  const createHiddenAudioElement = (stream) => {
    const element = document.createElement("audio");
    element.autoplay = true;
    element.playsInline = true;
    element.volume = remoteVolume;
    element.srcObject = stream;
    element.style.display = "none";
    document.body.appendChild(element);
    return element;
  };

  const setupSpeakingDetection = (peerState, stream) => {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass || !stream) {
      return;
    }

    try {
      const context = new AudioContextClass();
      const source = context.createMediaStreamSource(stream);
      const analyser = context.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      const data = new Uint8Array(analyser.frequencyBinCount);

      peerState.speakingMeter = window.setInterval(() => {
        analyser.getByteFrequencyData(data);
        const average = data.reduce((sum, value) => sum + value, 0) / Math.max(1, data.length);
        const isSpeaking = average > 18;

        if (isSpeaking) {
          speakingUsers.add(String(peerState.participant.userId));
          emitSpeakingUsers();
          window.clearTimeout(peerState.speakingTimeout);
          peerState.speakingTimeout = window.setTimeout(() => {
            speakingUsers.delete(String(peerState.participant.userId));
            emitSpeakingUsers();
          }, 320);
        }
      }, 120);

      peerState.speakingAudioContext = context;
      peerState.speakingAnalyser = analyser;
      peerState.speakingSource = source;
    } catch {
      // ignore speaking detector init failures
    }
  };

  const stopScreenRecorder = () => {
    if (screenMediaRecorder && screenMediaRecorder.state !== "inactive") {
      try {
        screenMediaRecorder.stop();
      } catch {
        // ignore recorder stop failures
      }
    }

    screenMediaRecorder = null;
    isSendingScreenChunk = false;
  };

  const cleanupRemoteScreenSession = (userId) => {
    const session = remoteScreenSessions.get(userId);
    if (!session) {
      return;
    }

    if (session.objectUrl) {
      URL.revokeObjectURL(session.objectUrl);
    }

    try {
      if (session.mediaSource.readyState === "open") {
        session.mediaSource.endOfStream();
      }
    } catch {
      // ignore media source shutdown failures
    }

    remoteScreenSessions.delete(userId);
  };

  const appendChunkToSession = (session, chunkBytes) => {
    if (session.queue.length > 24) {
      session.queue.splice(0, session.queue.length - 12);
    }

    if (!session.sourceBuffer || session.sourceBuffer.updating || session.mediaSource.readyState !== "open") {
      session.queue.push(chunkBytes);
      return;
    }

    try {
      session.sourceBuffer.appendBuffer(chunkBytes);
    } catch {
      session.queue.push(chunkBytes);
    }
  };

  const ensureRemoteScreenSession = (participant, mimeType) => {
    const existing = remoteScreenSessions.get(participant.userId);
    if (existing && existing.mimeType === mimeType) {
      existing.participant = participant;
      return existing;
    }

    if (existing) {
      cleanupRemoteScreenSession(participant.userId);
    }

    const mediaSource = new MediaSource();
    const objectUrl = URL.createObjectURL(mediaSource);
    const session = {
      participant,
      mimeType,
      mediaSource,
      objectUrl,
      sourceBuffer: null,
      queue: [],
    };

    mediaSource.addEventListener(
      "sourceopen",
      () => {
        try {
          session.sourceBuffer = mediaSource.addSourceBuffer(mimeType);
          session.sourceBuffer.mode = "sequence";
          session.sourceBuffer.addEventListener("updateend", () => {
            if (session.queue.length && !session.sourceBuffer.updating) {
              const nextChunk = session.queue.shift();
              if (nextChunk) {
                appendChunkToSession(session, nextChunk);
              }
            }

            if (session.sourceBuffer.buffered.length) {
              const start = session.sourceBuffer.buffered.start(0);
              const end = session.sourceBuffer.buffered.end(session.sourceBuffer.buffered.length - 1);
              if (end - start > 6 && !session.sourceBuffer.updating) {
                try {
                  session.sourceBuffer.remove(start, Math.max(start, end - 2.5));
                } catch {
                  // ignore buffered prune failures
                }
              }
            }
          });

          while (session.queue.length && !session.sourceBuffer.updating) {
            const nextChunk = session.queue.shift();
            if (!nextChunk) {
              break;
            }
            appendChunkToSession(session, nextChunk);
          }
        } catch (error) {
          console.error("Ошибка инициализации MediaSource для трансляции:", error);
        }
      },
      { once: true }
    );

    remoteScreenSessions.set(participant.userId, session);
    return session;
  };

  const removeRemoteScreen = (userId) => {
    const existing = remoteScreenShares.get(userId);
    if (existing?.imageSrc?.startsWith?.("blob:")) {
      URL.revokeObjectURL(existing.imageSrc);
    }

    cleanupRemoteScreenSession(userId);
    remoteScreenShares.delete(userId);
    emitRemoteScreens();
  };

  const clearRemoteScreens = () => {
    Array.from(remoteScreenShares.keys()).forEach((userId) => {
      removeRemoteScreen(userId);
    });
  };

  const stopLocalMic = () => {
    if (localSpeakingMeter) {
      window.clearInterval(localSpeakingMeter);
      localSpeakingMeter = null;
    }

    if (localSpeakingTimeout) {
      window.clearTimeout(localSpeakingTimeout);
      localSpeakingTimeout = null;
    }

    if (currentUser?.id) {
      speakingUsers.delete(String(currentUser.id));
      emitSpeakingUsers();
    }

    localMicSourceStream?.getTracks().forEach((track) => track.stop());
    localMicSourceStream = null;
    localAudioStream = null;
    localOutputAnalyser = null;

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
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    audioContext = new AudioContextClass();
    const sourceNode = audioContext.createMediaStreamSource(localMicSourceStream);
    gainNode = audioContext.createGain();
    destinationNode = audioContext.createMediaStreamDestination();
    gainNode.gain.value = micVolume;
    connectLocalAudioGraph(sourceNode);
    localAudioStream = destinationNode.stream;

    startLocalSpeakingDetection(localOutputAnalyser);

    return localAudioStream;
  };

  const rebuildLocalAudioPipeline = async () => {
    const hadMicTrack = Boolean(localMicSourceStream || localAudioStream);
    stopLocalMic();

    if (!hadMicTrack) {
      return null;
    }

    const nextStream = await ensureAudioPipeline();
    const nextTrack = nextStream?.getAudioTracks?.()?.[0] || null;

    if (!nextTrack) {
      return nextStream;
    }

    await Promise.all(
      Array.from(peers.values()).map(async (peerState) => {
        if (peerState.audioSender) {
          await peerState.audioSender.replaceTrack(nextTrack);
        } else {
          peerState.audioSender = peerState.pc.addTrack(nextTrack, nextStream);
        }
      })
    );

    return nextStream;
  };

  const flushPendingIceCandidates = async (peerState) => {
    if (!peerState?.pc?.remoteDescription || !peerState.pendingIceCandidates.length) {
      return;
    }

    const pendingCandidates = [...peerState.pendingIceCandidates];
    peerState.pendingIceCandidates = [];

    for (const candidate of pendingCandidates) {
      try {
        await peerState.pc.addIceCandidate(candidate);
      } catch (error) {
        console.error("Ошибка применения отложенного ICE-кандидата:", error);
      }
    }
  };

  const moveQueuedIceCandidatesToPeer = (peerState) => {
    if (!peerState?.participant?.userId) {
      return;
    }

    const queuedCandidates = queuedIceCandidatesByUser.get(peerState.participant.userId);
    if (!queuedCandidates?.length) {
      return;
    }

    peerState.pendingIceCandidates.push(...queuedCandidates);
    queuedIceCandidatesByUser.delete(peerState.participant.userId);
  };

  const cleanupPeer = (userId) => {
    const peer = peers.get(userId);
    if (!peer) {
      return;
    }

    peer.pc.onicecandidate = null;
    peer.pc.ontrack = null;
    peer.pc.onconnectionstatechange = null;

    if (peer.audioElement) {
      peer.audioElement.srcObject = null;
      peer.audioElement.remove();
    }

    if (peer.speakingMeter) {
      window.clearInterval(peer.speakingMeter);
    }

    if (peer.speakingTimeout) {
      window.clearTimeout(peer.speakingTimeout);
    }

    if (peer.speakingAudioContext) {
      peer.speakingAudioContext.close().catch(() => {});
    }

    speakingUsers.delete(String(userId));
    emitSpeakingUsers();

    try {
      peer.pc.close();
    } catch {
      // ignore close errors
    }

    peers.delete(userId);
  };

  const cleanupPeers = () => {
    Array.from(peers.keys()).forEach(cleanupPeer);
  };

  const attachLocalTracks = async (peerState) => {
    const micStream = await ensureAudioPipeline();
    const micTrack = micStream.getAudioTracks()[0];

    if (micTrack && !peerState.audioSender) {
      peerState.audioSender = peerState.pc.addTrack(micTrack, micStream);
    }
  };

  const createPeerState = async (participant) => {
    const existing = peers.get(participant.userId);
    if (existing) {
      return existing;
    }

    const pc = new RTCPeerConnection(RTC_CONFIGURATION);
    const audioStream = new MediaStream();

    const peerState = {
      participant,
      pc,
      audioStream,
      audioElement: null,
      audioSender: null,
      pendingIceCandidates: [],
      speakingMeter: null,
      speakingTimeout: null,
      speakingAudioContext: null,
      speakingAnalyser: null,
      speakingSource: null,
    };

    peers.set(participant.userId, peerState);
    moveQueuedIceCandidatesToPeer(peerState);
    await attachLocalTracks(peerState);

    pc.onicecandidate = async (event) => {
      if (!event.candidate || !connection || connection.state !== signalR.HubConnectionState.Connected) {
        return;
      }

      try {
        await connection.invoke("SendIceCandidate", participant.userId, JSON.stringify(event.candidate));
      } catch (error) {
        console.error("Ошибка отправки ICE-кандидата:", error);
      }
    };

    pc.ontrack = (event) => {
      if (event.track.kind !== "audio") {
        return;
      }

      const [stream] = event.streams;
      const targetStream = stream || peerState.audioStream;

      if (!peerState.audioElement) {
        peerState.audioElement = createHiddenAudioElement(targetStream);
        setupSpeakingDetection(peerState, targetStream);
      } else if (peerState.audioElement.srcObject !== targetStream) {
        peerState.audioElement.srcObject = targetStream;
      }
    };

    pc.onconnectionstatechange = () => {
      if (["failed", "closed"].includes(pc.connectionState)) {
        cleanupPeer(participant.userId);
      }
    };

    return peerState;
  };

  const createOfferForPeer = async (participant) => {
    if (!participant.userId) {
      return;
    }

    const peerState = await createPeerState(participant);
    await attachLocalTracks(peerState);
    const offer = await peerState.pc.createOffer();
    await peerState.pc.setLocalDescription(offer);
    await connection.invoke("SendOffer", participant.userId, offer.sdp);
  };

  const handleOffer = async (payload) => {
    const participant = normalizeParticipant(payload);
    if (!participant.userId) {
      return;
    }

    const peerState = await createPeerState(participant);
    await peerState.pc.setRemoteDescription(
      new RTCSessionDescription({ type: "offer", sdp: payload.sdp || payload.Sdp })
    );
    await flushPendingIceCandidates(peerState);

    const answer = await peerState.pc.createAnswer();
    await peerState.pc.setLocalDescription(answer);
    await connection.invoke("SendAnswer", participant.userId, answer.sdp);
  };

  const handleAnswer = async (payload) => {
    const participant = normalizeParticipant(payload);
    const peerState = peers.get(participant.userId);
    if (!peerState) {
      return;
    }

    await peerState.pc.setRemoteDescription(
      new RTCSessionDescription({ type: "answer", sdp: payload.sdp || payload.Sdp })
    );
    await flushPendingIceCandidates(peerState);
  };

  const handleIceCandidate = async (payload) => {
    const fromUserId = payload.fromUserId || payload.FromUserId;
    const rawCandidate = payload.candidate || payload.Candidate;
    const peerState = peers.get(fromUserId);

    if (!fromUserId || !rawCandidate) {
      return;
    }

    try {
      const candidate = new RTCIceCandidate(JSON.parse(rawCandidate));

      if (!peerState) {
        const queue = queuedIceCandidatesByUser.get(fromUserId) || [];
        queue.push(candidate);
        queuedIceCandidatesByUser.set(fromUserId, queue);
        return;
      }

      if (!peerState.pc.remoteDescription) {
        peerState.pendingIceCandidates.push(candidate);
        return;
      }

      await peerState.pc.addIceCandidate(candidate);
    } catch (error) {
      console.error("Ошибка применения ICE-кандидата:", error);
    }
  };

  const startScreenBroadcasting = async () => {
    if (!localScreenStream || !connection || connection.state !== signalR.HubConnectionState.Connected || !currentUser?.id) {
      return;
    }

    stopScreenRecorder();

    const mimeType = getSupportedScreenMimeType();
    const screenSharePreset = getScreenSharePreset(screenShareResolution, screenShareFps);

    screenMediaRecorder = new MediaRecorder(localScreenStream, {
      mimeType,
      videoBitsPerSecond: screenSharePreset.videoBitsPerSecond,
    });

    screenMediaRecorder.ondataavailable = async (event) => {
      if (
        !event.data ||
        event.data.size === 0 ||
        !connection ||
        connection.state !== signalR.HubConnectionState.Connected ||
        isSendingScreenChunk
      ) {
        return;
      }

      isSendingScreenChunk = true;
      try {
        const chunkBytes = new Uint8Array(await event.data.arrayBuffer());
        if (chunkBytes.byteLength > 3_000_000) {
          console.warn("Chunk skipped because it exceeded the safe size limit");
          return;
        }

        await connection.invoke(
          "SendScreenShareChunk",
          String(currentUser.id),
          chunkBytes,
          screenMediaRecorder?.mimeType || mimeType,
          (localScreenStream?.getAudioTracks?.().length || 0) > 0
        );
      } catch (error) {
        console.error("Ошибка отправки видеочанка трансляции:", error);
      } finally {
        isSendingScreenChunk = false;
      }
    };

    screenMediaRecorder.onerror = (event) => {
      console.error("Ошибка MediaRecorder трансляции:", event.error || event);
    };

    screenMediaRecorder.start(screenSharePreset.chunkTimeslice);
  };

  const registerCurrentUser = async (user) => {
    if (!connection || connection.state !== signalR.HubConnectionState.Connected || !user?.id) {
      return;
    }

    currentUser = user;
    await connection.invoke("Register", String(user.id), getDisplayName(user), getAvatar(user));
  };

  const stopScreenShareInternal = async () => {
    stopScreenRecorder();

    if (!localScreenStream) {
      emitLocalScreenState();
      return;
    }

    localScreenStream.getTracks().forEach((track) => {
      track.onended = null;
      track.stop();
    });
    localScreenStream = null;

    emitLocalScreenState();
    if (connection && connection.state === signalR.HubConnectionState.Connected && currentUser?.id) {
      await connection.invoke("UpdateScreenShareStatus", String(currentUser.id), false);
    }
  };

  const ensureConnection = async (user) => {
    currentUser = user;

    if (!getStoredToken()) {
      throw new Error("Сессия не найдена. Войдите в аккаунт.");
    }

    if (!connection) {
      connection = new signalR.HubConnectionBuilder()
        .withUrl(VOICE_HUB_URL, {
          accessTokenFactory: () => getStoredToken(),
        })
        .configureLogging(signalR.LogLevel.Error)
        .withHubProtocol(new MessagePackHubProtocol())
        .withAutomaticReconnect([0, 1000, 3000, 5000])
        .build();

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

      connection.on("voice:screen-share-users", (userIds) => {
        const nextUserIds = Array.isArray(userIds) ? userIds.map(String) : [];
        onLiveUsersChanged?.(nextUserIds);

        Array.from(remoteScreenShares.keys()).forEach((userId) => {
          if (!nextUserIds.includes(String(userId))) {
            removeRemoteScreen(userId);
          }
        });
      });

      connection.on("screen-share:chunk", (payload) => {
        const participant = normalizeParticipant(payload);
        const chunkBytes = normalizeBinaryChunk(payload.chunkBytes || payload.ChunkBytes);
        const mimeType = payload.mimeType || payload.MimeType || "video/webm";
        const hasAudio = Boolean(payload.hasAudio ?? payload.HasAudio);

        if (!participant.userId || !chunkBytes) {
          return;
        }

        const previous = remoteScreenShares.get(participant.userId);
        if (previous?.imageSrc?.startsWith?.("blob:")) {
          URL.revokeObjectURL(previous.imageSrc);
        }

        const session = ensureRemoteScreenSession(participant, mimeType);
        appendChunkToSession(session, chunkBytes);

        remoteScreenShares.set(participant.userId, {
          ...participant,
          videoSrc: session.objectUrl,
          hasAudio,
          updatedAt: Date.now(),
          mode: "media-source",
        });
        emitRemoteScreens();
      });

      connection.on("screen-share:refresh-request", async (payload) => {
        const requesterId = payload?.fromUserId || payload?.FromUserId;

        if (!localScreenStream || !currentUser?.id) {
          return;
        }

        if (requesterId && String(requesterId) === String(currentUser.id)) {
          return;
        }

        try {
          await startScreenBroadcasting();
        } catch (error) {
          console.error("Ошибка обновления видеопотока трансляции:", error);
        }
      });

      connection.on("screen-share:frame", (payload) => {
        const participant = normalizeParticipant(payload);
        const frameBytes = normalizeBinaryChunk(payload.frameBytes || payload.FrameBytes);
        const mimeType = payload.mimeType || payload.MimeType || "image/webp";

        if (!participant.userId || !frameBytes) {
          return;
        }

        const previous = remoteScreenShares.get(participant.userId);
        if (previous?.imageSrc?.startsWith?.("blob:")) {
          URL.revokeObjectURL(previous.imageSrc);
        }

        remoteScreenShares.set(participant.userId, {
          ...participant,
          imageSrc: URL.createObjectURL(new Blob([frameBytes], { type: mimeType })),
          width: payload.width || payload.Width || 0,
          height: payload.height || payload.Height || 0,
          updatedAt: Date.now(),
          mode: "frame",
        });
        emitRemoteScreens();
      });

      connection.on("webrtc:offer", async (payload) => {
        await handleOffer(payload);
      });

      connection.on("webrtc:answer", async (payload) => {
        await handleAnswer(payload);
      });

      connection.on("webrtc:ice-candidate", async (payload) => {
        await handleIceCandidate(payload);
      });

      connection.onreconnected(async () => {
        if (!currentUser) {
          return;
        }

        cleanupPeers();
        await registerCurrentUser(currentUser);

        if (currentChannel) {
          const response = await connection.invoke(
            "JoinChannel",
            currentChannel,
            String(currentUser.id),
            getDisplayName(currentUser),
            getAvatar(currentUser)
          );

          const participants = response?.participants || response?.Participants || [];
          for (const participant of participants) {
            await createOfferForPeer(normalizeParticipant(participant));
          }
        }

        if (localScreenStream && currentUser?.id) {
          await connection.invoke("UpdateScreenShareStatus", String(currentUser.id), true);
          await startScreenBroadcasting();
        }
      });

      connection.onclose(() => {
        connectPromise = null;
        cleanupPeers();
        stopScreenRecorder();
        localScreenStream?.getTracks().forEach((track) => {
          try {
            track.stop();
          } catch {
            // ignore capture track stop failures
          }
        });
        localScreenStream = null;
        currentChannel = null;
        clearRemoteScreens();
        emitLocalScreenState();
        onChannelChanged?.(null);
      });
    }

    if (connection.state === signalR.HubConnectionState.Disconnected) {
      if (!connectPromise) {
        connectPromise = (async () => {
          try {
            await connection.start();
          } catch (error) {
            if (isUnauthorizedError(error)) {
              notifyUnauthorizedSession("voice_signalr_401");
              throw new Error("Сессия истекла. Войдите снова.");
            }

            throw error;
          } finally {
            connectPromise = null;
          }
        })();
      }

      await connectPromise;
    }

    await registerCurrentUser(user);
  };

  return {
    async connect(user) {
      await ensureConnection(user);
    },

    async joinChannel(channelName, user) {
      await ensureConnection(user);
      await ensureAudioPipeline();

      if (currentChannel === channelName) {
        return;
      }

      if (currentChannel && currentChannel !== channelName) {
        await this.leaveChannel();
      }

      const response = await connection.invoke(
        "JoinChannel",
        channelName,
        String(user.id),
        getDisplayName(user),
        getAvatar(user)
      );

      currentChannel = channelName;
      onChannelChanged?.(channelName);

      const participants = response?.participants || response?.Participants || [];
      for (const participant of participants) {
        await createOfferForPeer(normalizeParticipant(participant));
      }
    },

    async leaveChannel() {
      await stopScreenShareInternal();
      cleanupPeers();
      clearRemoteScreens();

      if (connection && connection.state === signalR.HubConnectionState.Connected && currentUser?.id) {
        await connection.invoke("LeaveChannel", String(currentUser.id));
      }

      currentChannel = null;
      onChannelChanged?.(null);
    },

    async startScreenShare({ resolution = "1080p", fps = 60, shareAudio = false } = {}) {
      if (!currentChannel) {
        throw new Error("Сначала подключитесь к голосовому каналу");
      }

      if (localScreenStream) {
        return;
      }

      screenShareResolution = resolution;
      screenShareFps = fps;

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

        console.warn("Не удалось захватить звук экрана, запускаю трансляцию без звука.", error);
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

      const screenTrack = localScreenStream.getVideoTracks()[0];
      if (screenTrack) {
        screenTrack.onended = () => {
          stopScreenShareInternal().catch((error) => console.error("Ошибка остановки трансляции:", error));
        };
      }

      emitLocalScreenState();
      if (currentUser?.id) {
        await connection.invoke("UpdateScreenShareStatus", String(currentUser.id), true);
      }
      await startScreenBroadcasting();
    },

    async stopScreenShare() {
      await stopScreenShareInternal();
    },

    async requestScreenShare(targetUserId) {
      if (
        !targetUserId ||
        !connection ||
        connection.state !== signalR.HubConnectionState.Connected ||
        !currentUser?.id ||
        String(targetUserId) === String(currentUser.id)
      ) {
        return;
      }

      await connection.invoke("RequestScreenShareOffer", String(targetUserId));
    },

    setMicrophoneVolume(value) {
      micVolume = value / 100;
      if (gainNode) {
        gainNode.gain.value = micVolume;
      }
    },

    setRemoteVolume(value) {
      remoteVolume = value / 100;
      for (const peerState of peers.values()) {
        if (peerState.audioElement) {
          peerState.audioElement.volume = remoteVolume;
        }
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
      if (!connection || connection.state !== signalR.HubConnectionState.Connected || !currentUser?.id) {
        return;
      }

      await connection.invoke("UpdateVoiceState", String(currentUser.id), Boolean(isMicMuted), Boolean(isDeafened));
    },

    async updateParticipantVoiceState(targetUserId, { isMicMuted = false, isDeafened = false } = {}) {
      if (!targetUserId || !connection || connection.state !== signalR.HubConnectionState.Connected) {
        return;
      }

      await connection.invoke("UpdateVoiceState", String(targetUserId), Boolean(isMicMuted), Boolean(isDeafened));
    },

    async disconnect() {
      await stopScreenShareInternal();
      cleanupPeers();
      clearRemoteScreens();
      stopLocalMic();
      currentChannel = null;
      onChannelChanged?.(null);

      if (connection) {
        try {
          await connection.stop();
        } catch {
          // ignore stop errors during shutdown
        }
      }
    },
  };
}
