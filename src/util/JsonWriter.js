const path = require("path");
const fsPromises = require("fs").promises;

/**
 * Write records to a JSON file with metadata
 * @param {string} filePath - Full path where JSON file will be written
 * @param {Array} records - Array of record objects
 * @param {object} logger - Logger instance
 * @returns {Promise<void>}
 */
async function writeJsonFile(filePath, records, logger) {
  try {
    if (!Array.isArray(records)) {
      throw new Error("Records must be an array");
    }

    // Filter out id and cliente_id fields
    const filteredRecords = records.map((record) => {
      const filtered = { ...record };
      delete filtered.id;
      delete filtered.cliente_id;
      return filtered;
    });

    let existingRecords = [];
    let fileExists = false;

    try {
      const existingContent = await fsPromises.readFile(filePath, "utf8");
      const existingData = JSON.parse(existingContent);
      if (Array.isArray(existingData.records)) {
        existingRecords = existingData.records;
        fileExists = true;
      }
    } catch (readErr) {
      // File does not exist or is unreadable/invalid — start fresh
      fileExists = false;
    }

    const allRecords = fileExists
      ? existingRecords.concat(filteredRecords)
      : filteredRecords;

    // Prepare metadata
    const jsonData = {
      timestamp: new Date().toISOString(),
      recordCount: allRecords.length,
      records: allRecords,
    };

    // Convert to JSON string with 2-space indentation for readability
    const jsonString = JSON.stringify(jsonData, null, 2);

    // Write to file (creates or overwrites)
    await fsPromises.writeFile(filePath, jsonString, "utf8");

    if (fileExists) {
      logger.info(
        `JSON file appended successfully: ${filePath} (${existingRecords.length} existing + ${filteredRecords.length} new = ${allRecords.length} records)`,
      );
    } else {
      logger.info(
        `JSON file written successfully: ${filePath} (${filteredRecords.length} records)`,
      );
    }
  } catch (err) {
    logger.error(`Failed to write JSON file at ${filePath}: ${err.message}`);
    throw err;
  }
}

/**
 * Safely construct and validate file path to prevent directory traversal attacks
 * @param {string} folderPath - Base folder path
 * @param {string} fileName - File name (typically table name + .json)
 * @param {object} logger - Logger instance
 * @returns {string} Safe, resolved file path
 * @throws {Error} If path validation fails
 */
function validateAndConstructPath(folderPath, fileName, logger) {
  try {
    // Sanitize fileName - only allow alphanumeric, underscores, hyphens
    if (!/^[a-zA-Z0-9_-]+\.json$/.test(fileName)) {
      throw new Error(
        `Invalid file name: ${fileName}. Only alphanumeric, underscore, hyphen allowed.`,
      );
    }

    // Resolve full path and normalize
    const fullPath = path.resolve(path.join(folderPath, fileName));
    const basePath = path.resolve(folderPath);

    // Ensure the resolved path is within the base folder (prevent directory traversal)
    if (!fullPath.startsWith(basePath)) {
      throw new Error(
        `Path traversal detected: ${fileName} attempts to escape base folder`,
      );
    }

    return fullPath;
  } catch (err) {
    logger.error(`Path validation error: ${err.message}`);
    throw err;
  }
}

module.exports = {
  writeJsonFile,
  validateAndConstructPath,
};
