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
    description: "Естественный голос с лёгким EQ и мягкой компрессией, почти без заметного шумодава.",
  },
  {
    id: "broadcast",
    title: "Эфир",
    description: "Сбалансированный режим для звонков: умеренное шумоподавление, чистый верх и ровная громкость.",
  },
  {
    id: "hard_gate",
    title: "Hard Gate",
    description: "Агрессивно давит фон и посторонние звуки, оставляя в приоритете почти только голос.",
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

  useEffect(() => {
    if (!user) {
      setNoiseSuppressionMode(DEFAULT_VOICE_INPUT_MODE);
      return;
    }

    try {
      const storedMode = localStorage.getItem(noiseSuppressionStorageKey);
      const normalizedStoredMode =
        storedMode === "voice_isolation"
          ? "hard_gate"
          : storedMode === "rnnoise" || storedMode === "krisp" || storedMode === "ai_noise_suppression"
            ? "hard_gate"
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

    client.setNoiseSuppressionMode(noiseSuppressionMode).catch((error) => {
      console.error("Ошибка применения стартового режима шумоподавления:", error);
    });
    client.setNoiseSuppressionStrength?.(noiseSuppressionStrength).catch((error) => {
      console.error("Ошибка применения силы шумоподавления:", error);
    });
    client.setEchoCancellationEnabled(echoCancellationEnabled).catch((error) => {
      console.error("Ошибка применения стартового эхоподавления:", error);
    });
  }, [echoCancellationEnabled, noiseSuppressionMode, noiseSuppressionStrength, voiceClientRef]);

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
