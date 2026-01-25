const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronAPI", {
  selectFolder: () => ipcRenderer.invoke("dialog:openDirectory"),
  openLogs: () => ipcRenderer.send("open-logs"),
  getLastPath: () => ipcRenderer.invoke("get:lastPath"),
  testConnection: () => ipcRenderer.invoke("test-connection"),
  getLastClient: () => ipcRenderer.invoke("get:lastClient"),
  getLastKey: () => ipcRenderer.invoke("get:lastKey"),
  validateApiKey: (apiKey) => ipcRenderer.invoke("validate-api-key", apiKey),
  getSettings: () => ipcRenderer.invoke("get-settings"),
  saveSettings: (settings) => ipcRenderer.invoke("save-settings", settings),
  // startMigration: (folderPath, clientId) =>
  //   ipcRenderer.send("migration:start", { folderPath, clientId }),
  // startMigration: () => ipcRenderer.on("migration:start"),
  startMigration: (data) => ipcRenderer.send("migration:start", data),
  onLog: (callback) =>
    ipcRenderer.on("migration-log", (event, value) => callback(value)),
  onProgress: (callback) => {
    if (typeof callback === "function") {
      ipcRenderer.removeAllListeners("migration:progress");
      ipcRenderer.on("migration:progress", (event, message) =>
        callback(message),
      );
    }
  },
});
