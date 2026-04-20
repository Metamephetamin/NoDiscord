const DEFAULT_VOICE_RTC_CONFIGURATION = {
  iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
  iceTransportPolicy: "all",
  bundlePolicy: "max-bundle",
  rtcpMuxPolicy: "require",
  usesRelayOnly: false,
  hasTurnRelay: false,
};

const electronRuntime =
  typeof window !== "undefined" && window.electronRuntime && typeof window.electronRuntime === "object"
    ? window.electronRuntime
    : {};

function isTrustedLocalHost(value) {
  const normalizedValue = String(value || "").trim().toLowerCase();
  return normalizedValue === "localhost" || normalizedValue === "127.0.0.1";
}

const resolveDefaultApiUrl = () => {
  if (
    !electronRuntime.isPackagedApp
    && typeof window !== "undefined"
    && /^https?:$/i.test(String(window.location?.protocol || ""))
    && isTrustedLocalHost(window.location?.hostname)
  ) {
    return String(window.location.origin || "").trim();
  }

  if (electronRuntime.apiUrl) {
    return String(electronRuntime.apiUrl).trim();
  }

  const configuredApiUrl = String(import.meta.env.VITE_API_URL || "").trim();
  if (configuredApiUrl) {
    return configuredApiUrl;
  }

  if (typeof window !== "undefined" && /^https?:$/i.test(String(window.location?.protocol || ""))) {
    return String(window.location.origin || "").trim();
  }

  return "http://localhost:7031";
};

const API_URL = resolveDefaultApiUrl();
const API_BASE_URL = `${API_URL}/api`;
const CHAT_HUB_URL = `${API_URL}/chatHub`;
const VOICE_HUB_URL = `${API_URL}/voiceHub`;
const VOICE_RTC_CONFIGURATION = {
  ...DEFAULT_VOICE_RTC_CONFIGURATION,
  ...(electronRuntime.voiceRtcConfig || {}),
  iceServers:
    Array.isArray(electronRuntime.voiceRtcConfig?.iceServers) && electronRuntime.voiceRtcConfig.iceServers.length > 0
      ? electronRuntime.voiceRtcConfig.iceServers.map((server) => ({ ...server }))
      : DEFAULT_VOICE_RTC_CONFIGURATION.iceServers.map((server) => ({ ...server })),
};

export { API_URL, API_BASE_URL, CHAT_HUB_URL, VOICE_HUB_URL, VOICE_RTC_CONFIGURATION };
