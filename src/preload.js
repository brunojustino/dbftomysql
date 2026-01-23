const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronAPI", {
  selectFolder: () => ipcRenderer.invoke("dialog:openDirectory"),
  getLastPath: () => ipcRenderer.invoke("get:lastPath"),
  getLastClient: () => ipcRenderer.invoke("get:lastClient"),
  startMigration: (folderPath, clientId) =>
    ipcRenderer.send("migration:start", { folderPath, clientId }),
  onProgress: (callback) =>
    ipcRenderer.on("migration:progress", (event, value) => callback(value)),
});
