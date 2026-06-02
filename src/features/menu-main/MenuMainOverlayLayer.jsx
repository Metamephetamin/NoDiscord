import { Suspense, lazy, useEffect } from "react";
import {
  AdminSecurityPageOverlay,
  CameraModal,
  CreateServerModal,
  DirectCallOverlayView,
  DirectToastStack,
  DonationModal,
  MediaFrameEditorOverlay,
  QuickSwitcherModal,
  QrScannerModal,
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
import "../../css/MenuMainInviteFeedback.css";

const SoundboardPanel = lazy(() => import("./SoundboardPanel"));

export default function MenuMainOverlayLayer({
  children,
  avatarInputRef,
  profileBackgroundInputRef,
  serverIconInputRef,
  handleAvatarChange,
  handleProfileBackgroundChange,
  handleServerIconChange,
  serverInviteFeedback,
  isMobileViewport,
  openAdminSecurityPage,
  donationModalOpen,
  openSettings,
  popupRef,
  user,
  showAdminSettingsLink,
  settingsNavSections,
  settingsTab,
  setOpenAdminSecurityPage,
  setOpenSettings,
  setSettingsTab,
  openAdminSecurityPageFromSettings,
  closeDonationModal,
  renderAdminSecurityPage,
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
  showQrScannerModal,
  qrScannerDevices,
  selectedQrScannerDeviceId,
  qrScannerPreviewRef,
  hasQrScannerPreview,
  qrScannerError,
  qrScannerStatus,
  closeQrScannerModal,
  handleQrScannerDeviceChange,
  startQrScannerPreview,
  mediaFrameEditorState,
  closeMediaFrameEditor,
  handleMediaFrameConfirm,
  directMessageToasts,
  openConversationChat,
  openDirectChat,
  dismissDirectToast,
  serverMessageToasts,
  openServerChannelFromToast,
  dismissServerToast,
  workspaceStatusToasts,
  dismissWorkspaceStatusToast,
  quickSwitcherOpen,
  quickSwitcherQuery,
  quickSwitcherItems,
  quickSwitcherSelectedIndex,
  setQuickSwitcherSelectedIndex,
  setQuickSwitcherQuery,
  handleQuickSwitcherSelect,
  closeQuickSwitcher,
  sb,
  c,
  voiceClientRef,
  directCallState,
  directCallHistory,
  isMicMuted,
  isSoundMuted,
  micLevel,
  directCallPeerIsSpeaking,
  isDirectCallPeerStreamLive,
  isWatchingDirectCallPeerStream,
  directCallPeerStreamMode,
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
  onWatchDirectCallPeerStream,
  acceptDirectCall,
  declineDirectCall,
  endDirectCall,
}) {
  const availableFpsOptions =
    STREAM_FPS_OPTIONS.filter((option) => (SCREEN_SHARE_ALLOWED_FPS[resolution] || SCREEN_SHARE_ALLOWED_FPS["1080p"]).includes(option.value));
  const directCallPhase = String(directCallState?.phase || "");
  const showPendingDirectCallPopup = directCallPhase === "incoming" || directCallPhase === "outgoing";
  const showExpandedDirectCallOverlay =
    ["connected", "connecting", "reconnecting"].includes(directCallPhase) && !directCallState?.isMiniMode;
  const showDirectCallOverlay = isMobileViewport
    ? directCallPhase && directCallPhase !== "idle"
    : showPendingDirectCallPopup || showExpandedDirectCallOverlay;
  const useCompactDirectCallOverlay =
    !isMobileViewport && showPendingDirectCallPopup && Boolean(directCallState?.isMiniMode);

  useEffect(() => {
    if (showDirectCallOverlay) {
      void import("../../css/DirectCallOverlay.css");
    }
  }, [showDirectCallOverlay]);

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
      <input
        type="file"
        accept=".png,.jpg,.jpeg,.heif,.heic,.gif,.mp4,image/png,image/jpeg,image/heif,image/heic,image/gif,video/mp4"
        ref={serverIconInputRef}
        className="hidden-input"
        onChange={handleServerIconChange}
      />
      {serverInviteFeedback ? (
        <div className={`server-invite-feedback ${isMobileViewport ? "server-invite-feedback--mobile" : ""}`} role="status" aria-live="polite">
          {serverInviteFeedback}
        </div>
      ) : null}

      {children}

      <Suspense fallback={null}>
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
      </Suspense>

      {sb && (
        <Suspense>
          <SoundboardPanel
            u={user}
            c={c}
            voiceClientRef={voiceClientRef}
          />
        </Suspense>
      )}

      {showDirectCallOverlay ? (
        <DirectCallOverlayView
          call={directCallState}
          history={directCallHistory}
          isMicMuted={isMicMuted}
          isSoundMuted={isSoundMuted}
          micLevel={micLevel}
          peerIsSpeaking={directCallPeerIsSpeaking}
          selfName={getDisplayName(user)}
          selfAvatar={getUserAvatar(user)}
          selfAvatarFrame={getUserAvatarFrame(user)}
          audioInputDevices={audioInputDevices}
          audioOutputDevices={audioOutputDevices}
          selectedInputDeviceId={selectedInputDeviceId}
          selectedOutputDeviceId={selectedOutputDeviceId}
          outputSelectionSupported={outputSelectionSupported}
          isScreenShareActive={isScreenShareActive}
          isCameraShareActive={isCameraShareActive}
          isScreenShareSupported={isScreenShareSupported}
          isPeerStreamLive={isDirectCallPeerStreamLive}
          isWatchingPeerStream={isWatchingDirectCallPeerStream}
          peerStreamMode={directCallPeerStreamMode}
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
          onWatchPeerStream={onWatchDirectCallPeerStream}
          compact={useCompactDirectCallOverlay}
        />
      ) : null}

      <SettingsOverlay
        open={openSettings}
        isMobileViewport={isMobileViewport}
        popupRef={popupRef}
        userAvatarSrc={user?.avatarUrl || user?.avatar}
        userAvatarFrame={getUserAvatarFrame(user)}
        displayName={getDisplayName(user)}
        showAdminSettingsLink={showAdminSettingsLink}
        settingsNavSections={settingsNavSections}
        settingsTab={settingsTab}
        onClose={() => setOpenSettings(false)}
        onSelectSettingsTab={setSettingsTab}
        onOpenAdminSecurityPage={openAdminSecurityPageFromSettings}
        renderMobileSettingsShell={renderMobileSettingsShell}
        renderSettingsContent={renderSettingsContent}
      />

      <DonationModal
        open={donationModalOpen}
        onClose={closeDonationModal}
      />

      <AdminSecurityPageOverlay
        open={openAdminSecurityPage && showAdminSettingsLink}
        onClose={() => setOpenAdminSecurityPage(false)}
        renderAdminSecurityPage={renderAdminSecurityPage}
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

      <QrScannerModal
        open={showQrScannerModal}
        devices={qrScannerDevices}
        selectedDeviceId={selectedQrScannerDeviceId}
        previewRef={qrScannerPreviewRef}
        hasPreview={hasQrScannerPreview}
        error={qrScannerError}
        status={qrScannerStatus}
        onClose={closeQrScannerModal}
        onDeviceChange={handleQrScannerDeviceChange}
        onStartPreview={startQrScannerPreview}
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
          if (toast.kind === "conversation") {
            openConversationChat(toast.friend.conversationId || toast.friend.id);
          } else {
            openDirectChat(toast.friend.id);
          }
          dismissDirectToast(toast.id);
        }}
        onDismiss={dismissDirectToast}
      />

      <ServerToastStack
        toasts={serverMessageToasts}
        onOpenToast={openServerChannelFromToast}
        onDismiss={dismissServerToast}
      />

      {workspaceStatusToasts?.length ? (
        <div className={`workspace-status-toast-stack ${isMobileViewport ? "workspace-status-toast-stack--mobile" : ""}`} role="status" aria-live="polite">
          {workspaceStatusToasts.map((toast) => (
            <div key={toast.id} className={`workspace-status-toast workspace-status-toast--${toast.tone || "success"}`}>
              <span className="workspace-status-toast__dot" aria-hidden="true" />
              <span className="workspace-status-toast__text">{toast.message}</span>
              <button
                type="button"
                className="workspace-status-toast__close"
                onClick={() => dismissWorkspaceStatusToast?.(toast.id)}
                aria-label="Закрыть уведомление"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      ) : null}
    </>
  );
}
