const mysql = require("mysql2/promise");
require("dotenv").config();

async function connectToDatabase() {
  try {
    const pool = mysql.createPool({
      host: process.env.DB_HOST,
      user: process.env.DB_USER,
      password: process.env.DB_PASS,
      database: process.env.DB_NAME,
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0,
      enableKeepAlive: true,
      timezone: "-03:00",
    });

    console.log("Successfully connected to MySQL Pool!");
    return pool;
  } catch (error) {
    console.error("Error connecting to database:", error);
  }
}

module.exports = connectToDatabase;
