import {
  CameraModal,
  CreateServerModal,
  DirectCallOverlayView,
  DirectToastStack,
  MediaFrameEditorOverlay,
  QuickSwitcherModal,
  ScreenShareModal,
  ServerToastStack,
  SettingsOverlay,
} from "../../components/MenuMainOverlays";
import {
  DEFAULT_SERVER_ICON,
} from "../../utils/media";
import {
  getDisplayName,
  getUserAvatar,
  getUserAvatarFrame,
  getUserProfileBackground,
  STREAM_FPS_OPTIONS,
  STREAM_RESOLUTION_OPTIONS,
} from "../../utils/menuMainModel";
import { SCREEN_SHARE_ALLOWED_FPS } from "../../webrtc/voiceClientUtils";

export default function MenuMainOverlayLayer({
  children,
  avatarInputRef,
  profileBackgroundInputRef,
  handleAvatarChange,
  handleProfileBackgroundChange,
  serverInviteFeedback,
  isMobileViewport,
  openSettings,
  popupRef,
  user,
  settingsNavSections,
  settingsTab,
  setOpenSettings,
  setSettingsTab,
  renderMobileSettingsShell,
  renderSettingsContent,
  showCreateServerModal,
  createServerName,
  createServerIcon,
  createServerIconFrame,
  createServerError,
  closeCreateServerModal,
  handleCreateServerSubmit,
  handleCreateServerIconChange,
  setCreateServerName,
  setCreateServerError,
  showModal,
  resolution,
  fps,
  shareStreamAudio,
  isScreenShareActive,
  isCameraShareActive,
  currentVoiceChannel,
  isScreenShareSupported,
  screenShareError,
  setShowModal,
  setScreenShareError,
  setResolution,
  setFps,
  setShareStreamAudio,
  startScreenShare,
  stopScreenShare,
  openLocalSharePreview,
  showCameraModal,
  cameraDevices,
  selectedVideoDeviceId,
  cameraPreviewRef,
  hasCameraPreview,
  cameraError,
  closeCameraModal,
  handleCameraPreviewDeviceChange,
  startCameraPreview,
  startCameraShare,
  stopCameraShare,
  mediaFrameEditorState,
  closeMediaFrameEditor,
  handleMediaFrameConfirm,
  directMessageToasts,
  openDirectChat,
  dismissDirectToast,
  serverMessageToasts,
  openServerChannelFromToast,
  dismissServerToast,
  quickSwitcherOpen,
  quickSwitcherQuery,
  quickSwitcherItems,
  quickSwitcherSelectedIndex,
  setQuickSwitcherSelectedIndex,
  setQuickSwitcherQuery,
  handleQuickSwitcherSelect,
  closeQuickSwitcher,
  directCallState,
  directCallHistory,
  isMicMuted,
  isSoundMuted,
  audioInputDevices,
  audioOutputDevices,
  selectedInputDeviceId,
  selectedOutputDeviceId,
  outputSelectionSupported,
  toggleMicMute,
  toggleSoundMute,
  setSelectedInputDeviceId,
  setSelectedOutputDeviceId,
  setDirectCallMiniMode,
  dismissDirectCallOverlay,
  retryDirectCall,
  onDirectCallHistoryRedial,
  acceptDirectCall,
  declineDirectCall,
  endDirectCall,
}) {
  const availableFpsOptions =
    STREAM_FPS_OPTIONS.filter((option) => (SCREEN_SHARE_ALLOWED_FPS[resolution] || SCREEN_SHARE_ALLOWED_FPS["1080p"]).includes(option.value));

  return (
    <>
      <input
        type="file"
        accept=".jpg,.jpeg,.png,.webp,.gif,.mp4,image/*,video/mp4"
        ref={avatarInputRef}
        className="hidden-input"
        onChange={handleAvatarChange}
      />
      <input
        type="file"
        accept=".jpg,.jpeg,.png,.webp,.gif,.mp4,image/*,video/mp4"
        ref={profileBackgroundInputRef}
        className="hidden-input"
        onChange={handleProfileBackgroundChange}
      />
      {serverInviteFeedback ? (
        <div className={`server-invite-feedback ${isMobileViewport ? "server-invite-feedback--mobile" : ""}`} role="status" aria-live="polite">
          {serverInviteFeedback}
        </div>
      ) : null}

      {children}

      <QuickSwitcherModal
        open={quickSwitcherOpen}
        query={quickSwitcherQuery}
        items={quickSwitcherItems}
        selectedIndex={quickSwitcherSelectedIndex}
        onClose={closeQuickSwitcher}
        onQueryChange={setQuickSwitcherQuery}
        onSelectIndex={setQuickSwitcherSelectedIndex}
        onSelect={handleQuickSwitcherSelect}
      />

      {isMobileViewport ? (
        <DirectCallOverlayView
          call={directCallState}
          history={directCallHistory}
          isMicMuted={isMicMuted}
          isSoundMuted={isSoundMuted}
          selfName={getDisplayName(user)}
          selfAvatar={getUserAvatar(user)}
          selfAvatarFrame={getUserAvatarFrame(user)}
          audioInputDevices={audioInputDevices}
          audioOutputDevices={audioOutputDevices}
          selectedInputDeviceId={selectedInputDeviceId}
          selectedOutputDeviceId={selectedOutputDeviceId}
          outputSelectionSupported={outputSelectionSupported}
          onAccept={acceptDirectCall}
          onDecline={declineDirectCall}
          onEnd={endDirectCall}
          onToggleMic={toggleMicMute}
          onToggleSound={toggleSoundMute}
          onSelectInputDevice={setSelectedInputDeviceId}
          onSelectOutputDevice={setSelectedOutputDeviceId}
          onToggleMiniMode={setDirectCallMiniMode}
          onDismiss={dismissDirectCallOverlay}
          onRetry={retryDirectCall}
          onRedialHistoryItem={onDirectCallHistoryRedial}
        />
      ) : null}

      <SettingsOverlay
        open={openSettings}
        isMobileViewport={isMobileViewport}
        popupRef={popupRef}
        userAvatarSrc={user?.avatarUrl || user?.avatar}
        userAvatarFrame={getUserAvatarFrame(user)}
        displayName={getDisplayName(user)}
        settingsNavSections={settingsNavSections}
        settingsTab={settingsTab}
        onClose={() => setOpenSettings(false)}
        onSelectSettingsTab={setSettingsTab}
        renderMobileSettingsShell={renderMobileSettingsShell}
        renderSettingsContent={renderSettingsContent}
      />

      <CreateServerModal
        open={showCreateServerModal}
        name={createServerName}
        icon={createServerIcon}
        iconFrame={createServerIconFrame}
        defaultServerIcon={DEFAULT_SERVER_ICON}
        error={createServerError}
        onClose={closeCreateServerModal}
        onSubmit={handleCreateServerSubmit}
        onIconChange={handleCreateServerIconChange}
        onNameChange={(value) => {
          setCreateServerName(value);
          if (createServerError) {
            setCreateServerError("");
          }
        }}
      />

      <ScreenShareModal
        open={showModal}
        isMobileViewport={isMobileViewport}
        resolution={resolution}
        fps={fps}
        shareStreamAudio={shareStreamAudio}
        resolutionOptions={STREAM_RESOLUTION_OPTIONS}
        fpsOptions={availableFpsOptions}
        isScreenShareActive={isScreenShareActive}
        isCameraShareActive={isCameraShareActive}
        currentVoiceChannel={currentVoiceChannel}
        isScreenShareSupported={isScreenShareSupported}
        error={screenShareError}
        onClose={() => { setShowModal(false); setScreenShareError(""); }}
        onResolutionChange={setResolution}
        onFpsChange={setFps}
        onShareAudioChange={setShareStreamAudio}
        onStartScreenShare={startScreenShare}
        onStopScreenShare={stopScreenShare}
        onOpenPreview={openLocalSharePreview}
      />

      <CameraModal
        open={showCameraModal}
        devices={cameraDevices}
        selectedDeviceId={selectedVideoDeviceId}
        previewRef={cameraPreviewRef}
        hasPreview={hasCameraPreview}
        error={cameraError}
        isCameraShareActive={isCameraShareActive}
        isScreenShareActive={isScreenShareActive}
        currentVoiceChannel={currentVoiceChannel}
        onClose={closeCameraModal}
        onDeviceChange={handleCameraPreviewDeviceChange}
        onStartPreview={startCameraPreview}
        onOpenPreview={openLocalSharePreview}
        onStartCameraShare={startCameraShare}
        onStopCameraShare={stopCameraShare}
      />

      <MediaFrameEditorOverlay
        state={mediaFrameEditorState}
        defaultServerIcon={DEFAULT_SERVER_ICON}
        fallbackProfileBackground={getUserProfileBackground(user)}
        fallbackAvatar={getUserAvatar(user)}
        avatarFrame={getUserAvatarFrame(user)}
        avatarAlt={getDisplayName(user)}
        onCancel={closeMediaFrameEditor}
        onConfirm={handleMediaFrameConfirm}
      />

      <DirectToastStack
        toasts={directMessageToasts}
        onOpenToast={(toast) => {
          openDirectChat(toast.friend.id);
          dismissDirectToast(toast.id);
        }}
        onDismiss={dismissDirectToast}
        getAvatar={getUserAvatar}
        getDisplayName={getDisplayName}
      />

      <ServerToastStack
        toasts={serverMessageToasts}
        onOpenToast={openServerChannelFromToast}
        onDismiss={dismissServerToast}
      />
    </>
  );
}
