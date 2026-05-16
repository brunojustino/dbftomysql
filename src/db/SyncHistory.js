const createSyncQuery = `
  CREATE TABLE IF NOT EXISTS sync_history (
    id INT AUTO_INCREMENT PRIMARY KEY,
    file_name VARCHAR(255) NOT NULL,
    cliente_id INT NOT NULL,
    file_hash VARCHAR(32),
    last_processed DATETIME DEFAULT CURRENT_TIMESTAMP,
    last_processed_on DATETIME,
    UNIQUE KEY \`idx_file_client\` (\`file_name\`, \`cliente_id\`)
  ) ENGINE=InnoDB;
`;

const createConflictsQuery = `
  CREATE TABLE IF NOT EXISTS sync_conflicts (
    id INT AUTO_INCREMENT PRIMARY KEY,
    table_name VARCHAR(255) NOT NULL,
    record_id VARCHAR(255) NOT NULL,
    cliente_id INT NOT NULL,
    local_data LONGTEXT NOT NULL COMMENT 'JSON of local record',
    remote_data LONGTEXT NOT NULL COMMENT 'JSON of remote record',
    conflict_type VARCHAR(50) DEFAULT 'last-write-wins',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    resolved BOOLEAN DEFAULT false,
    INDEX \`idx_table_client\` (\`table_name\`, \`cliente_id\`),
    INDEX \`idx_resolved\` (\`resolved\`)
  ) ENGINE=InnoDB;
`;

async function CreateSyncHistoryTable(db, logger) {
  try {
    // 1. Check if table exists in the current database
    const [tables] = await db.execute(`SHOW TABLES LIKE 'sync_history'`);
    const tableExists = tables.length > 0;

    if (!tableExists) {
      // 2. If it doesn't exist, create it
      await db.execute(createSyncQuery);
      console.log(`Table "sync_history" created successfully!`);
    } else {
      // 3. If it DOES exist, run the structure update logic
      console.log(`Table "sync_history" already exists.`);
      await ensureSyncHistoryColumns(db, logger);
    }

    // Also create conflicts table
    await CreateSyncConflictsTable(db, logger);
  } catch (err) {
    console.error("Critical error in CreateTable:", err.message);
    logger.error(`Critical error in CreateTable: ${err.message}`);
  }
}

async function ensureSyncHistoryColumns(db, logger) {
  try {
    // Check if last_processed_on column exists
    const [columns] = await db.execute(
      `SHOW COLUMNS FROM sync_history LIKE 'last_processed_on'`,
    );

    if (columns.length === 0) {
      // Add the column if it doesn't exist
      await db.execute(
        `ALTER TABLE sync_history ADD COLUMN last_processed_on DATETIME`,
      );
      console.log(`Column "last_processed_on" added to sync_history table.`);
      logger.info(`Column "last_processed_on" added to sync_history table.`);
    }

    // Also ensure file_hash is nullable for reverse sync
    await db.execute(
      `ALTER TABLE sync_history MODIFY COLUMN file_hash VARCHAR(32) NULL`,
    );
  } catch (err) {
    console.error("Error ensuring sync_history columns:", err.message);
    logger.error(`Error ensuring sync_history columns: ${err.message}`);
  }
}

async function CreateSyncConflictsTable(db, logger) {
  try {
    const [tables] = await db.execute(`SHOW TABLES LIKE 'sync_conflicts'`);
    const tableExists = tables.length > 0;

    if (!tableExists) {
      await db.execute(createConflictsQuery);
      console.log(`Table "sync_conflicts" created successfully!`);
      logger.info(`Table "sync_conflicts" created successfully!`);
    } else {
      console.log(`Table "sync_conflicts" already exists.`);
    }
  } catch (err) {
    console.error("Critical error creating sync_conflicts table:", err.message);
    logger.error(
      `Critical error creating sync_conflicts table: ${err.message}`,
    );
  }
}

// Update the hash after successful migration (LOCAL → REMOTE push)
async function updateSuccessfulMigration(db, file, clientId, currentHash) {
  try {
    await db.query(
      `INSERT INTO sync_history (file_name, cliente_id, file_hash, last_processed) 
        VALUES (?, ?, ?, NOW()) ON DUPLICATE KEY UPDATE file_hash = VALUES(file_hash), last_processed = NOW()`,
      [file, clientId, currentHash],
    );
  } catch (err) {
    console.error("Failed to update sync history:", err.message);
  }
}

// Update after successful REMOTE → LOCAL sync (pull)
async function updateReverseSyncTime(db, file, clientId, logger) {
  try {
    await db.execute(
      `INSERT INTO sync_history (file_name, cliente_id, last_processed_on) 
        VALUES (?, ?, NOW()) ON DUPLICATE KEY UPDATE last_processed_on = NOW()`,
      [file, clientId],
    );
  } catch (err) {
    console.error("Failed to update reverse sync history:", err.message);
    logger.error(`Failed to update reverse sync history: ${err.message}`);
    throw err;
  }
}

// Get last sync time for LOCAL → REMOTE (push)
async function getLastProcessed(db, file, clientId, logger) {
  try {
    const [rows] = await db.execute(
      `SELECT last_processed FROM sync_history 
       WHERE file_name = ? AND cliente_id = ?`,
      [file, clientId],
    );
    return rows.length > 0 ? rows[0].last_processed : null;
  } catch (err) {
    console.error("Failed to get last processed time:", err.message);
    logger.error(`Failed to get last processed time: ${err.message}`);
    return null;
  }
}

// Get last sync time for REMOTE → LOCAL (pull)
async function getLastProcessedOn(db, file, clientId, logger) {
  try {
    const [rows] = await db.execute(
      `SELECT last_processed_on FROM sync_history 
       WHERE file_name = ? AND cliente_id = ?`,
      [file, clientId],
    );
    return rows.length > 0 ? rows[0].last_processed_on : null;
  } catch (err) {
    console.error("Failed to get last processed_on time:", err.message);
    logger.error(`Failed to get last processed_on time: ${err.message}`);
    return null;
  }
}

// Log conflict before overwriting record (last-write-wins strategy with audit trail)
async function logConflict(
  db,
  tableName,
  recordId,
  clientId,
  localData,
  remoteData,
  logger,
) {
  try {
    const localDataJson =
      typeof localData === "string" ? localData : JSON.stringify(localData);
    const remoteDataJson =
      typeof remoteData === "string" ? remoteData : JSON.stringify(remoteData);

    await db.execute(
      `INSERT INTO sync_conflicts (table_name, record_id, cliente_id, local_data, remote_data, conflict_type) 
       VALUES (?, ?, ?, ?, ?, 'last-write-wins')`,
      [tableName, recordId, clientId, localDataJson, remoteDataJson],
    );
  } catch (err) {
    console.error("Failed to log conflict:", err.message);
    logger.error(
      `Failed to log conflict for ${tableName}.${recordId}: ${err.message}`,
    );
    throw err;
  }
}

module.exports = {
  CreateSyncHistoryTable,
  updateSuccessfulMigration,
  updateReverseSyncTime,
  getLastProcessed,
  getLastProcessedOn,
  logConflict,
  ensureSyncHistoryColumns,
  CreateSyncConflictsTable,
};
