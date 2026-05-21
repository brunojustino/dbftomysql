const { getLastProcessedOn } = require("./SyncHistory");

/**
 * Format a Date to MySQL datetime format using LOCAL time (not UTC)
 * MySQL datetime format: YYYY-MM-DD HH:MM:SS
 * @param {Date|string} date - The date to format
 * @returns {string} MySQL datetime string in local time
 */
function toLocalMySQLDateTime(date) {
  if (!date) return null;
  const d = typeof date === "string" ? new Date(date) : date;
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const hours = String(d.getHours()).padStart(2, "0");
  const minutes = String(d.getMinutes()).padStart(2, "0");
  const seconds = String(d.getSeconds()).padStart(2, "0");
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}

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
    logger.info(`[DEBUG] getLastSyncTime for ${tableName}: ${lastSyncTime}`);
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
      // Convert to MySQL datetime format using LOCAL time
      const sqlDateTime = toLocalMySQLDateTime(lastSyncTime);
      query += ` AND (updatedAt > ? OR updatedAt IS NULL)`;
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

    let sqlDateTime = null;
    if (lastSyncTime) {
      sqlDateTime = toLocalMySQLDateTime(lastSyncTime);
      query += ` AND (updatedAt > ? OR updatedAt IS NULL)`;
      params.push(sqlDateTime);
    }

    logger.info(`[DEBUG] getTableRecordCount query: ${query}`);
    logger.info(
      `[DEBUG] getTableRecordCount params: ${JSON.stringify(params)}`,
    );
    logger.info(
      `[DEBUG] lastSyncTime was: ${lastSyncTime}, converted to: ${sqlDateTime}`,
    );

    const [rows] = await connection.execute(query, params);
    const count = rows[0].count || 0;
    logger.info(`[DEBUG] getTableRecordCount result: ${count} records`);
    return count;
  } catch (err) {
    logger.error(
      `Error getting record count from ${tableName}: ${err.message}`,
    );
    return 0;
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
