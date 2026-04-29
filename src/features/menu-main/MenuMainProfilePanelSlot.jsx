import MenuProfilePanel from "../../components/MenuProfilePanel";
import {
  getDisplayName,
  getUserAvatarFrame,
  SETTINGS_ICON_URL,
} from "../../utils/menuMainModel";
import { formatIntegrationActivityStatus } from "../../utils/integrations";

export default function MenuMainProfilePanelSlot({
  currentVoiceChannel,
  currentVoiceChannelName,
  pingTone,
  pingTooltip,
  isCurrentUserSpeaking,
  isScreenShareActive,
  isCameraShareActive,
  streamResolution,
  streamFps,
  streamDiagnostics,
  streamSourceTitle,
  streamResolutionOptions,
  streamFpsOptions,
  isMicMuted,
  isSoundMuted,
  showMicMenu,
  showSoundMenu,
  micMenuRef,
  soundMenuRef,
  avatarInputRef,
  serverIconInputRef,
  user,
  profileCustomization,
  audioInputDevices,
  audioOutputDevices,
  selectedInputDeviceId,
  selectedOutputDeviceId,
  outputSelectionAvailable,
  deviceInputLabel,
  deviceOutputLabel,
  noiseProfileOptions,
  noiseSuppressionMode,
  activeNoiseProfile,
  echoCancellationEnabled,
  micVolume,
  audioVolume,
  activeMicMenuBars,
  openSettingsPanel,
  handleScreenShareAction,
  openCameraModal,
  stopCameraShare,
  openLocalSharePreview,
  handleStreamResolutionChange,
  handleStreamFpsChange,
  leaveVoiceChannel,
  leaveCurrentVoiceContext,
  handleAvatarChange,
  handleServerIconChange,
  toggleMicMute,
  toggleSoundMute,
  setShowMicMenu,
  setShowSoundMenu,
  handleInputDeviceChange,
  handleOutputDeviceChange,
  handleNoiseSuppressionModeChange,
  toggleEchoCancellation,
  updateMicVolume,
  updateAudioVolume,
  suppressTooltipOnClick,
  restoreTooltipOnLeave,
  leaveVoiceActionLabel,
  leaveVoiceActionAriaLabel,
}) {
  return (
    <MenuProfilePanel
      currentVoiceChannel={currentVoiceChannel}
      currentVoiceChannelName={currentVoiceChannelName}
      pingTone={pingTone}
      pingTooltip={pingTooltip}
      isCurrentUserSpeaking={isCurrentUserSpeaking}
      isScreenShareActive={isScreenShareActive}
      isCameraShareActive={isCameraShareActive}
      streamResolution={streamResolution}
      streamFps={streamFps}
      streamDiagnostics={streamDiagnostics}
      streamSourceTitle={streamSourceTitle}
      streamResolutionOptions={streamResolutionOptions}
      streamFpsOptions={streamFpsOptions}
      isMicMuted={isMicMuted}
      isSoundMuted={isSoundMuted}
      showMicMenu={showMicMenu}
      showSoundMenu={showSoundMenu}
      micMenuRef={micMenuRef}
      soundMenuRef={soundMenuRef}
      avatarInputRef={avatarInputRef}
      serverIconInputRef={serverIconInputRef}
      userAvatarSrc={user?.avatarUrl || user?.avatar}
      userAvatarFrame={getUserAvatarFrame(user)}
      displayName={getDisplayName(user)}
      activityStatus={formatIntegrationActivityStatus(user?.activity || user?.externalActivity)}
      profileCustomization={profileCustomization}
      audioInputDevices={audioInputDevices}
      audioOutputDevices={audioOutputDevices}
      selectedInputDeviceId={selectedInputDeviceId}
      selectedOutputDeviceId={selectedOutputDeviceId}
      outputSelectionAvailable={outputSelectionAvailable}
      deviceInputLabel={deviceInputLabel}
      deviceOutputLabel={deviceOutputLabel}
      noiseProfileOptions={noiseProfileOptions}
      noiseSuppressionMode={noiseSuppressionMode}
      activeNoiseProfile={activeNoiseProfile}
      echoCancellationEnabled={echoCancellationEnabled}
      micVolume={micVolume}
      audioVolume={audioVolume}
      activeMicMenuBars={activeMicMenuBars}
      icons={{ settings: SETTINGS_ICON_URL }}
      onOpenProfileSettings={() => openSettingsPanel("personal_profile")}
      onOpenVoiceSettings={() => openSettingsPanel("voice_video")}
      onScreenShareAction={handleScreenShareAction}
      onOpenCamera={openCameraModal}
      onStopCameraShare={stopCameraShare}
      onOpenLocalSharePreview={openLocalSharePreview}
      onStreamResolutionChange={handleStreamResolutionChange}
      onStreamFpsChange={handleStreamFpsChange}
      onLeaveVoiceChannel={leaveCurrentVoiceContext || leaveVoiceChannel}
      onAvatarChange={handleAvatarChange}
      onServerIconChange={handleServerIconChange}
      onToggleMicMute={toggleMicMute}
      onToggleSoundMute={toggleSoundMute}
      onToggleMicMenu={() => setShowMicMenu((previous) => !previous)}
      onToggleSoundMenu={() => setShowSoundMenu((previous) => !previous)}
      onInputDeviceChange={handleInputDeviceChange}
      onOutputDeviceChange={handleOutputDeviceChange}
      onNoiseProfileChange={handleNoiseSuppressionModeChange}
      onToggleEchoCancellation={toggleEchoCancellation}
      onMicVolumeChange={updateMicVolume}
      onAudioVolumeChange={updateAudioVolume}
      onSuppressTooltip={suppressTooltipOnClick}
      onRestoreTooltip={restoreTooltipOnLeave}
      leaveVoiceActionLabel={leaveVoiceActionLabel}
      leaveVoiceActionAriaLabel={leaveVoiceActionAriaLabel}
      directCallPanel={null}
    />
  );
}
