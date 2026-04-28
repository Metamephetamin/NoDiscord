import { useCallback, useMemo, useState } from "react";
import {
  getScopedVoiceChannelId,
  hasServerPermission,
  isPersonalDefaultServer,
} from "../../utils/menuMainModel";
import { getStoredTextChannelId } from "./menuMainWorkspaceStorage";

export function useMenuMainServerInvitePermissions({ currentUserId, user }) {
  const canInviteToServer = useCallback((server) => {
    if (!server || !currentUserId || isPersonalDefaultServer(server, user)) {
      return false;
    }

    if (hasServerPermission(server, currentUserId, "invite_members") || hasServerPermission(server, currentUserId, "manage_server")) {
      return true;
    }

    return (server.members || []).some((member) => String(member?.userId || member?.id || "") === String(currentUserId));
  }, [currentUserId, user]);

  return { canInviteToServer };
}

export default function useMenuMainServerInviteFlow({
  activeServer,
  activeServerId,
  activeTextChannelStorageKey,
  canInviteToServer,
  currentTextChannel,
  currentVoiceChannel,
  leaveVoiceChannel,
  requestServerInviteLink,
  servers,
  setActiveServerId,
  setCurrentTextChannelId,
  setProfileStatus,
  setSelectedStreamUserId,
  setServerContextMenu,
  setServers,
  showServerInviteFeedback,
  user,
}) {
  const [serverInviteModalOpen, setServerInviteModalOpen] = useState(false);
  const [serverInviteTargetId, setServerInviteTargetId] = useState("");
  const serverInviteTarget = useMemo(
    () => servers.find((server) => String(server.id) === String(serverInviteTargetId)) || activeServer,
    [activeServer, serverInviteTargetId, servers]
  );
  const serverInviteTargetChannelName = useMemo(() => {
    if (!serverInviteTarget) {
      return "основной";
    }

    if (String(serverInviteTarget.id) === String(activeServer?.id)) {
      return currentTextChannel?.name || serverInviteTarget.textChannels?.[0]?.name || "основной";
    }

    return serverInviteTarget.textChannels?.[0]?.name || "основной";
  }, [activeServer?.id, currentTextChannel?.name, serverInviteTarget]);

  const openServerInviteModal = useCallback((targetServer = activeServer) => {
    const resolvedTargetServer = targetServer?.id ? targetServer : activeServer;

    if (!resolvedTargetServer) {
      showServerInviteFeedback("Сервер не найден.");
      return;
    }

    if (!canInviteToServer(resolvedTargetServer)) {
      showServerInviteFeedback("Недостаточно прав для приглашения.");
      return;
    }

    setServerContextMenu(null);
    setServerInviteTargetId(String(resolvedTargetServer.id || ""));
    setServerInviteModalOpen(true);
  }, [activeServer, canInviteToServer, setServerContextMenu, showServerInviteFeedback]);

  const closeServerInviteModal = useCallback(() => {
    setServerInviteModalOpen(false);
    setServerInviteTargetId("");
  }, []);

  const createServerInviteLinkForModal = useCallback(
    () => requestServerInviteLink(serverInviteTarget, { copyToClipboard: false }),
    [requestServerInviteLink, serverInviteTarget]
  );

  const handleLeaveServer = useCallback(async (targetServer) => {
    const serverId = String(targetServer?.id || targetServer || "");
    const serverToLeave = servers.find((server) => String(server.id) === serverId);
    if (!serverToLeave) {
      setProfileStatus("Сервер не найден.");
      return;
    }

    if (isPersonalDefaultServer(serverToLeave, user)) {
      setProfileStatus("Из личного сервера выйти нельзя.");
      return;
    }

    if (serverToLeave.voiceChannels?.some((channel) => getScopedVoiceChannelId(serverToLeave.id, channel.id) === currentVoiceChannel)) {
      await leaveVoiceChannel();
    }

    const nextServers = servers.filter((server) => String(server.id) !== serverId);
    const nextActiveId = String(activeServerId) === serverId ? nextServers[0]?.id || "" : activeServerId;
    const nextActiveServer = nextServers.find((server) => server.id === nextActiveId) || nextServers[0] || null;

    setServerContextMenu(null);
    setServerInviteTargetId((previous) => (String(previous) === serverId ? "" : previous));
    setServers(nextServers);
    setActiveServerId(nextActiveId);
    setCurrentTextChannelId(getStoredTextChannelId(activeTextChannelStorageKey, nextActiveServer) || nextActiveServer?.textChannels?.[0]?.id || "");
    setSelectedStreamUserId(null);
    setProfileStatus(`Вы вышли с сервера ${serverToLeave.name || ""}.`.trim());
  }, [
    activeServerId,
    activeTextChannelStorageKey,
    currentVoiceChannel,
    leaveVoiceChannel,
    servers,
    setActiveServerId,
    setCurrentTextChannelId,
    setProfileStatus,
    setSelectedStreamUserId,
    setServerContextMenu,
    setServers,
    user,
  ]);

  return {
    closeServerInviteModal,
    createServerInviteLinkForModal,
    handleLeaveServer,
    openServerInviteModal,
    serverInviteModalOpen,
    serverInviteTarget,
    serverInviteTargetChannelName,
  };
}
