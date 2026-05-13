import { API_BASE_URL } from "../../config/runtime";
import { authFetch, getApiErrorMessage, parseApiResponse } from "../../utils/auth";

async function requestModeration(path, { method = "GET", body = null } = {}) {
  const response = await authFetch(`${API_BASE_URL}${path}`, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await parseApiResponse(response);
  if (!response.ok) {
    throw new Error(getApiErrorMessage(response, data, "Не удалось выполнить действие модерации."));
  }

  return data;
}

export function createModerationReport({
  serverId,
  channelId,
  messageId,
  targetUserId,
  reason,
}) {
  return requestModeration("/moderation/reports", {
    method: "POST",
    body: {
      serverId,
      channelId,
      messageId,
      targetUserId,
      reason,
    },
  });
}

export function fetchModerationReports(serverId, { status = "open", limit = 50 } = {}) {
  const params = new URLSearchParams({
    status,
    limit: String(limit),
  });
  return requestModeration(`/moderation/servers/${encodeURIComponent(serverId)}/reports?${params.toString()}`);
}

export function updateModerationReportStatus(reportId, status) {
  return requestModeration(`/moderation/reports/${encodeURIComponent(reportId)}/status`, {
    method: "PATCH",
    body: { status },
  });
}

export function applyModerationAction(serverId, {
  targetUserId,
  actionType,
  reason,
  durationMinutes,
}) {
  return requestModeration(`/moderation/servers/${encodeURIComponent(serverId)}/actions`, {
    method: "POST",
    body: {
      targetUserId,
      actionType,
      reason,
      durationMinutes,
    },
  });
}

export function revokeModerationAction(actionId) {
  return requestModeration(`/moderation/actions/${encodeURIComponent(actionId)}`, {
    method: "DELETE",
  });
}
