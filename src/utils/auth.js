import { API_BASE_URL } from "../config/runtime";

const TOKEN_STORAGE_KEY = "token";
const USER_STORAGE_KEY = "user";
const REFRESH_TOKEN_STORAGE_KEY = "refresh_token";
const ACCESS_TOKEN_EXPIRES_AT_STORAGE_KEY = "access_token_expires_at";

export const AUTH_UNAUTHORIZED_EVENT = "nodiscord:auth-unauthorized";

const sessionCache = {
  user: null,
  accessToken: "",
  refreshToken: "",
  accessTokenExpiresAt: "",
  hydrated: false,
};

let refreshPromise = null;

function normalizeStoredValue(value) {
  if (typeof value !== "string") {
    return "";
  }

  const trimmed = value.trim();
  if (!trimmed || trimmed === "null" || trimmed === "undefined") {
    return "";
  }

  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    try {
      const parsed = JSON.parse(trimmed);
      return typeof parsed === "string" ? parsed.trim() : trimmed.slice(1, -1).trim();
    } catch {
      return trimmed.slice(1, -1).trim();
    }
  }

  return trimmed;
}

function isElectronSecureSessionAvailable() {
  return Boolean(window?.electronSecureSession?.get);
}

function readLegacySession() {
  try {
    const rawUser = localStorage.getItem(USER_STORAGE_KEY);
    return {
      user: rawUser ? JSON.parse(rawUser) : null,
      accessToken: normalizeStoredValue(localStorage.getItem(TOKEN_STORAGE_KEY)),
      refreshToken: normalizeStoredValue(localStorage.getItem(REFRESH_TOKEN_STORAGE_KEY)),
      accessTokenExpiresAt: normalizeStoredValue(localStorage.getItem(ACCESS_TOKEN_EXPIRES_AT_STORAGE_KEY)),
    };
  } catch {
    return {
      user: null,
      accessToken: "",
      refreshToken: "",
      accessTokenExpiresAt: "",
    };
  }
}

function writeLegacySession({ user, accessToken, refreshToken, accessTokenExpiresAt }) {
  try {
    if (user) {
      localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(user));
    } else {
      localStorage.removeItem(USER_STORAGE_KEY);
    }

    if (accessToken) {
      localStorage.setItem(TOKEN_STORAGE_KEY, accessToken);
    } else {
      localStorage.removeItem(TOKEN_STORAGE_KEY);
    }

    if (refreshToken) {
      localStorage.setItem(REFRESH_TOKEN_STORAGE_KEY, refreshToken);
    } else {
      localStorage.removeItem(REFRESH_TOKEN_STORAGE_KEY);
    }

    if (accessTokenExpiresAt) {
      localStorage.setItem(ACCESS_TOKEN_EXPIRES_AT_STORAGE_KEY, accessTokenExpiresAt);
    } else {
      localStorage.removeItem(ACCESS_TOKEN_EXPIRES_AT_STORAGE_KEY);
    }
  } catch {
    // ignore storage failures
  }
}

function clearLegacySession() {
  try {
    localStorage.removeItem(USER_STORAGE_KEY);
    localStorage.removeItem(TOKEN_STORAGE_KEY);
    localStorage.removeItem(REFRESH_TOKEN_STORAGE_KEY);
    localStorage.removeItem(ACCESS_TOKEN_EXPIRES_AT_STORAGE_KEY);
  } catch {
    // ignore storage failures
  }
}

function applySessionCache({ user = null, accessToken = "", refreshToken = "", accessTokenExpiresAt = "" } = {}) {
  sessionCache.user = user ?? null;
  sessionCache.accessToken = normalizeStoredValue(accessToken);
  sessionCache.refreshToken = normalizeStoredValue(refreshToken);
  sessionCache.accessTokenExpiresAt = normalizeStoredValue(accessTokenExpiresAt);
  sessionCache.hydrated = true;
}

function buildSessionPayload(user, tokenOrSession, refreshToken = "", accessTokenExpiresAt = "") {
  if (tokenOrSession && typeof tokenOrSession === "object" && !Array.isArray(tokenOrSession)) {
    return {
      user: user ?? null,
      accessToken: normalizeStoredValue(tokenOrSession.accessToken || tokenOrSession.token),
      refreshToken: normalizeStoredValue(tokenOrSession.refreshToken),
      accessTokenExpiresAt: normalizeStoredValue(tokenOrSession.accessTokenExpiresAt),
    };
  }

  return {
    user: user ?? null,
    accessToken: normalizeStoredValue(tokenOrSession),
    refreshToken: normalizeStoredValue(refreshToken),
    accessTokenExpiresAt: normalizeStoredValue(accessTokenExpiresAt),
  };
}

export async function hydrateStoredSession() {
  if (sessionCache.hydrated) {
    return {
      user: sessionCache.user,
      accessToken: sessionCache.accessToken,
      refreshToken: sessionCache.refreshToken,
      accessTokenExpiresAt: sessionCache.accessTokenExpiresAt,
    };
  }

  const legacySession = readLegacySession();

  if (!isElectronSecureSessionAvailable()) {
    applySessionCache(legacySession);
    return legacySession;
  }

  try {
    const secureSession = await window.electronSecureSession.get();
    const normalizedSession =
      secureSession && typeof secureSession === "object"
        ? {
            user: secureSession.user ?? null,
            accessToken: normalizeStoredValue(secureSession.accessToken || secureSession.token),
            refreshToken: normalizeStoredValue(secureSession.refreshToken),
            accessTokenExpiresAt: normalizeStoredValue(secureSession.accessTokenExpiresAt),
          }
        : legacySession;

    applySessionCache(normalizedSession);

    if ((legacySession.accessToken || legacySession.user) && !normalizedSession.accessToken) {
      await window.electronSecureSession.set(legacySession);
      applySessionCache(legacySession);
    }

    clearLegacySession();
    return {
      user: sessionCache.user,
      accessToken: sessionCache.accessToken,
      refreshToken: sessionCache.refreshToken,
      accessTokenExpiresAt: sessionCache.accessTokenExpiresAt,
    };
  } catch {
    applySessionCache(legacySession);
    return legacySession;
  }
}

export function getStoredToken() {
  if (sessionCache.hydrated) {
    return sessionCache.accessToken;
  }

  return readLegacySession().accessToken;
}

export function hasStoredToken() {
  return Boolean(getStoredToken());
}

export function getStoredUser() {
  if (sessionCache.hydrated) {
    return sessionCache.user;
  }

  return readLegacySession().user;
}

export function getStoredRefreshToken() {
  if (sessionCache.hydrated) {
    return sessionCache.refreshToken;
  }

  return readLegacySession().refreshToken;
}

export function getStoredAccessTokenExpiresAt() {
  if (sessionCache.hydrated) {
    return sessionCache.accessTokenExpiresAt;
  }

  return readLegacySession().accessTokenExpiresAt;
}

export async function storeSession(user, tokenOrSession, refreshToken = "", accessTokenExpiresAt = "") {
  const nextSession = buildSessionPayload(user, tokenOrSession, refreshToken, accessTokenExpiresAt);
  applySessionCache(nextSession);
  writeLegacySession(nextSession);

  if (!isElectronSecureSessionAvailable()) {
    return;
  }

  try {
    await window.electronSecureSession.set(nextSession);
    clearLegacySession();
  } catch {
    // keep local fallback if secure storage write fails
  }
}

export async function clearStoredSession() {
  applySessionCache();
  clearLegacySession();

  if (!isElectronSecureSessionAvailable()) {
    return;
  }

  try {
    await window.electronSecureSession.clear();
  } catch {
    // ignore storage cleanup failures
  }
}

export function notifyUnauthorizedSession(reason = "unauthorized") {
  void clearStoredSession();

  if (typeof window === "undefined") {
    return;
  }

  window.dispatchEvent(
    new CustomEvent(AUTH_UNAUTHORIZED_EVENT, {
      detail: { reason },
    })
  );
}

export function buildAuthHeaders(headers = undefined) {
  const nextHeaders = new Headers(headers || {});
  const token = getStoredToken();

  if (token) {
    nextHeaders.set("Authorization", `Bearer ${token}`);
  }

  return nextHeaders;
}

export async function parseApiResponse(response) {
  const rawText = await response.text();
  if (!rawText) {
    return null;
  }

  try {
    return JSON.parse(rawText);
  } catch {
    return { message: rawText };
  }
}

export function getApiErrorMessage(response, data, fallbackMessage) {
  if (response?.status === 401) {
    return "Сессия истекла. Войдите снова.";
  }

  if (response?.status === 429) {
    return "Слишком много попыток. Подождите немного и попробуйте снова.";
  }

  if (data && typeof data === "object") {
    if (typeof data.message === "string" && data.message.trim()) {
      return data.message.trim();
    }

    if (data.errors && typeof data.errors === "object") {
      const firstErrorGroup = Object.values(data.errors).find((value) => Array.isArray(value) && value.length > 0);
      if (firstErrorGroup) {
        return firstErrorGroup.join(" ");
      }
    }

    if (typeof data.title === "string" && data.title.trim()) {
      return data.title.trim();
    }
  }

  return fallbackMessage;
}

export function isUnauthorizedError(error) {
  const message = String(error?.message || error || "").toLowerCase();
  return message.includes("401") || message.includes("unauthorized");
}

export async function refreshAccessToken() {
  if (refreshPromise) {
    return refreshPromise;
  }

  const refreshToken = getStoredRefreshToken();
  if (!refreshToken) {
    return false;
  }

  refreshPromise = (async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/auth/refresh`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refreshToken }),
      });
      const data = await parseApiResponse(response);

      if (!response.ok || !data?.token) {
        await clearStoredSession();
        return false;
      }

      const nextUser = data?.id
        ? {
            id: data.id,
            firstName: data.first_name || sessionCache.user?.firstName || "",
            lastName: data.last_name || sessionCache.user?.lastName || "",
            email: data.email || sessionCache.user?.email || "",
          }
        : sessionCache.user;

      await storeSession(nextUser, {
        accessToken: data.token,
        refreshToken: data.refreshToken || refreshToken,
        accessTokenExpiresAt: data.accessTokenExpiresAt || "",
      });

      return true;
    } catch {
      await clearStoredSession();
      return false;
    } finally {
      refreshPromise = null;
    }
  })();

  return refreshPromise;
}

export async function authFetch(input, init = {}) {
  const { _retryAfterRefresh = true, ...requestInit } = init;
  let response = await fetch(input, {
    ...requestInit,
    headers: buildAuthHeaders(requestInit.headers),
  });

  if (response.status !== 401) {
    return response;
  }

  const requestUrl = String(typeof input === "string" ? input : input?.url || "");
  const isAuthRequest =
    requestUrl.includes("/auth/login") ||
    requestUrl.includes("/auth/register") ||
    requestUrl.includes("/auth/refresh");

  if (!_retryAfterRefresh || isAuthRequest) {
    notifyUnauthorizedSession("http_401");
    return response;
  }

  const didRefresh = await refreshAccessToken();
  if (!didRefresh) {
    notifyUnauthorizedSession("http_401");
    return response;
  }

  response = await fetch(input, {
    ...requestInit,
    headers: buildAuthHeaders(requestInit.headers),
  });

  if (response.status === 401) {
    notifyUnauthorizedSession("http_401");
  }

  return response;
}
