const path = require("path");
const fs = require("fs").promises;

const logFilePath = path.join("log-errors.txt");
async function logError(message) {
  // Format timestamp in Brasilia timezone (America/Sao_Paulo)
  const formatter = new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const timestamp = formatter
    .format(new Date())
    .replace(/(\d+)\/(\d+)\/(\d+),\s(.*)/, "$3-$2-$1 $4");
  const logMessage = `[${timestamp}] ${message}\n`;
  try {
    await fs.appendFile(logFilePath, logMessage);
  } catch (err) {
    console.error("Failed to write to log file:", err);
  }
}

module.exports = logError;
