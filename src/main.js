import { app, BrowserWindow, desktopCapturer, dialog, ipcMain, safeStorage, session, shell } from "electron";
import fs from "node:fs/promises";
import path from "node:path";
import started from "electron-squirrel-startup";

if (started) {
  app.quit();
}

const SESSION_STORE_FILE_NAME = "session.secure.json";
const SECURE_KEY_VALUE_STORE_FILE_NAME = "secure-store.json";
const ALLOWED_EXTERNAL_PROTOCOLS = new Set(["http:", "https:", "mailto:"]);
const DOWNLOAD_FILE_NAME_FALLBACK = "download";

const getSessionStorePath = () => path.join(app.getPath("userData"), SESSION_STORE_FILE_NAME);
const getSecureKeyValueStorePath = () => path.join(app.getPath("userData"), SECURE_KEY_VALUE_STORE_FILE_NAME);

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

const createWindow = () => {
  const mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
    },
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (isSafeExternalUrl(url)) {
      shell.openExternal(url).catch(() => {});
    }
    return { action: "deny" };
  });

  mainWindow.webContents.on("will-navigate", (event, url) => {
    const expectedUrl = MAIN_WINDOW_VITE_DEV_SERVER_URL;
    const isRendererNavigation = expectedUrl ? url.startsWith(expectedUrl) : url.startsWith("file://");

    if (!isRendererNavigation) {
      event.preventDefault();
    }
  });

  mainWindow.webContents.on("will-attach-webview", (event) => {
    event.preventDefault();
  });

  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
    mainWindow.webContents.openDevTools({ mode: "detach" });
    return;
  }

  mainWindow.loadFile(path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`));
};

app.whenReady().then(() => {
  session.defaultSession.setPermissionRequestHandler((_webContents, permission, callback) => {
    const allowedPermissions = new Set(["media", "display-capture"]);
    callback(allowedPermissions.has(permission));
  });

  session.defaultSession.setPermissionCheckHandler((_webContents, permission) => {
    const allowedPermissions = new Set(["media", "display-capture"]);
    return allowedPermissions.has(permission);
  });

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
      title: "РЎРѕС…СЂР°РЅРёС‚СЊ С„Р°Р№Р»",
      defaultPath: targetPath,
      buttonLabel: "РЎРєР°С‡Р°С‚СЊ",
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

  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
