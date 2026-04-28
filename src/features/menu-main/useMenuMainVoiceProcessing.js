import { useCallback, useEffect, useMemo, useState } from "react";
import { VOICE_INPUT_MODES } from "../../utils/menuMainModel";

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
    id: "ai_noise_suppression",
    title: "AI шумодав",
    description: "Тяжелая RNNoise/WASM-модель перед отправкой голоса: лучше режет клавиатуру, вентилятор и фон.",
  },
  {
    id: "hard_gate",
    title: "Hard RNNoise",
    description: "Агрессивно давит фон и посторонние звуки, оставляя в приоритете почти только голос.",
  },
];

export default function useMenuMainVoiceProcessing({
  user,
  voiceClientRef,
  noiseSuppressionStorageKey,
  echoCancellationStorageKey,
}) {
  const noiseSuppressionStrengthStorageKey = `${noiseSuppressionStorageKey}:strength`;
  const [noiseSuppressionMode, setNoiseSuppressionMode] = useState("transparent");
  const [noiseSuppressionStrength, setNoiseSuppressionStrength] = useState(100);
  const [echoCancellationEnabled, setEchoCancellationEnabled] = useState(true);

  useEffect(() => {
    if (!user) {
      setNoiseSuppressionMode("transparent");
      return;
    }

    try {
      const storedMode = localStorage.getItem(noiseSuppressionStorageKey);
      const normalizedStoredMode =
        storedMode === "voice_isolation"
          ? "hard_gate"
          : storedMode === "rnnoise" || storedMode === "krisp"
            ? "ai_noise_suppression"
            : storedMode;
      setNoiseSuppressionMode(VOICE_INPUT_MODES.includes(normalizedStoredMode) ? normalizedStoredMode : "transparent");
    } catch {
      setNoiseSuppressionMode("transparent");
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
      setNoiseSuppressionStrength(100);
      return;
    }

    try {
      const storedStrength = Number(localStorage.getItem(noiseSuppressionStrengthStorageKey));
      setNoiseSuppressionStrength(Number.isFinite(storedStrength) ? Math.max(0, Math.min(100, Math.round(storedStrength))) : 100);
    } catch {
      setNoiseSuppressionStrength(100);
    }
  }, [noiseSuppressionStrengthStorageKey, user]);

  useEffect(() => {
    if (!user) {
      return;
    }

    try {
      localStorage.setItem(noiseSuppressionStrengthStorageKey, String(noiseSuppressionStrength));
    } catch {
      // ignore storage failures
    }
  }, [noiseSuppressionStrength, noiseSuppressionStrengthStorageKey, user]);

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
    setNoiseSuppressionStrength,
    echoCancellationEnabled,
    setEchoCancellationEnabled,
    applyVoiceProcessingToClient,
  };
}
