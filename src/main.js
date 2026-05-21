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
const { runMigration } = require("./dbftosql.js");
const ReverseSyncService = require("./services/ReverseSyncService.js");
const logger = require("./util/logger.js");
const { initDb, connectToDatabase, closeDatabase } = require("./db/db.js");
const axios = require("axios");
const { autoUpdater } = require("electron-updater");
const store = new Store();

// SECURITY: Global sync lock to prevent concurrent migrations
let isSyncing = false;
const SYNC_TIMEOUT = 180000; // 3 minutes sync timeout protection

async function initDbIfApiKeySaved() {
  const apiKey = store.get("apiKey");
  if (!apiKey) return;

  try {
    const response = await axios.get(
      "https://proinfo.brunojustino.com/auth/validate-key",
      {
        headers: { "x-api-key": apiKey },
      },
    );

    const { db_host, db_name, db_usr, db_password, db_port } = response.data;

    initDb({
      host: db_host,
      user: db_usr,
      password: db_password,
      database: db_name,
      port: db_port || 3307,
    });

    logger.info("DB initialized using stored API key.");
  } catch (err) {
    const message = err.response?.data?.message || err.message;
    logger.warn(`Could not init DB from stored API key: ${message}`);
  }
}

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
  mainWindow.setMenu(null);

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

  // Ensure DB pool is initialized using stored API key (if available)
  await initDbIfApiKeySaved();

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
  try {
    // SECURITY: Add timeout to API request
    const response = await axios.get(
      "https://proinfo.brunojustino.com/auth/validate-key",
      {
        headers: { "x-api-key": apiKey },
        timeout: 5000, // 5s timeout
      },
    );
    const { clientId, nome, db_host, db_name, db_usr, db_password } =
      response.data;

    // SECURITY: Validate clientId is a positive integer
    if (!Number.isInteger(clientId) || clientId <= 0) {
      logger.error("Invalid clientId from API response", {
        operation: "save-settings",
        clientId,
      });
      return {
        success: false,
        message: "Resposta inválida da API: clientId inválido.",
      };
    }

    // Initialize the database pool using credentials returned from the auth service
    try {
      initDb({
        host: db_host,
        user: db_usr,
        password: db_password,
        database: db_name,
        port: response.data.db_port || 3307,
      });
    } catch (dbInitErr) {
      logger.error(`Failed to initialize DB: ${dbInitErr.message}`, {
        operation: "save-settings",
        errorStack: dbInitErr.stack,
      });
      return {
        success: false,
        message: "Falha ao inicializar conexão com o banco de dados.",
      };
    }

    // Store API key (electron-store encrypts it at rest)
    store.set("apiKey", apiKey);
    store.set("lastPath", folderPath);
    store.set("lastClient", clientId);

    logger.info(`Settings saved successfully`, {
      operation: "save-settings",
      clientId,
      nome,
    });

    return { success: true, message: `Conectado: ${nome}` };
  } catch (err) {
    const errorMsg = err.response?.data?.message || err.message;
    logger.error(`Failed to save settings: ${errorMsg}`, {
      operation: "save-settings",
      errorStack: err.stack,
    });
    return { success: false, message: errorMsg };
  }
});

ipcMain.handle("validate-api-key", async (event, apiKey) => {
  try {
    // SECURITY: Add timeout to API request
    const response = await axios.get(
      "https://proinfo.brunojustino.com/auth/validate-key",
      {
        headers: { "x-api-key": apiKey },
        timeout: 5000, // 5s timeout
      },
    );

    // SECURITY: Validate response contains required fields
    const { clientId, nome } = response.data;

    if (!Number.isInteger(clientId) || clientId <= 0 || !nome) {
      logger.error("Invalid API response format", {
        operation: "validate-api-key",
        hasClientId: clientId !== undefined,
        hasNome: nome !== undefined,
      });
      return { success: false, message: "Resposta inválida da API." };
    }

    // Store API key (electron-store encrypts it at rest)
    store.set("apiKey", apiKey);
    store.set("lastClient", clientId);

    logger.info("API key validated successfully", {
      operation: "validate-api-key",
      clientId,
    });

    return { success: true, clientName: nome, clientId };
  } catch (err) {
    const errorMsg =
      err.code === "ECONNABORTED"
        ? "Timeout na validação da API"
        : err.response?.data?.message || err.message;

    logger.error(`API key validation failed: ${errorMsg}`, {
      operation: "validate-api-key",
      errorCode: err.code,
    });
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
    folderPath: store.get("lastPath"),
    lastClient: store.get("lastClient"),
  };
});

// Triggered when user clicks "Start" in the UI
ipcMain.on("migration:start", async (event, { folderPath, clientId }) => {
  // SECURITY: Prevent concurrent syncs
  if (isSyncing) {
    const message = "Sync already in progress. Please wait for it to complete.";
    logger.warn(message, { operation: "migration:start", clientId });
    event.sender.send("migration:progress", `Error: ${message}`);
    return;
  }

  // SECURITY: Validate clientId
  if (!Number.isInteger(clientId) || clientId <= 0) {
    logger.error("Invalid clientId provided", {
      operation: "migration:start",
      clientId,
    });
    event.sender.send("migration:progress", "Error: Invalid client ID");
    return;
  }

  isSyncing = true;
  const syncStartTime = Date.now();
  const syncTimeout = setTimeout(() => {
    isSyncing = false;
    logger.error("Sync timeout - forcing sync lock release", {
      operation: "migration:start",
      clientId,
      duration: Date.now() - syncStartTime,
    });
  }, SYNC_TIMEOUT);

  store.set("lastClient", clientId);
  store.set("lastPath", folderPath);

  try {
    logger.info("Starting migration", {
      operation: "migration:start",
      clientId,
      folderPath,
    });

    await runMigration(folderPath, clientId, (message) => {
      event.sender.send("migration:progress", message);
    });

    logger.info("Migration completed, starting reverse sync", {
      operation: "migration:start",
      clientId,
    });

    // Start reverse sync automatically after normal sync
    const reverseSyncService = new ReverseSyncService({
      logger,
    });

    await reverseSyncService.start(folderPath, clientId, (message) => {
      event.sender.send("reverseSync:progress", message);
    });

    const finalStatus = reverseSyncService.getStatus();
    event.sender.send(
      "reverseSync:progress",
      `Reverse sync completed: ${finalStatus.tablesProcessed} tables processed, ${finalStatus.recordsProcessed} records synced, ${finalStatus.conflictsLogged} conflicts logged.`,
    );

    logger.info("Full sync cycle completed", {
      operation: "migration:start",
      clientId,
      tablesProcessed: finalStatus.tablesProcessed,
      recordsProcessed: finalStatus.recordsProcessed,
      conflictsLogged: finalStatus.conflictsLogged,
      duration: Date.now() - syncStartTime,
    });
  } catch (error) {
    logger.error(`Sync error: ${error.message}`, {
      operation: "migration:start",
      clientId,
      errorStack: error.stack,
      duration: Date.now() - syncStartTime,
    });
    event.sender.send("migration:progress", `Error: ${error.message}`);
  } finally {
    isSyncing = false;
    clearTimeout(syncTimeout);
  }
});

// Triggered when user clicks "Pull from Database" in the UI (reverse sync)
ipcMain.on("reverseSync:start", async (event, { folderPath, clientId }) => {
  // SECURITY: Prevent concurrent syncs
  if (isSyncing) {
    const message = "Sync already in progress. Please wait for it to complete.";
    logger.warn(message, { operation: "reverseSync:start", clientId });
    event.sender.send("reverseSync:progress", `Error: ${message}`);
    return;
  }

  // SECURITY: Validate clientId
  if (!Number.isInteger(clientId) || clientId <= 0) {
    logger.error("Invalid clientId provided", {
      operation: "reverseSync:start",
      clientId,
    });
    event.sender.send("reverseSync:progress", "Error: Invalid client ID");
    return;
  }

  isSyncing = true;
  const syncStartTime = Date.now();
  const syncTimeout = setTimeout(() => {
    isSyncing = false;
    logger.error("Reverse sync timeout - forcing sync lock release", {
      operation: "reverseSync:start",
      clientId,
      duration: Date.now() - syncStartTime,
    });
  }, SYNC_TIMEOUT);

  store.set("lastClient", clientId);
  store.set("lastPath", folderPath);

  try {
    logger.info("Starting reverse sync", {
      operation: "reverseSync:start",
      clientId,
      folderPath,
    });

    const reverseSyncService = new ReverseSyncService({
      logger,
    });

    await reverseSyncService.start(folderPath, clientId, (message) => {
      event.sender.send("reverseSync:progress", message);
    });

    const finalStatus = reverseSyncService.getStatus();
    event.sender.send(
      "reverseSync:progress",
      `Reverse sync completed: ${finalStatus.tablesProcessed} tables processed, ${finalStatus.recordsProcessed} records synced, ${finalStatus.conflictsLogged} conflicts logged.`,
    );

    logger.info("Reverse sync completed", {
      operation: "reverseSync:start",
      clientId,
      tablesProcessed: finalStatus.tablesProcessed,
      recordsProcessed: finalStatus.recordsProcessed,
      conflictsLogged: finalStatus.conflictsLogged,
      duration: Date.now() - syncStartTime,
    });
  } catch (error) {
    logger.error(`Reverse sync error: ${error.message}`, {
      operation: "reverseSync:start",
      clientId,
      errorStack: error.stack,
      duration: Date.now() - syncStartTime,
    });
    event.sender.send("reverseSync:progress", `Error: ${error.message}`);
  } finally {
    isSyncing = false;
    clearTimeout(syncTimeout);
  }
});

ipcMain.on("open-logs", () => {
  try {
    const logPath = logger.getLogPath();
    logger.info("Opening logs folder", {
      operation: "open-logs",
      path: logPath,
    });

    // Try to open the log file, or if it doesn't exist, open the directory
    const fs = require("fs");
    if (fs.existsSync(logPath)) {
      shell.showItemInFolder(logPath);
    } else {
      // If log file doesn't exist yet, open the directory
      const logDir = require("path").dirname(logPath);
      if (fs.existsSync(logDir)) {
        shell.openPath(logDir);
      } else {
        logger.error("Log path does not exist", {
          operation: "open-logs",
          logPath,
          logDir,
        });
      }
    }
  } catch (err) {
    logger.error(`Failed to open logs: ${err.message}`, {
      operation: "open-logs",
      errorStack: err.stack,
    });
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
      label: "Abrir Logs",
      click: () => {
        try {
          const logPath = logger.getLogPath();
          const fs = require("fs");
          if (fs.existsSync(logPath)) {
            shell.showItemInFolder(logPath);
          } else {
            const logDir = require("path").dirname(logPath);
            if (fs.existsSync(logDir)) {
              shell.openPath(logDir);
            }
          }
        } catch (err) {
          logger.error(`Failed to open logs from tray: ${err.message}`, {
            operation: "open-logs",
            errorStack: err.stack,
          });
        }
      },
    },
    {
      label: "Checar Atualizações",
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

  tray.setToolTip("Proinfo Sync");
  tray.setContextMenu(contextMenu);

  // Optional: Double click icon to open settings
  tray.on("double-click", () => {
    mainWindow.show();
    mainWindow.webContents.send("from-tray", currentStatus);
  });
}

// prevent multiple instances (especially helpful when Windows auto-launches)
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    // Someone tried to start a second instance, show the window
    if (mainWindow) {
      mainWindow.show();
    }
  });

  app.whenReady().then(async () => {
    await initDbIfApiKeySaved();

    // Auto-start configuration for Windows builds
    if (process.platform === "win32") {
      const exeName = path.basename(process.execPath);
      // The special args are needed when the app is installed with squirrel / nsis
      const args = [
        "--processStart",
        `\"${exeName}\"`,
        "--process-start-args",
        "--hidden",
      ];
      const appExePath = path.join(
        process.env.ProgramFiles,
        "Proinfo Sync Tool",
        "Proinfo Sync Tool.exe",
      );
      if (!app.isPackaged) {
        app.setLoginItemSettings({
          openAtLogin: true,
          openAsHidden: true, // still request a hidden launch
          path: appExePath,
          args,
        });
      }
    } else {
      // fallback for other platforms
      app.setLoginItemSettings({
        openAtLogin: true,
        openAsHidden: true,
      });
    }

    createTray();
    createWindow();

    // respect `--hidden` flag passed on startup; prevents any visible window
    if (process.argv.includes("--hidden")) {
      mainWindow.hide();
    } else {
      mainWindow.show();
    }

    // auto updater
    autoUpdater.checkForUpdatesAndNotify();

    // Event listeners for the updater
    autoUpdater.on("checking-for-update", () => {
      logger.debug("Checking for update...");
    });

    autoUpdater.on("update-available", (info) => {
      console.log("Update available.", info);
      dialog.showMessageBox(mainWindow, {
        type: "info",
        title: "Atualização Disponível",
        message:
          "Uma nova versão está disponível e será baixada em segundo plano. Você será notificado quando o download for concluído.",
        buttons: ["OK"],
      });
    });

    autoUpdater.on("update-not-available", (info) => {
      logger.debug("Update not available");
    });

    autoUpdater.on("error", (err) => {
      logger.error(`Error in auto-updater: ${err.message}`, {
        operation: "autoUpdater",
        errorStack: err.stack,
      });
    });

    autoUpdater.on("download-progress", (progressObj) => {
      logger.debug(
        `Update download progress: ${progressObj.percent}% (${progressObj.transferred}/${progressObj.total} bytes)`,
        { operation: "autoUpdater" },
      );
    });

    autoUpdater.on("update-downloaded", (info) => {
      logger.info("Update downloaded", { operation: "autoUpdater" });
      dialog
        .showMessageBox(mainWindow, {
          type: "info",
          title: "Update Ready",
          message:
            "Uma nova versão foi baixada. O aplicativo será reiniciado para aplicar a atualização.",
          buttons: ["Reiniciar agora", "Depois"],
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
        logger.info("[AUTO] Starting auto sync", {
          operation: "autoSync",
          clientId: lastClient,
        });
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
          logger.info("[AUTO] Auto sync migration completed", {
            operation: "autoSync",
            clientId: lastClient,
          });
          currentStatus = `\n Sincronização automática finalizada para Cliente ID: ${lastClient} na pasta: ${lastPath}`;
          logger.info(
            `Sincronização automática finalizada para Cliente ID: ${lastClient} na pasta: ${lastPath}`,
          );

          // Start reverse sync automatically after normal sync
          logger.info("[AUTO] Starting auto reverse sync", {
            operation: "autoSync",
            clientId: lastClient,
          });
          const reverseSyncService = new ReverseSyncService({
            logger,
          });

          await reverseSyncService.start(lastPath, lastClient, (message) => {
            if (mainWindow && !mainWindow.isDestroyed()) {
              mainWindow.webContents.send(
                "reverseSync:progress",
                `[AUTO] ${message}`,
              );
            }
          });

          const finalStatus = reverseSyncService.getStatus();
          logger.info("[AUTO] Auto reverse sync completed", {
            operation: "autoSync",
            clientId: lastClient,
            tablesProcessed: finalStatus.tablesProcessed,
            recordsProcessed: finalStatus.recordsProcessed,
            conflictsLogged: finalStatus.conflictsLogged,
          });
          currentStatus += `\n Reverse sync finalizado: ${finalStatus.tablesProcessed} tabelas, ${finalStatus.recordsProcessed} registros.`;
          logger.info(
            `[AUTO] Reverse sync finalizado: ${finalStatus.tablesProcessed} tabelas, ${finalStatus.recordsProcessed} registros.`,
          );
          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send(
              "reverseSync:progress",
              `[AUTO] Reverse sync completed: ${finalStatus.tablesProcessed} tables processed, ${finalStatus.recordsProcessed} records synced, ${finalStatus.conflictsLogged} conflicts logged.`,
            );
          }
        } catch (err) {
          logger.error(`[AUTO] Auto sync error: ${err.message}`, {
            operation: "autoSync",
            clientId: lastClient,
            errorStack: err.stack,
          });
        }
      } else {
        logger.warn("[AUTO] Auto sync skipped: Missing configuration");
        currentStatus = `\n Configure sua chave api`;
      }
    };

    // 3. Set the interval for every 30 minutes thereafter

    mainWindow.webContents.on("did-finish-load", () => {
      runAutoSync();
    });

    setInterval(runAutoSync, 30 * 60 * 1000);
  });
}

// Ensure the app doesn't quit when all windows are closed
app.on("window-all-closed", (e) => {
  e.preventDefault();
});

// SECURITY: Graceful shutdown - close database pool and complete in-flight operations
app.on("before-quit", async (e) => {
  // Prevent quit temporarily
  e.preventDefault();

  logger.info("App shutting down", { operation: "shutdown" });

  // If sync is in progress, wait a bit for it to complete
  if (isSyncing) {
    logger.warn("App quit requested while sync is in progress", {
      operation: "shutdown",
    });
    // Wait up to 5 seconds for sync to complete
    const shutdownTimeout = setTimeout(() => {
      logger.warn("Forcing shutdown - sync timeout", { operation: "shutdown" });
      isSyncing = false;
      closeDatabase(logger).then(() => app.exit(0));
    }, 5000);

    // Check every 100ms if sync completed
    const checkInterval = setInterval(() => {
      if (!isSyncing) {
        clearInterval(checkInterval);
        clearTimeout(shutdownTimeout);
        closeDatabase(logger).then(() => app.exit(0));
      }
    }, 100);
  } else {
    // Sync not in progress, close cleanly
    await closeDatabase(logger);
    logger.info("App shutdown completed", { operation: "shutdown" });
    app.exit(0);
  }
});
