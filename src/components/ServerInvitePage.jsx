import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import Auth from "./Auth";
import "../css/ServerInvitePage.css";
import { API_BASE_URL } from "../config/runtime";
import { authFetch, getApiErrorMessage, parseApiResponse } from "../utils/auth";
import { DEFAULT_SERVER_ICON, resolveMediaUrl } from "../utils/media";

const getDisplayName = (user) =>
  user?.firstName || user?.first_name || user?.name || user?.email || "User";

export default function ServerInvitePage({ user, onAuthSuccess, onInviteAccepted }) {
  const { inviteCode = "" } = useParams();
  const [preview, setPreview] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");

  const normalizedInviteCode = useMemo(() => String(inviteCode || "").trim().toUpperCase(), [inviteCode]);
  const serverIconUrl = resolveMediaUrl(preview?.serverIcon, DEFAULT_SERVER_ICON);

  useEffect(() => {
    if (!normalizedInviteCode) {
      setPreview(null);
      setError("Ссылка приглашения повреждена.");
      setIsLoading(false);
      return;
    }

    let disposed = false;

    const loadPreview = async () => {
      setIsLoading(true);
      setError("");
      setStatus("");

      try {
        const request = user ? authFetch : fetch;
        const response = await request(`${API_BASE_URL}/server-invites/${encodeURIComponent(normalizedInviteCode)}`);
        const data = await parseApiResponse(response);

        if (!response.ok) {
          throw new Error(getApiErrorMessage(response, data, "Не удалось загрузить приглашение."));
        }

        if (!disposed) {
          setPreview(data || null);
        }
      } catch (requestError) {
        if (!disposed) {
          setPreview(null);
          setError(requestError?.message || "Не удалось загрузить приглашение.");
        }
      } finally {
        if (!disposed) {
          setIsLoading(false);
        }
      }
    };

    void loadPreview();

    return () => {
      disposed = true;
    };
  }, [normalizedInviteCode, user]);

  const handleAcceptInvite = async () => {
    if (!user || !preview || preview.isExpired) {
      return;
    }

    setIsSubmitting(true);
    setStatus("");

    try {
      const response = await authFetch(`${API_BASE_URL}/server-invites/${encodeURIComponent(normalizedInviteCode)}/redeem`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: getDisplayName(user),
          avatar: user?.avatarUrl || user?.avatar || "",
        }),
      });
      const data = await parseApiResponse(response);

      if (!response.ok) {
        throw new Error(getApiErrorMessage(response, data, "Не удалось принять приглашение."));
      }

      const snapshot = data?.snapshot || data?.serverSnapshot || null;
      if (!snapshot) {
        throw new Error("Сервер не вернул данные приглашения.");
      }

      setStatus("Приглашение принято. Открываем сервер...");
      onInviteAccepted?.(snapshot);
    } catch (requestError) {
      setStatus(requestError?.message || "Не удалось принять приглашение.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleOpenServer = async () => {
    if (!user || !preview?.serverId) {
      return;
    }

    setIsSubmitting(true);
    setStatus("");

    try {
      const response = await authFetch(`${API_BASE_URL}/server-invites/server/${encodeURIComponent(preview.serverId)}`, {
        method: "GET",
      });
      const data = await parseApiResponse(response);

      if (!response.ok) {
        throw new Error(getApiErrorMessage(response, data, "Не удалось открыть сервер."));
      }

      setStatus("Открываем сервер...");
      onInviteAccepted?.(data);
    } catch (requestError) {
      setStatus(requestError?.message || "Не удалось открыть сервер.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const renderInviteCard = () => {
    if (isLoading) {
      return (
        <div className="server-invite-card server-invite-card--loading">
          <div className="server-invite-card__pulse" />
          <strong>Загружаем приглашение</strong>
          <span>Проверяем ссылку и собираем карточку сервера.</span>
        </div>
      );
    }

    if (error || !preview) {
      return (
        <div className="server-invite-card server-invite-card--error">
          <div className="server-invite-card__badge">Invite</div>
          <h1>Приглашение недоступно</h1>
          <p>{error || "Ссылка приглашения не найдена или больше не работает."}</p>
        </div>
      );
    }

    const isAlreadyMember = Boolean(preview.currentUserAlreadyMember);

    return (
      <div className={`server-invite-card ${preview.isExpired ? "server-invite-card--error" : ""}`}>
        <div className="server-invite-card__badge">Приглашение</div>
        <div className="server-invite-card__server">
          <img
            className="server-invite-card__icon"
            src={serverIconUrl}
            alt={preview.serverName || "Сервер"}
          />
          <div className="server-invite-card__copy">
            <h1>{preview.serverName || "Без названия"}</h1>
            <p>
              {preview.memberCount || 0} участников, {preview.textChannelCount || 0} текстовых каналов,{" "}
              {preview.voiceChannelCount || 0} голосовых каналов
            </p>
          </div>
        </div>

        <div className="server-invite-card__meta">
          <span>Код: {preview.inviteCode}</span>
          <span>Действует до: {new Date(preview.expiresAt).toLocaleString("ru-RU")}</span>
        </div>

        {!user ? (
          <div className="server-invite-card__notice">
            Войдите или зарегистрируйтесь ниже, после чего приглашение можно будет принять.
          </div>
        ) : preview.isExpired ? (
          <div className="server-invite-card__notice server-invite-card__notice--error">
            Срок действия приглашения истёк.
          </div>
        ) : isAlreadyMember ? (
          <div className="server-invite-card__actions">
            <div className="server-invite-card__notice">Вы уже состоите на этом сервере.</div>
            <button type="button" className="server-invite-card__button" onClick={handleOpenServer} disabled={isSubmitting}>
              {isSubmitting ? "Открываем..." : "Открыть сервер"}
            </button>
          </div>
        ) : (
          <div className="server-invite-card__actions">
            <button type="button" className="server-invite-card__button" onClick={handleAcceptInvite} disabled={isSubmitting}>
              {isSubmitting ? "Принимаем..." : "Принять приглашение"}
            </button>
          </div>
        )}

        {status ? <div className="server-invite-card__status">{status}</div> : null}
      </div>
    );
  };

  return (
    <div className="server-invite-page">
      <div className="server-invite-page__shell">
        <div className="server-invite-page__intro">
          <div className="server-invite-page__eyebrow">MAX Invite</div>
          <h2>Приглашение на сервер</h2>
          <p>Открывайте ссылку, смотрите карточку сервера и принимайте приглашение без ручного ввода кода.</p>
          {renderInviteCard()}
        </div>

        {!user ? (
          <div className="server-invite-page__auth">
            <Auth onAuthSuccess={onAuthSuccess} />
          </div>
        ) : null}
      </div>
    </div>
  );
}
