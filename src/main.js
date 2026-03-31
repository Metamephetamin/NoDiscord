import { app, BrowserWindow, desktopCapturer, ipcMain, safeStorage, session, shell } from "electron";
import fs from "node:fs/promises";
import path from "node:path";
import started from "electron-squirrel-startup";

if (started) {
  app.quit();
}

const SESSION_STORE_FILE_NAME = "session.secure.json";
const ALLOWED_EXTERNAL_PROTOCOLS = new Set(["http:", "https:", "mailto:"]);

const getSessionStorePath = () => path.join(app.getPath("userData"), SESSION_STORE_FILE_NAME);

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

const isSafeExternalUrl = (value) => {
  try {
    const parsed = new URL(String(value || "").trim());
    return ALLOWED_EXTERNAL_PROTOCOLS.has(parsed.protocol);
  } catch {
    return false;
  }
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
