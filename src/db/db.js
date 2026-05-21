const mysql = require("mysql2/promise");

let pool;

// const pool = mysql.createPool({
//   host: process.env.VITE_DB_HOST,
//   port: process.env.VITE_DB_PORT || 3307,
//   user: process.env.VITE_DB_USER,
//   password: process.env.VITE_DB_PASS,
//   database: process.env.VITE_DB_NAME,
//   waitForConnections: true,
//   connectionLimit: 10,
//   queueLimit: 0,
//   enableKeepAlive: true,
//   timezone: "-03:00",
// });

function initDb({ host, port = 3307, user, password, database }) {
  if (pool) return pool; // reuse if already initialized

  pool = mysql.createPool({
    host,
    port,
    user,
    password,
    database,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 100, // SECURITY: Bounded queue prevents memory exhaustion
    enableKeepAlive: true,
    keepAliveInitialDelayMs: 30000, // Keep alive every 30s
    connectionTimeout: 30000, // 30s connection timeout
    enableTimeout: true,
    timeout: 40000, // 40s query timeout
    timezone: "-03:00",
  });

  return pool;
}

async function connectToDatabase(logger) {
  if (!pool) {
    throw new Error("Database pool not initialized. Call initDb() first.");
  }
  try {
    const connection = await pool.getConnection();
    logger.info("Successfully connected to MySQL Pool!");
    return connection;
  } catch (error) {
    logger.error(`Error connecting to database: ${error.message}`, {
      operation: "connectToDatabase",
      errorStack: error.stack,
    });
    throw error;
  }
}

/**
 * Close the database pool gracefully
 * @param {object} logger - Logger instance
 */
async function closeDatabase(logger) {
  if (pool) {
    try {
      await pool.end();
      logger?.info("Database pool closed successfully");
      pool = null;
    } catch (error) {
      logger?.error(`Error closing database pool: ${error.message}`, {
        operation: "closeDatabase",
        errorStack: error.stack,
      });
    }
  }
}

module.exports = { initDb, connectToDatabase, closeDatabase };
