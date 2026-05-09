import { useCallback, useEffect, useMemo, useState } from "react";
import {
  DEFAULT_VOICE_INPUT_MODE,
  VOICE_INPUT_MODES,
  getVoiceInputModeNoiseStrength,
} from "../../utils/menuMainModel";

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

export default function useMenuMainVoiceProcessing({
  user,
  voiceClientRef,
  noiseSuppressionStorageKey,
  echoCancellationStorageKey,
}) {
  const [noiseSuppressionMode, setNoiseSuppressionMode] = useState(DEFAULT_VOICE_INPUT_MODE);
  const [echoCancellationEnabled, setEchoCancellationEnabled] = useState(true);
  const noiseSuppressionStrength = useMemo(
    () => getVoiceInputModeNoiseStrength(noiseSuppressionMode),
    [noiseSuppressionMode]
  );
  const voiceProcessingStateRef = useMemo(() => ({
    current: {
      noiseSuppressionMode: DEFAULT_VOICE_INPUT_MODE,
      noiseSuppressionStrength: getVoiceInputModeNoiseStrength(DEFAULT_VOICE_INPUT_MODE),
      echoCancellationEnabled: true,
    },
  }), []);

  useEffect(() => {
    voiceProcessingStateRef.current = {
      noiseSuppressionMode,
      noiseSuppressionStrength,
      echoCancellationEnabled,
    };
  }, [echoCancellationEnabled, noiseSuppressionMode, noiseSuppressionStrength, voiceProcessingStateRef]);

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
