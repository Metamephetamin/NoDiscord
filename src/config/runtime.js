const DEFAULT_API_URL = "http://localhost:7031";
const DEFAULT_VOICE_RTC_CONFIGURATION = {
  iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
  iceTransportPolicy: "all",
  bundlePolicy: "max-bundle",
  rtcpMuxPolicy: "require",
};

const electronRuntime =
  typeof window !== "undefined" && window.electronRuntime && typeof window.electronRuntime === "object"
    ? window.electronRuntime
    : {};

const API_URL = String(electronRuntime.apiUrl || import.meta.env.VITE_API_URL || DEFAULT_API_URL).trim();
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
