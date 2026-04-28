import { ServerInviteFriendsModal } from "./ServerWorkspace";
import { isServerOwnedByUser } from "../utils/menuMainModel";

export default function ServerRailContextLayer({
  servers,
  serverContextMenu,
  serverContextMenuRef,
  canInviteToServer,
  currentUserId,
  inviteFriends = [],
  isServerInviteModalOpen = false,
  serverInviteTarget = null,
  serverInviteTargetChannelName = "",
  currentTextChannel = null,
  onOpenServerInviteModal,
  onCloseServerInviteModal,
  onCreateServerInviteLink,
  onSendServerInviteToFriend,
  onCopyServerInvite,
  onLeaveServer,
  onDeleteServer,
  getChannelDisplayName,
}) {
  const targetServer = serverContextMenu
    ? servers.find((server) => String(server.id) === String(serverContextMenu.serverId))
    : null;
  const inviteModalServer = serverInviteTarget || targetServer;
  const canCopyInvite = canInviteToServer?.(targetServer);
  const canUseServerActions = Boolean(targetServer);
  const isTargetServerOwner = isServerOwnedByUser(targetServer, currentUserId);
  const rawChannelName = serverInviteTargetChannelName || currentTextChannel?.name || "основной";
  const channelName = getChannelDisplayName ? getChannelDisplayName(rawChannelName, "text") : rawChannelName;

  return (
    <>
      {isServerInviteModalOpen ? (
        <ServerInviteFriendsModal
          key={serverInviteTargetChannelName || currentTextChannel?.name || "server-invite"}
          activeServer={inviteModalServer}
          channelName={channelName}
          friends={inviteFriends}
          currentUserId={currentUserId}
          canInvite={canInviteToServer?.(inviteModalServer)}
          onClose={onCloseServerInviteModal}
          onCreateInviteLink={onCreateServerInviteLink}
          onSendInviteToFriend={onSendServerInviteToFriend}
        />
      ) : null}

      {serverContextMenu ? (
        <div
          ref={serverContextMenuRef}
          className="member-role-menu member-role-menu--server member-role-menu--server-compact"
          style={{ left: serverContextMenu.x, top: serverContextMenu.y }}
        >
          <div className="member-role-menu__title">{targetServer?.name || "Сервер"}</div>
          <button
            type="button"
            className={`member-role-menu__item ${!canCopyInvite ? "member-role-menu__item--disabled" : ""}`}
            onClick={() => onOpenServerInviteModal?.(targetServer)}
            disabled={!canCopyInvite || serverContextMenu.isLoading}
          >
            Пригласить друзей
          </button>
          <button
            type="button"
            className={`member-role-menu__item ${!canCopyInvite ? "member-role-menu__item--disabled" : ""}`}
            onClick={onCopyServerInvite}
            disabled={!canCopyInvite || serverContextMenu.isLoading}
          >
            {serverContextMenu.isLoading ? "Готовим ссылку..." : "Скопировать ссылку"}
          </button>
          <button
            type="button"
            className="member-role-menu__item member-role-menu__item--danger"
            onClick={() => (isTargetServerOwner ? onDeleteServer?.(targetServer?.id) : onLeaveServer?.(targetServer))}
            disabled={!canUseServerActions || (isTargetServerOwner ? !onDeleteServer : !onLeaveServer)}
          >
            {isTargetServerOwner ? "Удалить сервер" : "Выйти с сервера"}
          </button>
          {serverContextMenu.status ? (
            <>
              <div className="member-role-menu__separator" />
              <div className="member-role-menu__status">{serverContextMenu.status}</div>
            </>
          ) : null}
        </div>
      ) : null}
    </>
  );
}
