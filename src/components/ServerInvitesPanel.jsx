import { useMemo, useState } from "react";
import { API_BASE_URL } from "../config/runtime";
import { authFetch, getApiErrorMessage, parseApiResponse } from "../utils/auth";
import { copyTextToClipboard } from "../utils/clipboard";
import { buildServerInviteLink } from "../utils/serverInviteLinks";

const getDisplayName = (user) =>
  user?.nickname || user?.firstName || user?.first_name || user?.name || user?.email || "User";

export default function ServerInvitesPanel({
  activeServer,
  user,
  canInvite = false,
  onBeforeCreateInvite,
  onImportServer,
  onServerShared,
  showCreate = true,
  showJoin = true,
  title = "Приглашения",
  helperText = "",
}) {
  const [inviteLink, setInviteLink] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [status, setStatus] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [isJoining, setIsJoining] = useState(false);

  const avatarUrl = useMemo(() => user?.avatarUrl || user?.avatar || "", [user?.avatarUrl, user?.avatar]);
  const normalizedJoinCode = useMemo(
    () => String(joinCode || "").toUpperCase().replace(/[^A-Z0-9]/g, ""),
    [joinCode]
  );

  const createInvite = async () => {
    if (!activeServer) {
      return;
    }

    setIsCreating(true);
    setStatus("");

    try {
      const inviteSource = (await onBeforeCreateInvite?.(activeServer)) || activeServer;
      const response = await authFetch(`${API_BASE_URL}/server-invites/create`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          serverSnapshot: inviteSource,
        }),
      });
      const data = await parseApiResponse(response);

      if (!response.ok) {
        throw new Error(getApiErrorMessage(response, data, "Не удалось создать приглашение."));
      }

      const nextInviteLink = buildServerInviteLink(data?.inviteCode || "");
      setInviteLink(nextInviteLink || data?.inviteCode || "");
      onServerShared?.(data?.serverId || inviteSource?.id || activeServer.id);
      setStatus("Ссылка-приглашение создана.");
    } catch (error) {
      setStatus(error?.message || "Ошибка создания приглашения.");
    } finally {
      setIsCreating(false);
    }
  };

  const copyInvite = async () => {
    if (!inviteLink) {
      return;
    }

    try {
      await copyTextToClipboard(inviteLink);
      setStatus("Ссылка-приглашение скопирована.");
    } catch {
      setStatus("Не удалось скопировать ссылку.");
    }
  };

  const redeemInvite = async () => {
    if (!normalizedJoinCode) {
      return;
    }

    setIsJoining(true);
    setStatus("");

    try {
      const response = await authFetch(`${API_BASE_URL}/server-invites/redeem`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          inviteCode: normalizedJoinCode,
          name: getDisplayName(user),
          avatar: avatarUrl,
        }),
      });
      const data = await parseApiResponse(response);

      if (!response.ok) {
        throw new Error(getApiErrorMessage(response, data, "Не удалось присоединиться к серверу."));
      }

      const snapshot = data?.snapshot || data?.serverSnapshot || null;
      onImportServer?.(snapshot);
      onServerShared?.(snapshot?.id || activeServer?.id);
      setJoinCode("");
      setStatus("Сервер добавлен.");
    } catch (error) {
      setStatus(error?.message || "Ошибка присоединения к серверу.");
    } finally {
      setIsJoining(false);
    }
  };

  return (
    <div className="settings-section">
      <div className="settings-section__header">
        <h4>{title}</h4>
      </div>

      <div className="settings-list">
        {showCreate ? (
          <div className="settings-list__row">
            <input className="settings-input" type="text" value={inviteLink} readOnly placeholder="Ссылка-приглашение" />
            <div className="settings-list__actions">
              <button
                type="button"
                className="settings-inline-button"
                onClick={createInvite}
                disabled={!canInvite || isCreating || !activeServer}
              >
                {isCreating ? "Создаём..." : "Создать"}
              </button>
              <button type="button" className="settings-inline-button" onClick={copyInvite} disabled={!inviteLink}>
                Копировать
              </button>
            </div>
          </div>
        ) : null}

        {showJoin ? (
          <div className="settings-list__row">
            <input
              className="settings-input"
              type="text"
              value={joinCode}
              onChange={(event) => setJoinCode(event.target.value.toUpperCase())}
              placeholder="Введите код сервера"
            />
            <div className="settings-list__actions">
              <button
                type="button"
                className="settings-inline-button"
                onClick={redeemInvite}
                disabled={!normalizedJoinCode || isJoining}
              >
                {isJoining ? "Входим..." : "Вступить"}
              </button>
            </div>
          </div>
        ) : null}
      </div>

      <div className="settings-helper">
        {status || helperText || "Создайте ссылку, чтобы пригласить человека, или вставьте код, чтобы добавить сервер к себе."}
      </div>
    </div>
  );
}
