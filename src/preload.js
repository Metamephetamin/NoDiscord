import { contextBridge, ipcRenderer } from "electron";

const DEFAULT_LOCAL_API_URL = "http://localhost:7031";
const DEFAULT_LOCAL_LIVEKIT_URL = "wss://localhost:5173/livekit";
const DEFAULT_PACKAGED_API_URL = "https://tendsec.ru";
const DEFAULT_PACKAGED_LIVEKIT_URL = "wss://tendsec.ru/livekit";
const DEFAULT_APP_PROTOCOL = "nodiscord";

function isPackagedRuntime() {
  const nodeEnv = String(process.env.NODE_ENV || "").trim().toLowerCase();
  if (nodeEnv === "development") {
    return false;
  }

  if (process.defaultApp === true) {
    return false;
  }

  const normalizedExecPath = String(process.execPath || "").replace(/\\/g, "/").toLowerCase();
  if (normalizedExecPath.includes("/node_modules/electron/dist/")) {
    return false;
  }

  return true;
}

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

  const normalizedIceServers = normalizeIceServers(envConfiguredIceServers);
  const configuredIceTransportPolicy = process.env.ND_ICE_TRANSPORT_POLICY?.trim().toLowerCase();
  const hasTurnRelay = hasTurnRelayServer(normalizedIceServers);
  const resolvedIceTransportPolicy =
    configuredIceTransportPolicy === "relay"
      ? "relay"
      : configuredIceTransportPolicy === "all"
        ? "all"
        : "all";
  const defaultApiUrl = isPackagedRuntime() ? DEFAULT_PACKAGED_API_URL : DEFAULT_LOCAL_API_URL;
  const defaultLiveKitUrl = isPackagedRuntime() ? DEFAULT_PACKAGED_LIVEKIT_URL : DEFAULT_LOCAL_LIVEKIT_URL;

  return {
    apiUrl: process.env.ND_API_URL?.trim() || process.env.VITE_API_URL?.trim() || defaultApiUrl,
    liveKitUrl: process.env.ND_LIVEKIT_URL?.trim() || defaultLiveKitUrl,
    publicAppUrl: process.env.ND_PUBLIC_APP_URL?.trim() || process.env.VITE_PUBLIC_APP_URL?.trim() || "",
    appProtocol: process.env.ND_APP_PROTOCOL?.trim() || DEFAULT_APP_PROTOCOL,
    appVersion: process.env.npm_package_version?.trim?.() || "",
    isPackagedApp: isPackagedRuntime(),
    voiceRtcConfig: {
      iceServers: normalizedIceServers,
      iceTransportPolicy: resolvedIceTransportPolicy,
      bundlePolicy: "max-bundle",
      rtcpMuxPolicy: "require",
      usesRelayOnly: resolvedIceTransportPolicy === "relay",
      hasTurnRelay,
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

contextBridge.exposeInMainWorld("electronDownloads", {
  async saveFile(payload) {
    return ipcRenderer.invoke("downloads:save-file", payload);
  },
  async fetchAndSave(payload) {
    return ipcRenderer.invoke("downloads:fetch-and-save", payload);
  },
  async fetchAndSaveMany(payload) {
    return ipcRenderer.invoke("downloads:fetch-and-save-many", payload);
  },
  async fetchBytes(payload) {
    return ipcRenderer.invoke("downloads:fetch-bytes", payload);
  },
});

contextBridge.exposeInMainWorld("electronClipboard", {
  async writeText(value) {
    return ipcRenderer.invoke("clipboard:write-text", value);
  },
});

contextBridge.exposeInMainWorld("electronAttachmentPicker", {
  async open(payload) {
    return ipcRenderer.invoke("attachments:open-picker", payload);
  },
  async readFiles(payload) {
    return ipcRenderer.invoke("attachments:read-selected-files", payload);
  },
  async releaseFiles(payload) {
    return ipcRenderer.invoke("attachments:release-selected-files", payload);
  },
});

contextBridge.exposeInMainWorld("electronBackground", {
  async getPreferences() {
    return ipcRenderer.invoke("background:get-preferences");
  },
  async setPreferences(value) {
    return ipcRenderer.invoke("background:set-preferences", value);
  },
  async showMainWindow(route = "") {
    return ipcRenderer.invoke("background:show-main-window", route);
  },
});

contextBridge.exposeInMainWorld("electronWindowControls", {
  async setTitleBarOverlayVisible(visible = true) {
    return ipcRenderer.invoke("window-controls:set-titlebar-overlay-visible", visible);
  },
  async minimize() {
    return ipcRenderer.invoke("window-controls:minimize");
  },
  async toggleMaximize() {
    return ipcRenderer.invoke("window-controls:toggle-maximize");
  },
  async close() {
    return ipcRenderer.invoke("window-controls:close");
  },
});

contextBridge.exposeInMainWorld("electronDesktopNotifications", {
  async show(payload) {
    return ipcRenderer.invoke("desktop-notifications:show", payload);
  },
});

contextBridge.exposeInMainWorld("electronPermissions", {
  async getMediaStatus(mediaType) {
    return ipcRenderer.invoke("permissions:get-media-status", mediaType);
  },
  async requestMediaAccess(mediaType) {
    return ipcRenderer.invoke("permissions:request-media-access", mediaType);
  },
});

contextBridge.exposeInMainWorld("electronRuntime", buildVoiceRuntimeConfig());

contextBridge.exposeInMainWorld("electronAppLinks", {
  onNavigate(callback) {
    if (typeof callback !== "function") {
      return () => {};
    }

    const listener = (_event, route) => {
      callback(String(route || ""));
    };

    ipcRenderer.on("app:navigate", listener);
    return () => {
      ipcRenderer.removeListener("app:navigate", listener);
    };
  },
});

contextBridge.exposeInMainWorld("electronAppUpdate", {
  async getState() {
    return ipcRenderer.invoke("app-update:get-state");
  },
  async check() {
    return ipcRenderer.invoke("app-update:check");
  },
  async install() {
    return ipcRenderer.invoke("app-update:install");
  },
  onStateChange(callback) {
    if (typeof callback !== "function") {
      return () => {};
    }

    const listener = (_event, nextState) => {
      callback(nextState && typeof nextState === "object" ? nextState : {});
    };

    ipcRenderer.on("app-update:state", listener);
    return () => {
      ipcRenderer.removeListener("app-update:state", listener);
    };
  },
});

contextBridge.exposeInMainWorld("electronPerf", {
  async record(event) {
    return ipcRenderer.invoke("perf:record", event);
  },
  async getEvents() {
    return ipcRenderer.invoke("perf:get-events");
  },
  async clear() {
    return ipcRenderer.invoke("perf:clear");
  },
  async ping(payload) {
    return ipcRenderer.invoke("perf:ping", payload);
  },
});
