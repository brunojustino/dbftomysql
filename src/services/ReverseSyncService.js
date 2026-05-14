const { connectToDatabase } = require("../db/db");
const {
  getLastSyncTime,
  getChangedRecords,
  getTableRecordCount,
} = require("../db/ReverseQuery");
const { updateReverseSyncTime, logConflict } = require("../db/SyncHistory");
const {
  writeJsonFile,
  validateAndConstructPath,
} = require("../util/JsonWriter");
const TableNames = require("../db/TableNames");
const logger = require("../util/logger");

class ReverseSyncService {
  constructor(options = {}) {
    this.db = options.db || { connectToDatabase };
    this.getLastSyncTime = options.getLastSyncTime || getLastSyncTime;
    this.getChangedRecords = options.getChangedRecords || getChangedRecords;
    this.getTableRecordCount =
      options.getTableRecordCount || getTableRecordCount;
    this.updateReverseSyncTime =
      options.updateReverseSyncTime || updateReverseSyncTime;
    this.logConflict = options.logConflict || logConflict;
    this.writeJsonFile = options.writeJsonFile || writeJsonFile;
    this.validateAndConstructPath =
      options.validateAndConstructPath || validateAndConstructPath;
    this.logger = options.logger || logger;
    this.tableNames = options.tableNames || TableNames;

    this.state = {
      isRunning: false,
      status: "idle",
      progressMessage: "",
      lastError: null,
      lastRunAt: null,
      lastDuration: null,
      tablesProcessed: 0,
      recordsProcessed: 0,
      conflictsLogged: 0,
      currentTable: null,
    };

    this._cancelRequested = false;
  }

  getStatus() {
    return { ...this.state };
  }

  requestCancel() {
    if (!this.state.isRunning) {
      return {
        success: false,
        message: "No active reverse sync to cancel.",
      };
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
        message: "Reverse sync is already running.",
      };
    }

    this.state.isRunning = true;
    this.state.status = "starting";
    this.state.lastError = null;
    this.state.tablesProcessed = 0;
    this.state.recordsProcessed = 0;
    this.state.conflictsLogged = 0;
    this._cancelRequested = false;
    const startedAt = Date.now();

    const report = (message) => {
      this.state.progressMessage = message;
      progressCallback(message);
      this.logger.info(`ReverseSyncService: ${message}`);

      if (this._cancelRequested) {
        throw new Error("Reverse sync cancelled by user.");
      }
    };

    let connection;

    try {
      report("Connecting to database for reverse sync...");
      connection = await this.db.connectToDatabase(this.logger);

      report("Starting reverse sync for all tables...");
      this.state.status = "running";

      const clientIdNum = parseInt(clientId, 10);
      await this._processAllTables(
        connection,
        folderPath,
        clientIdNum,
        progressCallback,
        report,
      );

      this.state.status = "completed";
      this.state.lastRunAt = new Date().toISOString();
      this.state.lastDuration = `${((Date.now() - startedAt) / 1000).toFixed(2)}s`;
      report("Reverse sync process completed successfully.");

      return {
        success: true,
        data: {
          folderPath,
          clientId,
          tablesProcessed: this.state.tablesProcessed,
          recordsProcessed: this.state.recordsProcessed,
          conflictsLogged: this.state.conflictsLogged,
          lastRunAt: this.state.lastRunAt,
        },
      };
    } catch (error) {
      this.state.lastError = error.message;
      this.state.status = this._cancelRequested ? "cancelled" : "failed";
      this.logger.error(`ReverseSyncService.start failed: ${error.message}`);
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

  async _processAllTables(
    connection,
    folderPath,
    clientId,
    progressCallback,
    report,
  ) {
    const BATCH_SIZE = 1000;

    for (const tableName of this.tableNames) {
      if (this._cancelRequested) {
        throw new Error("Reverse sync cancelled by user.");
      }

      this.state.currentTable = tableName;

      try {
        // Get last sync time for this table
        const lastSyncTime = await this.getLastSyncTime(
          connection,
          tableName,
          clientId,
          this.logger,
        );

        // Get count of changed records
        const recordCount = await this.getTableRecordCount(
          connection,
          tableName,
          lastSyncTime,
          clientId,
          this.logger,
        );

        if (recordCount === 0) {
          // Skip tables with no changes
          report(`${tableName}: No changes, skipping.`);
          continue;
        }

        report(
          `${tableName}: Processing ${recordCount} changed records in batches of ${BATCH_SIZE}...`,
        );

        // Fetch and write records in batches
        let allRecords = [];
        let offset = 0;
        let batchNumber = 1;

        while (offset < recordCount) {
          if (this._cancelRequested) {
            throw new Error("Reverse sync cancelled by user.");
          }

          const records = await this.getChangedRecords(
            connection,
            tableName,
            lastSyncTime,
            clientId,
            BATCH_SIZE,
            offset,
            this.logger,
          );

          if (records.length === 0) {
            break; // No more records
          }

          allRecords = allRecords.concat(records);
          offset += records.length;
          batchNumber++;

          report(
            `${tableName}: Loaded batch ${batchNumber - 1} (${offset}/${recordCount} records).`,
          );
        }

        if (allRecords.length > 0) {
          // Write JSON file
          const jsonFileName = `${tableName}.json`;
          const jsonFilePath = this.validateAndConstructPath(
            folderPath,
            jsonFileName,
            this.logger,
          );

          await this.writeJsonFile(jsonFilePath, allRecords, this.logger);

          // Update sync history only after successful JSON write
          await this.updateReverseSyncTime(
            connection,
            tableName,
            clientId,
            this.logger,
          );

          this.state.tablesProcessed++;
          this.state.recordsProcessed += allRecords.length;
          report(
            `${tableName}: Completed (${allRecords.length} records written to JSON).`,
          );
        }
      } catch (err) {
        this.logger.error(
          `Error processing table ${tableName}: ${err.message}`,
        );
        report(`${tableName}: Error - ${err.message}`);
        // Continue with next table instead of failing entirely
        continue;
      }
    }
  }

  _emitStatus(message) {
    this.state.progressMessage = message;
  }
}

module.exports = ReverseSyncService;
