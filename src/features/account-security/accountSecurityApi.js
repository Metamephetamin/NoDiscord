import { API_BASE_URL } from "../../config/runtime";
import {
  authFetch,
  getApiErrorMessage,
  getStoredRefreshToken,
  parseApiResponse,
} from "../../utils/auth";
import { DEVICE_SESSION_REFRESH_TOKEN_HEADER } from "../menu-main/menuMainControllerUtils";

function buildRefreshTokenHeaders() {
  const refreshToken = getStoredRefreshToken();
  return refreshToken ? { [DEVICE_SESSION_REFRESH_TOKEN_HEADER]: refreshToken } : undefined;
}

export async function fetchAccountSessions() {
  const response = await authFetch(`${API_BASE_URL}/auth/sessions`, {
    method: "GET",
    headers: buildRefreshTokenHeaders(),
  });
  const data = await parseApiResponse(response);

  if (!response.ok) {
    throw new Error(getApiErrorMessage(response, data, "Не удалось загрузить список устройств."));
  }

  return Array.isArray(data?.sessions) ? data.sessions : [];
}

export async function revokeAccountSession(sessionId) {
  const response = await authFetch(`${API_BASE_URL}/auth/sessions/${encodeURIComponent(String(sessionId))}`, {
    method: "DELETE",
  });
  const data = await parseApiResponse(response);

  if (!response.ok) {
    throw new Error(getApiErrorMessage(response, data, "Не удалось завершить сессию."));
  }

  return data;
}

export async function revokeOtherAccountSessions() {
  const response = await authFetch(`${API_BASE_URL}/auth/sessions/revoke-others`, {
    method: "POST",
    headers: buildRefreshTokenHeaders(),
  });
  const data = await parseApiResponse(response);

  if (!response.ok) {
    throw new Error(getApiErrorMessage(response, data, "Не удалось завершить другие сессии."));
  }

  return data;
}
