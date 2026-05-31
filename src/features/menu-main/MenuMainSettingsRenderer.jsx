import {
  AccountSettings,
  AdminSettingsPanel,
  AppearanceAccessibilitySettings,
  DevicesSettings,
  IntegrationsSettings,
  MobileSettingsShell,
  NotificationsSettings,
  PersonalProfileSettings,
  ProductCompanyInfoSettings,
  RolesSettings,
  ServerSettings,
  VoiceSettingsPanel,
} from "../../components/MenuSettingsPanels";
import ModerationPanel from "../moderation/ModerationPanel";
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
  setSettingsTab,
  profileBackgroundSrc,
  profileDraft,
  profileAccountName,
  profileDisplayName,
  profileStatus,
  profileCustomization,
  handleProfileCustomizationChange,
  emailChangeState,
  locationSharing,
  isTotpEnabled,
  totpSetup,
  maxProfileNicknameLength,
  user,
  avatarInputRef,
  profileBackgroundInputRef,
  serverIconInputRef,
  handleAvatarFrameEdit,
  handleProfileBackgroundFrameEdit,
  handleResetProfileCustomization,
  handleProfileSave,
  updateProfileDraft,
  updateEmailChangeDraft,
  startEmailChange,
  confirmEmailChange,
  updateTotpCode,
  updateTotpResetPassword,
  updateTotpResetCode,
  startTotpSetup,
  verifyTotpSetup,
  disableTotp,
  requestTotpResetCode,
  resetTotp,
  handleLogout,
  deviceSessions,
  deviceSessionsLoading,
  deviceSessionsError,
  deviceSessionActionBusy,
  refreshDeviceSessions,
  revokeDeviceSession,
  revokeOtherDeviceSessions,
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
  denoiserModeOptions,
  audioDenoiserMode,
  noiseProfileOptions,
  noiseSuppressionMode,
  activeNoiseProfile,
  echoCancellationEnabled,
  autoInputSensitivity,
  streamDiagnostics,
  handleInputDeviceChange,
  handleOutputDeviceChange,
  updateMicVolume,
  updateAudioVolume,
  toggleMicrophoneTestPreview,
  handleDenoiserModeChange,
  handleNoiseSuppressionModeChange,
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
  uiTheme,
  chatThemeId,
  customChatBackgroundData,
  customChatBackgroundFit,
  customChatBackgroundName,
  chatThemeError,
  appLogoId,
  setUiDensity,
  setUiFontScale,
  setUiReduceMotion,
  setUiTouchTargetSize,
  setUiTheme,
  setChatThemeId,
  setCustomChatBackgroundData,
  setCustomChatBackgroundFit,
  setCustomChatBackgroundName,
  setChatThemeError,
  handleCustomChatBackgroundChange,
  handleAppLogoChange,
  activeServer,
  canManageServer,
  canManageRoles,
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
  createServerRole,
  updateServerRole,
  deleteServerRole,
  updateMemberRole,
  handleImportServer,
  markServerAsShared,
  currentServerRole,
  serverAuditLogs,
}) {
  switch (settingsTab) {
    case "account":
      return (
        <AccountSettings
          profileBackgroundSrc={profileBackgroundSrc}
          profileBackgroundFrame={profileDraft.profileBackgroundFrame}
          avatarSrc={user?.avatarUrl || user?.avatar}
          avatarFrame={getUserAvatarFrame(user)}
          accountName={profileAccountName}
          displayName={profileDisplayName || getDisplayName(user)}
          nickname={profileDraft.nickname}
          email={profileDraft.email}
          profileDraft={profileDraft}
          profileStatus={profileStatus}
          maxNicknameLength={maxProfileNicknameLength}
          emailChangeState={emailChangeState}
          locationSharing={locationSharing}
          onToggleLocationSharing={(enabled) => locationSharing?.setEnabled?.(enabled)}
          isTotpEnabled={isTotpEnabled}
          totpSetup={totpSetup}
          onTotpCodeChange={updateTotpCode}
          onTotpResetPasswordChange={updateTotpResetPassword}
          onTotpResetCodeChange={updateTotpResetCode}
          onSaveProfile={handleProfileSave}
          onUpdateProfileDraft={updateProfileDraft}
          onUpdateEmailChangeDraft={updateEmailChangeDraft}
          onStartEmailChange={startEmailChange}
          onConfirmEmailChange={confirmEmailChange}
          onStartTotpSetup={startTotpSetup}
          onVerifyTotpSetup={verifyTotpSetup}
          onDisableTotp={disableTotp}
          onRequestTotpResetCode={requestTotpResetCode}
          onResetTotp={resetTotp}
          onLogout={handleLogout}
        />
      );
    case "personal_profile":
      return (
        <PersonalProfileSettings
          profileBackgroundSrc={profileBackgroundSrc}
          profileBackgroundFrame={profileDraft.profileBackgroundFrame}
          avatarSrc={user?.avatarUrl || user?.avatar}
          avatarFrame={getUserAvatarFrame(user)}
          displayName={profileDisplayName || getDisplayName(user)}
          profileStatus={profileStatus}
          email={profileDraft.email}
          profileDraft={profileDraft}
          isTotpEnabled={isTotpEnabled}
          totpSetup={totpSetup}
          maxProfileNameLength={MAX_PROFILE_NAME_LENGTH}
          maxNicknameLength={maxProfileNicknameLength}
          onSubmit={handleProfileSave}
          onChangeAvatar={() => avatarInputRef.current?.click()}
          onChangeBackground={() => profileBackgroundInputRef.current?.click()}
          onChangeAvatarFrame={handleAvatarFrameEdit}
          onChangeBackgroundFrame={handleProfileBackgroundFrameEdit}
          profileCustomization={profileCustomization}
          onProfileCustomizationChange={handleProfileCustomizationChange}
          onResetCustomization={handleResetProfileCustomization}
          onUpdateDraft={updateProfileDraft}
          onTotpCodeChange={updateTotpCode}
          onTotpResetPasswordChange={updateTotpResetPassword}
          onTotpResetCodeChange={updateTotpResetCode}
          onStartTotpSetup={startTotpSetup}
          onVerifyTotpSetup={verifyTotpSetup}
          onDisableTotp={disableTotp}
          onRequestTotpResetCode={requestTotpResetCode}
          onResetTotp={resetTotp}
          onLogout={handleLogout}
        />
      );
    case "devices":
      return (
        <DevicesSettings
          deviceSessions={deviceSessions}
          deviceSessionsLoading={deviceSessionsLoading}
          deviceSessionsError={deviceSessionsError}
          deviceSessionActionBusy={deviceSessionActionBusy}
          onRefreshDeviceSessions={refreshDeviceSessions}
          onRevokeDeviceSession={revokeDeviceSession}
          onRevokeOtherDeviceSessions={revokeOtherDeviceSessions}
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
          uiTheme={uiTheme}
          chatThemeId={chatThemeId}
          customChatBackgroundData={customChatBackgroundData}
          customChatBackgroundFit={customChatBackgroundFit}
          customChatBackgroundName={customChatBackgroundName}
          chatThemeError={chatThemeError}
          appLogoId={appLogoId}
          onDensityChange={setUiDensity}
          onFontScaleChange={setUiFontScale}
          onReduceMotionChange={setUiReduceMotion}
          onTouchTargetSizeChange={setUiTouchTargetSize}
          onThemeChange={setUiTheme}
          onChatThemeChange={setChatThemeId}
          onCustomChatBackgroundFitChange={setCustomChatBackgroundFit}
          onCustomChatBackgroundChange={handleCustomChatBackgroundChange}
          onRemoveCustomChatBackground={() => {
            setCustomChatBackgroundData("");
            setCustomChatBackgroundName("");
            setChatThemeError("");
          }}
          onAppLogoChange={handleAppLogoChange}
        />
      );
    case "company_info":
      return <ProductCompanyInfoSettings />;
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
          currentUserId={currentUserId}
          canManageRoles={canManageRoles}
          currentServerRole={currentServerRole}
          rolePermissionLabels={ROLE_PERMISSION_LABELS}
          auditLogs={serverAuditLogs}
          canAssignRoleToMember={canAssignRoleToMember}
          onCreateRole={createServerRole}
          onUpdateRole={updateServerRole}
          onDeleteRole={deleteServerRole}
          onUpdateMemberRole={updateMemberRole}
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
          denoiserModeOptions={denoiserModeOptions}
          audioDenoiserMode={audioDenoiserMode}
          noiseProfileOptions={noiseProfileOptions}
          noiseSuppressionMode={noiseSuppressionMode}
          activeNoiseProfile={activeNoiseProfile}
          echoCancellationEnabled={echoCancellationEnabled}
          autoInputSensitivity={autoInputSensitivity}
          streamDiagnostics={streamDiagnostics}
          onInputDeviceChange={handleInputDeviceChange}
          onOutputDeviceChange={handleOutputDeviceChange}
          onMicVolumeChange={updateMicVolume}
          onAudioVolumeChange={updateAudioVolume}
          onToggleMicTest={toggleMicrophoneTestPreview}
          onDenoiserModeChange={handleDenoiserModeChange}
          onNoiseProfileChange={handleNoiseSuppressionModeChange}
          onToggleEchoCancellation={toggleEchoCancellation}
          onToggleAutoSensitivity={() => setAutoInputSensitivity((previous) => !previous)}
        />
      );
  }
}

export function MenuMainAdminSecurityPage({
  user,
  isTotpEnabled,
  currentUserId,
  activeServer,
  canManageReports,
}) {
  if (!(user?.isAdmin || user?.is_admin)) {
    return (
      <div className="admin-security-page__empty">
        Нет доступа к странице безопасности.
      </div>
    );
  }

  if (!isTotpEnabled) {
    return (
      <div className="admin-security-page__content">
        <section className="admin-security-page__hero">
          <div>
            <h1>Безопасность</h1>
            <p>Включите двухфакторную защиту в настройках аккаунта, чтобы открыть админские инструменты.</p>
          </div>
        </section>
        <div className="admin-security-page__empty">
          Админка привязана к Google Authenticator: пока TOTP выключен, действия с пользователями и отчетами закрыты.
        </div>
      </div>
    );
  }

  return (
    <div className="admin-security-page__content">
      <section className="admin-security-page__hero">
        <div>
          <h1>Безопасность</h1>
          <p>Пользователи, баны, подозрительные сигналы и жалобы собраны отдельно от обычных настроек.</p>
        </div>
        {activeServer?.name ? (
          <span className="admin-security-page__server">Текущий сервер: {activeServer.name}</span>
        ) : null}
      </section>

      <AdminSettingsPanel currentUserId={currentUserId} showHeader={false} />

      <section className="admin-security-section admin-security-page__reports">
        <div className="admin-security-section__header">
          <div>
            <h3>Жалобы текущего сервера</h3>
            <p>Здесь теперь находится бывший раздел модерации из настроек сервера.</p>
          </div>
        </div>
        {activeServer?.id && canManageReports ? (
          <ModerationPanel
            serverId={activeServer.id}
            canManage={canManageReports}
          />
        ) : (
          <div className="admin-users-list__empty">
            Выберите сервер с правами модерации, чтобы увидеть его жалобы.
          </div>
        )}
      </section>
    </div>
  );
}

export function MenuMainMobileSettingsShell({
  activeSettingsTabMeta,
  user,
  mobileSettingsNavItems,
  settingsTab,
  setOpenSettings,
  setSettingsTab,
  onOpenAdminSecurityPage,
  children,
}) {
  const handleSelectTab = (tabId) => {
    if (tabId === "admin") {
      onOpenAdminSecurityPage?.();
      return;
    }

    setSettingsTab(tabId);
  };

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
      onSelectTab={handleSelectTab}
    >
      {children}
    </MobileSettingsShell>
  );
}
