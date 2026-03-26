const TOKEN_STORAGE_KEY = "token";
const USER_STORAGE_KEY = "user";

export const AUTH_UNAUTHORIZED_EVENT = "nodiscord:auth-unauthorized";

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

export function getStoredToken() {
  try {
    return normalizeStoredValue(localStorage.getItem(TOKEN_STORAGE_KEY));
  } catch {
    return "";
  }
}

export function hasStoredToken() {
  return Boolean(getStoredToken());
}

export function getStoredUser() {
  try {
    const raw = localStorage.getItem(USER_STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function storeSession(user, token) {
  try {
    if (user) {
      localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(user));
    } else {
      localStorage.removeItem(USER_STORAGE_KEY);
    }

    if (token) {
      localStorage.setItem(TOKEN_STORAGE_KEY, token);
    } else {
      localStorage.removeItem(TOKEN_STORAGE_KEY);
    }
  } catch {
    // ignore storage failures
  }
}

export function clearStoredSession() {
  try {
    localStorage.removeItem(USER_STORAGE_KEY);
    localStorage.removeItem(TOKEN_STORAGE_KEY);
  } catch {
    // ignore storage failures
  }
}

export function notifyUnauthorizedSession(reason = "unauthorized") {
  clearStoredSession();

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

export async function authFetch(input, init = {}) {
  const response = await fetch(input, {
    ...init,
    headers: buildAuthHeaders(init.headers),
  });

  if (response.status === 401) {
    notifyUnauthorizedSession("http_401");
  }

  return response;
}
