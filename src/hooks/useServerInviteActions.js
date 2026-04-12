import { useEffect, useRef, useState } from "react";
import { authFetch, getApiErrorMessage, parseApiResponse } from "../utils/auth";
import { copyTextToClipboard } from "../utils/clipboard";
import { buildServerInviteLink } from "../utils/serverInviteLinks";

export default function useServerInviteActions({
  apiBaseUrl,
  activeServer,
  servers,
  serverContextMenu,
  setServerContextMenu,
  canInviteToServer,
  syncServerSnapshot,
  markServerAsShared,
}) {
  const [serverInviteFeedback, setServerInviteFeedback] = useState("");
  const serverInviteFeedbackTimeoutRef = useRef(null);

  useEffect(() => () => {
    if (serverInviteFeedbackTimeoutRef.current) {
      window.clearTimeout(serverInviteFeedbackTimeoutRef.current);
    }
  }, []);

  const showServerInviteFeedback = (message) => {
    if (!message) {
      return;
    }

    if (serverInviteFeedbackTimeoutRef.current) {
      window.clearTimeout(serverInviteFeedbackTimeoutRef.current);
    }

    setServerInviteFeedback(message);
    serverInviteFeedbackTimeoutRef.current = window.setTimeout(() => {
      setServerInviteFeedback("");
      serverInviteFeedbackTimeoutRef.current = null;
    }, 2600);
  };

  const requestServerInviteLink = async (targetServer) => {
    if (!targetServer) {
      throw new Error("Сервер не найден.");
    }

    if (!canInviteToServer(targetServer)) {
      throw new Error("Недостаточно прав для приглашения.");
    }

    const syncedSnapshot = await syncServerSnapshot(targetServer);
    const inviteSource = syncedSnapshot || targetServer;

    const response = await authFetch(`${apiBaseUrl}/server-invites/create`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        serverSnapshot: inviteSource,
      }),
    });
    const data = await parseApiResponse(response);

    if (!response.ok) {
      throw new Error(getApiErrorMessage(response, data, "Не удалось создать ссылку-приглашение."));
    }

    const inviteLink = buildServerInviteLink(data?.inviteCode || "");
    if (!inviteLink) {
      throw new Error("Не удалось подготовить ссылку-приглашение.");
    }

    await copyTextToClipboard(inviteLink);
    markServerAsShared(data?.serverId || inviteSource.id || targetServer.id);
    return inviteLink;
  };

  const handleInvitePeopleToVoice = async () => {
    if (!activeServer) {
      showServerInviteFeedback("Сервер не найден.");
      return;
    }

    try {
      await requestServerInviteLink(activeServer);
      showServerInviteFeedback(`Ссылка на ${activeServer.name || "сервер"} скопирована.`);
    } catch (error) {
      showServerInviteFeedback(error?.message || "Не удалось скопировать ссылку.");
    }
  };

  const copyServerInviteLink = async () => {
    if (!serverContextMenu?.serverId) {
      return;
    }

    const targetServer = servers.find((server) => String(server.id) === String(serverContextMenu.serverId));
    if (!targetServer) {
      setServerContextMenu((previous) => (previous ? { ...previous, status: "Сервер не найден.", isLoading: false } : previous));
      return;
    }

    if (!canInviteToServer(targetServer)) {
      setServerContextMenu((previous) => (previous ? { ...previous, status: "Недостаточно прав для приглашения.", isLoading: false } : previous));
      return;
    }

    setServerContextMenu((previous) => (previous ? { ...previous, status: "", isLoading: true } : previous));

    try {
      await requestServerInviteLink(targetServer);
      setServerContextMenu((previous) =>
        previous
          ? {
              ...previous,
              status: "Ссылка приглашения скопирована.",
              isLoading: false,
            }
          : previous
      );
    } catch (error) {
      setServerContextMenu((previous) =>
        previous
          ? {
              ...previous,
              status: error?.message || "Не удалось скопировать ссылку.",
              isLoading: false,
            }
          : previous
      );
    }
  };

  return {
    serverInviteFeedback,
    showServerInviteFeedback,
    requestServerInviteLink,
    handleInvitePeopleToVoice,
    copyServerInviteLink,
  };
}
