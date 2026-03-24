import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("electronScreenCapture", {
  async getSources() {
    return ipcRenderer.invoke("desktop-capturer:get-sources");
  },
});
