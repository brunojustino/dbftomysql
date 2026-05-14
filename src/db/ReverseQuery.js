const { getLastProcessedOn } = require("./SyncHistory");

/**
 * Get the last time this table was synced from remote to local
 * @param {object} connection - MySQL connection
 * @param {string} tableName - Table name to query
 * @param {number} clientId - Client ID
 * @param {object} logger - Logger instance
 * @returns {Date|null} Last processed_on timestamp or null if never synced
 */
async function getLastSyncTime(connection, tableName, clientId, logger) {
  try {
    let lastSyncTime = await getLastProcessedOn(
      connection,
      tableName,
      clientId,
      logger,
    );
    if (!lastSyncTime) {
      const { getLastProcessed } = require("./SyncHistory");
      lastSyncTime = await getLastProcessed(
        connection,
        tableName,
        clientId,
        logger,
      );
    }
    return lastSyncTime;
  } catch (err) {
    logger.error(
      `Error getting last sync time for ${tableName}: ${err.message}`,
    );
    return null;
  }
}

/**
 * Get changed records from a table since last sync (with batching)
 * @param {object} connection - MySQL connection
 * @param {string} tableName - Table name
 * @param {Date|null} lastSyncTime - Last sync timestamp; if null, fetch all records
 * @param {number} batchSize - Records per batch (default 1000)
 * @param {number} offset - Offset for pagination
 * @param {object} logger - Logger instance
 * @returns {Array} Array of records or empty array if none found
 */
async function getChangedRecords(
  connection,
  tableName,
  lastSyncTime,
  clientId,
  batchSize = 1000,
  offset = 0,
  logger,
) {
  try {
    let query = `SELECT * FROM \`${tableName}\` WHERE cliente_id = ?`;
    const params = [clientId];

    if (lastSyncTime) {
      // Convert to MySQL datetime format if needed
      const sqlDateTime =
        typeof lastSyncTime === "string"
          ? lastSyncTime
          : new Date(lastSyncTime).toISOString().slice(0, 19).replace("T", " ");
      query += ` AND updatedAt > ?`;
      params.push(sqlDateTime);
    }

    query += ` ORDER BY id LIMIT ? OFFSET ?`;
    params.push(batchSize, offset);

    const [records] = await connection.execute(query, params);
    return records;
  } catch (err) {
    logger.error(
      `Error querying changed records from ${tableName}: ${err.message}`,
    );
    throw err;
  }
}

/**
 * Get total count of changed records since last sync
 * @param {object} connection - MySQL connection
 * @param {string} tableName - Table name
 * @param {Date|null} lastSyncTime - Last sync timestamp; if null, count all
 * @param {object} logger - Logger instance
 * @returns {number} Count of changed records
 */
async function getTableRecordCount(
  connection,
  tableName,
  lastSyncTime,
  clientId,
  logger,
) {
  try {
    let query = `SELECT COUNT(*) as count FROM \`${tableName}\` WHERE cliente_id = ?`;
    const params = [clientId];

    if (lastSyncTime) {
      const sqlDateTime =
        typeof lastSyncTime === "string"
          ? lastSyncTime
          : new Date(lastSyncTime).toISOString().slice(0, 19).replace("T", " ");
      query += ` AND updatedAt > ?`;
      params.push(sqlDateTime);
    }

    const [rows] = await connection.execute(query, params);
    return rows[0].count || 0;
  } catch (err) {
    logger.error(
      `Error getting record count from ${tableName}: ${err.message}`,
    );
    throw err;
  }
}

/**
 * Get all records from a table (fallback for first sync, with batching)
 * @param {object} connection - MySQL connection
 * @param {string} tableName - Table name
 * @param {number} batchSize - Records per batch (default 1000)
 * @param {number} offset - Offset for pagination
 * @param {object} logger - Logger instance
 * @returns {Array} Array of records
 */
async function getAllRecords(
  connection,
  tableName,
  batchSize = 1000,
  offset = 0,
  logger,
) {
  try {
    const query = `SELECT * FROM \`${tableName}\` ORDER BY id LIMIT ? OFFSET ?`;
    const [records] = await connection.execute(query, [batchSize, offset]);
    return records;
  } catch (err) {
    logger.error(
      `Error querying all records from ${tableName}: ${err.message}`,
    );
    throw err;
  }
}

module.exports = {
  getLastSyncTime,
  getChangedRecords,
  getTableRecordCount,
  getAllRecords,
};
