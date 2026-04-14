import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import "../css/ServerInvitePage.css";
import { API_BASE_URL } from "../config/runtime";
import { authFetch, getApiErrorMessage, parseApiResponse } from "../utils/auth";
import { clearPendingInviteAcceptCode, readPendingInviteAcceptCode, writePendingInviteAcceptCode } from "../utils/inviteFlow";
import { DEFAULT_SERVER_ICON } from "../utils/media";
import { parseMediaFrame } from "../utils/mediaFrames";
import AnimatedAvatar from "./AnimatedAvatar";

const getDisplayName = (user) =>
  user?.nickname || user?.firstName || user?.first_name || user?.name || user?.email || "User";

function getServerTypeLabel(preview) {
  const textCount = Number(preview?.textChannelCount || 0);
  const voiceCount = Number(preview?.voiceChannelCount || 0);

  if (textCount > 0 && voiceCount > 0) {
    return "Текстовый и голосовой сервер";
  }

  if (voiceCount > 0) {
    return "Голосовой сервер";
  }

  if (textCount > 0) {
    return "Текстовый сервер";
  }

  return "Сервер сообщества";
}

function getServerDescription(preview) {
  const description = String(preview?.serverDescription || "").trim();
  if (description) {
    return description;
  }

  const textCount = Number(preview?.textChannelCount || 0);
  const voiceCount = Number(preview?.voiceChannelCount || 0);

  if (textCount > 0 && voiceCount > 0) {
    return "Сервер для общения, переписки и голосовых созвонов.";
  }

  if (voiceCount > 0) {
    return "Сервер в первую очередь рассчитан на голосовое общение.";
  }

  if (textCount > 0) {
    return "Сервер для переписки, обсуждений и координации участников.";
  }

  return "Сервер для общения и совместной работы участников.";
}

function resolveInviteCodeFromPath(pathname) {
  const match = String(pathname || "").match(/^\/invite\/([^/?#]+)/i);
  return match?.[1] ? decodeURIComponent(match[1]) : "";
}

export default function ServerInvitePage({ user, onInviteAccepted, inviteCode: inviteCodeProp = "" }) {
  const location = useLocation();
  const { inviteCode: inviteCodeParam = "" } = useParams();
  const navigate = useNavigate();
  const [preview, setPreview] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const autoAcceptAttemptedRef = useRef("");

  const normalizedInviteCode = useMemo(() => {
    const rawInviteCode = inviteCodeParam || inviteCodeProp || resolveInviteCodeFromPath(location.pathname);
    return String(rawInviteCode || "").trim().toUpperCase();
  }, [inviteCodeParam, inviteCodeProp, location.pathname]);

  const rawServerIconValue =
    preview?.serverIcon ||
    preview?.server_icon ||
    preview?.iconUrl ||
    preview?.icon_url ||
    preview?.icon ||
    preview?.Icon ||
    "";
  const serverIconFrame = useMemo(
    () => parseMediaFrame(preview?.serverIconFrame, preview?.server_icon_frame, preview?.iconFrame, preview?.icon_frame),
    [preview?.serverIconFrame, preview?.server_icon_frame, preview?.iconFrame, preview?.icon_frame]
  );
  const serverTypeLabel = useMemo(() => getServerTypeLabel(preview), [preview]);
  const serverDescription = useMemo(() => getServerDescription(preview), [preview]);

  useEffect(() => {
    if (!normalizedInviteCode) {
      setPreview(null);
      setError("Ссылка-приглашение повреждена.");
      setIsLoading(false);
      return undefined;
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
    if (!preview || preview.isExpired) {
      return;
    }

    if (!user) {
      writePendingInviteAcceptCode(normalizedInviteCode);
      navigate("/", { replace: true });
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

      clearPendingInviteAcceptCode();
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

      clearPendingInviteAcceptCode();
      setStatus("Открываем сервер...");
      onInviteAccepted?.(data);
    } catch (requestError) {
      setStatus(requestError?.message || "Не удалось открыть сервер.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeclineInvite = () => {
    clearPendingInviteAcceptCode();

    if (typeof window !== "undefined" && window.history.length > 1) {
      navigate(-1);
      return;
    }

    navigate("/", { replace: true });
  };

  useEffect(() => {
    if (!user || !preview || !normalizedInviteCode) {
      return;
    }

    const pendingInviteCode = readPendingInviteAcceptCode();
    if (pendingInviteCode !== normalizedInviteCode) {
      return;
    }

    if (autoAcceptAttemptedRef.current === normalizedInviteCode) {
      return;
    }

    autoAcceptAttemptedRef.current = normalizedInviteCode;

    if (preview.isExpired) {
      clearPendingInviteAcceptCode();
      return;
    }

    if (preview.currentUserAlreadyMember) {
      void handleOpenServer();
      return;
    }

    void handleAcceptInvite();
  }, [normalizedInviteCode, preview, user]);

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
          <p>{error || "Ссылка-приглашение не найдена или больше не работает."}</p>
        </div>
      );
    }

    const isAlreadyMember = Boolean(preview.currentUserAlreadyMember);

    return (
      <div className={`server-invite-card ${preview.isExpired ? "server-invite-card--error" : ""}`}>
        <div className="server-invite-card__badge">Приглашение</div>

        <div className="server-invite-card__server">
          <AnimatedAvatar
            className="server-invite-card__icon"
            src={rawServerIconValue}
            fallback={DEFAULT_SERVER_ICON}
            alt={preview.serverName || "Сервер"}
            frame={serverIconFrame}
          />
          <div className="server-invite-card__copy">
            <h1>{preview.serverName || "Без названия"}</h1>
            <p>
              {preview.memberCount || 0} участников, {preview.textChannelCount || 0} текстовых каналов,{" "}
              {preview.voiceChannelCount || 0} голосовых каналов
            </p>
          </div>
        </div>

        <div className="server-invite-card__summary">
          <div className="server-invite-card__summary-label">Что это за сервер</div>
          <div className="server-invite-card__summary-type">{serverTypeLabel}</div>
          <p>{serverDescription}</p>
        </div>

        <div className="server-invite-card__meta">
          <span>Код: {preview.inviteCode}</span>
          <span>Действует до: {new Date(preview.expiresAt).toLocaleString("ru-RU")}</span>
        </div>

        {preview.isExpired ? (
          <div className="server-invite-card__notice server-invite-card__notice--error">
            Срок действия приглашения истёк.
          </div>
        ) : isAlreadyMember ? (
          <div className="server-invite-card__actions">
            <div className="server-invite-card__notice">Вы уже состоите на этом сервере.</div>
            <div className="server-invite-card__action-row">
              <button type="button" className="server-invite-card__button server-invite-card__button--secondary" onClick={handleDeclineInvite}>
                Отклонить
              </button>
              <button type="button" className="server-invite-card__button" onClick={handleOpenServer} disabled={isSubmitting}>
                {isSubmitting ? "Открываем..." : "Открыть сервер"}
              </button>
            </div>
          </div>
        ) : (
          <div className="server-invite-card__actions">
            {!user ? (
              <div className="server-invite-card__notice">
                После нажатия на кнопку мы переведём вас на авторизацию, а затем автоматически вернём к этому приглашению и сразу откроем нужный сервер.
              </div>
            ) : null}
            <div className="server-invite-card__action-row">
              <button type="button" className="server-invite-card__button server-invite-card__button--secondary" onClick={handleDeclineInvite} disabled={isSubmitting}>
                Отклонить
              </button>
              <button type="button" className="server-invite-card__button" onClick={handleAcceptInvite} disabled={isSubmitting}>
                {isSubmitting ? "Принимаем..." : user ? "Принять приглашение" : "Войти и принять"}
              </button>
            </div>
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
          <p>Откройте ссылку, посмотрите карточку сервера и решите, принимать приглашение или отклонить его.</p>
        </div>
        {renderInviteCard()}
      </div>
    </div>
  );
}
