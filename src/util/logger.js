const fs = require("fs");
const path = require("path");
const { app } = require("electron");

// Get the path where Electron saves app data (C:\Users\...\AppData\Roaming\YourApp)
// If we are running in Node (utility tests), fallback to current dir
const logDir = app ? app.getPath("userData") : process.cwd();
const logFile = path.join(logDir, "log.log");

function writeLog(level, message) {
  const timestamp = new Date()
    .toISOString()
    .replace(/T/, " ")
    .replace(/\..+/, "");
  const logEntry = `[${timestamp}] [${level.toUpperCase()}] ${message}\n`;

  // Append to file (creates it if it doesn't exist)
  fs.appendFile(logFile, logEntry, (err) => {
    if (err) console.error("Falha ao escrever no log:", err);
  });

  // Also print to console for development
  console.log(logEntry.trim());
}

module.exports = {
  info: (msg) => writeLog("info", msg),
  warn: (msg) => writeLog("warn", msg),
  error: (msg) => writeLog("error", msg),
  getLogPath: () => logFile,
};
