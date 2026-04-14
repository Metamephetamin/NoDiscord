const PENDING_INVITE_ACCEPT_STORAGE_KEY = "nd:pending-invite-accept:v1";

function getInviteFlowStorage() {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    return window.sessionStorage || null;
  } catch {
    return null;
  }
}

export function readPendingInviteAcceptCode() {
  try {
    return String(getInviteFlowStorage()?.getItem(PENDING_INVITE_ACCEPT_STORAGE_KEY) || "").trim().toUpperCase();
  } catch {
    return "";
  }
}

export function writePendingInviteAcceptCode(inviteCode) {
  const normalizedInviteCode = String(inviteCode || "").trim().toUpperCase();
  if (!normalizedInviteCode) {
    return;
  }

  try {
    getInviteFlowStorage()?.setItem(PENDING_INVITE_ACCEPT_STORAGE_KEY, normalizedInviteCode);
  } catch {
    // ignore storage failures
  }
}

export function clearPendingInviteAcceptCode() {
  try {
    getInviteFlowStorage()?.removeItem(PENDING_INVITE_ACCEPT_STORAGE_KEY);
  } catch {
    // ignore storage failures
  }
}
