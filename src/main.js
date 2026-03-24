import { app, BrowserWindow, desktopCapturer, ipcMain, session } from "electron";
import path from "node:path";
import started from "electron-squirrel-startup";

if (started) {
  app.quit();
}

if (MAIN_WINDOW_VITE_DEV_SERVER_URL?.startsWith("https://")) {
  app.commandLine.appendSwitch("ignore-certificate-errors");
}

const createWindow = () => {
  const mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
    },
  });

  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
    mainWindow.webContents.openDevTools();
    return;
  }

  mainWindow.loadFile(path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`));
};

app.whenReady().then(() => {
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
