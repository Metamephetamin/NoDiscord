import {
  AppearanceAccessibilitySettings,
  DevicesSettings,
  IntegrationsSettings,
  MobileSettingsShell,
  NotificationsSettings,
  PersonalProfileSettings,
  RolesSettings,
  ServerSettings,
  VoiceSettingsPanel,
} from "../../components/MenuSettingsPanels";
import {
  DEFAULT_SERVER_ICON,
} from "../../utils/media";
import {
  getDisplayName,
  getUserAvatarFrame,
  MAX_PROFILE_NAME_LENGTH,
  NOTIFICATION_SOUND_OPTIONS,
  ROLE_PERMISSION_LABELS,
  SETTINGS_ICON_URL,
  MICROPHONE_ICON_URL,
  HEADPHONES_ICON_URL,
} from "../../utils/menuMainModel";
import { getDirectMessageSoundOptions } from "../../utils/directMessageSounds";

export function MenuMainSettingsContent({
  settingsTab,
  profileBackgroundSrc,
  profileDraft,
  profileDisplayName,
  profileStatus,
  isTotpEnabled,
  totpSetup,
  maxProfileNicknameLength,
  user,
  avatarInputRef,
  profileBackgroundInputRef,
  serverIconInputRef,
  handleProfileSave,
  updateProfileDraft,
  updateTotpCode,
  startTotpSetup,
  verifyTotpSetup,
  disableTotp,
  handleLogout,
  deviceSessions,
  deviceSessionsLoading,
  deviceSessionsError,
  refreshDeviceSessions,
  openQrDeviceScanner,
  integrations,
  integrationsLoading,
  integrationsStatus,
  integrationActionBusy,
  handleConnectIntegration,
  handleDisconnectIntegration,
  handleToggleIntegrationSetting,
  audioInputDevices,
  audioOutputDevices,
  selectedInputDeviceId,
  selectedOutputDeviceId,
  outputSelectionAvailable,
  micVolume,
  audioVolume,
  activeMicSettingsBars,
  isMicTestActive,
  noiseProfileOptions,
  noiseSuppressionMode,
  noiseSuppressionStrength,
  activeNoiseProfile,
  echoCancellationEnabled,
  autoInputSensitivity,
  handleInputDeviceChange,
  handleOutputDeviceChange,
  updateMicVolume,
  updateAudioVolume,
  toggleMicrophoneTestPreview,
  handleNoiseSuppressionModeChange,
  handleNoiseSuppressionStrengthChange,
  toggleEchoCancellation,
  setAutoInputSensitivity,
  directNotificationsEnabled,
  conversationNotificationsEnabled,
  serverNotificationsEnabled,
  directMessageSoundEnabled,
  directMessageSendSoundId,
  directMessageReceiveSoundId,
  notificationSoundEnabled,
  notificationSoundId,
  notificationSoundOptions,
  customNotificationSoundData,
  customNotificationSoundName,
  notificationSoundError,
  notificationSoundInputRef,
  setDirectNotificationsEnabled,
  setConversationNotificationsEnabled,
  setServerNotificationsEnabled,
  setDirectMessageSoundEnabled,
  setDirectMessageSendSoundId,
  setDirectMessageReceiveSoundId,
  setNotificationSoundEnabled,
  setNotificationSoundId,
  setCustomNotificationSoundData,
  setCustomNotificationSoundName,
  setNotificationSoundError,
  handleCustomNotificationSoundChange,
  uiDensity,
  uiFontScale,
  uiReduceMotion,
  uiTouchTargetSize,
  setUiDensity,
  setUiFontScale,
  setUiReduceMotion,
  setUiTouchTargetSize,
  activeServer,
  canManageServer,
  canInviteMembers,
  isDefaultServer,
  currentUserId,
  voiceParticipantByUserId,
  updateActiveServerName,
  updateActiveServerDescription,
  handleDeleteServer,
  canManageTargetMember,
  canAssignRoleToMember,
  openMemberActionsMenu,
  syncServerSnapshot,
  handleImportServer,
  markServerAsShared,
  currentServerRole,
}) {
  switch (settingsTab) {
    case "personal_profile":
      return (
        <PersonalProfileSettings
          profileBackgroundSrc={profileBackgroundSrc}
          profileBackgroundFrame={profileDraft.profileBackgroundFrame}
          avatarSrc={user?.avatarUrl || user?.avatar}
          avatarFrame={getUserAvatarFrame(user)}
          displayName={profileDisplayName || getDisplayName(user)}
          email={profileDraft.email}
          profileDraft={profileDraft}
          profileStatus={profileStatus}
          isTotpEnabled={isTotpEnabled}
          totpSetup={totpSetup}
          maxProfileNameLength={MAX_PROFILE_NAME_LENGTH}
          maxNicknameLength={maxProfileNicknameLength}
          onSubmit={handleProfileSave}
          onChangeAvatar={() => avatarInputRef.current?.click()}
          onChangeBackground={() => profileBackgroundInputRef.current?.click()}
          onUpdateDraft={updateProfileDraft}
          onTotpCodeChange={updateTotpCode}
          onStartTotpSetup={startTotpSetup}
          onVerifyTotpSetup={verifyTotpSetup}
          onDisableTotp={disableTotp}
          onLogout={handleLogout}
        />
      );
    case "devices":
      return (
        <DevicesSettings
          deviceSessions={deviceSessions}
          deviceSessionsLoading={deviceSessionsLoading}
          deviceSessionsError={deviceSessionsError}
          onRefreshSessions={refreshDeviceSessions}
          onOpenQrScanner={openQrDeviceScanner}
        />
      );
    case "integrations":
      return (
        <IntegrationsSettings
          integrations={integrations}
          integrationsLoading={integrationsLoading}
          integrationsStatus={integrationsStatus}
          integrationActionBusy={integrationActionBusy}
          onConnectIntegration={handleConnectIntegration}
          onDisconnectIntegration={handleDisconnectIntegration}
          onToggleIntegrationSetting={handleToggleIntegrationSetting}
        />
      );
    case "notifications":
      return (
        <NotificationsSettings
          directNotificationsEnabled={directNotificationsEnabled}
          conversationNotificationsEnabled={conversationNotificationsEnabled}
          serverNotificationsEnabled={serverNotificationsEnabled}
          directMessageSoundEnabled={directMessageSoundEnabled}
          directMessageSendSoundId={directMessageSendSoundId}
          directMessageReceiveSoundId={directMessageReceiveSoundId}
          notificationSoundEnabled={notificationSoundEnabled}
          notificationSoundId={notificationSoundId}
          notificationSoundOptions={notificationSoundOptions}
          customNotificationSoundData={customNotificationSoundData}
          customNotificationSoundName={customNotificationSoundName}
          notificationSoundError={notificationSoundError}
          notificationSoundInputRef={notificationSoundInputRef}
          getDirectMessageSoundOptions={getDirectMessageSoundOptions}
          onToggleDirectNotifications={() => setDirectNotificationsEnabled((previous) => !previous)}
          onToggleConversationNotifications={() => setConversationNotificationsEnabled((previous) => !previous)}
          onToggleServerNotifications={() => setServerNotificationsEnabled((previous) => !previous)}
          onToggleDirectMessageSound={() => setDirectMessageSoundEnabled((previous) => !previous)}
          onSendSoundChange={setDirectMessageSendSoundId}
          onReceiveSoundChange={setDirectMessageReceiveSoundId}
          onToggleNotificationSound={() => setNotificationSoundEnabled((previous) => !previous)}
          onNotificationSoundChange={setNotificationSoundId}
          onRemoveCustomNotificationSound={() => {
            setCustomNotificationSoundData("");
            setCustomNotificationSoundName("");
            if (notificationSoundId === "custom") {
              setNotificationSoundId(NOTIFICATION_SOUND_OPTIONS[0].id);
            }
            setNotificationSoundError("");
          }}
          onCustomNotificationSoundChange={handleCustomNotificationSoundChange}
        />
      );
    case "appearance_accessibility":
      return (
        <AppearanceAccessibilitySettings
          uiDensity={uiDensity}
          uiFontScale={uiFontScale}
          uiReduceMotion={uiReduceMotion}
          uiTouchTargetSize={uiTouchTargetSize}
          onDensityChange={setUiDensity}
          onFontScaleChange={setUiFontScale}
          onReduceMotionChange={setUiReduceMotion}
          onTouchTargetSizeChange={setUiTouchTargetSize}
        />
      );
    case "server":
      return (
        <ServerSettings
          activeServer={activeServer}
          user={user}
          canManageServer={canManageServer}
          canInviteMembers={canInviteMembers}
          isDefaultServer={isDefaultServer}
          currentUserId={currentUserId}
          voiceParticipantByUserId={voiceParticipantByUserId}
          defaultServerIcon={DEFAULT_SERVER_ICON}
          icons={{ microphone: MICROPHONE_ICON_URL, headphones: HEADPHONES_ICON_URL, settings: SETTINGS_ICON_URL }}
          onServerNameChange={updateActiveServerName}
          onServerDescriptionChange={updateActiveServerDescription}
          onChangeServerIcon={() => serverIconInputRef.current?.click()}
          onDeleteServer={handleDeleteServer}
          canManageTargetMember={canManageTargetMember}
          canAssignRoleToMember={canAssignRoleToMember}
          onOpenMemberActionsMenu={openMemberActionsMenu}
          onSyncServerSnapshot={syncServerSnapshot}
          onImportServer={handleImportServer}
          onServerShared={markServerAsShared}
        />
      );
    case "roles":
      return (
        <RolesSettings
          activeServer={activeServer}
          currentServerRole={currentServerRole}
          rolePermissionLabels={ROLE_PERMISSION_LABELS}
        />
      );
    case "voice_video":
    default:
      return (
        <VoiceSettingsPanel
          audioInputDevices={audioInputDevices}
          audioOutputDevices={audioOutputDevices}
          selectedInputDeviceId={selectedInputDeviceId}
          selectedOutputDeviceId={selectedOutputDeviceId}
          outputSelectionAvailable={outputSelectionAvailable}
          micVolume={micVolume}
          audioVolume={audioVolume}
          activeMicSettingsBars={activeMicSettingsBars}
          isMicTestActive={isMicTestActive}
          noiseProfileOptions={noiseProfileOptions}
          noiseSuppressionMode={noiseSuppressionMode}
          noiseSuppressionStrength={noiseSuppressionStrength}
          activeNoiseProfile={activeNoiseProfile}
          echoCancellationEnabled={echoCancellationEnabled}
          autoInputSensitivity={autoInputSensitivity}
          onInputDeviceChange={handleInputDeviceChange}
          onOutputDeviceChange={handleOutputDeviceChange}
          onMicVolumeChange={updateMicVolume}
          onAudioVolumeChange={updateAudioVolume}
          onToggleMicTest={toggleMicrophoneTestPreview}
          onNoiseProfileChange={handleNoiseSuppressionModeChange}
          onNoiseStrengthChange={handleNoiseSuppressionStrengthChange}
          onToggleEchoCancellation={toggleEchoCancellation}
          onToggleAutoSensitivity={() => setAutoInputSensitivity((previous) => !previous)}
        />
      );
  }
}

export function MenuMainMobileSettingsShell({
  activeSettingsTabMeta,
  user,
  mobileSettingsNavItems,
  settingsTab,
  setOpenSettings,
  setSettingsTab,
  children,
}) {
  return (
    <MobileSettingsShell
      activeSettingsTabMeta={activeSettingsTabMeta}
      userAvatarSrc={user?.avatarUrl || user?.avatar}
      userAvatarFrame={getUserAvatarFrame(user)}
      displayName={getDisplayName(user)}
      email={user?.email || ""}
      navItems={mobileSettingsNavItems}
      settingsTab={settingsTab}
      onClose={() => setOpenSettings(false)}
      onSelectTab={setSettingsTab}
    >
      {children}
    </MobileSettingsShell>
  );
}
