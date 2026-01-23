const { app, BrowserWindow, Tray, Menu, ipcMain, dialog } = require("electron");
const path = require("path");
const Store = require("electron-store");
// Import your existing logic
const { runMigration } = require("./dbttosql");

const store = new Store();

let mainWindow;
let tray = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 800,
    height: 600,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "./preload.js"),
    },
  });
  mainWindow.loadFile(path.join(__dirname, "index.html"));

  // Prevent the app from closing when the window is closed
  // Instead, just hide it so it keeps running in the tray
  mainWindow.on("close", (event) => {
    if (!app.isQuitting) {
      event.preventDefault();
      mainWindow.hide();
    }
    return false;
  });
}

// Handler to pick the folder via Windows Explorer
ipcMain.handle("dialog:openDirectory", async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog({
    title: "Selecionar Pasta SIV",
    defaultPath: store.get("lastPath", "C:\\siv"),
    properties: ["openDirectory"],
  });
  if (!canceled && filePaths.length > 0) {
    store.set("lastPath", filePaths[0]);
    return filePaths[0];
  }
  return null;
});

ipcMain.handle("get:lastPath", () => {
  return store.get("lastPath", "C:\\siv"); // Return saved or default
});
ipcMain.handle("get:lastClient", () => {
  return store.get("lastClient", "1"); // Return saved or default
});

// Triggered when user clicks "Start" in the UI
ipcMain.on("migration:start", async (event, { folderPath, clientId }) => {
  store.set("lastClient", clientId);
  store.set("lastPath", folderPath);
  try {
    await runMigration(folderPath, clientId, (message) => {
      event.sender.send("migration:progress", message);
    });
  } catch (error) {
    event.sender.send("migration:progress", `Error: ${error.message}`);
  }
});

function createTray() {
  // Replace 'icon.png' with your actual icon file path
  const iconPath = path.join(__dirname, "assets", "proinfo logo 333.png");
  tray = new Tray(iconPath);

  const contextMenu = Menu.buildFromTemplate([
    {
      label: "Configurações",
      click: () => {
        mainWindow.show();
      },
    },
    { type: "separator" },
    {
      label: "Sair",
      click: () => {
        app.isQuitting = true;
        app.quit();
      },
    },
  ]);

  tray.setToolTip("DBF to SQL Sync");
  tray.setContextMenu(contextMenu);

  // Optional: Double click icon to open settings
  tray.on("double-click", () => {
    mainWindow.show();
  });
}

app.whenReady().then(() => {
  createWindow();
  createTray();

  setInterval(
    async () => {
      const lastPath = store.get("lastPath");
      const lastClient = store.get("lastClient");

      if (lastPath && lastClient) {
        console.log("Iniciando sincronização automática...");
        await runMigration(lastClient, lastPath, (msg) => {
          // Log to terminal if window is open
          if (mainWindow)
            mainWindow.webContents.send("migration:progress", `[AUTO] ${msg}`);
        });
      }
    },
    30 * 60 * 1000,
  ); // Every 30 minutes
});

// Ensure the app doesn't quit when all windows are closed
app.on("window-all-closed", (e) => {
  e.preventDefault();
});
