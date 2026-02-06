const mysql = require("mysql2/promise");

const pool = mysql.createPool({
  host: process.env.VITE_DB_HOST,
  port: process.env.VITE_DB_PORT || 3307,
  user: process.env.VITE_DB_USER,
  password: process.env.VITE_DB_PASS,
  database: process.env.VITE_DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  enableKeepAlive: true,
  timezone: "-03:00",
});

async function connectToDatabase(logger) {
  try {
    const connection = await pool.getConnection();
    logger.info("Successfully connected to MySQL Pool!");
    return connection;
  } catch (error) {
    console.error("Error connecting to database:", error);
    console.log(
      "env: " + process.env.VITE_DB_HOST + " - " + process.env.VITE_DB_USER,
    );
    logger.error(`Error connecting to database: ${error.message}`);
    throw error;
  }
}

module.exports = connectToDatabase;
