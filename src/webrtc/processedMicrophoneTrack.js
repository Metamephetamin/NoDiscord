export const AUDIO_DENOISER_STORAGE_KEY = "nodiscord.audio.denoiser";
export const AUDIO_DENOISER_MODE_DEEPFILTERNET3 = "deepfilternet3";
export const AUDIO_DENOISER_MODE_WEBRTC = "webrtc";
export const AUDIO_DENOISER_MODE_OFF = "off";

export const AUDIO_DENOISER_MODES = Object.freeze([
  AUDIO_DENOISER_MODE_DEEPFILTERNET3,
  AUDIO_DENOISER_MODE_WEBRTC,
  AUDIO_DENOISER_MODE_OFF,
]);

export const AUDIO_PROCESSING_PROFILE_TRANSPARENT = "transparent";
export const AUDIO_PROCESSING_PROFILE_BROADCAST = "broadcast";
export const AUDIO_PROCESSING_PROFILE_NOISY_ROOM = "noisy_room";
export const AUDIO_PROCESSING_PROFILE_VOICE_MESSAGE = "voice_message";
export const AUDIO_PROCESSING_PROFILE_DICTATION = "dictation";

export const AUDIO_PROCESSING_PROFILES = Object.freeze([
  AUDIO_PROCESSING_PROFILE_TRANSPARENT,
  AUDIO_PROCESSING_PROFILE_BROADCAST,
  AUDIO_PROCESSING_PROFILE_NOISY_ROOM,
  AUDIO_PROCESSING_PROFILE_VOICE_MESSAGE,
  AUDIO_PROCESSING_PROFILE_DICTATION,
]);

const DEFAULT_SAMPLE_RATE = 48_000;
const DEFAULT_CHANNEL_COUNT = 1;
const DENOISER_FALLBACK_ORDER = Object.freeze([
  AUDIO_DENOISER_MODE_DEEPFILTERNET3,
  AUDIO_DENOISER_MODE_WEBRTC,
  AUDIO_DENOISER_MODE_OFF,
]);
const DEFAULT_DENOISER_BY_PROFILE = Object.freeze({
  [AUDIO_PROCESSING_PROFILE_TRANSPARENT]: AUDIO_DENOISER_MODE_DEEPFILTERNET3,
  [AUDIO_PROCESSING_PROFILE_BROADCAST]: AUDIO_DENOISER_MODE_DEEPFILTERNET3,
  [AUDIO_PROCESSING_PROFILE_NOISY_ROOM]: AUDIO_DENOISER_MODE_DEEPFILTERNET3,
  [AUDIO_PROCESSING_PROFILE_VOICE_MESSAGE]: AUDIO_DENOISER_MODE_DEEPFILTERNET3,
  [AUDIO_PROCESSING_PROFILE_DICTATION]: AUDIO_DENOISER_MODE_OFF,
});

const DEEPFILTER_CONFIG_BY_PROFILE = Object.freeze({
  [AUDIO_PROCESSING_PROFILE_TRANSPARENT]: { attenLimDb: 35, postFilterBeta: 0.005 },
  [AUDIO_PROCESSING_PROFILE_BROADCAST]: { attenLimDb: 52, postFilterBeta: 0.012 },
  [AUDIO_PROCESSING_PROFILE_NOISY_ROOM]: { attenLimDb: 72, postFilterBeta: 0.02 },
  [AUDIO_PROCESSING_PROFILE_VOICE_MESSAGE]: { attenLimDb: 52, postFilterBeta: 0.012 },
});

const LEGACY_DENOISER_ALIASES = Object.freeze({
  deepfilter: AUDIO_DENOISER_MODE_DEEPFILTERNET3,
  deepfilternet: AUDIO_DENOISER_MODE_DEEPFILTERNET3,
  deepfilternet3: AUDIO_DENOISER_MODE_DEEPFILTERNET3,
  browser: AUDIO_DENOISER_MODE_WEBRTC,
  native: AUDIO_DENOISER_MODE_WEBRTC,
  webrtc: AUDIO_DENOISER_MODE_WEBRTC,
  none: AUDIO_DENOISER_MODE_OFF,
  disabled: AUDIO_DENOISER_MODE_OFF,
  off: AUDIO_DENOISER_MODE_OFF,
});

const PROFILE_ALIASES = Object.freeze({
  hard_gate: AUDIO_PROCESSING_PROFILE_NOISY_ROOM,
  noisy_room: AUDIO_PROCESSING_PROFILE_NOISY_ROOM,
  voice_message: AUDIO_PROCESSING_PROFILE_VOICE_MESSAGE,
  dictation: AUDIO_PROCESSING_PROFILE_DICTATION,
  broadcast: AUDIO_PROCESSING_PROFILE_BROADCAST,
  transparent: AUDIO_PROCESSING_PROFILE_TRANSPARENT,
});
const failedWorkletDenoisers = new Map();
const AUDIO_PIPELINE_WORKLET_URL = "/audio/AudioPipelineWorklet.js";
const AUDIO_PIPELINE_WORKER_URL = "/audio/AudioPipelineWorker.js";
let audioPipelinePluginPromise = null;

const getWindowValue = (key) => {
  if (typeof window === "undefined") {
    return undefined;
  }

  return window[key];
};

function resolvePublicAssetUrl(path) {
  const normalizedPath = String(path || "").trim();
  if (!normalizedPath || typeof window === "undefined") {
    return normalizedPath;
  }

  if (/^(?:https?:|file:|blob:|data:)/i.test(normalizedPath)) {
    return normalizedPath;
  }

  if (window.location?.protocol === "file:") {
    return new URL(`.${normalizedPath.startsWith("/") ? normalizedPath : `/${normalizedPath}`}`, window.location.href).toString();
  }

  return normalizedPath;
}

export function normalizeAudioProcessingProfile(profile = AUDIO_PROCESSING_PROFILE_BROADCAST) {
  const normalizedProfile = String(profile || "").trim().toLowerCase();
  return PROFILE_ALIASES[normalizedProfile] || AUDIO_PROCESSING_PROFILE_BROADCAST;
}

export function normalizeAudioDenoiserMode(mode, fallback = AUDIO_DENOISER_MODE_OFF) {
  const normalizedMode = String(mode || "").trim().toLowerCase();
  const aliasedMode = LEGACY_DENOISER_ALIASES[normalizedMode] || normalizedMode;
  return AUDIO_DENOISER_MODES.includes(aliasedMode) ? aliasedMode : fallback;
}

export function getDefaultAudioDenoiserForProfile(profile = AUDIO_PROCESSING_PROFILE_BROADCAST) {
  const normalizedProfile = normalizeAudioProcessingProfile(profile);
  return DEFAULT_DENOISER_BY_PROFILE[normalizedProfile] || AUDIO_DENOISER_MODE_OFF;
}

export function getStoredAudioDenoiserPreference() {
  if (typeof window === "undefined") {
    return "";
  }

  try {
    return window.localStorage?.getItem(AUDIO_DENOISER_STORAGE_KEY) || "";
  } catch {
    return "";
  }
}

export function resolvePreferredAudioDenoiser(profile = AUDIO_PROCESSING_PROFILE_BROADCAST, explicitMode = "") {
  const profileDefault = getDefaultAudioDenoiserForProfile(profile);
  const storedMode = getStoredAudioDenoiserPreference();
  return normalizeAudioDenoiserMode(explicitMode || storedMode || profileDefault, profileDefault);
}

export function shouldUseBrowserNoiseSuppression(denoiserMode) {
  return normalizeAudioDenoiserMode(denoiserMode) === AUDIO_DENOISER_MODE_WEBRTC;
}

export function getAudioDenoiserFallbackChain(preferredMode) {
  const normalizedPreferredMode = normalizeAudioDenoiserMode(preferredMode, AUDIO_DENOISER_MODE_OFF);
  const preferredIndex = DENOISER_FALLBACK_ORDER.indexOf(normalizedPreferredMode);
  if (preferredIndex < 0) {
    return [AUDIO_DENOISER_MODE_OFF];
  }

  return DENOISER_FALLBACK_ORDER.slice(preferredIndex);
}

export function buildAudioCaptureConstraints({
  denoiserMode = AUDIO_DENOISER_MODE_WEBRTC,
  deviceId = "",
  echoCancellation = true,
  relaxed = false,
  sampleRate = DEFAULT_SAMPLE_RATE,
  channelCount = DEFAULT_CHANNEL_COUNT,
  extraAudioConstraints = {},
} = {}) {
  const useBrowserNoiseSuppression = shouldUseBrowserNoiseSuppression(denoiserMode);

  return {
    ...(deviceId && deviceId !== "default" ? { deviceId: { exact: deviceId } } : {}),
    echoCancellation: Boolean(echoCancellation),
    noiseSuppression: useBrowserNoiseSuppression,
    autoGainControl: false,
    channelCount: relaxed ? undefined : channelCount,
    sampleRate: relaxed ? undefined : sampleRate,
    ...extraAudioConstraints,
  };
}

function createDenoiserMetrics(selectedDenoiser, fallbackReason = "") {
  return {
    selectedDenoiser,
    fallbackReason,
    inputRms: 0,
    inputPeak: 0,
    outputRms: 0,
    outputPeak: 0,
    droppedFrames: 0,
    underruns: 0,
    processorLatencyMs: 0,
    realtimeFactor: 0,
  };
}

function getAudioTrackDebugInfo(track) {
  if (!track) {
    return null;
  }

  return {
    id: track.id || "",
    label: track.label || "",
    enabled: track.enabled,
    muted: track.muted,
    readyState: track.readyState || "",
    settings: track.getSettings?.() || {},
    constraints: track.getConstraints?.() || {},
  };
}

function getAudioPipelineModuleId() {
  return "deepfilternet";
}

async function loadAudioPipelineTrackProcessor() {
  if (!audioPipelinePluginPromise) {
    audioPipelinePluginPromise = import("@cc-livekit/audio-pipeline-plugin");
  }

  const module = await audioPipelinePluginPromise;
  if (!module?.AudioPipelineTrackProcessor) {
    throw new Error("Audio pipeline processor is unavailable.");
  }

  return module.AudioPipelineTrackProcessor;
}

async function runWithRnnoiseFetchDisabled(operation) {
  if (typeof window === "undefined" || typeof window.fetch !== "function") {
    return operation();
  }

  const originalFetch = window.fetch.bind(window);
  window.fetch = (resource, options) => {
    const url = typeof resource === "string" ? resource : resource?.url || "";
    if (String(url).includes("rnnoise.wasm")) {
      return Promise.resolve(new Response(new ArrayBuffer(0), {
        status: 200,
        headers: { "Content-Type": "application/wasm" },
      }));
    }

    return originalFetch(resource, options);
  };

  try {
    return await operation();
  } finally {
    window.fetch = originalFetch;
  }
}

function getAudioPipelineRuntimeOptions(mode, profile, options = {}) {
  const workletUrl =
    options.workletUrl
    || getWindowValue("__ND_AUDIO_PIPELINE_WORKLET_URL__")
    || AUDIO_PIPELINE_WORKLET_URL;
  const workerUrl =
    options.workerUrl
    || getWindowValue("__ND_AUDIO_PIPELINE_WORKER_URL__")
    || AUDIO_PIPELINE_WORKER_URL;
  const moduleId = getAudioPipelineModuleId(mode);
  const profileDeepFilterConfig =
    DEEPFILTER_CONFIG_BY_PROFILE[normalizeAudioProcessingProfile(profile)]
    || DEEPFILTER_CONFIG_BY_PROFILE[AUDIO_PROCESSING_PROFILE_BROADCAST];
  const deepFilterConfig = {
    ...profileDeepFilterConfig,
    minDbThresh: -18,
    maxDbErbThresh: 35,
    maxDbDfThresh: 35,
    ...(options.deepfilternet || {}),
  };

  return {
    workletUrl: resolvePublicAssetUrl(workletUrl),
    workerUrl: resolvePublicAssetUrl(workerUrl),
    debugLogs: Boolean(options.debugLogs || getWindowValue("__ND_AUDIO_PIPELINE_DEBUG__")),
    batchFrames: Math.max(1, Math.floor(Number(options.batchFrames) || 1)),
    stages: {
      denoise: moduleId,
    },
    moduleConfigs: {
      deepfilternet: deepFilterConfig,
      soundtouch: {
        enabled: false,
      },
    },
  };
}

async function createAudioWorkletDenoisedStream({
  stream,
  mode,
  profile,
  workletOptions,
}) {
  if (typeof window === "undefined") {
    throw new Error("AudioWorklet is not available outside browser runtime.");
  }

  const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextCtor || !window.AudioWorkletNode) {
    throw new Error("AudioWorklet is not supported in this runtime.");
  }

  if (!workletOptions && failedWorkletDenoisers.has(mode)) {
    throw new Error(failedWorkletDenoisers.get(mode));
  }

  const [sourceTrack] = stream?.getAudioTracks?.() || [];
  if (!sourceTrack) {
    throw new Error(`${mode} cannot start without a microphone track.`);
  }

  const audioContext = new AudioContextCtor({
    sampleRate: DEFAULT_SAMPLE_RATE,
    latencyHint: "interactive",
  });

  let processor = null;
  try {
    const AudioPipelineTrackProcessor = await loadAudioPipelineTrackProcessor();
    if (!AudioPipelineTrackProcessor.isSupported?.()) {
      throw new Error("Audio pipeline processor is not supported in this runtime.");
    }

    if (!audioContext.audioWorklet?.addModule) {
      throw new Error("AudioWorklet module loading is not supported in this runtime.");
    }

    processor = new AudioPipelineTrackProcessor(getAudioPipelineRuntimeOptions(mode, profile, workletOptions));
    await runWithRnnoiseFetchDisabled(() => processor.init({
      audioContext,
      track: sourceTrack,
    }));

    if (audioContext.state === "suspended") {
      await audioContext.resume().catch(() => {});
    }

    const processedTrack = processor.processedTrack;
    if (!processedTrack) {
      throw new Error(`${mode} did not return a processed microphone track.`);
    }
    processedTrack.contentHint = "speech";
    const outputStream = new MediaStream([processedTrack]);

    return {
      stream: outputStream,
      cleanup: () => {
        Promise.resolve(processor?.destroy?.()).catch(() => {});
        audioContext.close?.().catch(() => {});
      },
    };
  } catch (error) {
    if (!workletOptions) {
      failedWorkletDenoisers.set(mode, error?.message || String(error));
    }
    Promise.resolve(processor?.destroy?.()).catch(() => {});
    audioContext.close?.().catch(() => {});
    throw error;
  }
}

export async function createProcessedMicrophoneTrack({
  profile = AUDIO_PROCESSING_PROFILE_BROADCAST,
  preferredDenoiser = "",
  sourceStream = null,
  buildCaptureConstraints,
  captureStream,
  logger,
  debugLabel = "microphone",
  workletOptions,
} = {}) {
  const normalizedProfile = normalizeAudioProcessingProfile(profile);
  const selectedPreference = resolvePreferredAudioDenoiser(normalizedProfile, preferredDenoiser);
  const fallbackChain = getAudioDenoiserFallbackChain(selectedPreference);
  let lastError = null;
  let fallbackReason = "";

  for (const denoiserMode of fallbackChain) {
    const metrics = createDenoiserMetrics(denoiserMode, fallbackReason);
    let nextSourceStream = sourceStream;

    try {
      if (!nextSourceStream) {
        const constraints = typeof buildCaptureConstraints === "function"
          ? buildCaptureConstraints(denoiserMode)
          : { audio: buildAudioCaptureConstraints({ denoiserMode }) };
        nextSourceStream = typeof captureStream === "function"
          ? await captureStream(constraints, denoiserMode)
          : await navigator.mediaDevices.getUserMedia(constraints);

        logger?.("audio:capture", {
          debugLabel,
          profile: normalizedProfile,
          requestedDenoiser: selectedPreference,
          selectedDenoiser: denoiserMode,
          fallbackReason,
          requestedConstraints: constraints,
          track: getAudioTrackDebugInfo(nextSourceStream.getAudioTracks?.()[0]),
        });
      }

      if (denoiserMode === AUDIO_DENOISER_MODE_WEBRTC || denoiserMode === AUDIO_DENOISER_MODE_OFF) {
        return {
          sourceStream: nextSourceStream,
          stream: nextSourceStream,
          track: nextSourceStream.getAudioTracks?.()[0] || null,
          selectedDenoiser: denoiserMode,
          requestedDenoiser: selectedPreference,
          fallbackReason,
          metrics,
          cleanup: () => {},
        };
      }

      const denoised = await createAudioWorkletDenoisedStream({
        stream: nextSourceStream,
        mode: denoiserMode,
        profile: normalizedProfile,
        workletOptions,
      });

      return {
        sourceStream: nextSourceStream,
        stream: denoised.stream,
        track: denoised.stream.getAudioTracks?.()[0] || null,
        selectedDenoiser: denoiserMode,
        requestedDenoiser: selectedPreference,
        fallbackReason,
        metrics,
        cleanup: denoised.cleanup,
      };
    } catch (error) {
      lastError = error;
      fallbackReason = `${denoiserMode}: ${error?.message || String(error)}`;
      logger?.("audio:denoiser-fallback", {
        debugLabel,
        profile: normalizedProfile,
        requestedDenoiser: selectedPreference,
        failedDenoiser: denoiserMode,
        fallbackReason,
      });

      if (!sourceStream) {
        nextSourceStream?.getTracks?.().forEach((track) => {
          try {
            track.stop();
          } catch {
            // Ignore stopped capture tracks before trying the next fallback mode.
          }
        });
      }
    }
  }

  throw lastError || new Error("Unable to create processed microphone track.");
}
