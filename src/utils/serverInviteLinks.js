const DEFAULT_APP_PROTOCOL = "nodiscord";
const INVITE_CODE_SEGMENT = "([a-z0-9_-]{4,})";
const INVITE_URL_PATTERNS = [
  new RegExp(`(?:https?:\\/\\/)?(?:www\\.)?tendsec\\.ru\\/invite\\/${INVITE_CODE_SEGMENT}`, "i"),
  new RegExp(`(?:https?:\\/\\/)?(?:www\\.)?discord\\.gg\\/${INVITE_CODE_SEGMENT}`, "i"),
  new RegExp(`(?:https?:\\/\\/)?(?:www\\.)?discord(?:app)?\\.com\\/invite\\/${INVITE_CODE_SEGMENT}`, "i"),
  new RegExp(`(?:nodiscord|max|tend):\\/\\/invite\\/${INVITE_CODE_SEGMENT}`, "i"),
  new RegExp(`(?:^|\\s|[([])\\/invite\\/${INVITE_CODE_SEGMENT}(?=$|\\s|[)\\]])`, "i"),
];

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

export function normalizeInviteCode(inviteCode) {
  return String(inviteCode || "").trim().replace(/[^a-z0-9_-]/gi, "").toUpperCase();
}

export function extractInviteCode(value) {
  const text = String(value || "").trim();
  if (!text) {
    return "";
  }

  for (const pattern of INVITE_URL_PATTERNS) {
    const match = text.match(pattern);
    const inviteCode = normalizeInviteCode(match?.[1] || "");
    if (inviteCode) {
      return inviteCode;
    }
  }

  return "";
}

export function isInviteLink(value) {
  return Boolean(extractInviteCode(value));
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
