import { useCallback, useEffect, useMemo, useState } from "react";
import {
  DEFAULT_VOICE_INPUT_MODE,
  VOICE_INPUT_MODES,
  getVoiceInputModeNoiseStrength,
} from "../../utils/menuMainModel";
import {
  AUDIO_DENOISER_MODE_DEEPFILTERNET3,
  AUDIO_DENOISER_MODE_OFF,
  AUDIO_DENOISER_MODE_WEBRTC,
  AUDIO_DENOISER_STORAGE_KEY,
  normalizeAudioDenoiserMode,
} from "../../webrtc/processedMicrophoneTrack";

const NOISE_PROFILE_OPTIONS = [
  {
    id: "transparent",
    title: "Студия",
    description: "Естественный голос с лёгким DeepFilter, мягкой компрессией и без агрессивного отсечения.",
  },
  {
    id: "broadcast",
    title: "Эфир",
    description: "Сбалансированный режим для звонков: умеренное шумоподавление, чистый верх и ровная громкость.",
  },
  {
    id: "noisy_room",
    title: "Шумная комната",
    description: "Агрессивное отсечение шума для шумной комнаты, рации или дешёвого микрофона.",
  },
];

const DENOISER_MODE_OPTIONS = [
  {
    id: AUDIO_DENOISER_MODE_DEEPFILTERNET3,
    title: "Лучшее качество",
    description: "DeepFilterNet: самое сильное шумоподавление без зависимости от сети.",
  },
  {
    id: AUDIO_DENOISER_MODE_WEBRTC,
    title: "Баланс",
    description: "Встроенное WebRTC-шумоподавление браузера, легче для слабых устройств.",
  },
  {
    id: AUDIO_DENOISER_MODE_OFF,
    title: "Выключено",
    description: "Сырой микрофонный сигнал для диагностики и проблемных устройств.",
  },
];

export default function useMenuMainVoiceProcessing({
  user,
  voiceClientRef,
  noiseSuppressionStorageKey,
  echoCancellationStorageKey,
}) {
  const [noiseSuppressionMode, setNoiseSuppressionMode] = useState(DEFAULT_VOICE_INPUT_MODE);
  const [audioDenoiserMode, setAudioDenoiserMode] = useState(AUDIO_DENOISER_MODE_DEEPFILTERNET3);
  const [echoCancellationEnabled, setEchoCancellationEnabled] = useState(true);
  const noiseSuppressionStrength = useMemo(
    () => getVoiceInputModeNoiseStrength(noiseSuppressionMode),
    [noiseSuppressionMode]
  );
  const voiceProcessingStateRef = useMemo(() => ({
    current: {
      noiseSuppressionMode: DEFAULT_VOICE_INPUT_MODE,
      audioDenoiserMode: AUDIO_DENOISER_MODE_DEEPFILTERNET3,
      noiseSuppressionStrength: getVoiceInputModeNoiseStrength(DEFAULT_VOICE_INPUT_MODE),
      echoCancellationEnabled: true,
    },
  }), []);

  useEffect(() => {
    voiceProcessingStateRef.current = {
      noiseSuppressionMode,
      audioDenoiserMode,
      noiseSuppressionStrength,
      echoCancellationEnabled,
    };
  }, [audioDenoiserMode, echoCancellationEnabled, noiseSuppressionMode, noiseSuppressionStrength, voiceProcessingStateRef]);

  useEffect(() => {
    if (!user) {
      setNoiseSuppressionMode(DEFAULT_VOICE_INPUT_MODE);
      return;
    }

    try {
      const storedMode = localStorage.getItem(noiseSuppressionStorageKey);
      const normalizedStoredMode =
        storedMode === "voice_isolation" || storedMode === "hard_gate"
          ? "noisy_room"
          : storedMode;
      setNoiseSuppressionMode(VOICE_INPUT_MODES.includes(normalizedStoredMode) ? normalizedStoredMode : DEFAULT_VOICE_INPUT_MODE);
    } catch {
      setNoiseSuppressionMode(DEFAULT_VOICE_INPUT_MODE);
    }
  }, [noiseSuppressionStorageKey, user]);

  useEffect(() => {
    if (!user) {
      return;
    }

    try {
      localStorage.setItem(noiseSuppressionStorageKey, noiseSuppressionMode);
    } catch {
      // ignore storage failures
    }
  }, [noiseSuppressionMode, noiseSuppressionStorageKey, user]);

  useEffect(() => {
    if (!user) {
      setAudioDenoiserMode(AUDIO_DENOISER_MODE_DEEPFILTERNET3);
      return;
    }

    try {
      setAudioDenoiserMode(normalizeAudioDenoiserMode(
        localStorage.getItem(AUDIO_DENOISER_STORAGE_KEY),
        AUDIO_DENOISER_MODE_DEEPFILTERNET3
      ));
    } catch {
      setAudioDenoiserMode(AUDIO_DENOISER_MODE_DEEPFILTERNET3);
    }
  }, [user]);

  useEffect(() => {
    if (!user) {
      return;
    }

    try {
      localStorage.setItem(AUDIO_DENOISER_STORAGE_KEY, audioDenoiserMode);
    } catch {
      // ignore storage failures
    }
  }, [audioDenoiserMode, user]);

  useEffect(() => {
    if (!user) {
      setEchoCancellationEnabled(true);
      return;
    }

    try {
      setEchoCancellationEnabled(localStorage.getItem(echoCancellationStorageKey) !== "false");
    } catch {
      setEchoCancellationEnabled(true);
    }
  }, [echoCancellationStorageKey, user]);

  useEffect(() => {
    if (!user) {
      return;
    }

    try {
      localStorage.setItem(echoCancellationStorageKey, echoCancellationEnabled ? "true" : "false");
    } catch {
      // ignore storage failures
    }
  }, [echoCancellationEnabled, echoCancellationStorageKey, user]);

  const applyVoiceProcessingToClient = useCallback((client = voiceClientRef.current) => {
    if (!client) {
      return;
    }

    const currentVoiceProcessingState = voiceProcessingStateRef.current;
    client.setNoiseSuppressionMode(currentVoiceProcessingState.noiseSuppressionMode).catch((error) => {
      console.error("Ошибка применения стартового режима шумоподавления:", error);
    });
    client.setAudioDenoiserMode?.(currentVoiceProcessingState.audioDenoiserMode).catch((error) => {
      console.error("Ошибка применения стартового движка шумоподавления:", error);
    });
    client.setNoiseSuppressionStrength?.(currentVoiceProcessingState.noiseSuppressionStrength).catch((error) => {
      console.error("Ошибка применения силы шумоподавления:", error);
    });
    client.setEchoCancellationEnabled(currentVoiceProcessingState.echoCancellationEnabled).catch((error) => {
      console.error("Ошибка применения стартового эхоподавления:", error);
    });
  }, [voiceClientRef, voiceProcessingStateRef]);

  useEffect(() => {
    if (!voiceClientRef.current) {
      return;
    }

    voiceClientRef.current.setNoiseSuppressionMode(noiseSuppressionMode).catch((error) => {
      console.error("Ошибка переключения режима шумоподавления:", error);
    });
  }, [noiseSuppressionMode, voiceClientRef]);

  useEffect(() => {
    if (!voiceClientRef.current) {
      return;
    }

    voiceClientRef.current.setAudioDenoiserMode?.(audioDenoiserMode).catch((error) => {
      console.error("Ошибка переключения движка шумоподавления:", error);
    });
  }, [audioDenoiserMode, voiceClientRef]);

  useEffect(() => {
    if (!voiceClientRef.current) {
      return;
    }

    voiceClientRef.current.setNoiseSuppressionStrength?.(noiseSuppressionStrength).catch((error) => {
      console.error("Ошибка переключения силы шумоподавления:", error);
    });
  }, [noiseSuppressionStrength, voiceClientRef]);

  useEffect(() => {
    if (!voiceClientRef.current) {
      return;
    }

    voiceClientRef.current.setEchoCancellationEnabled(echoCancellationEnabled).catch((error) => {
      console.error("Ошибка переключения эхоподавления:", error);
    });
  }, [echoCancellationEnabled, voiceClientRef]);

  const noiseProfileOptions = NOISE_PROFILE_OPTIONS;
  const activeNoiseProfile = useMemo(
    () => noiseProfileOptions.find((option) => option.id === noiseSuppressionMode) || noiseProfileOptions[0],
    [noiseProfileOptions, noiseSuppressionMode]
  );

  return {
    denoiserModeOptions: DENOISER_MODE_OPTIONS,
    audioDenoiserMode,
    setAudioDenoiserMode,
    noiseProfileOptions,
    activeNoiseProfile,
    noiseSuppressionMode,
    setNoiseSuppressionMode,
    noiseSuppressionStrength,
    echoCancellationEnabled,
    setEchoCancellationEnabled,
    applyVoiceProcessingToClient,
  };
}
