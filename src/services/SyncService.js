const { connectToDatabase } = require("../db/db");
const { processFolder } = require("../util/BatchRead");
const { CreateSyncHistoryTable } = require("../db/SyncHistory");
const logger = require("../util/logger");

class SyncService {
  constructor(options = {}) {
    this.db = options.db || { connectToDatabase };
    this.processFolder = options.processFolder || processFolder;
    this.createSyncHistoryTable =
      options.createSyncHistoryTable || CreateSyncHistoryTable;
    this.logger = options.logger || logger;

    this.state = {
      isRunning: false,
      status: "idle",
      progressMessage: "",
      lastError: null,
      lastRunAt: null,
      lastDuration: null,
    };

    this._cancelRequested = false;
  }

  getStatus() {
    return { ...this.state };
  }

  requestCancel() {
    if (!this.state.isRunning) {
      return { success: false, message: "No active migration to cancel." };
    }
    this._cancelRequested = true;
    this.state.status = "cancelling";
    this._emitStatus("Cancellation requested");
    return { success: true };
  }

  async start(folderPath, clientId, progressCallback = () => {}) {
    if (!folderPath) {
      return {
        success: false,
        errorCode: "NO_FOLDER",
        message: "folderPath is required.",
      };
    }

    if (!clientId) {
      return {
        success: false,
        errorCode: "NO_CLIENT",
        message: "clientId is required.",
      };
    }

    if (this.state.isRunning) {
      return {
        success: false,
        errorCode: "ALREADY_RUNNING",
        message: "Migration is already running.",
      };
    }

    this.state.isRunning = true;
    this.state.status = "starting";
    this.state.lastError = null;
    this._cancelRequested = false;
    const startedAt = Date.now();

    const report = (message) => {
      this.state.progressMessage = message;
      progressCallback(message);
      logger.info(`SyncService: ${message}`);

      if (this._cancelRequested) {
        throw new Error("Migration cancelled by user.");
      }
    };

    let connection;

    try {
      report("Connecting to database...");
      connection = await this.db.connectToDatabase(this.logger);

      report("Ensuring sync_history table exists...");
      await this.createSyncHistoryTable(connection, this.logger);

      this.state.status = "running";
      report("Starting folder processing...");

      await this.processFolder(
        connection,
        folderPath,
        clientId,
        this.logger,
        report,
      );

      this.state.status = "completed";
      this.state.lastRunAt = new Date().toISOString();
      this.state.lastDuration = `${((Date.now() - startedAt) / 1000).toFixed(2)}s`;
      report("Sync process completed successfully.");

      return {
        success: true,
        data: { folderPath, clientId, lastRunAt: this.state.lastRunAt },
      };
    } catch (error) {
      this.state.lastError = error.message;
      this.state.status = this._cancelRequested ? "cancelled" : "failed";
      logger.error(`SyncService.start failed: ${error.message}`);
      this._emitStatus(`Error: ${error.message}`);
      return {
        success: false,
        errorCode: "SYNC_FAILED",
        message: error.message,
      };
    } finally {
      if (connection && typeof connection.release === "function") {
        connection.release();
      }
      this.state.isRunning = false;
      if (this.state.status !== "completed") {
        this.state.lastRunAt = new Date().toISOString();
        this.state.lastDuration = `${((Date.now() - startedAt) / 1000).toFixed(2)}s`;
      }
    }
  }

  _emitStatus(message) {
    this.state.progressMessage = message;
  }
}

module.exports = SyncService;
