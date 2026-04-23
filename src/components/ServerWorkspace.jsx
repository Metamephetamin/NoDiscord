import { Suspense, lazy, memo } from "react";
import AnimatedAvatar from "./AnimatedAvatar";
import ScreenShareViewer from "./ScreenShareViewer";
import TextChat from "./TextChat";
import VoiceChannelList from "./VoiceChannelList";
import { formatUserPresenceStatus, isUserCurrentlyOnline } from "../utils/menuMainModel";

const loadVoiceRoomStage = () => import("./VoiceRoomStage");
const VoiceRoomStage = lazy(loadVoiceRoomStage);

function VoiceStageModuleFallback({ channelName = "" }) {
  return (
    <div className="voice-room-stage__empty voice-room-stage__empty--pending">
      <strong>{channelName ? `Подключаем ${channelName}` : "Подключаем голосовой канал"}</strong>
      <span>Готовим голосовую сцену без полной перезагрузки интерфейса.</span>
    </div>
  );
}

function areStringArraysEqual(previousValue = [], nextValue = []) {
  if (previousValue === nextValue) {
    return true;
  }

  if (!Array.isArray(previousValue) || !Array.isArray(nextValue) || previousValue.length !== nextValue.length) {
    return false;
  }

  for (let index = 0; index < previousValue.length; index += 1) {
    if (String(previousValue[index] || "") !== String(nextValue[index] || "")) {
      return false;
    }
  }

  return true;
}

function areUserLikeEntriesEqual(previousEntries = [], nextEntries = []) {
  if (previousEntries === nextEntries) {
    return true;
  }

  if (!Array.isArray(previousEntries) || !Array.isArray(nextEntries) || previousEntries.length !== nextEntries.length) {
    return false;
  }

  for (let index = 0; index < previousEntries.length; index += 1) {
    const previousEntry = previousEntries[index];
    const nextEntry = nextEntries[index];

    if (
      String(previousEntry?.id || previousEntry?.userId || "") !== String(nextEntry?.id || nextEntry?.userId || "")
      || String(previousEntry?.name || previousEntry?.nickname || "") !== String(nextEntry?.name || nextEntry?.nickname || "")
      || String(previousEntry?.avatar || previousEntry?.avatarUrl || "") !== String(nextEntry?.avatar || nextEntry?.avatarUrl || "")
      || String(previousEntry?.roleId || "") !== String(nextEntry?.roleId || "")
      || String(previousEntry?.lastSeenAt || previousEntry?.last_seen_at || "") !== String(nextEntry?.lastSeenAt || nextEntry?.last_seen_at || "")
      || Boolean(previousEntry?.isLive) !== Boolean(nextEntry?.isLive)
      || Boolean(previousEntry?.isSpeaking) !== Boolean(nextEntry?.isSpeaking)
      || Boolean(previousEntry?.isOnline) !== Boolean(nextEntry?.isOnline)
      || Boolean(previousEntry?.isSelf) !== Boolean(nextEntry?.isSelf)
    ) {
      return false;
    }
  }

  return true;
}

function areRoleEntriesEqual(previousEntries = [], nextEntries = []) {
  if (previousEntries === nextEntries) {
    return true;
  }

  if (!Array.isArray(previousEntries) || !Array.isArray(nextEntries) || previousEntries.length !== nextEntries.length) {
    return false;
  }

  for (let index = 0; index < previousEntries.length; index += 1) {
    const previousEntry = previousEntries[index];
    const nextEntry = nextEntries[index];

    if (
      String(previousEntry?.id || "") !== String(nextEntry?.id || "")
      || String(previousEntry?.name || "") !== String(nextEntry?.name || "")
      || String(previousEntry?.color || "") !== String(nextEntry?.color || "")
    ) {
      return false;
    }
  }

  return true;
}

function areRemoteSharesEqual(previousShares = [], nextShares = []) {
  if (previousShares === nextShares) {
    return true;
  }

  if (!Array.isArray(previousShares) || !Array.isArray(nextShares) || previousShares.length !== nextShares.length) {
    return false;
  }

  for (let index = 0; index < previousShares.length; index += 1) {
    const previousShare = previousShares[index];
    const nextShare = nextShares[index];

    if (
      String(previousShare?.userId || "") !== String(nextShare?.userId || "")
      || String(previousShare?.mode || "") !== String(nextShare?.mode || "")
      || String(previousShare?.videoSrc || "") !== String(nextShare?.videoSrc || "")
      || String(previousShare?.imageSrc || "") !== String(nextShare?.imageSrc || "")
      || Boolean(previousShare?.hasAudio) !== Boolean(nextShare?.hasAudio)
      || Number(previousShare?.updatedAt || 0) !== Number(nextShare?.updatedAt || 0)
    ) {
      return false;
    }
  }

  return true;
}

function areNavigationRequestsEqual(previousRequest, nextRequest) {
  if (previousRequest === nextRequest) {
    return true;
  }

  if (!previousRequest && !nextRequest) {
    return true;
  }

  if (!previousRequest || !nextRequest) {
    return false;
  }

  return String(previousRequest?.type || "") === String(nextRequest?.type || "")
    && String(previousRequest?.serverId || "") === String(nextRequest?.serverId || "")
    && String(previousRequest?.channelId || "") === String(nextRequest?.channelId || "")
    && String(previousRequest?.messageId || "") === String(nextRequest?.messageId || "")
    && String(previousRequest?.nonce || "") === String(nextRequest?.nonce || "");
}

export const ServersSidebar = memo(({
  includeProfilePanel = true,
  profilePanel,
  activeServer,
  desktopServerPane = "text",
  servers,
  serverMembersRef,
  memberRoleMenu,
  memberRoleMenuRef,
  serverContextMenu,
  serverContextMenuRef,
  voiceParticipantByUserId,
  currentUserId,
  canManageChannels,
  channelRenameState,
  serverUnreadCounts,
  chatDraftPresence,
  currentTextChannel,
  currentVoiceChannel,
  activeVoiceParticipantsMap,
  liveUserIds,
  speakingUserIds,
  watchedStreamUserId,
  joiningVoiceChannelId,
  icons,
  onOpenServerSettings,
  onOpenMemberActions,
  onUpdateMemberNickname,
  onUpdateMemberVoiceState,
  onUpdateMemberRole,
  onCopyServerInvite,
  onAddServer,
  onAddTextChannel,
  onAddVoiceChannel,
  onSelectTextChannel,
  onStartChannelRename,
  onUpdateChannelRenameValue,
  onSubmitChannelRename,
  onCancelChannelRename,
  onJoinVoiceChannel,
  onLeaveVoiceChannel,
  onPrewarmVoiceChannel,
  onWatchStream,
  canManageTargetMember,
  canAssignRoleToMember,
  canInviteToServer,
  getChannelDisplayName,
  getScopedChatChannelId,
}) => (
  <aside className="sidebar__channels sidebar__channels--servers">
    <div className="channels__top">
      {activeServer ? (
        <div className="server-summary-wrap" ref={serverMembersRef}>
          <button type="button" className="server-summary server-summary--discordish" onClick={onOpenServerSettings}>
            <div className="server-summary__content">
              <div className="server-summary__name">{activeServer.name || "Server"}</div>
              <div className="server-summary__subtitle">Сервер</div>
            </div>
            <span className="server-summary__caret">?</span>
          </button>

          {memberRoleMenu ? (
            <div ref={memberRoleMenuRef} className="member-role-menu" style={{ left: memberRoleMenu.x, top: memberRoleMenu.y }}>
              {(() => {
                const targetMember = activeServer?.members?.find((member) => String(member.userId) === String(memberRoleMenu.memberUserId));
                const targetVoiceState = voiceParticipantByUserId.get(String(memberRoleMenu.memberUserId));
                const canRenameMember = canManageTargetMember(activeServer, currentUserId, memberRoleMenu.memberUserId, "manage_nicknames");
                const canMuteMember = canManageTargetMember(activeServer, currentUserId, memberRoleMenu.memberUserId, "mute_members");
                const canDeafenMember = canManageTargetMember(activeServer, currentUserId, memberRoleMenu.memberUserId, "deafen_members");
                const assignableRoles = (activeServer?.roles || []).filter((role) =>
                  canAssignRoleToMember(activeServer, currentUserId, memberRoleMenu.memberUserId, role.id)
                );

                return (
                  <>
                    {targetMember ? <div className="member-role-menu__title">{targetMember.name}</div> : null}
                    {canRenameMember ? (
                      <button type="button" className="member-role-menu__item" onClick={() => onUpdateMemberNickname(memberRoleMenu.memberUserId)}>
                        <img src={icons.pencil} alt="" className="member-role-menu__icon" />
                        Сменить ник
                      </button>
                    ) : null}
                    {canMuteMember ? (
                      <button
                        type="button"
                        className="member-role-menu__item"
                        onClick={() =>
                          onUpdateMemberVoiceState(memberRoleMenu.memberUserId, {
                            isMicMuted: !targetVoiceState?.isMicMuted,
                            isDeafened: Boolean(targetVoiceState?.isDeafened),
                          })
                        }
                      >
                        <img src={icons.microphone} alt="" className="member-role-menu__icon" />
                        {targetVoiceState?.isMicMuted ? "Включить микрофон" : "Выключить микрофон"}
                      </button>
                    ) : null}
                    {canDeafenMember ? (
                      <button
                        type="button"
                        className="member-role-menu__item"
                        onClick={() =>
                          onUpdateMemberVoiceState(memberRoleMenu.memberUserId, {
                            isMicMuted: targetVoiceState?.isDeafened ? Boolean(targetVoiceState?.isMicMuted) : true,
                            isDeafened: !targetVoiceState?.isDeafened,
                          })
                        }
                      >
                        <img src={icons.headphones} alt="" className="member-role-menu__icon" />
                        {targetVoiceState?.isDeafened ? "Вернуть звук" : "Отключить звук"}
                      </button>
                    ) : null}
                    {assignableRoles.length > 0 ? (
                      <>
                        <div className="member-role-menu__separator" />
                        <div className="member-role-menu__subtitle">Роль</div>
                        {assignableRoles.map((role) => (
                          <button
                            key={role.id}
                            type="button"
                            className={`member-role-menu__item ${targetMember?.roleId === role.id ? "member-role-menu__item--active" : ""}`}
                            onClick={() => onUpdateMemberRole(memberRoleMenu.memberUserId, role.id)}
                          >
                            <span className="member-role-menu__dot" style={{ backgroundColor: role.color || "#7b89a8" }} aria-hidden="true" />
                            {role.name}
                          </button>
                        ))}
                      </>
                    ) : null}
                  </>
                );
              })()}
            </div>
          ) : null}

          {serverContextMenu ? (
            <div ref={serverContextMenuRef} className="member-role-menu member-role-menu--server" style={{ left: serverContextMenu.x, top: serverContextMenu.y }}>
              {(() => {
                const targetServer = servers.find((server) => String(server.id) === String(serverContextMenu.serverId));
                const canCopyInvite = canInviteToServer(targetServer);

                return (
                  <>
                    <div className="member-role-menu__title">{targetServer?.name || "Сервер"}</div>
                    <button
                      type="button"
                      className={`member-role-menu__item ${!canCopyInvite ? "member-role-menu__item--disabled" : ""}`}
                      onClick={onCopyServerInvite}
                      disabled={!canCopyInvite || serverContextMenu.isLoading}
                    >
                      {serverContextMenu.isLoading ? "Готовим ссылку..." : "Скопировать ссылку-приглашение"}
                    </button>
                    {serverContextMenu.status ? (
                      <>
                        <div className="member-role-menu__separator" />
                        <div className="member-role-menu__status">{serverContextMenu.status}</div>
                      </>
                    ) : null}
                  </>
                );
              })()}
            </div>
          ) : null}
        </div>
      ) : (
        <div className="servers-empty-sidebar">
          <h3>Серверов пока нет</h3>
          <p>Создайте первый сервер, и здесь появятся каналы, участники и настройки.</p>
          <button type="button" className="servers-empty-sidebar__button" onClick={onAddServer}>Создать сервер</button>
        </div>
      )}

      {activeServer ? (
        <>
          <div className="server-panel__section">
            <div className="server-panel__header">
              <span>Текстовые каналы</span>
              <button type="button" onClick={onAddTextChannel} disabled={!canManageChannels}>+</button>
            </div>
            <ul className="channel-list">
              {(activeServer?.textChannels || []).map((channel) => {
                const isEditing = channelRenameState?.type === "text" && channelRenameState.channelId === channel.id;
                const scopedChannelId = getScopedChatChannelId(activeServer?.id || "", channel.id);
                const unreadCount = Number(serverUnreadCounts[scopedChannelId] || 0);
                const hasDraft = Boolean(chatDraftPresence[scopedChannelId]);
                const isTextChannelActive = desktopServerPane !== "voice" && currentTextChannel?.id === channel.id;

                return (
                  <li key={channel.id} className={`channel-item ${isTextChannelActive ? "active-channel" : ""} ${isEditing ? "channel-item--editing" : ""}`}>
                    {isEditing ? (
                      <input
                        className="channel-inline-input"
                        type="text"
                        value={channelRenameState.value}
                        autoFocus
                        spellCheck={false}
                        autoCorrect="off"
                        autoCapitalize="off"
                        onChange={(event) => onUpdateChannelRenameValue(event.target.value)}
                        onBlur={onSubmitChannelRename}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") {
                            event.preventDefault();
                            onSubmitChannelRename();
                          }
                          if (event.key === "Escape") {
                            event.preventDefault();
                            onCancelChannelRename();
                          }
                        }}
                      />
                    ) : (
                      <button type="button" className="channel-item__button" onClick={() => onSelectTextChannel(channel.id)}>
                        <span className="channel-item__label">{getChannelDisplayName(channel.name, "text")}</span>
                        {hasDraft ? <span className="channel-item__draft">Черновик</span> : null}
                        {unreadCount > 0 ? <span className="sidebar-unread-badge sidebar-unread-badge--channel">{Math.min(unreadCount, 99)}</span> : null}
                      </button>
                    )}
                    <button type="button" className="channel-edit-button" onClick={() => onStartChannelRename("text", channel)} aria-label="Переименовать канал" disabled={!canManageChannels}>
                      <img src={icons.settings} alt="" />
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>

          <div className="server-panel__section">
            <div className="server-panel__header">
              <span>Голосовые каналы</span>
              <button type="button" onClick={onAddVoiceChannel} disabled={!canManageChannels}>+</button>
            </div>
            <VoiceChannelList
              channels={activeServer?.voiceChannels || []}
              activeChannelId={currentVoiceChannel}
              participantsMap={activeVoiceParticipantsMap}
              serverId={activeServer?.id || ""}
              serverMembers={activeServer?.members || []}
              serverRoles={activeServer?.roles || []}
              onJoinChannel={onJoinVoiceChannel}
              onLeaveChannel={onLeaveVoiceChannel}
              onPrewarmChannel={(channelId) => {
                void loadVoiceRoomStage();
                onPrewarmVoiceChannel?.(channelId);
              }}
              onRenameChannel={onStartChannelRename}
              liveUserIds={liveUserIds}
              speakingUserIds={speakingUserIds}
              watchedStreamUserId={watchedStreamUserId}
              joiningChannelId={joiningVoiceChannelId}
              onWatchStream={onWatchStream}
              canManageChannels={canManageChannels}
              editingChannelId={channelRenameState?.type === "voice" ? channelRenameState.channelId : ""}
              editingChannelValue={channelRenameState?.type === "voice" ? channelRenameState.value : ""}
              onRenameValueChange={onUpdateChannelRenameValue}
              onRenameSubmit={onSubmitChannelRename}
              onRenameCancel={onCancelChannelRename}
            />
          </div>
        </>
      ) : null}
    </div>

    {includeProfilePanel ? profilePanel : null}
  </aside>
));

function ServerMainComponent({
  activeServer,
  currentTextChannel,
  currentVoiceChannelName,
  desktopServerPane = "text",
  currentVoiceParticipants,
  joiningVoiceChannelId,
  remoteScreenShares,
  activeServerUnreadCount,
  hasLocalSharePreview,
  isLocalSharePreviewVisible,
  localSharePreview,
  localSharePreviewMeta,
  localSharePreviewDebugInfo,
  selectedStreamUserId,
  selectedStream,
  selectedStreamParticipant,
  selectedStreamDebugInfo,
  channelSearchQuery,
  searchIcon,
  user,
  directConversationTargets,
  serverMembers,
  serverRoles,
  textChatNavigationRequest,
  onTextChatNavigationIndexChange,
  onOpenDirectChat,
  onStartDirectCall,
  onOpenLocalSharePreview,
  onWatchStream,
  onChannelSearchChange,
  onClearChannelSearch,
  onAddServer,
  onCloseSelectedStream,
  onStopCameraShare,
  onStopScreenShare,
  onCloseLocalSharePreview,
  isMicMuted = false,
  isSoundMuted = false,
  isScreenShareActive = false,
  isCameraShareActive = false,
  onToggleMic,
  onToggleSound,
  onOpenTextChat,
  onScreenShareAction,
  onOpenCamera,
  onLeave,
  getChannelDisplayName,
}) {
  const isVoiceStageVisible = Boolean(activeServer && currentVoiceChannelName && desktopServerPane === "voice");
  const isJoiningVoiceChannel = Boolean(joiningVoiceChannelId && desktopServerPane === "voice");

  return (
    <main className="chat__wrapper chat__wrapper--servers">
      <div className={`chat__box chat__box--servers ${isVoiceStageVisible ? "chat__box--voice-stage" : ""}`}>
        {activeServer && !isVoiceStageVisible ? (
          <div className="chat__topbar">
            <div className="chat__topbar-title">
              <div className="chat__topbar-copy">
                <strong>
                  <span>{getChannelDisplayName(currentTextChannel?.name || "channel", "text")}</span>
                  {activeServerUnreadCount > 0 ? <span className="chat__topbar-badge">{Math.min(activeServerUnreadCount, 99)}</span> : null}
                </strong>
                <span>Текстовый канал сервера</span>
              </div>
            </div>
            <div className="chat__topbar-actions">
              {hasLocalSharePreview ? (
                <button type="button" className={`chat__topbar-action ${isLocalSharePreviewVisible ? "chat__topbar-action--active" : ""}`} onClick={onOpenLocalSharePreview}>
                  {localSharePreview?.mode === "camera" ? "Моё видео" : "Мой стрим"}
                </button>
              ) : null}
              <label className="chat__topbar-search-wrap">
                <img src={searchIcon} alt="" />
                <input
                  className="chat__topbar-search"
                  type="text"
                  value={channelSearchQuery}
                  onChange={(event) => onChannelSearchChange(event.target.value)}
                  placeholder={`Искать в ${getChannelDisplayName(currentTextChannel?.name || "канал", "text")}`}
                />
              </label>
            </div>
          </div>
        ) : null}

        {!activeServer ? (
          <div className="server-empty-state">
            <div className="server-empty-state__badge">Серверы</div>
            <h1>У вас пока нет серверов</h1>
            <p>После регистрации список пустой. Создайте свой первый сервер вручную, и здесь появятся каналы и чат.</p>
            <button type="button" className="server-empty-state__button" onClick={onAddServer}>Создать первый сервер</button>
          </div>
        ) : isVoiceStageVisible ? (
          <Suspense fallback={<VoiceStageModuleFallback channelName={currentVoiceChannelName} />}>
          <VoiceRoomStage
            activeServerName={activeServer?.name || "Сервер"}
            channelName={currentVoiceChannelName}
            participants={currentVoiceParticipants}
            isJoining={isJoiningVoiceChannel}
            pendingParticipant={user ? { name: user.nickname || user.firstName || user.first_name || user.email || "Вы", avatar: user.avatarUrl || user.avatar || "" } : null}
            remoteShares={remoteScreenShares}
            selectedStreamUserId={selectedStreamUserId}
            selectedStream={selectedStream}
            selectedStreamParticipant={selectedStreamParticipant}
            hasLocalSharePreview={hasLocalSharePreview}
            isLocalSharePreviewVisible={isLocalSharePreviewVisible}
            localSharePreview={localSharePreview}
            onWatchStream={onWatchStream}
            onOpenLocalSharePreview={onOpenLocalSharePreview}
            onCloseSelectedStream={onCloseSelectedStream}
            onCloseLocalSharePreview={onCloseLocalSharePreview}
            onStopScreenShare={onStopScreenShare}
            onStopCameraShare={onStopCameraShare}
            isMicMuted={isMicMuted}
            isSoundMuted={isSoundMuted}
            isScreenShareActive={isScreenShareActive}
            isCameraShareActive={isCameraShareActive}
            onToggleMic={onToggleMic}
            onToggleSound={onToggleSound}
            onOpenTextChat={onOpenTextChat}
            onScreenShareAction={onScreenShareAction}
            onOpenCamera={onOpenCamera}
            onLeave={onLeave}
          />
          </Suspense>
        ) : selectedStreamUserId ? (
          <ScreenShareViewer
            stream={selectedStream?.stream || null}
            videoSrc={selectedStream?.videoSrc || ""}
            imageSrc={selectedStream?.imageSrc || ""}
            muted={!Boolean(selectedStream?.hasAudio || selectedStream?.stream?.getAudioTracks?.().length)}
            hasAudio={Boolean(selectedStream?.hasAudio || selectedStream?.stream?.getAudioTracks?.().length)}
            title={`Трансляция ${selectedStreamParticipant?.name || "участника"}`}
            subtitle="Просмотр видеопотока участника"
            onClose={onCloseSelectedStream}
            debugInfo={selectedStreamDebugInfo}
          />
        ) : isLocalSharePreviewVisible && hasLocalSharePreview ? (
          <ScreenShareViewer
            stream={localSharePreview?.stream || null}
            title={localSharePreviewMeta.title}
            subtitle={localSharePreviewMeta.subtitle}
            onAction={localSharePreview?.mode === "camera" ? onStopCameraShare : onStopScreenShare}
            actionLabel={localSharePreview?.mode === "camera" ? "Остановить камеру" : "Остановить стрим"}
            actionVariant="danger"
            onClose={onCloseLocalSharePreview}
            debugInfo={localSharePreviewDebugInfo}
          />
        ) : (
          currentTextChannel ? (
            <TextChat
              serverId={activeServer?.id}
              channelId={currentTextChannel.id}
              user={user}
              searchQuery={channelSearchQuery}
              onClearSearchQuery={onClearChannelSearch}
              directTargets={directConversationTargets}
              serverMembers={serverMembers}
              serverRoles={serverRoles}
              navigationRequest={textChatNavigationRequest}
              onNavigationIndexChange={onTextChatNavigationIndexChange}
              onOpenDirectChat={onOpenDirectChat}
              onStartDirectCall={onStartDirectCall}
            />
          ) : null
        )}
      </div>
    </main>
  );
}

function areServerMainPropsEqual(previousProps, nextProps) {
  return previousProps.activeServer === nextProps.activeServer
    && previousProps.currentTextChannel === nextProps.currentTextChannel
    && previousProps.currentVoiceChannelName === nextProps.currentVoiceChannelName
    && previousProps.desktopServerPane === nextProps.desktopServerPane
    && areUserLikeEntriesEqual(previousProps.currentVoiceParticipants, nextProps.currentVoiceParticipants)
    && previousProps.joiningVoiceChannelId === nextProps.joiningVoiceChannelId
    && areRemoteSharesEqual(previousProps.remoteScreenShares, nextProps.remoteScreenShares)
    && previousProps.activeServerUnreadCount === nextProps.activeServerUnreadCount
    && previousProps.hasLocalSharePreview === nextProps.hasLocalSharePreview
    && previousProps.isLocalSharePreviewVisible === nextProps.isLocalSharePreviewVisible
    && previousProps.localSharePreview === nextProps.localSharePreview
    && previousProps.localSharePreviewMeta === nextProps.localSharePreviewMeta
    && previousProps.localSharePreviewDebugInfo === nextProps.localSharePreviewDebugInfo
    && previousProps.selectedStreamUserId === nextProps.selectedStreamUserId
    && previousProps.selectedStream === nextProps.selectedStream
    && previousProps.selectedStreamParticipant === nextProps.selectedStreamParticipant
    && previousProps.selectedStreamDebugInfo === nextProps.selectedStreamDebugInfo
    && previousProps.channelSearchQuery === nextProps.channelSearchQuery
    && previousProps.searchIcon === nextProps.searchIcon
    && previousProps.user === nextProps.user
    && areUserLikeEntriesEqual(previousProps.directConversationTargets, nextProps.directConversationTargets)
    && areUserLikeEntriesEqual(previousProps.serverMembers, nextProps.serverMembers)
    && areRoleEntriesEqual(previousProps.serverRoles, nextProps.serverRoles)
    && areNavigationRequestsEqual(previousProps.textChatNavigationRequest, nextProps.textChatNavigationRequest)
    && previousProps.onTextChatNavigationIndexChange === nextProps.onTextChatNavigationIndexChange
    && previousProps.onOpenDirectChat === nextProps.onOpenDirectChat
    && previousProps.onStartDirectCall === nextProps.onStartDirectCall
    && previousProps.onOpenLocalSharePreview === nextProps.onOpenLocalSharePreview
    && previousProps.onWatchStream === nextProps.onWatchStream
    && previousProps.onChannelSearchChange === nextProps.onChannelSearchChange
    && previousProps.onAddServer === nextProps.onAddServer
    && previousProps.onCloseSelectedStream === nextProps.onCloseSelectedStream
    && previousProps.onStopCameraShare === nextProps.onStopCameraShare
    && previousProps.onStopScreenShare === nextProps.onStopScreenShare
    && previousProps.onCloseLocalSharePreview === nextProps.onCloseLocalSharePreview
    && previousProps.isMicMuted === nextProps.isMicMuted
    && previousProps.isSoundMuted === nextProps.isSoundMuted
    && previousProps.isScreenShareActive === nextProps.isScreenShareActive
    && previousProps.isCameraShareActive === nextProps.isCameraShareActive
    && previousProps.onToggleMic === nextProps.onToggleMic
    && previousProps.onToggleSound === nextProps.onToggleSound
    && previousProps.onOpenTextChat === nextProps.onOpenTextChat
    && previousProps.onScreenShareAction === nextProps.onScreenShareAction
    && previousProps.onOpenCamera === nextProps.onOpenCamera
    && previousProps.onLeave === nextProps.onLeave
    && previousProps.getChannelDisplayName === nextProps.getChannelDisplayName;
}

export const ServerMain = memo(ServerMainComponent, areServerMainPropsEqual);

ServersSidebar.displayName = "ServersSidebar";
ServerMain.displayName = "ServerMain";
export const DesktopServerRail = ({
  servers,
  workspaceMode,
  activeServer,
  defaultServerIcon,
  smsIcon,
  onOpenFriendsWorkspace,
  onServerShortcutClick,
  onServerContextMenu,
  onServerPointerDown,
  onServerPointerUp,
  onServerPointerCancel,
  onAddServer,
  getServerIconFrame,
}) => (
  <aside className="sidebar__servers">
    <button type="button" className={`workspace-switch ${workspaceMode === "friends" ? "workspace-switch--active" : ""}`} onClick={onOpenFriendsWorkspace} aria-label="Друзья">
      <img src={smsIcon} alt="" />
      <span>Друзья</span>
    </button>
    {servers.map((server) => (
      <button
        key={server.id}
        type="button"
        className={`btn__server ${workspaceMode === "servers" && server.id === activeServer?.id ? "btn__server--active" : ""}`}
        onClick={onServerShortcutClick(server)}
        onContextMenu={(event) => onServerContextMenu(event, server)}
        onPointerDown={(event) => onServerPointerDown(event, server)}
        onPointerUp={onServerPointerUp}
        onPointerLeave={onServerPointerCancel}
        onPointerCancel={onServerPointerCancel}
        aria-label={server.name || "Без названия"}
      >
        {server.icon ? (
          <AnimatedAvatar
            className="btn__server-media"
            src={server.icon}
            fallback={defaultServerIcon}
            alt={server.name || "Без названия"}
            frame={getServerIconFrame(server)}
            loading="eager"
            decoding="sync"
          />
        ) : (
          <span className="btn__server-empty" aria-hidden="true" />
        )}
      </button>
    ))}
    <button type="button" className="btn__create-server" aria-label="Создать сервер" onClick={onAddServer}>+</button>
  </aside>
);

export const MobileServerStrip = ({
  servers,
  workspaceMode,
  activeServer,
  defaultServerIcon,
  onServerShortcutClick,
  onServerPointerDown,
  onServerPointerUp,
  onServerPointerCancel,
  onAddServer,
  getServerIconFrame,
}) => (
  <div className="mobile-server-strip">
    <div className="mobile-server-strip__scroller">
      {servers.map((server) => (
        <button
          key={server.id}
          type="button"
          className={`btn__server ${workspaceMode === "servers" && server.id === activeServer?.id ? "btn__server--active" : ""}`}
          onClick={onServerShortcutClick(server)}
          onPointerDown={(event) => onServerPointerDown(event, server)}
          onPointerUp={onServerPointerUp}
          onPointerLeave={onServerPointerCancel}
          onPointerCancel={onServerPointerCancel}
          aria-label={server.name || "Без названия"}
        >
          {server.icon ? (
            <AnimatedAvatar
              className="btn__server-media"
              src={server.icon}
              fallback={defaultServerIcon}
              alt={server.name || "Без названия"}
              frame={getServerIconFrame(server)}
              loading="eager"
              decoding="sync"
            />
          ) : (
            <span className="btn__server-empty" aria-hidden="true" />
          )}
        </button>
      ))}
      <button type="button" className="btn__create-server btn__create-server--mobile" aria-label="Создать сервер" onClick={onAddServer}>+</button>
    </div>
  </div>
);

export const MobileDirectChat = ({
  currentDirectFriend,
  currentDirectChannelId,
  textChatLocalStateVersion = 0,
  user,
  directConversationTargets,
  getDisplayName,
  textChatNavigationRequest,
  onTextChatNavigationIndexChange,
  onStartDirectCall,
}) => (
  <main className="chat__wrapper chat__wrapper--friends chat__wrapper--mobile-direct">
    <div className="chat__box chat__box--servers">
      <div className="chat__topbar chat__topbar--mobile-direct">
        <div className="chat__topbar-title">
          <div className="chat__topbar-copy">
            <strong className={isUserCurrentlyOnline(currentDirectFriend) ? "chat__topbar-copy-name--online" : ""}>{getDisplayName(currentDirectFriend)}</strong>
            <span>{formatUserPresenceStatus(currentDirectFriend)}</span>
          </div>
        </div>
      </div>
      <TextChat
        resolvedChannelId={currentDirectChannelId}
        localMessageStateVersion={textChatLocalStateVersion}
        user={user}
        onClearSearchQuery={onClearChannelSearch}
        directTargets={directConversationTargets}
        navigationRequest={textChatNavigationRequest}
        onNavigationIndexChange={onTextChatNavigationIndexChange}
        onStartDirectCall={onStartDirectCall}
      />
    </div>
  </main>
);
