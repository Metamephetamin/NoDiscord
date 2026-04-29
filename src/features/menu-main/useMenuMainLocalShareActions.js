import { useCallback, useRef } from "react";
import { getScopedVoiceChannelId } from "../../utils/menuMainModel";

export default function useMenuMainLocalShareActions({
  voiceClientRef,
  currentVoiceChannel,
  currentVoiceChannelRef,
  servers,
  resolution,
  fps,
  shareStreamAudio,
  selectedVideoDeviceId,
  isScreenShareActive,
  isCameraShareActive,
  isScreenShareSupported,
  displayCaptureSupportInfo,
  hasLocalSharePreview,
  setShowModal,
  setShowCameraModal,
  setSelectedStreamUserId,
  setIsLocalSharePreviewVisible,
  setScreenShareError,
  setCameraError,
  setDesktopServerPane,
  pushNavigationHistory,
  showServerInviteFeedback,
  stopCameraPreview,
  startCameraPreview,
  pendingLocalScreenShareToneRef,
  clearScreenShareStartToneTimeout,
  scheduleScreenShareStartTone,
  playUiTone,
}) {
  const localShareActionInFlightRef = useRef(false);

  const startScreenShare = useCallback(async () => {
    if (!voiceClientRef.current || localShareActionInFlightRef.current) {
      return;
    }

    localShareActionInFlightRef.current = true;
    setScreenShareError("");
    pendingLocalScreenShareToneRef.current = "shareStart";
    clearScreenShareStartToneTimeout();

    try {
      await voiceClientRef.current.startScreenShare({ resolution, fps, shareAudio: shareStreamAudio });
      scheduleScreenShareStartTone(140);
      setShowModal(false);
      setSelectedStreamUserId(null);
      setIsLocalSharePreviewVisible(true);
    } catch (error) {
      pendingLocalScreenShareToneRef.current = "";
      clearScreenShareStartToneTimeout();
      const message = error?.message || "Не удалось запустить трансляцию экрана.";
      setScreenShareError(message);
      showServerInviteFeedback(message);
      throw error;
    } finally {
      localShareActionInFlightRef.current = false;
    }
  }, [
    clearScreenShareStartToneTimeout,
    fps,
    pendingLocalScreenShareToneRef,
    resolution,
    scheduleScreenShareStartTone,
    setIsLocalSharePreviewVisible,
    setScreenShareError,
    setSelectedStreamUserId,
    setShowModal,
    shareStreamAudio,
    showServerInviteFeedback,
    voiceClientRef,
  ]);

  const stopScreenShare = useCallback(async () => {
    if (!voiceClientRef.current || localShareActionInFlightRef.current) {
      return;
    }

    localShareActionInFlightRef.current = true;
    setScreenShareError("");
    pendingLocalScreenShareToneRef.current = "shareStop";
    clearScreenShareStartToneTimeout();
    playUiTone("shareStop");

    try {
      await voiceClientRef.current.stopScreenShare();
      setShowModal(false);
      setIsLocalSharePreviewVisible(Boolean(isCameraShareActive));
    } catch (error) {
      pendingLocalScreenShareToneRef.current = "";
      const message = error?.message || "Не удалось остановить трансляцию экрана.";
      setScreenShareError(message);
      showServerInviteFeedback(message);
      throw error;
    } finally {
      localShareActionInFlightRef.current = false;
    }
  }, [
    clearScreenShareStartToneTimeout,
    isCameraShareActive,
    pendingLocalScreenShareToneRef,
    playUiTone,
    setIsLocalSharePreviewVisible,
    setScreenShareError,
    setShowModal,
    showServerInviteFeedback,
    voiceClientRef,
  ]);

  const handleScreenShareAction = useCallback(async () => {
    if (isScreenShareActive) {
      await stopScreenShare();
      return;
    }

    if (!currentVoiceChannel) {
      showServerInviteFeedback("Сначала подключитесь к голосовому каналу.");
      return;
    }

    if (!isScreenShareSupported) {
      setScreenShareError(displayCaptureSupportInfo.subtitle);
      showServerInviteFeedback(displayCaptureSupportInfo.subtitle);
      return;
    }

    setShowCameraModal(false);
    setScreenShareError("");
    setShowModal(true);
  }, [
    currentVoiceChannel,
    displayCaptureSupportInfo.subtitle,
    isScreenShareActive,
    isScreenShareSupported,
    isCameraShareActive,
    setScreenShareError,
    setShowCameraModal,
    setShowModal,
    showServerInviteFeedback,
    stopScreenShare,
  ]);

  const openLocalSharePreview = useCallback(() => {
    if (!hasLocalSharePreview) {
      showServerInviteFeedback("Сначала запустите камеру или стрим.");
      return;
    }

    pushNavigationHistory(() => {
      setSelectedStreamUserId(null);
      setDesktopServerPane("voice");
      setIsLocalSharePreviewVisible(true);
    });
  }, [
    hasLocalSharePreview,
    pushNavigationHistory,
    setDesktopServerPane,
    setIsLocalSharePreviewVisible,
    setSelectedStreamUserId,
    showServerInviteFeedback,
  ]);

  const closeLocalSharePreview = useCallback(() => {
    setIsLocalSharePreviewVisible(false);
  }, [setIsLocalSharePreviewVisible]);

  const startCameraShare = useCallback(async (options = {}) => {
    if (!voiceClientRef.current || localShareActionInFlightRef.current) {
      return;
    }

    const restorePreviewOnError = !options?.nativeEvent && options?.restorePreviewOnError === false ? false : true;
    localShareActionInFlightRef.current = true;
    setCameraError("");
    stopCameraPreview();

    try {
      const currentChannelConfig = servers
        .flatMap((server) => (server.voiceChannels || []).map((channel) => ({
          ...channel,
          runtimeId: getScopedVoiceChannelId(server.id, channel.id),
        })))
        .find((channel) => String(channel.runtimeId || "") === String(currentVoiceChannelRef.current || ""));
      const channelVideoQuality = String(currentChannelConfig?.videoQuality || "auto");
      const effectiveResolution =
        channelVideoQuality && channelVideoQuality !== "auto" ? channelVideoQuality : resolution;

      await voiceClientRef.current.startCameraShare({
        deviceId: selectedVideoDeviceId,
        resolution: effectiveResolution,
        fps,
      });
      setShowCameraModal(false);
      setSelectedStreamUserId(null);
      setIsLocalSharePreviewVisible(true);
    } catch (error) {
      const message = error?.message || "Не удалось запустить трансляцию камеры.";
      setCameraError(message);
      showServerInviteFeedback(message);
      if (restorePreviewOnError) {
        startCameraPreview(selectedVideoDeviceId).catch(() => {});
      }
    } finally {
      localShareActionInFlightRef.current = false;
    }
  }, [
    currentVoiceChannelRef,
    fps,
    resolution,
    selectedVideoDeviceId,
    servers,
    setCameraError,
    setIsLocalSharePreviewVisible,
    setSelectedStreamUserId,
    setShowCameraModal,
    showServerInviteFeedback,
    startCameraPreview,
    stopCameraPreview,
    voiceClientRef,
  ]);

  const stopCameraShare = useCallback(async () => {
    if (!voiceClientRef.current || localShareActionInFlightRef.current) {
      return;
    }

    localShareActionInFlightRef.current = true;
    setCameraError("");
    try {
      await voiceClientRef.current.stopCameraShare();
      setShowCameraModal(false);
      setIsLocalSharePreviewVisible(Boolean(isScreenShareActive));
      stopCameraPreview();
    } catch (error) {
      setCameraError(error?.message || "Не удалось остановить трансляцию камеры.");
    } finally {
      localShareActionInFlightRef.current = false;
    }
  }, [
    setCameraError,
    isScreenShareActive,
    setIsLocalSharePreviewVisible,
    setShowCameraModal,
    stopCameraPreview,
    voiceClientRef,
  ]);

  return {
    startScreenShare,
    stopScreenShare,
    handleScreenShareAction,
    openLocalSharePreview,
    closeLocalSharePreview,
    startCameraShare,
    stopCameraShare,
  };
}
