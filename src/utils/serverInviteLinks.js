const DEFAULT_APP_PROTOCOL = "nodiscord";

function stripTrailingSlash(value) {
  return String(value || "").trim().replace(/\/+$/, "");
}

function getElectronRuntime() {
  return typeof window !== "undefined" && window.electronRuntime && typeof window.electronRuntime === "object"
    ? window.electronRuntime
    : {};
}

export function getInviteRoute(inviteCode) {
  return `/invite/${encodeURIComponent(String(inviteCode || "").trim().toUpperCase())}`;
}

export function buildServerInviteLink(inviteCode) {
  const normalizedInviteCode = String(inviteCode || "").trim().toUpperCase();
  if (!normalizedInviteCode) {
    return "";
  }

  const runtime = getElectronRuntime();
  const configuredPublicAppUrl = stripTrailingSlash(runtime.publicAppUrl || import.meta.env.VITE_PUBLIC_APP_URL);

  if (configuredPublicAppUrl) {
    return `${configuredPublicAppUrl}${getInviteRoute(normalizedInviteCode)}`;
  }

  if (typeof window !== "undefined") {
    const protocol = String(window.location.protocol || "").toLowerCase();
    if (protocol === "http:" || protocol === "https:") {
      return `${stripTrailingSlash(window.location.origin)}${getInviteRoute(normalizedInviteCode)}`;
    }
  }

  const customProtocol = String(runtime.appProtocol || import.meta.env.VITE_APP_PROTOCOL || DEFAULT_APP_PROTOCOL).trim() || DEFAULT_APP_PROTOCOL;
  return `${customProtocol}://invite/${encodeURIComponent(normalizedInviteCode)}`;
}
