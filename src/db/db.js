const mysql = require("mysql2/promise");
require("dotenv").config();

const pool = mysql.createPool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT || 3307,
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
  database: process.env.DB_NAME,
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
    logger.error(`Error connecting to database: ${error.message}`);
    throw error;
  }
}

module.exports = connectToDatabase;
