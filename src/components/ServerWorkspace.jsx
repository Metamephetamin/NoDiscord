import AnimatedAvatar from "./AnimatedAvatar";
import ScreenShareViewer from "./ScreenShareViewer";
import TextChat from "./TextChat";
import VoiceChannelList from "./VoiceChannelList";

export const ServersSidebar = ({
  includeProfilePanel = true,
  profilePanel,
  activeServer,
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

                return (
                  <li key={channel.id} className={`channel-item ${currentTextChannel?.id === channel.id ? "active-channel" : ""} ${isEditing ? "channel-item--editing" : ""}`}>
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
              onRenameChannel={onStartChannelRename}
              liveUserIds={liveUserIds}
              speakingUserIds={speakingUserIds}
              watchedStreamUserId={watchedStreamUserId}
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
);

export const ServerMain = ({
  activeServer,
  currentTextChannel,
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
  onOpenLocalSharePreview,
  onChannelSearchChange,
  onAddServer,
  onCloseSelectedStream,
  onStopCameraShare,
  onStopScreenShare,
  onCloseLocalSharePreview,
  getChannelDisplayName,
}) => (
  <main className="chat__wrapper chat__wrapper--servers">
    <div className="chat__box chat__box--servers">
      {activeServer ? (
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
      ) : selectedStreamUserId ? (
        <ScreenShareViewer
          stream={selectedStream?.stream || null}
          videoSrc={selectedStream?.videoSrc || ""}
          imageSrc={selectedStream?.imageSrc || ""}
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
            directTargets={directConversationTargets}
            serverMembers={serverMembers}
          />
        ) : null
      )}
    </div>
  </main>
);

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
          <AnimatedAvatar className="btn__server-media" src={server.icon} fallback={defaultServerIcon} alt={server.name || "Без названия"} frame={getServerIconFrame(server)} />
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
            <AnimatedAvatar className="btn__server-media" src={server.icon} fallback={defaultServerIcon} alt={server.name || "Без названия"} frame={getServerIconFrame(server)} />
          ) : (
            <span className="btn__server-empty" aria-hidden="true" />
          )}
        </button>
      ))}
      <button type="button" className="btn__create-server btn__create-server--mobile" aria-label="Создать сервер" onClick={onAddServer}>+</button>
    </div>
  </div>
);

export const MobileDirectChat = ({ currentDirectFriend, currentDirectChannelId, user, directConversationTargets, getDisplayName }) => (
  <main className="chat__wrapper chat__wrapper--friends chat__wrapper--mobile-direct">
    <div className="chat__box chat__box--servers">
      <div className="chat__topbar chat__topbar--mobile-direct">
        <div className="chat__topbar-title">
          <div className="chat__topbar-copy">
            <strong>{getDisplayName(currentDirectFriend)}</strong>
            <span>Личный чат между двумя пользователями</span>
          </div>
        </div>
      </div>
      <TextChat resolvedChannelId={currentDirectChannelId} user={user} directTargets={directConversationTargets} />
    </div>
  </main>
);
