const {
  app,
  BrowserWindow,
  Tray,
  Menu,
  ipcMain,
  dialog,
  shell,
} = require("electron");

if (process.env.NODE_ENV !== "development") {
  // These strings are replaced by Vite during build
  process.env.VITE_DB_HOST = process.env.VITE_DB_HOST;
  process.env.VITE_DB_USER = process.env.VITE_DB_USER;
  process.env.VITE_DB_PASS = process.env.VITE_DB_PASS;
  process.env.VITE_DB_PORT = process.env.VITE_DB_PORT;
  process.env.VITE_DB_NAME = process.env.VITE_DB_NAME;
} else {
  require("dotenv").config();
}

const path = require("path");
const Store = require("electron-store");
const { runMigration } = require("./dbftosql.js");
const logger = require("./util/logger.js");
const connectToDatabase = require("./db/db.js");
const axios = require("axios");
const { autoUpdater } = require("electron-updater");
const store = new Store();

autoUpdater.logger = require("electron-log");
autoUpdater.logger.transports.file.level = "info";

// const updateServer = "https://github.com/brunojustino/dbftomysql";
// const feedUrl = `${updateServer}/releases/download/v${app.getVersion()}`;
// autoUpdater.setFeedURL({ url: feedUrl });

let mainWindow;
let tray = null;
let currentStatus = "";

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

ipcMain.handle("test-connection", async () => {
  let db;
  try {
    db = await connectToDatabase(logger);
    // Simple query to prove we are truly inside
    await db.query("SELECT 1");
    return { success: true };
  } catch (err) {
    logger.error(`Teste de conexão falhou: ${err.message}`);
    return { success: false, message: err.message };
  } finally {
    if (db) await db.release();
  }
});

// ipcMain.handle("get-current-status", () => {
//   return { status: currentStatus };
// });

ipcMain.handle("save-settings", async (event, { apiKey, folderPath }) => {
  console.log("Validating API Key:", apiKey);
  console.log("Validating folder:", folderPath);
  try {
    const response = await axios.get(
      "https://proinfo.brunojustino.com/auth/validate-key",
      {
        headers: { "x-api-key": apiKey },
      },
    );
    const { clientId, nome } = response.data;
    // 2. If valid, save to electron-store

    console.log(clientId, nome);

    store.set("apiKey", apiKey);
    store.set("lastPath", folderPath);
    store.set("lastClient", clientId);

    logger.info(`Configurações salvas para: ${nome}`);

    return { success: true, message: `Conectado: ${nome}` };
  } catch (err) {
    const errorMsg = err.response?.data?.message || err.message;
    logger.error(`Falha ao salvar configurações: ${errorMsg}`);
    return { success: false, message: errorMsg };
  }
});

ipcMain.handle("validate-api-key", async (event, apiKey) => {
  try {
    // Replace with your actual NestJS endpoint
    const response = await axios.get(
      "https://proinfo.brunojustino.com/auth/validate-key",
      {
        headers: { "x-api-key": apiKey },
      },
    );

    // Assuming your API returns { clientId: 22, name: 'ASSOJAF/PE' }
    const { clientId, nome } = response.data;

    store.set("apiKey", apiKey);
    store.set("lastClient", clientId);

    return { success: true, clientName: nome, clientId };
  } catch (err) {
    logger.error(`Falha na validação da API Key: ${err.message}`);
    return { success: false, message: "Chave inválida ou erro de conexão." };
  }
});

ipcMain.handle("get:lastPath", () => {
  return store.get("lastPath", "C:\\siv"); // Return saved or default
});
ipcMain.handle("get:lastClient", () => {
  return store.get("lastClient", "1"); // Return saved or default
});

// ipcMain.handle("get-settings", () => {
//   return {
//     lastClient: store.get("lastClient", "1"),
//     lastPath: store.get("lastPath", "C:\\siv"),
//   };
// });

ipcMain.handle("get-settings", () => {
  return {
    apiKey: store.get("apiKey"),
    folderPath: store.get("lastPath"), // Internal store uses 'lastPath'
    lastClient: store.get("lastClient"),
  };
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
      label: "Abrir Logs",
      click: () => {
        shell.showItemInFolder(logger.getLogPath());
      },
    },
    {
      label: "Check for Updates",
      click: () => {
        autoUpdater.checkForUpdates();
      },
    },
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
    mainWindow.webContents.send("from-tray", currentStatus);
  });
}

app.whenReady().then(() => {
  createWindow();
  createTray();

  // auto updater
  autoUpdater.checkForUpdatesAndNotify();

  // Event listeners for the updater
  autoUpdater.on("checking-for-update", () => {
    console.log("Checking for update...");
  });

  autoUpdater.on("update-available", (info) => {
    console.log("Update available.", info);
    dialog.showMessageBox(mainWindow, {
      type: "info",
      title: "Update Available",
      message:
        "A new version is available. It will be downloaded in the background.",
      buttons: ["OK"],
    });
  });

  autoUpdater.on("update-not-available", (info) => {
    console.log("Update not available.", info);
  });

  autoUpdater.on("error", (err) => {
    console.error("Error in auto-updater.", err);
  });

  autoUpdater.on("download-progress", (progressObj) => {
    let log_message = "Download speed: " + progressObj.bytesPerSecond;
    log_message = log_message + " - Downloaded " + progressObj.percent + "%";
    log_message =
      log_message +
      " (" +
      progressObj.transferred +
      "/" +
      progressObj.total +
      ")";
    console.log(log_message);
  });

  autoUpdater.on("update-downloaded", (info) => {
    console.log("Update downloaded.", info);
    dialog
      .showMessageBox(mainWindow, {
        type: "info",
        title: "Update Ready",
        message:
          "A new version has been downloaded. Restart the application to apply the updates.",
        buttons: ["Restart Now", "Later"],
      })
      .then((result) => {
        if (result.response === 0) {
          // "Restart Now"
          autoUpdater.quitAndInstall();
        }
      });
  });

  // end auto updater

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
        currentStatus = `\n Sincronização automática finalizada para Cliente ID: ${lastClient} na pasta: ${lastPath}`;
        logger.info(
          `Sincronização automática finalizada para Cliente ID: ${lastClient} na pasta: ${lastPath}`,
        );
      } catch (err) {
        console.error("Erro na sincronização automática:", err);
        logger.error(`Erro na migração: ${err.stack}`);
      }
    } else {
      console.log("Sincronização automática pulada: Faltam configurações.");
      currentStatus = `\n Configure sua chave api`;
    }
  };

  // 3. Set the interval for every 30 minutes thereafter

  mainWindow.webContents.on("did-finish-load", () => {
    runAutoSync();
  });

  setInterval(runAutoSync, 30 * 60 * 1000);
});

// Ensure the app doesn't quit when all windows are closed
app.on("window-all-closed", (e) => {
  e.preventDefault();
});
