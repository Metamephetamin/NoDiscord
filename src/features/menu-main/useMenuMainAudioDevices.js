import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { areObjectArraysEqual } from "./menuMainRealtimeComparators";

export default function useMenuMainAudioDevices({
  user,
  voiceClientRef,
  audioInputDeviceStorageKey,
  audioOutputDeviceStorageKey,
  openSettings,
  settingsTab,
  showMicMenu,
  showSoundMenu,
  isMicTestActive,
}) {
  const [audioInputDevices, setAudioInputDevices] = useState([]);
  const [audioOutputDevices, setAudioOutputDevices] = useState([]);
  const [selectedInputDeviceId, setSelectedInputDeviceId] = useState("");
  const [selectedOutputDeviceId, setSelectedOutputDeviceId] = useState("");
  const [outputSelectionSupported, setOutputSelectionSupported] = useState(false);
  const appliedInputDeviceRef = useRef("");
  const appliedOutputDeviceRef = useRef("");

  useEffect(() => {
    if (!user) {
      setAudioInputDevices([]);
      setAudioOutputDevices([]);
      setSelectedInputDeviceId("");
      setSelectedOutputDeviceId("");
      setOutputSelectionSupported(false);
      appliedInputDeviceRef.current = "";
      appliedOutputDeviceRef.current = "";
      return;
    }

    try {
      setSelectedInputDeviceId(localStorage.getItem(audioInputDeviceStorageKey) || "");
    } catch {
      setSelectedInputDeviceId("");
    }

    try {
      setSelectedOutputDeviceId(localStorage.getItem(audioOutputDeviceStorageKey) || "");
    } catch {
      setSelectedOutputDeviceId("");
    }
  }, [audioInputDeviceStorageKey, audioOutputDeviceStorageKey, user]);

  useEffect(() => {
    if (!user) {
      return;
    }

    try {
      if (selectedInputDeviceId) {
        localStorage.setItem(audioInputDeviceStorageKey, selectedInputDeviceId);
      } else {
        localStorage.removeItem(audioInputDeviceStorageKey);
      }
    } catch {
      // ignore storage failures
    }
  }, [audioInputDeviceStorageKey, selectedInputDeviceId, user]);

  useEffect(() => {
    if (!user) {
      return;
    }

    try {
      if (selectedOutputDeviceId) {
        localStorage.setItem(audioOutputDeviceStorageKey, selectedOutputDeviceId);
      } else {
        localStorage.removeItem(audioOutputDeviceStorageKey);
      }
    } catch {
      // ignore storage failures
    }
  }, [audioOutputDeviceStorageKey, selectedOutputDeviceId, user]);

  const handleAudioDevicesChanged = useCallback(({
    inputs,
    outputs,
    selectedInputDeviceId: nextInputDeviceId,
    selectedOutputDeviceId: nextOutputDeviceId,
    outputSelectionSupported: nextOutputSelectionSupported,
  }) => {
    const normalizedInputs = Array.isArray(inputs) ? inputs : [];
    const normalizedOutputs = Array.isArray(outputs) ? outputs : [];
    const normalizedInputDeviceId = nextInputDeviceId || "";
    const normalizedOutputDeviceId = nextOutputDeviceId || "";
    const normalizedOutputSelectionSupported = Boolean(nextOutputSelectionSupported);

    setAudioInputDevices((previousValue) => (
      areObjectArraysEqual(previousValue, normalizedInputs) ? previousValue : normalizedInputs
    ));
    setAudioOutputDevices((previousValue) => (
      areObjectArraysEqual(previousValue, normalizedOutputs) ? previousValue : normalizedOutputs
    ));
    setSelectedInputDeviceId((previousValue) => (
      previousValue === normalizedInputDeviceId ? previousValue : normalizedInputDeviceId
    ));
    setSelectedOutputDeviceId((previousValue) => (
      previousValue === normalizedOutputDeviceId ? previousValue : normalizedOutputDeviceId
    ));
    setOutputSelectionSupported((previousValue) => (
      previousValue === normalizedOutputSelectionSupported ? previousValue : normalizedOutputSelectionSupported
    ));
  }, []);

  const applySelectedAudioDevicesToClient = useCallback((client = voiceClientRef.current) => {
    if (!client) {
      return;
    }

    if (selectedInputDeviceId) {
      appliedInputDeviceRef.current = selectedInputDeviceId;
      client.setInputDevice(selectedInputDeviceId).catch((error) => {
        console.error("Ошибка применения устройства ввода:", error);
      });
    }

    if (selectedOutputDeviceId) {
      appliedOutputDeviceRef.current = selectedOutputDeviceId;
      client.setOutputDevice(selectedOutputDeviceId).catch((error) => {
        console.error("Ошибка применения устройства вывода:", error);
      });
    }
  }, [selectedInputDeviceId, selectedOutputDeviceId, voiceClientRef]);

  useEffect(() => {
    if (!voiceClientRef.current || !selectedInputDeviceId) {
      return;
    }

    if (appliedInputDeviceRef.current === selectedInputDeviceId) {
      return;
    }

    appliedInputDeviceRef.current = selectedInputDeviceId;
    voiceClientRef.current.setInputDevice(selectedInputDeviceId).catch((error) => {
      console.error("Ошибка переключения устройства ввода:", error);
    });
  }, [selectedInputDeviceId, voiceClientRef]);

  useEffect(() => {
    if (!voiceClientRef.current || !selectedOutputDeviceId) {
      return;
    }

    if (appliedOutputDeviceRef.current === selectedOutputDeviceId) {
      return;
    }

    appliedOutputDeviceRef.current = selectedOutputDeviceId;
    voiceClientRef.current.setOutputDevice(selectedOutputDeviceId).catch((error) => {
      console.error("Ошибка переключения устройства вывода:", error);
    });
  }, [selectedOutputDeviceId, voiceClientRef]);

  useEffect(() => {
    if (!voiceClientRef.current || !user?.id) {
      return;
    }

    const shouldPreviewMicrophone = showMicMenu || isMicTestActive;
    const shouldLoadAudioDevices = shouldPreviewMicrophone || showSoundMenu || (openSettings && settingsTab === "voice_video");

    if (!shouldLoadAudioDevices) {
      voiceClientRef.current.releaseMicrophonePreview().catch((error) => {
        console.error("Ошибка остановки предпросмотра микрофона:", error);
      });
      return;
    }

    if (shouldPreviewMicrophone) {
      voiceClientRef.current.ensureMicrophonePreview().catch((error) => {
        console.error("Ошибка запуска предпросмотра микрофона:", error);
      });
      return;
    }

    voiceClientRef.current.releaseMicrophonePreview().catch((error) => {
      console.error("Ошибка остановки предпросмотра микрофона:", error);
    });
    voiceClientRef.current.getAudioDevices().catch((error) => {
      console.error("Ошибка обновления списка аудио-устройств:", error);
    });
  }, [isMicTestActive, openSettings, settingsTab, showMicMenu, showSoundMenu, user?.id, voiceClientRef]);

  const deviceInputLabel = useMemo(() => (
    audioInputDevices.find((device) => device.id === selectedInputDeviceId)?.label ||
    audioInputDevices[0]?.label ||
    "Системный микрофон"
  ), [audioInputDevices, selectedInputDeviceId]);

  const deviceOutputLabel = useMemo(() => (
    audioOutputDevices.find((device) => device.id === selectedOutputDeviceId)?.label ||
    audioOutputDevices[0]?.label ||
    "Системный вывод"
  ), [audioOutputDevices, selectedOutputDeviceId]);

  return {
    audioInputDevices,
    audioOutputDevices,
    selectedInputDeviceId,
    selectedOutputDeviceId,
    setSelectedInputDeviceId,
    setSelectedOutputDeviceId,
    outputSelectionSupported,
    outputSelectionAvailable: outputSelectionSupported && audioOutputDevices.length > 0,
    deviceInputLabel,
    deviceOutputLabel,
    handleAudioDevicesChanged,
    applySelectedAudioDevicesToClient,
  };
}
