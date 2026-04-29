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

function normalizeIceServers(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((server) => {
      const urls = Array.isArray(server?.urls)
        ? server.urls.filter(Boolean).map(String)
        : typeof server?.urls === "string" && server.urls.trim()
          ? server.urls.trim()
          : null;

      if (!urls) {
        return null;
      }

      const normalized = { urls };
      if (typeof server?.username === "string" && server.username.trim()) {
        normalized.username = server.username.trim();
      }
      if (typeof server?.credential === "string" && server.credential.trim()) {
        normalized.credential = server.credential.trim();
      }

      return normalized;
    })
    .filter(Boolean);
}

function parseJsonIceServers(rawValue) {
  if (typeof rawValue !== "string" || !rawValue.trim()) {
    return [];
  }

  try {
    return normalizeIceServers(JSON.parse(rawValue));
  } catch {
    return [];
  }
}

function normalizeIceServerUrls(urls) {
  const list = Array.isArray(urls) ? urls : [urls];
  return list
    .map((value) => String(value || "").trim().toLowerCase())
    .filter(Boolean);
}

function hasTurnRelayServer(iceServers) {
  return iceServers.some((server) =>
    normalizeIceServerUrls(server?.urls).some((url) => url.startsWith("turn:") || url.startsWith("turns:"))
  );
}

function buildBrowserVoiceRtcConfig() {
  const jsonConfiguredIceServers = parseJsonIceServers(import.meta.env.VITE_ICE_SERVERS_JSON);
  const envConfiguredIceServers =
    jsonConfiguredIceServers.length > 0
      ? jsonConfiguredIceServers
      : [
          import.meta.env.VITE_STUN_URL
            ? { urls: String(import.meta.env.VITE_STUN_URL).trim() }
            : null,
          import.meta.env.VITE_TURN_URL
            ? {
                urls: String(import.meta.env.VITE_TURN_URL).trim(),
                username: String(import.meta.env.VITE_TURN_USERNAME || "").trim(),
                credential: String(import.meta.env.VITE_TURN_CREDENTIAL || "").trim(),
              }
            : null,
        ].filter(Boolean);

  const normalizedIceServers = normalizeIceServers(envConfiguredIceServers);
  const configuredIceTransportPolicy = String(import.meta.env.VITE_ICE_TRANSPORT_POLICY || "").trim().toLowerCase();
  const hasTurnRelay = hasTurnRelayServer(normalizedIceServers);
  const resolvedIceTransportPolicy =
    configuredIceTransportPolicy === "relay"
      ? "relay"
      : configuredIceTransportPolicy === "all"
        ? "all"
        : DEFAULT_VOICE_RTC_CONFIGURATION.iceTransportPolicy;

  return {
    iceServers: normalizedIceServers,
    iceTransportPolicy: resolvedIceTransportPolicy,
    bundlePolicy: "max-bundle",
    rtcpMuxPolicy: "require",
    usesRelayOnly: resolvedIceTransportPolicy === "relay",
    hasTurnRelay,
  };
}

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
const IS_DESKTOP_APP_RUNTIME = Boolean(electronRuntime.isDesktopApp);
const browserVoiceRtcConfig = buildBrowserVoiceRtcConfig();
const VOICE_RTC_CONFIGURATION = {
  ...DEFAULT_VOICE_RTC_CONFIGURATION,
  ...browserVoiceRtcConfig,
  ...(electronRuntime.voiceRtcConfig || {}),
  iceServers:
    Array.isArray(electronRuntime.voiceRtcConfig?.iceServers) && electronRuntime.voiceRtcConfig.iceServers.length > 0
      ? electronRuntime.voiceRtcConfig.iceServers.map((server) => ({ ...server }))
      : Array.isArray(browserVoiceRtcConfig.iceServers) && browserVoiceRtcConfig.iceServers.length > 0
        ? browserVoiceRtcConfig.iceServers.map((server) => ({ ...server }))
      : DEFAULT_VOICE_RTC_CONFIGURATION.iceServers.map((server) => ({ ...server })),
};

export { API_URL, API_BASE_URL, CHAT_HUB_URL, IS_DESKTOP_APP_RUNTIME, VOICE_HUB_URL, VOICE_RTC_CONFIGURATION };
