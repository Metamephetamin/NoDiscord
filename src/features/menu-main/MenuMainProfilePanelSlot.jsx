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
  isMicMuted,
  isSoundMuted,
  showMicMenu,
  showSoundMenu,
  micMenuRef,
  soundMenuRef,
  avatarInputRef,
  serverIconInputRef,
  user,
  audioInputDevices,
  audioOutputDevices,
  selectedInputDeviceId,
  selectedOutputDeviceId,
  outputSelectionAvailable,
  deviceInputLabel,
  deviceOutputLabel,
  noiseProfileOptions,
  noiseSuppressionMode,
  noiseSuppressionStrength,
  activeNoiseProfile,
  echoCancellationEnabled,
  micVolume,
  audioVolume,
  activeMicMenuBars,
  openSettingsPanel,
  handleScreenShareAction,
  openCameraModal,
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
  handleNoiseSuppressionStrengthChange,
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
      audioInputDevices={audioInputDevices}
      audioOutputDevices={audioOutputDevices}
      selectedInputDeviceId={selectedInputDeviceId}
      selectedOutputDeviceId={selectedOutputDeviceId}
      outputSelectionAvailable={outputSelectionAvailable}
      deviceInputLabel={deviceInputLabel}
      deviceOutputLabel={deviceOutputLabel}
      noiseProfileOptions={noiseProfileOptions}
      noiseSuppressionMode={noiseSuppressionMode}
      noiseSuppressionStrength={noiseSuppressionStrength}
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
      onNoiseStrengthChange={handleNoiseSuppressionStrengthChange}
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
