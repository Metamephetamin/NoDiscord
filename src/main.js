import { app, BrowserWindow, clipboard, desktopCapturer, dialog, ipcMain, Menu, Notification, Tray, safeStorage, session, shell, systemPreferences } from "electron";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { createWriteStream } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { once } from "node:events";
import started from "electron-squirrel-startup";

if (started) {
  app.quit();
}

const SESSION_STORE_FILE_NAME = "session.secure.json";
const SECURE_KEY_VALUE_STORE_FILE_NAME = "secure-store.json";
const APP_UPDATE_CACHE_FILE_NAME = "app-update-cache.json";
const DOWNLOAD_PREFERENCES_STORE_KEY = "downloads.preferences";
const BACKGROUND_PREFERENCES_STORE_KEY = "app.background.preferences";
const ALLOWED_EXTERNAL_PROTOCOLS = new Set(["http:", "https:", "mailto:"]);
const DOWNLOAD_FILE_NAME_FALLBACK = "download";
const APP_PROTOCOL = "nodiscord";
const TRUSTED_DEV_HOSTS = new Set(["localhost", "127.0.0.1"]);
const APP_DISPLAY_NAME = "Tend";
const DEFAULT_LOCAL_API_URL = "http://localhost:7031";
const DEFAULT_PACKAGED_API_URL = "https://tendsec.ru";
const APP_UPDATE_EVENT = "app-update:state";
const SUPPORTED_AUTO_UPDATE_PLATFORM = "win32";
const resolveAppIconPath = () =>
  app.isPackaged
    ? path.join(app.getAppPath(), "assets", "app-icon.png")
    : path.resolve(__dirname, "../../assets/app-icon.png");

const resolveRendererDevServerUrl = () => {
  if (!MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    return "";
  }

  try {
    const parsed = new URL(String(MAIN_WINDOW_VITE_DEV_SERVER_URL).trim());
    if (TRUSTED_DEV_HOSTS.has(parsed.hostname.toLowerCase())) {
      parsed.protocol = "https:";
    }

    return parsed.toString();
  } catch {
    return String(MAIN_WINDOW_VITE_DEV_SERVER_URL || "").trim();
  }
};

const RENDERER_DEV_SERVER_URL = resolveRendererDevServerUrl();

let mainWindow = null;
let appTray = null;
let pendingRendererRoute = "";
let appUpdateCheckPromise = null;
let appUpdateDownloadPromise = null;
let shouldInstallDownloadedUpdateOnQuit = false;
let hasLaunchedDownloadedInstaller = false;
let isAppQuitting = false;
let backgroundPreferences = {
  minimizeToTray: true,
  launchOnStartup: true,
};

const createInitialAppUpdateState = () => ({
  status: app.isPackaged ? "idle" : "unsupported",
  currentVersion: app.getVersion(),
  latestVersion: "",
  minimumVersion: "",
  platform: process.platform,
  arch: process.arch,
  updateAvailable: false,
  required: false,
  isCompatible: true,
  downloadAvailable: false,
  autoInstallOnQuit: true,
  downloadProgress: 0,
  downloadUrl: "",
  downloadPath: "",
  sha256: "",
  releaseNotes: "",
  error: "",
  checkedAt: "",
  downloadedAt: "",
  message: "",
});

let appUpdateState = createInitialAppUpdateState();

const focusMainWindow = () => {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return;
  }

  if (mainWindow.isMinimized()) {
    mainWindow.restore();
  }

  mainWindow.focus();
};

const getDefaultBackgroundPreferences = () => ({
  minimizeToTray: true,
  launchOnStartup: app.isPackaged,
});

const normalizeBackgroundPreferences = (value) => {
  const defaults = getDefaultBackgroundPreferences();
  const source = value && typeof value === "object" && !Array.isArray(value) ? value : {};

  return {
    minimizeToTray: source.minimizeToTray !== false,
    launchOnStartup: source.launchOnStartup == null ? defaults.launchOnStartup : source.launchOnStartup !== false,
  };
};

const loadBackgroundPreferences = async () => {
  const secureStore = await readSecureKeyValueStore();
  backgroundPreferences = normalizeBackgroundPreferences(secureStore[BACKGROUND_PREFERENCES_STORE_KEY]);
  return backgroundPreferences;
};

const saveBackgroundPreferences = async (value) => {
  const secureStore = await readSecureKeyValueStore();
  backgroundPreferences = normalizeBackgroundPreferences(value);
  secureStore[BACKGROUND_PREFERENCES_STORE_KEY] = backgroundPreferences;
  await writeSecureKeyValueStore(secureStore);
  return backgroundPreferences;
};

const applyLaunchOnStartupPreference = () => {
  if (process.platform !== "win32" && process.platform !== "darwin") {
    return;
  }

  app.setLoginItemSettings({
    openAtLogin: backgroundPreferences.launchOnStartup,
    openAsHidden: backgroundPreferences.minimizeToTray,
  });
};

const showDesktopNotification = ({ title = APP_DISPLAY_NAME, body = "", route = "/", silent = false } = {}) => {
  if (!Notification.isSupported()) {
    return false;
  }

  const notification = new Notification({
    title: String(title || APP_DISPLAY_NAME).trim() || APP_DISPLAY_NAME,
    body: String(body || "").trim(),
    silent: Boolean(silent),
    icon: resolveAppIconPath(),
  });

  notification.on("click", () => {
    queueRendererRoute(route);
  });
  notification.show();
  return true;
};

const createTray = () => {
  if (appTray) {
    return appTray;
  }

  appTray = new Tray(resolveAppIconPath());
  appTray.setToolTip(APP_DISPLAY_NAME);
  appTray.on("click", () => {
    focusMainWindow();
  });
  appTray.setContextMenu(Menu.buildFromTemplate([
    {
      label: "Открыть Tend",
      click: () => focusMainWindow(),
    },
    {
      label: "Выход",
      click: () => {
        isAppQuitting = true;
        app.quit();
      },
    },
  ]));

  return appTray;
};

const extractDeepLinkFromArgv = (argv = []) =>
  argv.find((value) => typeof value === "string" && value.toLowerCase().startsWith(`${APP_PROTOCOL}://`)) || "";

const parseRendererRouteFromDeepLink = (rawUrl) => {
  try {
    const parsed = new URL(String(rawUrl || "").trim());
    if (parsed.protocol !== `${APP_PROTOCOL}:`) {
      return "";
    }

    const action = String(parsed.hostname || "").trim().toLowerCase();
    if (action !== "invite") {
      return "";
    }

    const inviteCode = decodeURIComponent(parsed.pathname.replace(/^\/+/, "")).trim().toUpperCase();
    return inviteCode ? `/invite/${encodeURIComponent(inviteCode)}` : "";
  } catch {
    return "";
  }
};

const deliverPendingRendererRoute = () => {
  if (!pendingRendererRoute || !mainWindow || mainWindow.isDestroyed()) {
    return;
  }

  const routeToSend = pendingRendererRoute;
  const sendRoute = () => {
    if (!mainWindow || mainWindow.isDestroyed()) {
      return;
    }

    mainWindow.webContents.send("app:navigate", routeToSend);
    if (pendingRendererRoute === routeToSend) {
      pendingRendererRoute = "";
    }
  };

  if (mainWindow.webContents.isLoading()) {
    mainWindow.webContents.once("did-finish-load", sendRoute);
    return;
  }

  sendRoute();
};

const queueRendererRoute = (route) => {
  const normalizedRoute = String(route || "").trim();
  if (!normalizedRoute) {
    focusMainWindow();
    return;
  }

  pendingRendererRoute = normalizedRoute;
  focusMainWindow();
  deliverPendingRendererRoute();
};

const getSessionStorePath = () => path.join(app.getPath("userData"), SESSION_STORE_FILE_NAME);
const getSecureKeyValueStorePath = () => path.join(app.getPath("userData"), SECURE_KEY_VALUE_STORE_FILE_NAME);
const getAppUpdateCachePath = () => path.join(app.getPath("userData"), APP_UPDATE_CACHE_FILE_NAME);
const getAppUpdateDownloadsRoot = () => path.join(app.getPath("userData"), "updates");

const isSupportedAutoUpdateRuntime = () => app.isPackaged && process.platform === SUPPORTED_AUTO_UPDATE_PLATFORM;

const resolveApiUrl = () => {
  const configuredApiUrl = String(process.env.ND_API_URL?.trim() || process.env.VITE_API_URL?.trim() || "");
  if (configuredApiUrl) {
    return configuredApiUrl;
  }

  return app.isPackaged ? DEFAULT_PACKAGED_API_URL : DEFAULT_LOCAL_API_URL;
};

const getSanitizedAppUpdateState = () => ({ ...appUpdateState });

const emitAppUpdateState = () => {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return;
  }

  mainWindow.webContents.send(APP_UPDATE_EVENT, getSanitizedAppUpdateState());
};

const updateAppUpdateState = (patch) => {
  appUpdateState = {
    ...appUpdateState,
    ...patch,
  };

  emitAppUpdateState();
  return appUpdateState;
};

const normalizeVersion = (value) => {
  const trimmed = String(value || "").trim();
  if (!trimmed) {
    return "";
  }

  return trimmed.split(/[+-]/, 1)[0].trim();
};

const compareVersions = (left, right) => {
  const parse = (value) => {
    const normalized = normalizeVersion(value);
    if (!normalized) {
      return [];
    }

    const segments = normalized.split(".").map((segment) => Number.parseInt(segment, 10));
    return segments.every((segment) => Number.isFinite(segment) && segment >= 0) ? segments : [];
  };

  const leftSegments = parse(left);
  const rightSegments = parse(right);

  if (leftSegments.length === 0 && rightSegments.length === 0) {
    return 0;
  }
  if (leftSegments.length === 0) {
    return String(right || "").trim() ? -1 : 0;
  }
  if (rightSegments.length === 0) {
    return 1;
  }

  const maxLength = Math.max(leftSegments.length, rightSegments.length);
  for (let index = 0; index < maxLength; index += 1) {
    const leftValue = leftSegments[index] ?? 0;
    const rightValue = rightSegments[index] ?? 0;
    if (leftValue !== rightValue) {
      return leftValue > rightValue ? 1 : -1;
    }
  }

  return 0;
};

const getAppUpdateMessage = (state = appUpdateState) => {
  if (state.status === "unsupported") {
    return "";
  }

  if (state.status === "checking") {
    return "Проверяем обновления клиента.";
  }

  if (state.status === "downloading") {
    if (state.required) {
      return `Доступно обязательное обновление ${state.latestVersion || ""}. Загружаем его в фоне, текущая сессия продолжит работать.`;
    }

    return `Загружаем обновление ${state.latestVersion || ""} в фоне.`;
  }

  if (state.status === "downloaded") {
    return state.autoInstallOnQuit
      ? `Обновление ${state.latestVersion || ""} скачано. Оно установится после закрытия приложения, либо можно перезапустить клиент сейчас.`
      : `Обновление ${state.latestVersion || ""} скачано и готово к установке.`;
  }

  if (state.status === "available") {
    return `Найдена новая версия ${state.latestVersion || ""}.`;
  }

  if (state.status === "up-to-date") {
    return "Клиент уже использует актуальную версию.";
  }

  if (state.status === "error") {
    return state.error || "Не удалось загрузить обновление клиента.";
  }

  return "";
};

const readAppUpdateCache = async () => {
  try {
    const raw = await fs.readFile(getAppUpdateCachePath(), "utf8");
    if (!raw.trim()) {
      return {};
    }

    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
};

const writeAppUpdateCache = async (value) => {
  const directory = path.dirname(getAppUpdateCachePath());
  await fs.mkdir(directory, { recursive: true });
  await fs.writeFile(getAppUpdateCachePath(), JSON.stringify(value ?? {}, null, 2), "utf8");
};

const clearAppUpdateCache = async () => {
  try {
    await fs.unlink(getAppUpdateCachePath());
  } catch {
    // ignore missing cache
  }
};

const fileExists = async (targetPath) => {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
};

const toSafeFileName = (value, fallback = "Tend-Setup.exe") => {
  const normalized = Array.from(String(value || ""))
    .filter((character) => {
      const code = character.charCodeAt(0);
      return code >= 32 && !('<>:"/\\|?*'.includes(character));
    })
    .join("")
    .trim();

  return normalized || fallback;
};

const getInstallerFileNameFromUrl = (downloadUrl, version) => {
  try {
    const parsed = new URL(String(downloadUrl || "").trim());
    const fileName = decodeURIComponent(parsed.pathname.split("/").filter(Boolean).pop() || "");
    return toSafeFileName(fileName, `Tend-Setup-${version || "latest"}.exe`);
  } catch {
    return `Tend-Setup-${version || "latest"}.exe`;
  }
};

const resolveDownloadedInstallerPath = (version, downloadUrl) => {
  const installerFileName = getInstallerFileNameFromUrl(downloadUrl, version);
  return path.join(getAppUpdateDownloadsRoot(), version || "latest", installerFileName);
};

const loadCachedDownloadedUpdate = async () => {
  const cache = await readAppUpdateCache();
  const cachedVersion = normalizeVersion(cache?.version);
  const cachedPath = String(cache?.downloadPath || "").trim();

  if (!cachedVersion || !cachedPath || !(await fileExists(cachedPath))) {
    await clearAppUpdateCache();
    return;
  }

  if (compareVersions(app.getVersion(), cachedVersion) >= 0) {
    await clearAppUpdateCache();
    return;
  }

  shouldInstallDownloadedUpdateOnQuit = cache?.autoInstallOnQuit !== false;
  const cachedUpdateIsRequired = cache?.required === true;
  updateAppUpdateState({
    status: "downloaded",
    latestVersion: cachedVersion,
    minimumVersion: normalizeVersion(cache?.minimumVersion),
    updateAvailable: true,
    required: cachedUpdateIsRequired,
    isCompatible: !cachedUpdateIsRequired,
    downloadAvailable: true,
    downloadUrl: String(cache?.downloadUrl || "").trim(),
    downloadPath: cachedPath,
    sha256: String(cache?.sha256 || "").trim(),
    downloadedAt: String(cache?.downloadedAt || "").trim(),
    autoInstallOnQuit: cache?.autoInstallOnQuit !== false,
  });
  updateAppUpdateState({ message: getAppUpdateMessage() });
};

const applyDownloadedUpdate = async () => {
  const downloadPath = String(appUpdateState.downloadPath || "").trim();
  if (!downloadPath || !(await fileExists(downloadPath))) {
    updateAppUpdateState({
      status: "error",
      error: "Скачанный установщик обновления не найден. Проверьте обновления ещё раз.",
    });
    updateAppUpdateState({ message: getAppUpdateMessage() });
    return false;
  }

  if (hasLaunchedDownloadedInstaller) {
    return true;
  }

  hasLaunchedDownloadedInstaller = true;
  try {
    const installerProcess = spawn(downloadPath, ["/S"], {
      detached: true,
      stdio: "ignore",
    });
    installerProcess.unref();
    return true;
  } catch (error) {
    hasLaunchedDownloadedInstaller = false;
    updateAppUpdateState({
      status: "error",
      error: error instanceof Error ? error.message : "Не удалось запустить установщик обновления.",
    });
    updateAppUpdateState({ message: getAppUpdateMessage() });
    return false;
  }
};

const installDownloadedUpdateAndQuit = async () => {
  if (!appUpdateState.downloadPath) {
    return false;
  }

  shouldInstallDownloadedUpdateOnQuit = true;
  app.quit();
  return true;
};

const downloadClientUpdate = async (descriptor) => {
  const latestVersion = normalizeVersion(descriptor?.latestVersion);
  const downloadUrl = String(descriptor?.downloadUrl || "").trim();
  const updateIsRequired = descriptor?.required === true;
  const autoInstallOnQuit = descriptor?.autoInstallOnQuit !== false;
  if (!latestVersion || !downloadUrl) {
    updateAppUpdateState({ status: "available" });
    updateAppUpdateState({ message: getAppUpdateMessage() });
    return getSanitizedAppUpdateState();
  }

  const finalPath = resolveDownloadedInstallerPath(latestVersion, downloadUrl);
  if (await fileExists(finalPath)) {
    shouldInstallDownloadedUpdateOnQuit = autoInstallOnQuit;
    updateAppUpdateState({
      status: "downloaded",
      latestVersion,
      minimumVersion: normalizeVersion(descriptor.minimumVersion),
      updateAvailable: true,
      required: updateIsRequired,
      isCompatible: !updateIsRequired,
      downloadAvailable: true,
      downloadUrl,
      downloadPath: finalPath,
      sha256: String(descriptor.sha256 || "").trim(),
      downloadedAt: new Date().toISOString(),
      autoInstallOnQuit,
      error: "",
    });
    updateAppUpdateState({ message: getAppUpdateMessage() });
    await writeAppUpdateCache({
      version: latestVersion,
      minimumVersion: normalizeVersion(descriptor.minimumVersion),
      required: updateIsRequired,
      downloadUrl,
      downloadPath: finalPath,
      sha256: String(descriptor.sha256 || "").trim(),
      downloadedAt: new Date().toISOString(),
      autoInstallOnQuit,
    });
    return getSanitizedAppUpdateState();
  }

  if (appUpdateDownloadPromise) {
    return appUpdateDownloadPromise;
  }

  appUpdateDownloadPromise = (async () => {
    const updateDirectory = path.dirname(finalPath);
    const tempPath = `${finalPath}.part`;
    await fs.mkdir(updateDirectory, { recursive: true });
    await fs.rm(tempPath, { force: true });

    updateAppUpdateState({
      status: "downloading",
      latestVersion,
      minimumVersion: normalizeVersion(descriptor.minimumVersion),
      updateAvailable: true,
      required: updateIsRequired,
      isCompatible: !updateIsRequired,
      downloadAvailable: true,
      downloadUrl,
      downloadPath: "",
      sha256: String(descriptor.sha256 || "").trim(),
      downloadedAt: "",
      autoInstallOnQuit,
      downloadProgress: 0,
      error: "",
    });
    updateAppUpdateState({ message: getAppUpdateMessage() });

    const response = await fetch(downloadUrl);
    if (!response.ok || !response.body) {
      throw new Error(`Update download failed with status ${response.status}.`);
    }

    const totalBytes = Number.parseInt(response.headers.get("content-length") || "0", 10);
    const expectedSha256 = String(descriptor.sha256 || "").trim().toLowerCase();
    const hash = expectedSha256 ? createHash("sha256") : null;
    const fileStream = createWriteStream(tempPath, { flags: "w" });

    try {
      const reader = response.body.getReader();
      let receivedBytes = 0;

      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          break;
        }

        const chunk = Buffer.from(value);
        if (hash) {
          hash.update(chunk);
        }

        if (!fileStream.write(chunk)) {
          await once(fileStream, "drain");
        }

        receivedBytes += chunk.length;
        const nextProgress = totalBytes > 0 ? Math.max(0, Math.min(100, Math.round((receivedBytes / totalBytes) * 100))) : 0;
        updateAppUpdateState({ downloadProgress: nextProgress });
      }

      fileStream.end();
      await once(fileStream, "finish");
    } catch (error) {
      fileStream.destroy();
      throw error;
    }

    if (hash) {
      const actualSha256 = hash.digest("hex").toLowerCase();
      if (actualSha256 !== expectedSha256) {
        throw new Error("Downloaded update checksum mismatch.");
      }
    }

    await fs.rename(tempPath, finalPath);

    const downloadedAt = new Date().toISOString();
    shouldInstallDownloadedUpdateOnQuit = autoInstallOnQuit;
    updateAppUpdateState({
      status: "downloaded",
      latestVersion,
      minimumVersion: normalizeVersion(descriptor.minimumVersion),
      updateAvailable: true,
      required: updateIsRequired,
      isCompatible: !updateIsRequired,
      downloadAvailable: true,
      downloadUrl,
      downloadPath: finalPath,
      downloadedAt,
      autoInstallOnQuit,
      downloadProgress: 100,
      error: "",
    });
    updateAppUpdateState({ message: getAppUpdateMessage() });

    await writeAppUpdateCache({
      version: latestVersion,
      minimumVersion: normalizeVersion(descriptor.minimumVersion),
      required: updateIsRequired,
      downloadUrl,
      downloadPath: finalPath,
      sha256: String(descriptor.sha256 || "").trim(),
      downloadedAt,
      autoInstallOnQuit,
    });

    return getSanitizedAppUpdateState();
  })()
    .catch(async (error) => {
      await fs.rm(`${finalPath}.part`, { force: true }).catch(() => {});
      updateAppUpdateState({
        status: "error",
        error: error instanceof Error ? error.message : "Не удалось скачать обновление клиента.",
      });
      updateAppUpdateState({ message: getAppUpdateMessage() });
      return getSanitizedAppUpdateState();
    })
    .finally(() => {
      appUpdateDownloadPromise = null;
    });

  return appUpdateDownloadPromise;
};

const checkForClientUpdates = async ({ force = false } = {}) => {
  if (!app.isPackaged) {
    updateAppUpdateState({
      status: "unsupported",
      message: "",
      currentVersion: app.getVersion(),
      platform: process.platform,
      arch: process.arch,
    });
    return getSanitizedAppUpdateState();
  }

  if (!force && appUpdateCheckPromise) {
    return appUpdateCheckPromise;
  }

  appUpdateCheckPromise = (async () => {
    updateAppUpdateState({
      status: "checking",
      currentVersion: app.getVersion(),
      platform: process.platform,
      arch: process.arch,
      error: "",
      checkedAt: new Date().toISOString(),
    });
    updateAppUpdateState({ message: getAppUpdateMessage() });

    const apiUrl = resolveApiUrl();
    const requestUrl = new URL("/api/app/version", apiUrl);
    requestUrl.searchParams.set("clientVersion", app.getVersion());
    requestUrl.searchParams.set("platform", process.platform);
    requestUrl.searchParams.set("arch", process.arch);

    const response = await fetch(requestUrl);
    if (!response.ok) {
      throw new Error(`Update check failed with status ${response.status}.`);
    }

    const descriptor = await response.json();
    const latestVersion = normalizeVersion(descriptor?.latestVersion);
    const minimumVersion = normalizeVersion(descriptor?.minimumVersion);
    const updateAvailable = Boolean(descriptor?.updateAvailable);
    const required = Boolean(descriptor?.required);
    const downloadAvailable = Boolean(descriptor?.downloadAvailable);

    updateAppUpdateState({
      status: updateAvailable ? (downloadAvailable && isSupportedAutoUpdateRuntime() ? "available" : "available") : "up-to-date",
      latestVersion,
      minimumVersion,
      updateAvailable,
      required,
      isCompatible: Boolean(descriptor?.isCompatible ?? !required),
      downloadAvailable,
      autoInstallOnQuit: descriptor?.autoInstallOnQuit !== false,
      downloadUrl: String(descriptor?.downloadUrl || "").trim(),
      sha256: String(descriptor?.sha256 || "").trim(),
      releaseNotes: String(descriptor?.releaseNotes || "").trim(),
      checkedAt: String(descriptor?.checkedAtUtc || new Date().toISOString()),
      error: "",
    });
    updateAppUpdateState({ message: getAppUpdateMessage() });

    if (!updateAvailable) {
      if (compareVersions(app.getVersion(), latestVersion) >= 0) {
        await clearAppUpdateCache();
      }

      return getSanitizedAppUpdateState();
    }

    if (!downloadAvailable || !isSupportedAutoUpdateRuntime()) {
      return getSanitizedAppUpdateState();
    }

    return downloadClientUpdate({
      latestVersion,
      minimumVersion,
      required,
      autoInstallOnQuit: descriptor?.autoInstallOnQuit !== false,
      downloadUrl: String(descriptor?.downloadUrl || "").trim(),
      sha256: String(descriptor?.sha256 || "").trim(),
    });
  })()
    .catch((error) => {
      updateAppUpdateState({
        status: "error",
        error: error instanceof Error ? error.message : "Не удалось проверить обновления клиента.",
      });
      updateAppUpdateState({ message: getAppUpdateMessage() });
      return getSanitizedAppUpdateState();
    })
    .finally(() => {
      appUpdateCheckPromise = null;
    });

  return appUpdateCheckPromise;
};

const readSecureSession = async () => {
  try {
    const raw = await fs.readFile(getSessionStorePath(), "utf8");
    if (!raw.trim()) {
      return null;
    }

    const payload = JSON.parse(raw);
    if (payload?.encrypted && safeStorage.isEncryptionAvailable()) {
      const decrypted = safeStorage.decryptString(Buffer.from(payload.encrypted, "base64"));
      return JSON.parse(decrypted);
    }

    return payload?.plain ?? null;
  } catch {
    return null;
  }
};

const writeSecureSession = async (sessionValue) => {
  const directory = path.dirname(getSessionStorePath());
  await fs.mkdir(directory, { recursive: true });

  if (safeStorage.isEncryptionAvailable()) {
    const encrypted = safeStorage.encryptString(JSON.stringify(sessionValue));
    await fs.writeFile(
      getSessionStorePath(),
      JSON.stringify({ encrypted: encrypted.toString("base64") }),
      "utf8"
    );
    return;
  }

  await fs.writeFile(getSessionStorePath(), JSON.stringify({ plain: sessionValue }), "utf8");
};

const clearSecureSession = async () => {
  try {
    await fs.unlink(getSessionStorePath());
  } catch {
    // ignore missing secure store
  }
};

const readSecureObjectFile = async (targetPath) => {
  try {
    const raw = await fs.readFile(targetPath, "utf8");
    if (!raw.trim()) {
      return {};
    }

    const payload = JSON.parse(raw);
    if (payload?.encrypted && safeStorage.isEncryptionAvailable()) {
      const decrypted = safeStorage.decryptString(Buffer.from(payload.encrypted, "base64"));
      const parsed = JSON.parse(decrypted);
      return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
    }

    const plain = payload?.plain;
    return plain && typeof plain === "object" && !Array.isArray(plain) ? plain : {};
  } catch {
    return {};
  }
};

const writeSecureObjectFile = async (targetPath, value) => {
  const directory = path.dirname(targetPath);
  await fs.mkdir(directory, { recursive: true });
  const normalizedValue = value && typeof value === "object" && !Array.isArray(value) ? value : {};

  if (safeStorage.isEncryptionAvailable()) {
    const encrypted = safeStorage.encryptString(JSON.stringify(normalizedValue));
    await fs.writeFile(
      targetPath,
      JSON.stringify({ encrypted: encrypted.toString("base64") }),
      "utf8"
    );
    return;
  }

  await fs.writeFile(targetPath, JSON.stringify({ plain: normalizedValue }), "utf8");
};

const readSecureKeyValueStore = async () => readSecureObjectFile(getSecureKeyValueStorePath());

const writeSecureKeyValueStore = async (value) => writeSecureObjectFile(getSecureKeyValueStorePath(), value);

const isSafeExternalUrl = (value) => {
  try {
    const parsed = new URL(String(value || "").trim());
    return ALLOWED_EXTERNAL_PROTOCOLS.has(parsed.protocol);
  } catch {
    return false;
  }
};

const sanitizeDownloadFileName = (value) => {
  const normalized = Array.from(String(value || "").trim())
    .filter((character) => {
      const code = character.charCodeAt(0);
      return !('<>:"/\\|?*'.includes(character) || code < 32);
    })
    .join("");
  return normalized || DOWNLOAD_FILE_NAME_FALLBACK;
};

const readDownloadPreferences = async () => {
  const secureStore = await readSecureKeyValueStore();
  const value = secureStore[DOWNLOAD_PREFERENCES_STORE_KEY];
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
};

const writeDownloadPreferences = async (value) => {
  const secureStore = await readSecureKeyValueStore();
  secureStore[DOWNLOAD_PREFERENCES_STORE_KEY] = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  await writeSecureKeyValueStore(secureStore);
};

const normalizeDirectoryPath = (value) => String(value || "").trim();

const ensureDirectoryExists = async (directoryPath) => {
  const normalizedPath = normalizeDirectoryPath(directoryPath);
  if (!normalizedPath) {
    return "";
  }

  try {
    const stats = await fs.stat(normalizedPath);
    return stats.isDirectory() ? normalizedPath : "";
  } catch {
    return "";
  }
};

const rememberDownloadDirectory = async (directoryPath) => {
  const normalizedPath = await ensureDirectoryExists(directoryPath);
  if (!normalizedPath) {
    return "";
  }

  const currentPreferences = await readDownloadPreferences();
  await writeDownloadPreferences({
    ...currentPreferences,
    directoryPath: normalizedPath,
  });
  return normalizedPath;
};

const getRememberedDownloadDirectory = async () => {
  const currentPreferences = await readDownloadPreferences();
  return ensureDirectoryExists(currentPreferences?.directoryPath);
};

const buildUniqueDownloadPath = async (directoryPath, fileName) => {
  const safeDirectoryPath = normalizeDirectoryPath(directoryPath) || app.getPath("downloads");
  const safeFileName = sanitizeDownloadFileName(fileName);
  const parsedName = path.parse(safeFileName);
  let attempt = 0;

  while (attempt < 500) {
    const candidateName =
      attempt === 0
        ? safeFileName
        : `${parsedName.name || DOWNLOAD_FILE_NAME_FALLBACK} (${attempt})${parsedName.ext || ""}`;
    const candidatePath = path.join(safeDirectoryPath, candidateName);

    try {
      await fs.access(candidatePath);
      attempt += 1;
    } catch {
      return candidatePath;
    }
  }

  return path.join(safeDirectoryPath, `${Date.now()}-${safeFileName}`);
};

const promptForDownloadDirectory = async () => {
  const rememberedDirectory = await getRememberedDownloadDirectory();
  const fallbackDirectory = rememberedDirectory || app.getPath("downloads");
  const { canceled, filePaths } = await dialog.showOpenDialog({
    title: "Выберите папку для загрузок",
    defaultPath: fallbackDirectory,
    buttonLabel: "Выбрать папку",
    properties: ["openDirectory", "createDirectory"],
  });

  const selectedDirectory = !canceled && Array.isArray(filePaths) ? normalizeDirectoryPath(filePaths[0]) : "";
  if (!selectedDirectory) {
    return { canceled: true, directoryPath: "" };
  }

  const rememberedPath = await rememberDownloadDirectory(selectedDirectory);
  return {
    canceled: !rememberedPath,
    directoryPath: rememberedPath,
  };
};

const resolveDownloadTargetPath = async (defaultFileName, { forceDialog = false } = {}) => {
  const fileName = sanitizeDownloadFileName(defaultFileName);
  const rememberedDirectory = await getRememberedDownloadDirectory();

  if (!forceDialog && rememberedDirectory) {
    return {
      canceled: false,
      filePath: await buildUniqueDownloadPath(rememberedDirectory, fileName),
      directoryPath: rememberedDirectory,
      usedDialog: false,
    };
  }

  const fallbackDirectory = rememberedDirectory || app.getPath("downloads");
  const defaultPath = path.join(fallbackDirectory, fileName);
  const { canceled, filePath } = await dialog.showSaveDialog({
    title: "Сохранить файл",
    defaultPath,
    buttonLabel: "Скачать",
  });

  if (canceled || !filePath) {
    return { canceled: true, filePath: "", directoryPath: "", usedDialog: true };
  }

  const resolvedDirectory = path.dirname(filePath);
  await rememberDownloadDirectory(resolvedDirectory);
  return {
    canceled: false,
    filePath,
    directoryPath: resolvedDirectory,
    usedDialog: true,
  };
};

const normalizeDownloadBytes = (bytes) => {
  if (bytes instanceof Uint8Array) {
    return Buffer.from(bytes);
  }

  if (ArrayBuffer.isView(bytes)) {
    return Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  }

  if (bytes instanceof ArrayBuffer) {
    return Buffer.from(new Uint8Array(bytes));
  }

  if (Array.isArray(bytes)) {
    return Buffer.from(bytes);
  }

  if (bytes && typeof bytes === "object") {
    const numericValues = Object.values(bytes)
      .filter((value) => Number.isInteger(value) && value >= 0 && value <= 255);
    if (numericValues.length) {
      return Buffer.from(numericValues);
    }
  }

  return null;
};

const getMediaAccessStatus = (mediaType) => {
  const normalizedType = String(mediaType || "").trim().toLowerCase();
  if (typeof systemPreferences?.getMediaAccessStatus !== "function") {
    return "unknown";
  }

  if (normalizedType !== "microphone" && normalizedType !== "camera") {
    return "unknown";
  }

  try {
    return systemPreferences.getMediaAccessStatus(normalizedType);
  } catch {
    return "unknown";
  }
};

const requestMediaAccess = async (mediaType) => {
  const normalizedType = String(mediaType || "").trim().toLowerCase();
  if (normalizedType !== "microphone" && normalizedType !== "camera") {
    return { granted: false, status: "unknown" };
  }

  const beforeStatus = getMediaAccessStatus(normalizedType);
  if (beforeStatus === "granted") {
    return { granted: true, status: beforeStatus };
  }

  if (process.platform === "darwin" && typeof systemPreferences?.askForMediaAccess === "function") {
    try {
      const granted = await systemPreferences.askForMediaAccess(normalizedType);
      return {
        granted: Boolean(granted),
        status: getMediaAccessStatus(normalizedType),
      };
    } catch {
      return {
        granted: false,
        status: getMediaAccessStatus(normalizedType),
      };
    }
  }

  return {
    granted: beforeStatus === "granted",
    status: beforeStatus,
  };
};

const createWindow = () => {
  const desktopTitleBarHeight = 28;
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    title: APP_DISPLAY_NAME,
    icon: resolveAppIconPath(),
    autoHideMenuBar: true,
    titleBarStyle: "hidden",
    ...(process.platform === "win32"
      ? {
          titleBarOverlay: {
            color: "#111319",
            symbolColor: "#dfe6f7",
            height: desktopTitleBarHeight,
          },
        }
      : {}),
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
    },
  });

  createTray();

  mainWindow.setMenuBarVisibility(false);

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (isSafeExternalUrl(url)) {
      shell.openExternal(url).catch(() => {});
    }
    return { action: "deny" };
  });

  mainWindow.webContents.on("will-navigate", (event, url) => {
    const expectedUrl = RENDERER_DEV_SERVER_URL;
    const isRendererNavigation = expectedUrl ? url.startsWith(expectedUrl) : url.startsWith("file://");

    if (!isRendererNavigation) {
      event.preventDefault();
    }
  });

  mainWindow.webContents.on("will-attach-webview", (event) => {
    event.preventDefault();
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });

  mainWindow.on("close", (event) => {
    if (isAppQuitting || !backgroundPreferences.minimizeToTray) {
      return;
    }

    event.preventDefault();
    mainWindow.hide();
  });

  mainWindow.webContents.on("did-finish-load", () => {
    emitAppUpdateState();
  });

  if (RENDERER_DEV_SERVER_URL) {
    mainWindow.loadURL(RENDERER_DEV_SERVER_URL);
    mainWindow.webContents.openDevTools({ mode: "detach" });
    deliverPendingRendererRoute();
    return;
  }

  mainWindow.loadFile(path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`));
  deliverPendingRendererRoute();
};

const hasSingleInstanceLock = app.requestSingleInstanceLock();

if (!hasSingleInstanceLock) {
  app.quit();
}

app.on("second-instance", (_event, argv) => {
  const route = parseRendererRouteFromDeepLink(extractDeepLinkFromArgv(argv));
  if (route) {
    queueRendererRoute(route);
    return;
  }

  focusMainWindow();
});

app.on("open-url", (event, url) => {
  event.preventDefault();
  queueRendererRoute(parseRendererRouteFromDeepLink(url));
});

app.whenReady().then(async () => {
  app.setName(APP_DISPLAY_NAME);
  if (process.defaultApp && process.argv.length >= 2) {
    app.setAsDefaultProtocolClient(APP_PROTOCOL, process.execPath, [path.resolve(process.argv[1])]);
  } else {
    app.setAsDefaultProtocolClient(APP_PROTOCOL);
  }

  pendingRendererRoute = parseRendererRouteFromDeepLink(extractDeepLinkFromArgv(process.argv));
  await loadBackgroundPreferences();
  applyLaunchOnStartupPreference();

  session.defaultSession.setPermissionRequestHandler((_webContents, permission, callback) => {
    const allowedPermissions = new Set(["media", "display-capture", "microphone", "camera"]);
    callback(allowedPermissions.has(permission));
  });

  session.defaultSession.setPermissionCheckHandler((_webContents, permission) => {
    const allowedPermissions = new Set(["media", "display-capture", "microphone", "camera"]);
    return allowedPermissions.has(permission);
  });

  if (RENDERER_DEV_SERVER_URL) {
    session.defaultSession.setCertificateVerifyProc((request, callback) => {
      const hostname = String(request?.hostname || "").trim().toLowerCase();
      if (TRUSTED_DEV_HOSTS.has(hostname)) {
        callback(0);
        return;
      }

      callback(-3);
    });
  }

  ipcMain.handle("secure-session:get", async () => readSecureSession());
  ipcMain.handle("secure-session:set", async (_event, sessionValue) => {
    await writeSecureSession(sessionValue ?? null);
    return true;
  });
  ipcMain.handle("secure-session:clear", async () => {
    await clearSecureSession();
    return true;
  });
  ipcMain.handle("secure-store:get", async (_event, key) => {
    const normalizedKey = String(key || "").trim();
    if (!normalizedKey) {
      return null;
    }

    const secureStore = await readSecureKeyValueStore();
    return secureStore[normalizedKey] ?? null;
  });
  ipcMain.handle("secure-store:set", async (_event, key, value) => {
    const normalizedKey = String(key || "").trim();
    if (!normalizedKey) {
      return false;
    }

    const secureStore = await readSecureKeyValueStore();
    secureStore[normalizedKey] = value ?? null;
    await writeSecureKeyValueStore(secureStore);
    return true;
  });
  ipcMain.handle("secure-store:remove", async (_event, key) => {
    const normalizedKey = String(key || "").trim();
    if (!normalizedKey) {
      return false;
    }

    const secureStore = await readSecureKeyValueStore();
    delete secureStore[normalizedKey];
    await writeSecureKeyValueStore(secureStore);
    return true;
  });
  ipcMain.handle("clipboard:write-text", async (_event, value) => {
    clipboard.writeText(String(value ?? ""));
    return true;
  });
  ipcMain.handle("background:get-preferences", async () => ({ ...backgroundPreferences }));
  ipcMain.handle("background:set-preferences", async (_event, value) => {
    const nextPreferences = await saveBackgroundPreferences(value);
    applyLaunchOnStartupPreference();
    return { ...nextPreferences };
  });
  ipcMain.handle("background:show-main-window", async (_event, route = "") => {
    const normalizedRoute = String(route || "").trim();
    if (normalizedRoute) {
      queueRendererRoute(normalizedRoute);
      return true;
    }

    focusMainWindow();
    return true;
  });
  ipcMain.handle("desktop-notifications:show", async (_event, payload) =>
    showDesktopNotification(payload && typeof payload === "object" ? payload : {}));
  ipcMain.handle("permissions:get-media-status", async (_event, mediaType) => getMediaAccessStatus(mediaType));
  ipcMain.handle("permissions:request-media-access", async (_event, mediaType) => requestMediaAccess(mediaType));
  ipcMain.handle("app-update:get-state", async () => getSanitizedAppUpdateState());
  ipcMain.handle("app-update:check", async () => checkForClientUpdates({ force: true }));
  ipcMain.handle("app-update:install", async () => installDownloadedUpdateAndQuit());

  ipcMain.handle("desktop-capturer:get-sources", async () => {
    const sources = await desktopCapturer.getSources({
      types: ["screen", "window"],
      thumbnailSize: { width: 320, height: 180 },
      fetchWindowIcons: true,
    });

    return sources.map((source) => ({
      id: source.id,
      name: source.name,
      display_id: source.display_id,
      thumbnail: source.thumbnail.isEmpty() ? "" : source.thumbnail.toDataURL(),
      appIcon: source.appIcon?.isEmpty?.() ? "" : source.appIcon?.toDataURL?.() || "",
    }));
  });

  ipcMain.handle("downloads:save-file", async (_event, payload) => {
    const fileName = sanitizeDownloadFileName(payload?.defaultFileName);
    const targetPath = path.join(app.getPath("downloads"), fileName);
    const { canceled, filePath } = await dialog.showSaveDialog({
      title: "Сохранить файл",
      defaultPath: targetPath,
      buttonLabel: "Скачать",
    });

    if (canceled || !filePath) {
      return { canceled: true, filePath: "" };
    }

    const bytes = payload?.bytes;
    let buffer = null;

    if (bytes instanceof Uint8Array) {
      buffer = Buffer.from(bytes);
    } else if (ArrayBuffer.isView(bytes)) {
      buffer = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    } else if (bytes instanceof ArrayBuffer) {
      buffer = Buffer.from(new Uint8Array(bytes));
    } else if (Array.isArray(bytes)) {
      buffer = Buffer.from(bytes);
    } else if (bytes && typeof bytes === "object") {
      const numericValues = Object.values(bytes)
        .filter((value) => Number.isInteger(value) && value >= 0 && value <= 255);
      if (numericValues.length) {
        buffer = Buffer.from(numericValues);
      }
    }

    if (!buffer) {
      throw new Error("No file bytes provided for download.");
    }

    await fs.writeFile(filePath, buffer);
    return { canceled: false, filePath };
  });
  ipcMain.handle("downloads:fetch-and-save", async (_event, payload) => {
    const sourceUrl = String(payload?.url || "").trim();
    if (!sourceUrl) {
      throw new Error("No download URL provided.");
    }

    const headers = new Headers();
    for (const [key, value] of Object.entries(payload?.headers || {})) {
      const normalizedKey = String(key || "").trim();
      const normalizedValue = String(value || "").trim();
      if (normalizedKey && normalizedValue) {
        headers.set(normalizedKey, normalizedValue);
      }
    }

    const response = await fetch(sourceUrl, { headers });
    if (!response.ok) {
      throw new Error(`Download request failed with status ${response.status}.`);
    }

    const fileName = sanitizeDownloadFileName(payload?.defaultFileName);
    const targetPath = path.join(app.getPath("downloads"), fileName);
    const { canceled, filePath } = await dialog.showSaveDialog({
      title: "Сохранить файл",
      defaultPath: targetPath,
      buttonLabel: "Скачать",
    });

    if (canceled || !filePath) {
      return { canceled: true, filePath: "" };
    }

    const buffer = Buffer.from(new Uint8Array(await response.arrayBuffer()));
    await fs.writeFile(filePath, buffer);
    return {
      canceled: false,
      filePath,
      contentType: response.headers.get("content-type") || "",
    };
  });
  ipcMain.handle("downloads:fetch-bytes", async (_event, payload) => {
    const sourceUrl = String(payload?.url || "").trim();
    if (!sourceUrl) {
      throw new Error("No download URL provided.");
    }

    const headers = new Headers();
    for (const [key, value] of Object.entries(payload?.headers || {})) {
      const normalizedKey = String(key || "").trim();
      const normalizedValue = String(value || "").trim();
      if (normalizedKey && normalizedValue) {
        headers.set(normalizedKey, normalizedValue);
      }
    }

    const response = await fetch(sourceUrl, { headers });
    if (!response.ok) {
      throw new Error(`Download request failed with status ${response.status}.`);
    }

    return {
      contentType: response.headers.get("content-type") || "",
      bytes: Array.from(new Uint8Array(await response.arrayBuffer())),
    };
  });

  ipcMain.removeHandler("downloads:save-file");
  ipcMain.handle("downloads:save-file", async (_event, payload) => {
    const { canceled, filePath, directoryPath, usedDialog } = await resolveDownloadTargetPath(payload?.defaultFileName, {
      forceDialog: payload?.forceDialog === true,
    });

    if (canceled || !filePath) {
      return { canceled: true, filePath: "", directoryPath: "", usedDialog };
    }

    const buffer = normalizeDownloadBytes(payload?.bytes);
    if (!buffer) {
      throw new Error("No file bytes provided for download.");
    }

    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, buffer);
    return { canceled: false, filePath, directoryPath, usedDialog };
  });

  ipcMain.removeHandler("downloads:fetch-and-save");
  ipcMain.handle("downloads:fetch-and-save", async (_event, payload) => {
    const sourceUrl = String(payload?.url || "").trim();
    if (!sourceUrl) {
      throw new Error("No download URL provided.");
    }

    const headers = new Headers();
    for (const [key, value] of Object.entries(payload?.headers || {})) {
      const normalizedKey = String(key || "").trim();
      const normalizedValue = String(value || "").trim();
      if (normalizedKey && normalizedValue) {
        headers.set(normalizedKey, normalizedValue);
      }
    }

    const response = await fetch(sourceUrl, { headers });
    if (!response.ok) {
      throw new Error(`Download request failed with status ${response.status}.`);
    }

    const { canceled, filePath, directoryPath, usedDialog } = await resolveDownloadTargetPath(payload?.defaultFileName, {
      forceDialog: payload?.forceDialog === true,
    });

    if (canceled || !filePath) {
      return { canceled: true, filePath: "", directoryPath: "", usedDialog };
    }

    const buffer = Buffer.from(new Uint8Array(await response.arrayBuffer()));
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, buffer);
    return {
      canceled: false,
      filePath,
      directoryPath,
      usedDialog,
      contentType: response.headers.get("content-type") || "",
    };
  });

  ipcMain.handle("downloads:fetch-and-save-many", async (_event, payload) => {
    const items = Array.isArray(payload?.items) ? payload.items : [];
    if (!items.length) {
      return { canceled: true, directoryPath: "", savedFiles: [] };
    }

    const requestedDirectory = normalizeDirectoryPath(payload?.directoryPath);
    const rememberedDirectory = await getRememberedDownloadDirectory();
    const resolvedDirectory = requestedDirectory
      ? await ensureDirectoryExists(requestedDirectory)
      : rememberedDirectory;
    const directorySelection = resolvedDirectory
      ? { canceled: false, directoryPath: resolvedDirectory }
      : await promptForDownloadDirectory();

    if (directorySelection.canceled || !directorySelection.directoryPath) {
      return { canceled: true, directoryPath: "", savedFiles: [] };
    }

    await fs.mkdir(directorySelection.directoryPath, { recursive: true });
    const savedFiles = [];

    for (const item of items) {
      const sourceUrl = String(item?.url || "").trim();
      if (!sourceUrl) {
        // eslint-disable-next-line no-continue
        continue;
      }

      const headers = new Headers();
      for (const [key, value] of Object.entries(item?.headers || {})) {
        const normalizedKey = String(key || "").trim();
        const normalizedValue = String(value || "").trim();
        if (normalizedKey && normalizedValue) {
          headers.set(normalizedKey, normalizedValue);
        }
      }

      // eslint-disable-next-line no-await-in-loop
      const response = await fetch(sourceUrl, { headers });
      if (!response.ok) {
        throw new Error(`Download request failed with status ${response.status}.`);
      }

      // eslint-disable-next-line no-await-in-loop
      const nextFilePath = await buildUniqueDownloadPath(directorySelection.directoryPath, item?.defaultFileName);
      const buffer = Buffer.from(new Uint8Array(await response.arrayBuffer()));
      // eslint-disable-next-line no-await-in-loop
      await fs.writeFile(nextFilePath, buffer);
      savedFiles.push(nextFilePath);
    }

    await rememberDownloadDirectory(directorySelection.directoryPath);
    return {
      canceled: false,
      directoryPath: directorySelection.directoryPath,
      savedFiles,
    };
  });

  if (typeof session.defaultSession.setDisplayMediaRequestHandler === "function") {
    session.defaultSession.setDisplayMediaRequestHandler(
      async (_request, callback) => {
        try {
          const sources = await desktopCapturer.getSources({
            types: ["screen", "window"],
            thumbnailSize: { width: 0, height: 0 },
          });

          if (!sources.length) {
            callback({});
            return;
          }

          callback({ video: sources[0] });
        } catch (error) {
          console.error("Failed to initialize screen capture source", error);
          callback({});
        }
      },
      { useSystemPicker: true }
    );
  }

  await loadCachedDownloadedUpdate();
  createWindow();
  void checkForClientUpdates();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("before-quit", () => {
  isAppQuitting = true;

  if (!shouldInstallDownloadedUpdateOnQuit || !appUpdateState.downloadPath || hasLaunchedDownloadedInstaller) {
    appTray?.destroy();
    appTray = null;
    return;
  }

  void applyDownloadedUpdate();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin" && !backgroundPreferences.minimizeToTray) {
    app.quit();
  }
});
