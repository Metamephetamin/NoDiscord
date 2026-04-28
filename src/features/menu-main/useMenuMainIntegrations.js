import { useCallback, useEffect, useRef, useState } from "react";
import chatConnection from "../../SignalR/ChatConnect";
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
import {
  connectIntegration,
  disconnectIntegration,
  fetchIntegrations,
  refreshIntegrationActivity,
  updateIntegrationSettings,
} from "../../utils/integrations";
import { DEVICE_SESSION_REFRESH_TOKEN_HEADER } from "./menuMainControllerUtils";

export default function useMenuMainIntegrations({
  user,
  setUser,
  openSettings,
  settingsTab,
  currentUserId,
  updateFriendProfile,
}) {
  const [deviceSessions, setDeviceSessions] = useState([]);
  const [deviceSessionsLoading, setDeviceSessionsLoading] = useState(false);
  const [deviceSessionsError, setDeviceSessionsError] = useState("");
  const [integrations, setIntegrations] = useState([]);
  const [integrationsLoading, setIntegrationsLoading] = useState(false);
  const [integrationsStatus, setIntegrationsStatus] = useState("");
  const [integrationActionBusy, setIntegrationActionBusy] = useState("");
  const integrationOAuthPollRef = useRef(null);
  const latestUserRef = useRef(user);

  useEffect(() => {
    latestUserRef.current = user;
  }, [user]);

  const refreshDeviceSessions = useCallback(async () => {
    if (!user?.id) {
      setDeviceSessions([]);
      setDeviceSessionsError("");
      return;
    }

    setDeviceSessionsLoading(true);
    setDeviceSessionsError("");

    try {
      const refreshToken = getStoredRefreshToken();
      const response = await authFetch(`${API_BASE_URL}/auth/devices`, {
        method: "GET",
        headers: refreshToken ? { [DEVICE_SESSION_REFRESH_TOKEN_HEADER]: refreshToken } : undefined,
      });
      const data = await parseApiResponse(response);

      if (!response.ok) {
        throw new Error(getApiErrorMessage(response, data, "Не удалось загрузить список устройств."));
      }

      setDeviceSessions(Array.isArray(data?.sessions) ? data.sessions : []);
    } catch (error) {
      setDeviceSessionsError(error?.message || "Не удалось загрузить список устройств.");
    } finally {
      setDeviceSessionsLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    if (!openSettings || settingsTab !== "devices") {
      return;
    }

    refreshDeviceSessions().catch((error) => {
      console.error("Ошибка загрузки устройств:", error);
    });
  }, [openSettings, refreshDeviceSessions, settingsTab]);

  const applyCurrentUserActivity = useCallback((activity) => {
    const currentUser = latestUserRef.current;
    if (!currentUser) {
      return;
    }

    if (JSON.stringify(currentUser.activity || currentUser.externalActivity || null) === JSON.stringify(activity || null)) {
      return;
    }

    const nextUser = {
      ...currentUser,
      activity: activity || null,
      externalActivity: activity || null,
    };

    latestUserRef.current = nextUser;
    setUser?.(nextUser);
    void storeSession(nextUser, {
      accessToken: getStoredToken(),
      refreshToken: getStoredRefreshToken(),
      accessTokenExpiresAt: getStoredAccessTokenExpiresAt(),
    });
  }, [setUser]);

  const replaceIntegrationProvider = useCallback((nextProvider) => {
    setIntegrations((previous) =>
      previous.map((provider) => (provider.id === nextProvider.id ? nextProvider : provider))
    );
  }, []);

  const refreshIntegrations = useCallback(async () => {
    if (!user?.id) {
      setIntegrations([]);
      setIntegrationsStatus("");
      return;
    }

    setIntegrationsLoading(true);
    setIntegrationsStatus("");

    try {
      const data = await fetchIntegrations();
      setIntegrations(data.providers);
      applyCurrentUserActivity(data.activity);
    } catch (error) {
      setIntegrationsStatus(error?.message || "Не удалось загрузить интеграции.");
    } finally {
      setIntegrationsLoading(false);
    }
  }, [applyCurrentUserActivity, user?.id]);

  useEffect(() => {
    if (!openSettings || settingsTab !== "integrations") {
      return;
    }

    refreshIntegrations().catch((error) => {
      console.error("Ошибка загрузки интеграций:", error);
    });
  }, [openSettings, refreshIntegrations, settingsTab]);

  useEffect(() => {
    if (!user?.id) {
      return;
    }

    refreshIntegrations().catch((error) => {
      console.error("Ошибка загрузки интеграций:", error);
    });
  }, [refreshIntegrations, user?.id]);

  const startIntegrationOAuthPolling = useCallback(() => {
    if (integrationOAuthPollRef.current) {
      window.clearInterval(integrationOAuthPollRef.current);
      integrationOAuthPollRef.current = null;
    }

    let attempt = 0;
    integrationOAuthPollRef.current = window.setInterval(() => {
      attempt += 1;
      refreshIntegrations().catch((error) => {
        console.error("Ошибка обновления интеграций:", error);
      });

      if (attempt >= 30 && integrationOAuthPollRef.current) {
        window.clearInterval(integrationOAuthPollRef.current);
        integrationOAuthPollRef.current = null;
      }
    }, 2000);
  }, [refreshIntegrations]);

  useEffect(() => () => {
    if (integrationOAuthPollRef.current) {
      window.clearInterval(integrationOAuthPollRef.current);
      integrationOAuthPollRef.current = null;
    }
  }, []);

  const handleConnectIntegration = useCallback(async (providerId) => {
    setIntegrationActionBusy(providerId);
    setIntegrationsStatus("");

    try {
      const integrationMeta = integrations.find((provider) => provider.id === providerId);
      if (integrationMeta?.oauthEnabled) {
        const result = await connectIntegration(providerId);
        if (result && typeof result === "object" && result.provider) {
          replaceIntegrationProvider(result.provider);
          setIntegrationsStatus(result.localDev ? "Локальная dev-интеграция подключена без OAuth." : "Интеграция подключена.");
          await refreshIntegrations();
          return;
        }

        const url = String(result || "");
        if (!url) {
          throw new Error("Сервис не вернул ссылку авторизации.");
        }

        const popup = window.open(url, `tend_${providerId}_oauth`, "width=560,height=760");
        if (!popup) {
          window.location.href = url;
          return;
        }

        startIntegrationOAuthPolling();
        setIntegrationsStatus("Подтвердите доступ в открывшемся окне, затем вернитесь сюда.");
        return;
      }

      const result = await connectIntegration(providerId);
      if (result && typeof result === "object" && result.provider) {
        replaceIntegrationProvider(result.provider);
      }
      await refreshIntegrations();
    } catch (error) {
      setIntegrationsStatus(error?.message || "Не удалось подключить интеграцию.");
    } finally {
      setIntegrationActionBusy("");
    }
  }, [integrations, refreshIntegrations, replaceIntegrationProvider, startIntegrationOAuthPolling]);

  const handleDisconnectIntegration = useCallback(async (providerId) => {
    setIntegrationActionBusy(providerId);
    setIntegrationsStatus("");

    try {
      await disconnectIntegration(providerId);
      setIntegrations((previous) =>
        previous.map((provider) =>
          provider.id === providerId
            ? { ...provider, connected: false, activity: null }
            : provider
        )
      );
      await refreshIntegrations();
    } catch (error) {
      setIntegrationsStatus(error?.message || "Не удалось отключить интеграцию.");
    } finally {
      setIntegrationActionBusy("");
    }
  }, [refreshIntegrations]);

  const handleToggleIntegrationSetting = useCallback(async (providerId, field, value) => {
    setIntegrationActionBusy(providerId);
    setIntegrationsStatus("");

    try {
      const nextProvider = await updateIntegrationSettings(providerId, { [field]: value });
      replaceIntegrationProvider(nextProvider);
      await refreshIntegrations();
    } catch (error) {
      setIntegrationsStatus(error?.message || "Не удалось сохранить настройки интеграции.");
    } finally {
      setIntegrationActionBusy("");
    }
  }, [refreshIntegrations, replaceIntegrationProvider]);

  const integrationStatusPollingEnabled = integrations.some((provider) =>
    provider.connected && ["spotify", "steam"].includes(provider.id)
  );

  useEffect(() => {
    if (!integrationStatusPollingEnabled) {
      return undefined;
    }

    let isCanceled = false;
    let isRefreshing = false;

    const refreshCurrentTrack = async () => {
      if (isRefreshing) {
        return;
      }

      isRefreshing = true;
      try {
        const data = await refreshIntegrationActivity();
        if (isCanceled) {
          return;
        }

        if (Array.isArray(data.providers)) {
          setIntegrations(data.providers);
        }
        applyCurrentUserActivity(data.activity);
      } catch (error) {
        if (!isCanceled) {
          console.error("Ошибка обновления статуса Spotify:", error);
        }
      } finally {
        isRefreshing = false;
      }
    };

    const refreshOnVisibleFocus = () => {
      if (document.visibilityState !== "hidden") {
        refreshCurrentTrack();
      }
    };

    refreshCurrentTrack();
    const intervalId = window.setInterval(refreshCurrentTrack, 10000);
    window.addEventListener("focus", refreshOnVisibleFocus);
    document.addEventListener("visibilitychange", refreshOnVisibleFocus);

    return () => {
      isCanceled = true;
      window.clearInterval(intervalId);
      window.removeEventListener("focus", refreshOnVisibleFocus);
      document.removeEventListener("visibilitychange", refreshOnVisibleFocus);
    };
  }, [applyCurrentUserActivity, integrationStatusPollingEnabled]);

  useEffect(() => {
    if (!user) {
      return undefined;
    }

    const handleUserActivityUpdated = (payload) => {
      const updatedUserId = String(payload?.userId || "");
      if (!updatedUserId) {
        return;
      }

      const nextActivity = payload?.activity || null;

      updateFriendProfile(updatedUserId, (friend) => ({
        ...friend,
        activity: nextActivity,
        externalActivity: nextActivity,
      }));

      if (updatedUserId === currentUserId) {
        applyCurrentUserActivity(nextActivity);
      }
    };

    chatConnection.on("UserActivityUpdated", handleUserActivityUpdated);

    return () => {
      chatConnection.off("UserActivityUpdated", handleUserActivityUpdated);
    };
  }, [applyCurrentUserActivity, currentUserId, updateFriendProfile, user]);

  return {
    deviceSessions,
    deviceSessionsLoading,
    deviceSessionsError,
    refreshDeviceSessions,
    integrations,
    integrationsLoading,
    integrationsStatus,
    integrationActionBusy,
    handleConnectIntegration,
    handleDisconnectIntegration,
    handleToggleIntegrationSetting,
  };
}
