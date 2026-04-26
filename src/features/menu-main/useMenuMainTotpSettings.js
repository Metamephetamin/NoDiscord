import { API_BASE_URL } from "../../config/runtime";
import {
  authFetch,
  getApiErrorMessage,
  getStoredAccessTokenExpiresAt,
  getStoredRefreshToken,
  getStoredToken,
  parseApiResponse,
  storeSession,
} from "../../utils/auth";
import { useState } from "react";

const initialTotpSetup = {
  secret: "",
  otpauthUri: "",
  code: "",
  status: "",
  isBusy: false,
};

const TOTP_MESSAGES = {
  startFailed: "\u041d\u0435 \u0443\u0434\u0430\u043b\u043e\u0441\u044c \u043d\u0430\u0447\u0430\u0442\u044c \u043f\u043e\u0434\u043a\u043b\u044e\u0447\u0435\u043d\u0438\u0435 Google Authenticator.",
  setupStarted: "\u041e\u0442\u0441\u043a\u0430\u043d\u0438\u0440\u0443\u0439\u0442\u0435 QR-\u043a\u043e\u0434 \u0432 Google Authenticator \u0438 \u0432\u0432\u0435\u0434\u0438\u0442\u0435 \u043a\u043e\u0434.",
  codeRequired: "\u0412\u0432\u0435\u0434\u0438\u0442\u0435 \u0448\u0435\u0441\u0442\u0438\u0437\u043d\u0430\u0447\u043d\u044b\u0439 \u043a\u043e\u0434 \u0438\u0437 Google Authenticator.",
  verifyFailed: "\u041d\u0435 \u0443\u0434\u0430\u043b\u043e\u0441\u044c \u043f\u043e\u0434\u0442\u0432\u0435\u0440\u0434\u0438\u0442\u044c \u043a\u043e\u0434 Google Authenticator.",
  enabled: "Google Authenticator \u043f\u043e\u0434\u043a\u043b\u044e\u0447\u0451\u043d.",
  disableFailed: "\u041d\u0435 \u0443\u0434\u0430\u043b\u043e\u0441\u044c \u043e\u0442\u043a\u043b\u044e\u0447\u0438\u0442\u044c Google Authenticator.",
  disabled: "Google Authenticator \u043e\u0442\u043a\u043b\u044e\u0447\u0451\u043d.",
};

export default function useMenuMainTotpSettings({ user, setUser }) {
  const [totpSetup, setTotpSetup] = useState(initialTotpSetup);

  const updateStoredUserTotpState = async (isTotpEnabled) => {
    const nextUser = {
      ...user,
      isTotpEnabled: Boolean(isTotpEnabled),
      is_totp_enabled: Boolean(isTotpEnabled),
    };
    setUser?.(nextUser);
    await storeSession(nextUser, {
      accessToken: getStoredToken(),
      refreshToken: getStoredRefreshToken(),
      accessTokenExpiresAt: getStoredAccessTokenExpiresAt(),
    });
  };

  const updateTotpCode = (value) => {
    setTotpSetup((previous) => ({
      ...previous,
      code: String(value || "").replace(/\D/g, "").slice(0, 6),
      status: "",
    }));
  };

  const startTotpSetup = async () => {
    setTotpSetup((previous) => ({ ...previous, isBusy: true, status: "" }));

    try {
      const response = await authFetch(`${API_BASE_URL}/auth/totp/setup`, {
        method: "POST",
      });
      const data = await parseApiResponse(response);
      if (!response.ok) {
        throw new Error(getApiErrorMessage(response, data, "Не удалось начать подключение Google Authenticator."));
      }

      setTotpSetup({
        secret: data?.secret || "",
        otpauthUri: data?.otpauthUri || "",
        code: "",
        status: "Добавьте ключ в Google Authenticator и введите код.",
        isBusy: false,
      });
    } catch (error) {
      setTotpSetup((previous) => ({
        ...previous,
        isBusy: false,
        status: error?.message || "Не удалось начать подключение Google Authenticator.",
      }));
    }
  };

  const verifyTotpSetup = async () => {
    const code = totpSetup.code.trim();
    if (code.length !== 6) {
      setTotpSetup((previous) => ({ ...previous, status: "Введите шестизначный код из Google Authenticator." }));
      return;
    }

    setTotpSetup((previous) => ({ ...previous, isBusy: true, status: "" }));

    try {
      const response = await authFetch(`${API_BASE_URL}/auth/totp/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      const data = await parseApiResponse(response);
      if (!response.ok) {
        throw new Error(getApiErrorMessage(response, data, "Не удалось подтвердить код Google Authenticator."));
      }

      await updateStoredUserTotpState(true);
      setTotpSetup({
        ...initialTotpSetup,
        status: "Google Authenticator подключён.",
      });
    } catch (error) {
      setTotpSetup((previous) => ({
        ...previous,
        isBusy: false,
        status: error?.message || "Не удалось подтвердить код Google Authenticator.",
      }));
    }
  };

  const disableTotp = async () => {
    const code = totpSetup.code.trim();
    if (code.length !== 6) {
      setTotpSetup((previous) => ({ ...previous, status: "Введите шестизначный код из Google Authenticator." }));
      return;
    }

    setTotpSetup((previous) => ({ ...previous, isBusy: true, status: "" }));

    try {
      const response = await authFetch(`${API_BASE_URL}/auth/totp/disable`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      const data = await parseApiResponse(response);
      if (!response.ok) {
        throw new Error(getApiErrorMessage(response, data, "Не удалось отключить Google Authenticator."));
      }

      await updateStoredUserTotpState(false);
      setTotpSetup({
        ...initialTotpSetup,
        status: "Google Authenticator отключён.",
      });
    } catch (error) {
      setTotpSetup((previous) => ({
        ...previous,
        isBusy: false,
        status: error?.message || "Не удалось отключить Google Authenticator.",
      }));
    }
  };

  return {
    isTotpEnabled: Boolean(user?.isTotpEnabled || user?.is_totp_enabled),
    totpSetup,
    updateTotpCode,
    startTotpSetup,
    verifyTotpSetup,
    disableTotp,
  };
}
