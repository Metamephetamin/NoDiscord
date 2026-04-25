import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import "../css/Auth.css";
import { API_BASE_URL } from "../config/runtime";
import { authFetch, getApiErrorMessage, getStoredToken, parseApiResponse } from "../utils/auth";

export default function QrLoginConfirmPage({ user }) {
  const location = useLocation();
  const navigate = useNavigate();
  const [status, setStatus] = useState("loading");
  const [message, setMessage] = useState("");
  const [sessionPreview, setSessionPreview] = useState(null);
  const [isApproving, setIsApproving] = useState(false);

  const qrParams = useMemo(() => {
    const params = new URLSearchParams(location.search);
    return {
      sessionId: String(params.get("sid") || "").trim(),
      scannerToken: String(params.get("token") || "").trim(),
    };
  }, [location.search]);

  useEffect(() => {
    if (!user && !getStoredToken()) {
      setStatus("locked");
      setMessage("Откройте ссылку на устройстве, где уже выполнен вход.");
      return undefined;
    }

    if (!qrParams.sessionId || !qrParams.scannerToken) {
      setStatus("error");
      setMessage("QR-ссылка неполная.");
      return undefined;
    }

    let disposed = false;

    const loadPreview = async () => {
      setStatus("loading");
      setMessage("");

      try {
        const query = new URLSearchParams({ scannerToken: qrParams.scannerToken });
        const response = await authFetch(
          `${API_BASE_URL}/auth/qr-login/session/${encodeURIComponent(qrParams.sessionId)}/preview?${query}`,
          { method: "GET" }
        );
        const data = await parseApiResponse(response);

        if (disposed) {
          return;
        }

        if (!response.ok) {
          throw new Error(getApiErrorMessage(response, data, "Не удалось открыть QR-вход."));
        }

        setSessionPreview(data);
        setStatus("ready");
      } catch (error) {
        if (!disposed) {
          setStatus("error");
          setMessage(error.message || "Не удалось открыть QR-вход.");
        }
      }
    };

    loadPreview();

    return () => {
      disposed = true;
    };
  }, [qrParams, user]);

  const approveQrLogin = async () => {
    if (!qrParams.sessionId || !qrParams.scannerToken || isApproving) {
      return;
    }

    setIsApproving(true);
    setMessage("");

    try {
      const response = await authFetch(`${API_BASE_URL}/auth/qr-login/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(qrParams),
      });
      const data = await parseApiResponse(response);

      if (!response.ok) {
        throw new Error(getApiErrorMessage(response, data, "Не удалось подтвердить вход."));
      }

      setStatus("approved");
      setMessage("Вход подтверждён. Можно вернуться к окну входа.");
    } catch (error) {
      setStatus("error");
      setMessage(error.message || "Не удалось подтвердить вход.");
    } finally {
      setIsApproving(false);
    }
  };

  return (
    <div className="auth-page auth-page--qr-confirm">
      <div className="auth-qr-confirm-card">
        <div>
          <h1>Вход по QR</h1>
          <p>
            {status === "ready"
              ? "Подтвердите вход на другом устройстве."
              : status === "approved"
                ? "Готово"
                : "Проверяем QR-ссылку."}
          </p>
        </div>

        {user ? (
          <div className="auth-qr-confirm-user">
            <span>{user.nickname || user.email || "Аккаунт"}</span>
            <small>{user.email || ""}</small>
          </div>
        ) : null}

        {sessionPreview?.requestedIp ? (
          <div className="auth-qr-confirm-meta">
            <span>Устройство входа</span>
            <strong>{sessionPreview.requestedIp}</strong>
          </div>
        ) : null}

        {message ? <div className="auth-qr-confirm-message">{message}</div> : null}

        <div className="auth-qr-confirm-actions">
          <button
            type="button"
            className="auth-submit auth-submit--secondary"
            onClick={() => navigate("/", { replace: true })}
          >
            Отмена
          </button>
          <button
            type="button"
            className="auth-submit"
            disabled={status !== "ready" || isApproving}
            onClick={approveQrLogin}
          >
            {isApproving ? "Подтверждаем..." : "Подтвердить"}
          </button>
        </div>
      </div>
    </div>
  );
}
