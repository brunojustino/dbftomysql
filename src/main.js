const {
  app,
  BrowserWindow,
  Tray,
  Menu,
  ipcMain,
  dialog,
  shell,
} = require("electron");

const path = require("path");
const Store = require("electron-store");
// Import your existing logic
const { runMigration } = require("./dbttosql");
const logger = require("./util/logger");

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

ipcMain.on("open-logs", () => {
  // This opens the folder in Windows Explorer and highlights the file
  shell.showItemInFolder(logger.getLogPath());
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

  const runAutoSync = async () => {
    const lastPath = store.get("lastPath");
    const rawClient = store.get("lastClient");
    const lastClient = parseInt(rawClient, 10);

    if (lastPath && !isNaN(lastClient)) {
      console.log(
        `[AUTO] Iniciando para Cliente ID: ${lastClient} na pasta: ${lastPath}`,
      );
      try {
        await runMigration(lastPath, lastClient, (message) => {
          // Safety check before sending to UI
          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send(
              "migration:progress",
              `[AUTO] ${message}`,
            );
          }
        });
        console.log("Sincronização automática finalizada.");
        logger.info(
          `Sincronização automática finalizada para Cliente ID: ${lastClient} na pasta: ${lastPath}`,
        );
      } catch (err) {
        console.error("Erro na sincronização automática:", err);
        logger.error(`Erro na migração: ${err.stack}`);
      }
    } else {
      console.log("Sincronização automática pulada: Faltam configurações.");
    }
  };

  // 3. Set the interval for every 30 minutes thereafter
  setInterval(runAutoSync, 30 * 60 * 1000);
});

// Ensure the app doesn't quit when all windows are closed
app.on("window-all-closed", (e) => {
  e.preventDefault();
});
