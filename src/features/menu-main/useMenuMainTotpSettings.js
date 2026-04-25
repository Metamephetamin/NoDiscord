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
