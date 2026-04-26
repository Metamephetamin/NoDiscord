import { API_URL } from "../config/runtime";
import { authFetch, getApiErrorMessage, parseApiResponse } from "./auth";

export const INTEGRATION_PROVIDER_META = {
  spotify: { label: "Spotify", shortLabel: "Spotify", tone: "#1ed760", kind: "music", oauthEnabled: true },
  steam: { label: "Steam", shortLabel: "Steam", tone: "#66c0f4", kind: "game", oauthEnabled: true },
  battlenet: { label: "Battle.net", shortLabel: "B.net", tone: "#00aeff", kind: "profile", oauthEnabled: true },
  github: { label: "GitHub", shortLabel: "GitHub", tone: "#f0f6fc", kind: "profile", oauthEnabled: true },
  yandex_music: { label: "Яндекс Музыка", shortLabel: "Музыка", tone: "#ffcc00", kind: "music", oauthEnabled: false },
};

export const formatIntegrationActivityStatus = (activity) => {
  if (!activity?.title) {
    return "";
  }

  const providerId = String(activity.provider || "").trim();
  const provider = INTEGRATION_PROVIDER_META[providerId];
  const title = String(activity.title || "").trim();
  const subtitle = String(activity.subtitle || "").trim();
  const kind = String(activity.kind || provider?.kind || "").trim();

  if (kind === "music") {
    return subtitle ? `${title} — ${subtitle}` : title;
  }

  if (kind === "game") {
    return `Играет в ${title}`;
  }

  return provider?.shortLabel ? `${provider.shortLabel}: ${title}` : title;
};

export const normalizeIntegrationProvider = (provider) => {
  const id = String(provider?.id || "").trim();
  const meta = INTEGRATION_PROVIDER_META[id] || {};
  return {
    id,
    name: String(provider?.name || meta.label || id),
    activityKind: String(provider?.activityKind || meta.kind || ""),
    oauthEnabled: Boolean(provider?.oauthEnabled ?? meta.oauthEnabled),
    connected: Boolean(provider?.connected),
    requiresReconnect: Boolean(provider?.requiresReconnect),
    displayName: String(provider?.displayName || ""),
    displayInProfile: Boolean(provider?.displayInProfile ?? true),
    useAsStatus: Boolean(provider?.useAsStatus ?? (meta.kind === "music" || meta.kind === "game")),
    activity: provider?.activity || null,
    meta,
  };
};

export async function fetchIntegrations() {
  const response = await authFetch(`${API_URL}/api/integrations`);
  const data = await parseApiResponse(response);
  if (!response.ok) {
    throw new Error(getApiErrorMessage(response, data, "Не удалось загрузить интеграции."));
  }

  return {
    providers: Array.isArray(data?.providers) ? data.providers.map(normalizeIntegrationProvider) : [],
    activity: data?.activity || null,
  };
}

export async function requestIntegrationConnectUrl(providerId) {
  const response = await authFetch(`${API_URL}/api/integrations/${providerId}/connect-url`);
  const data = await parseApiResponse(response);
  if (!response.ok) {
    throw new Error(getApiErrorMessage(response, data, "Не удалось начать подключение интеграции."));
  }

  return String(data?.url || "");
}

export async function connectIntegration(providerId) {
  const provider = INTEGRATION_PROVIDER_META[providerId];
  if (provider?.oauthEnabled) {
    return requestIntegrationConnectUrl(providerId);
  }

  const response = await authFetch(`${API_URL}/api/integrations/${providerId}/connect`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });
  const data = await parseApiResponse(response);
  if (!response.ok) {
    throw new Error(getApiErrorMessage(response, data, "Для этой интеграции пока нет настоящего подключения."));
  }

  return normalizeIntegrationProvider(data);
}

export async function disconnectIntegration(providerId) {
  const response = await authFetch(`${API_URL}/api/integrations/${providerId}`, {
    method: "DELETE",
  });
  if (!response.ok) {
    const data = await parseApiResponse(response);
    throw new Error(getApiErrorMessage(response, data, "Не удалось отключить интеграцию."));
  }
}

export async function updateIntegrationSettings(providerId, settings) {
  const response = await authFetch(`${API_URL}/api/integrations/${providerId}/settings`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(settings),
  });
  const data = await parseApiResponse(response);
  if (!response.ok) {
    throw new Error(getApiErrorMessage(response, data, "Не удалось сохранить настройки интеграции."));
  }

  return normalizeIntegrationProvider(data);
}

export async function refreshSpotifyActivity() {
  const response = await authFetch(`${API_URL}/api/integrations/spotify/activity/refresh`, {
    method: "POST",
  });
  const data = await parseApiResponse(response);
  if (!response.ok) {
    throw new Error(getApiErrorMessage(response, data, "Не удалось обновить статус Spotify."));
  }

  return {
    provider: data?.provider ? normalizeIntegrationProvider(data.provider) : null,
    activity: data?.activity || null,
  };
}

export async function refreshIntegrationActivity() {
  const response = await authFetch(`${API_URL}/api/integrations/activity/refresh`, {
    method: "POST",
  });
  const data = await parseApiResponse(response);
  if (!response.ok) {
    throw new Error(getApiErrorMessage(response, data, "Не удалось обновить статусы интеграций."));
  }

  return {
    providers: Array.isArray(data?.providers) ? data.providers.map(normalizeIntegrationProvider) : [],
    activity: data?.activity || null,
  };
}
