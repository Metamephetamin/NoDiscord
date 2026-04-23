import { API_BASE_URL } from "../config/runtime";
import { API_URL } from "../config/runtime";
import { parseMediaFrame } from "./mediaFrames";

const TOKEN_STORAGE_KEY = "token";
const USER_STORAGE_KEY = "user";
const REFRESH_TOKEN_STORAGE_KEY = "refresh_token";
const ACCESS_TOKEN_EXPIRES_AT_STORAGE_KEY = "access_token_expires_at";
const SESSION_API_URL_STORAGE_KEY = "session_api_url";

export const AUTH_UNAUTHORIZED_EVENT = "nodiscord:auth-unauthorized";

const sessionCache = {
  user: null,
  accessToken: "",
  refreshToken: "",
  accessTokenExpiresAt: "",
  updatedAt: "",
  hydrated: false,
};

let refreshPromise = null;

function normalizeApiScope(value) {
  const normalizedValue = normalizeStoredValue(value);
  if (!normalizedValue) {
    return "";
  }

  try {
    const parsed = new URL(normalizedValue);
    return parsed.origin.toLowerCase();
  } catch {
    return normalizedValue.replace(/\/+$/, "").toLowerCase();
  }
}

function isLocalApiScope(value) {
  return /^https?:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?$/i.test(normalizeApiScope(value));
}

const CURRENT_API_SCOPE = normalizeApiScope(API_URL);

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

function getWebSessionStorage() {
  try {
    return window?.sessionStorage || null;
  } catch {
    return null;
  }
}

function readSessionFromStorage(storage) {
  if (!storage) {
    return {
      user: null,
      accessToken: "",
      refreshToken: "",
      accessTokenExpiresAt: "",
      updatedAt: "",
      apiUrl: "",
    };
  }

  try {
    const rawUser = storage.getItem(USER_STORAGE_KEY);
    return {
      user: rawUser ? JSON.parse(rawUser) : null,
      accessToken: normalizeStoredValue(storage.getItem(TOKEN_STORAGE_KEY)),
      refreshToken: normalizeStoredValue(storage.getItem(REFRESH_TOKEN_STORAGE_KEY)),
      accessTokenExpiresAt: normalizeStoredValue(storage.getItem(ACCESS_TOKEN_EXPIRES_AT_STORAGE_KEY)),
      updatedAt: normalizeSessionUpdatedAt(storage.getItem(`${USER_STORAGE_KEY}_updated_at`)),
      apiUrl: normalizeApiScope(storage.getItem(SESSION_API_URL_STORAGE_KEY)),
    };
  } catch {
    return {
      user: null,
      accessToken: "",
      refreshToken: "",
      accessTokenExpiresAt: "",
      updatedAt: "",
      apiUrl: "",
    };
  }
}

function writeSessionToStorage(storage, { user, accessToken, refreshToken, accessTokenExpiresAt, updatedAt, apiUrl }) {
  if (!storage) {
    return;
  }

  try {
    if (user) {
      storage.setItem(USER_STORAGE_KEY, JSON.stringify(user));
    } else {
      storage.removeItem(USER_STORAGE_KEY);
    }

    if (accessToken) {
      storage.setItem(TOKEN_STORAGE_KEY, accessToken);
    } else {
      storage.removeItem(TOKEN_STORAGE_KEY);
    }

    if (refreshToken) {
      storage.setItem(REFRESH_TOKEN_STORAGE_KEY, refreshToken);
    } else {
      storage.removeItem(REFRESH_TOKEN_STORAGE_KEY);
    }

    if (accessTokenExpiresAt) {
      storage.setItem(ACCESS_TOKEN_EXPIRES_AT_STORAGE_KEY, accessTokenExpiresAt);
    } else {
      storage.removeItem(ACCESS_TOKEN_EXPIRES_AT_STORAGE_KEY);
    }

    if (updatedAt) {
      storage.setItem(`${USER_STORAGE_KEY}_updated_at`, updatedAt);
    } else {
      storage.removeItem(`${USER_STORAGE_KEY}_updated_at`);
    }

    if (apiUrl) {
      storage.setItem(SESSION_API_URL_STORAGE_KEY, apiUrl);
    } else {
      storage.removeItem(SESSION_API_URL_STORAGE_KEY);
    }
  } catch {
    // ignore storage failures
  }
}

function readTransientSession() {
  return readSessionFromStorage(getWebSessionStorage());
}

function writeTransientSession(payload) {
  writeSessionToStorage(getWebSessionStorage(), payload);
}

function readLegacySession() {
  try {
    return readSessionFromStorage(window?.localStorage || null);
  } catch {
    return {
      user: null,
      accessToken: "",
      refreshToken: "",
      accessTokenExpiresAt: "",
      apiUrl: "",
      updatedAt: "",
    };
  }
}

function clearStorageSession(storage) {
  if (!storage) {
    return;
  }

  try {
    storage.removeItem(USER_STORAGE_KEY);
    storage.removeItem(TOKEN_STORAGE_KEY);
    storage.removeItem(REFRESH_TOKEN_STORAGE_KEY);
    storage.removeItem(ACCESS_TOKEN_EXPIRES_AT_STORAGE_KEY);
    storage.removeItem(`${USER_STORAGE_KEY}_updated_at`);
    storage.removeItem(SESSION_API_URL_STORAGE_KEY);
  } catch {
    // ignore storage failures
  }
}

function clearTransientSession() {
  clearStorageSession(getWebSessionStorage());
}

function clearLegacySession() {
  try {
    clearStorageSession(window?.localStorage || null);
  } catch {
    // ignore storage failures
  }
}

function normalizeSessionUpdatedAt(value) {
  const normalized = normalizeStoredValue(value);
  if (!normalized) {
    return "";
  }

  const parsedTime = Date.parse(normalized);
  return Number.isFinite(parsedTime) ? new Date(parsedTime).toISOString() : "";
}

function getSessionUpdatedAtMs(value) {
  const parsedTime = Date.parse(normalizeStoredValue(value));
  return Number.isFinite(parsedTime) ? parsedTime : 0;
}

function applySessionCache({ user = null, accessToken = "", refreshToken = "", accessTokenExpiresAt = "", updatedAt = "" } = {}) {
  sessionCache.user = user ?? null;
  sessionCache.accessToken = normalizeStoredValue(accessToken);
  sessionCache.refreshToken = normalizeStoredValue(refreshToken);
  sessionCache.accessTokenExpiresAt = normalizeStoredValue(accessTokenExpiresAt);
  sessionCache.updatedAt = normalizeSessionUpdatedAt(updatedAt);
  sessionCache.hydrated = true;
}

function buildSessionPayload(user, tokenOrSession, refreshToken = "", accessTokenExpiresAt = "") {
  if (tokenOrSession && typeof tokenOrSession === "object" && !Array.isArray(tokenOrSession)) {
    return {
      user: user ?? null,
      accessToken: normalizeStoredValue(tokenOrSession.accessToken || tokenOrSession.token),
      refreshToken: normalizeStoredValue(tokenOrSession.refreshToken),
      accessTokenExpiresAt: normalizeStoredValue(tokenOrSession.accessTokenExpiresAt),
      updatedAt: normalizeSessionUpdatedAt(tokenOrSession.updatedAt) || new Date().toISOString(),
      apiUrl: normalizeApiScope(tokenOrSession.apiUrl) || CURRENT_API_SCOPE,
    };
  }

  return {
    user: user ?? null,
    accessToken: normalizeStoredValue(tokenOrSession),
    refreshToken: normalizeStoredValue(refreshToken),
    accessTokenExpiresAt: normalizeStoredValue(accessTokenExpiresAt),
    updatedAt: new Date().toISOString(),
    apiUrl: CURRENT_API_SCOPE,
  };
}

function shouldDiscardSessionForApiScope(session) {
  const sessionApiScope = normalizeApiScope(session?.apiUrl);
  if (!CURRENT_API_SCOPE) {
    return false;
  }

  if (isLocalApiScope(CURRENT_API_SCOPE)) {
    return sessionApiScope !== CURRENT_API_SCOPE;
  }

  return Boolean(sessionApiScope) && sessionApiScope !== CURRENT_API_SCOPE;
}

export async function hydrateStoredSession() {
  if (sessionCache.hydrated) {
    return {
      user: sessionCache.user,
      accessToken: sessionCache.accessToken,
      refreshToken: sessionCache.refreshToken,
      accessTokenExpiresAt: sessionCache.accessTokenExpiresAt,
      updatedAt: sessionCache.updatedAt,
      apiUrl: CURRENT_API_SCOPE,
    };
  }

  const transientSession = readTransientSession();
  const legacySession = readLegacySession();
  const baseSession = transientSession.accessToken || transientSession.user ? transientSession : legacySession;

  if (!isElectronSecureSessionAvailable()) {
    const resolvedSession =
      legacySession.accessToken || legacySession.user
        ? {
            ...baseSession,
            updatedAt: normalizeSessionUpdatedAt(baseSession.updatedAt) || new Date().toISOString(),
          }
        : baseSession;

    if (shouldDiscardSessionForApiScope(resolvedSession)) {
      clearTransientSession();
      clearLegacySession();
      applySessionCache();
      return {
        user: null,
        accessToken: "",
        refreshToken: "",
        accessTokenExpiresAt: "",
        updatedAt: "",
        apiUrl: CURRENT_API_SCOPE,
      };
    }

    applySessionCache(resolvedSession);
    if (legacySession.accessToken || legacySession.user) {
      writeTransientSession(resolvedSession);
      clearLegacySession();
    }
    return resolvedSession;
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
            updatedAt: normalizeSessionUpdatedAt(secureSession.updatedAt),
            apiUrl: normalizeApiScope(secureSession.apiUrl),
          }
        : baseSession;

    const legacyUpdatedAtMs = getSessionUpdatedAtMs(baseSession.updatedAt);
    const secureUpdatedAtMs = getSessionUpdatedAtMs(normalizedSession.updatedAt);
    const hasLegacySession = Boolean(baseSession.accessToken || baseSession.user);
    const hasSecureSession = Boolean(normalizedSession.accessToken || normalizedSession.user);
    const shouldPreferLegacy =
      hasLegacySession
      && (!hasSecureSession || legacyUpdatedAtMs > secureUpdatedAtMs);
    const resolvedSession = shouldPreferLegacy ? {
      ...baseSession,
      updatedAt: normalizeSessionUpdatedAt(baseSession.updatedAt) || new Date(legacyUpdatedAtMs || Date.now()).toISOString(),
    } : normalizedSession;

    if (shouldDiscardSessionForApiScope(resolvedSession)) {
      await clearStoredSession();
      return {
        user: null,
        accessToken: "",
        refreshToken: "",
        accessTokenExpiresAt: "",
        updatedAt: "",
        apiUrl: CURRENT_API_SCOPE,
      };
    }

    applySessionCache(resolvedSession);

    if (shouldPreferLegacy || ((baseSession.accessToken || baseSession.user) && !normalizedSession.accessToken)) {
      await window.electronSecureSession.set(resolvedSession);
      applySessionCache(resolvedSession);
    }

    clearTransientSession();
    clearLegacySession();
    return {
      user: sessionCache.user,
      accessToken: sessionCache.accessToken,
      refreshToken: sessionCache.refreshToken,
      accessTokenExpiresAt: sessionCache.accessTokenExpiresAt,
      updatedAt: sessionCache.updatedAt,
      apiUrl: CURRENT_API_SCOPE,
    };
  } catch {
    if (shouldDiscardSessionForApiScope(baseSession)) {
      await clearStoredSession();
      return {
        user: null,
        accessToken: "",
        refreshToken: "",
        accessTokenExpiresAt: "",
        updatedAt: "",
        apiUrl: CURRENT_API_SCOPE,
      };
    }

    applySessionCache(baseSession);
    if (legacySession.accessToken || legacySession.user) {
      writeTransientSession(baseSession);
      clearLegacySession();
    }
    return baseSession;
  }
}

export function getStoredToken() {
  if (sessionCache.hydrated) {
    return sessionCache.accessToken;
  }

  return readTransientSession().accessToken;
}

export function hasStoredToken() {
  return Boolean(getStoredToken());
}

export function getStoredUser() {
  if (sessionCache.hydrated) {
    return sessionCache.user;
  }

  return readTransientSession().user;
}

export function getStoredRefreshToken() {
  if (sessionCache.hydrated) {
    return sessionCache.refreshToken;
  }

  return readTransientSession().refreshToken;
}

export function getStoredAccessTokenExpiresAt() {
  if (sessionCache.hydrated) {
    return sessionCache.accessTokenExpiresAt;
  }

  return readTransientSession().accessTokenExpiresAt;
}

export async function storeSession(user, tokenOrSession, refreshToken = "", accessTokenExpiresAt = "") {
  const nextSession = buildSessionPayload(user, tokenOrSession, refreshToken, accessTokenExpiresAt);
  applySessionCache(nextSession);

  if (!isElectronSecureSessionAvailable()) {
    writeTransientSession(nextSession);
    clearLegacySession();
    return;
  }

  try {
    await window.electronSecureSession.set(nextSession);
    clearTransientSession();
    clearLegacySession();
  } catch {
    writeTransientSession(nextSession);
    clearLegacySession();
  }
}

export async function clearStoredSession() {
  applySessionCache();
  clearTransientSession();
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

function isLikelyHtmlPayload(value) {
  if (typeof value !== "string") {
    return false;
  }

  const normalized = value.trim().toLowerCase();
  if (!normalized) {
    return false;
  }

  return normalized.startsWith("<!doctype html") || normalized.startsWith("<html");
}

export function getApiErrorMessage(response, data, fallbackMessage) {
  const backendMessage =
    data &&
    typeof data === "object" &&
    typeof data.message === "string" &&
    data.message.trim() &&
    !isLikelyHtmlPayload(data.message)
      ? data.message.trim()
      : "";

  if (response?.status === 401) {
    return "Сессия истекла. Войдите снова.";
  }

  if (response?.status === 429) {
    if (backendMessage) {
      return backendMessage;
    }
    return "Слишком много попыток. Подождите немного и попробуйте снова.";
  }

  if ([500, 502, 503, 504].includes(response?.status)) {
    if (backendMessage) {
      return backendMessage;
    }
    return "Сервис временно недоступен. Попробуйте позже.";
  }

  if (data && typeof data === "object") {
    if (backendMessage) {
      return backendMessage;
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

export function isNetworkRequestError(error) {
  const message = String(error?.message || error || "").toLowerCase();
  return error instanceof TypeError
    || message.includes("failed to fetch")
    || message.includes("networkerror")
    || message.includes("err_connection_reset")
    || message.includes("load failed");
}

export function getNetworkErrorMessage(error, fallbackMessage = "Не удалось выполнить запрос.") {
  const message = String(error?.message || error || "").toLowerCase();
  if (message.includes("err_connection_reset") || message.includes("connection reset")) {
    return "Соединение с сервером было сброшено. Проверьте интернет или попробуйте снова чуть позже.";
  }

  if (message.includes("failed to fetch") || message.includes("networkerror") || message.includes("load failed")) {
    return "Не удалось связаться с сервером. Проверьте интернет, VPN/прокси и доступность Tend.";
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
            nickname: data.nickname || sessionCache.user?.nickname || "",
            email: data.email || sessionCache.user?.email || "",
            isEmailVerified: Boolean(data.is_email_verified ?? sessionCache.user?.isEmailVerified ?? true),
            phoneNumber: data.phone_number || sessionCache.user?.phoneNumber || "",
            isPhoneVerified: Boolean(
              data.is_phone_verified ?? sessionCache.user?.isPhoneVerified ?? sessionCache.user?.phone_verified ?? false
            ),
            avatarUrl: data.avatar_url || sessionCache.user?.avatarUrl || sessionCache.user?.avatar || "",
            avatar: data.avatar_url || sessionCache.user?.avatar || sessionCache.user?.avatarUrl || "",
            avatarFrame: parseMediaFrame(
              data.avatar_frame,
              data.avatarFrame,
              sessionCache.user?.avatarFrame,
              sessionCache.user?.avatar_frame
            ),
            avatar_frame: parseMediaFrame(
              data.avatar_frame,
              data.avatarFrame,
              sessionCache.user?.avatarFrame,
              sessionCache.user?.avatar_frame
            ),
            profileBackgroundUrl:
              data.profile_background_url
              || sessionCache.user?.profileBackgroundUrl
              || sessionCache.user?.profile_background_url
              || sessionCache.user?.profileBackground
              || "",
            profileBackground:
              data.profile_background_url
              || sessionCache.user?.profileBackground
              || sessionCache.user?.profileBackgroundUrl
              || sessionCache.user?.profile_background_url
              || "",
            profileBackgroundFrame: parseMediaFrame(
              data.profile_background_frame,
              data.profileBackgroundFrame,
              sessionCache.user?.profileBackgroundFrame,
              sessionCache.user?.profile_background_frame
            ),
            profile_background_frame: parseMediaFrame(
              data.profile_background_frame,
              data.profileBackgroundFrame,
              sessionCache.user?.profileBackgroundFrame,
              sessionCache.user?.profile_background_frame
            ),
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
  let response;

  try {
    response = await fetch(input, {
      ...requestInit,
      headers: buildAuthHeaders(requestInit.headers),
    });
  } catch (error) {
    const wrappedError = new Error(getNetworkErrorMessage(error, "Не удалось выполнить авторизованный запрос."));
    wrappedError.cause = error;
    throw wrappedError;
  }

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

  try {
    response = await fetch(input, {
      ...requestInit,
      headers: buildAuthHeaders(requestInit.headers),
    });
  } catch (error) {
    const wrappedError = new Error(getNetworkErrorMessage(error, "Не удалось выполнить авторизованный запрос."));
    wrappedError.cause = error;
    throw wrappedError;
  }

  if (response.status === 401) {
    notifyUnauthorizedSession("http_401");
  }

  return response;
}


