const log = require("electron-log");
const path = require("path");
const { app } = require("electron");

// Get the log directory (electron-log uses app data by default)
const logDir = app ? app.getPath("userData") : process.cwd();
const logFile = path.join(logDir, "app.log");

// Configure electron-log with proper file path
log.transports.file.level = "info";
log.transports.file.format = "[{y}-{m}-{d} {h}:{i}:{s}.{ms}] [{level}] {text}";
log.transports.file.maxSize = 5242880; // 5MB rotation
log.transports.file.file = logFile;
log.transports.console.level = false; // Disable console to prevent duplication

/**
 * Structured logging function that masks sensitive data
 * @param {string} level - 'info', 'warn', 'error'
 * @param {string} message - Log message
 * @param {object} context - Additional context (operation, clientId, etc.) - NO CREDENTIALS
 */
function structuredLog(level, message, context = {}) {
  const logObject = {
    timestamp: new Date().toISOString(),
    level,
    message,
    ...context,
  };

  log[level](JSON.stringify(logObject));
}

module.exports = {
  info: (msg, context) => {
    if (context) {
      structuredLog("info", msg, context);
    } else {
      log.info(msg);
    }
  },
  warn: (msg, context) => {
    if (context) {
      structuredLog("warn", msg, context);
    } else {
      log.warn(msg);
    }
  },
  error: (msg, context) => {
    if (context) {
      structuredLog("error", msg, context);
    } else {
      log.error(msg);
    }
  },
  debug: (msg, context) => {
    if (context) {
      structuredLog("debug", msg, context);
    } else {
      log.debug(msg);
    }
  },
  getLogPath: () => {
    // Return the actual electron-log file path, which may differ from our configured path
    // electron-log stores it in transports.file.file or uses the default location
    return log.transports.file.file || logFile;
  },
};
