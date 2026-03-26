import { contextBridge, ipcRenderer } from "electron";

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

function buildVoiceRuntimeConfig() {
  const jsonConfiguredIceServers = parseJsonIceServers(process.env.ND_ICE_SERVERS_JSON);

  const envConfiguredIceServers =
    jsonConfiguredIceServers.length > 0
      ? jsonConfiguredIceServers
      : [
          process.env.ND_STUN_URL
            ? { urls: process.env.ND_STUN_URL.trim() }
            : null,
          process.env.ND_TURN_URL
            ? {
                urls: process.env.ND_TURN_URL.trim(),
                username: process.env.ND_TURN_USERNAME?.trim() || "",
                credential: process.env.ND_TURN_CREDENTIAL?.trim() || "",
              }
            : null,
        ].filter(Boolean);

  return {
    apiUrl: process.env.ND_API_URL?.trim() || process.env.VITE_API_URL?.trim() || "http://localhost:7031",
    voiceRtcConfig: {
      iceServers: normalizeIceServers(envConfiguredIceServers),
      iceTransportPolicy:
        process.env.ND_ICE_TRANSPORT_POLICY?.trim().toLowerCase() === "relay" ? "relay" : "all",
      bundlePolicy: "max-bundle",
      rtcpMuxPolicy: "require",
    },
  };
}

contextBridge.exposeInMainWorld("electronScreenCapture", {
  async getSources() {
    return ipcRenderer.invoke("desktop-capturer:get-sources");
  },
});

contextBridge.exposeInMainWorld("electronSecureSession", {
  async get() {
    return ipcRenderer.invoke("secure-session:get");
  },
  async set(value) {
    return ipcRenderer.invoke("secure-session:set", value);
  },
  async clear() {
    return ipcRenderer.invoke("secure-session:clear");
  },
});

contextBridge.exposeInMainWorld("electronRuntime", buildVoiceRuntimeConfig());
