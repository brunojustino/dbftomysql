const { performance } = require("perf_hooks");
const path = require("path");
const fs = require("fs"); // Standard fs for sync operations like hashing
const fsPromises = require("fs").promises;
const crypto = require("crypto");
const tableKeys = require("../db/TablesKeys");
const CreateQuery = require("../db/CreateQuery");
const CreateTable = require("../db/CreateTable");
const InsertTable = require("../db/InsertTable");
const InsertQuery = require("../db/InsertQuery");
const { getDbfStructure, getDbfRecords } = require("./DbfFuncs");
const TableNames = require("../db/TableNames");
const { updateSuccessfulMigration } = require("../db/SyncHistory");

async function createTable(
  db,
  tableName,
  fullPath,
  overrides = {},
  uniqueKey = null,
  logger,
) {
  const structure = await getDbfStructure(fullPath);
  // const overrides = { DESCRICAO: 120 };
  const createQueryString = CreateQuery(
    tableName,
    structure,
    overrides,
    uniqueKey,
    logger,
  );
  // console.log("Create Table Query:\n" + createQueryString);
  await CreateTable(
    db,
    tableName,
    createQueryString,
    structure,
    overrides,
    logger,
  );
  return createQueryString;
}

async function insertTable(db, tableName, query, onProgress = null, logger) {
  try {
    await InsertTable(db, tableName, query, onProgress, logger);
  } catch (err) {
    logger.error(`InsertTable Error: ${err.message}`);
  }
}

function getFileHash(filePath) {
  const fileBuffer = fs.readFileSync(filePath);
  return crypto.createHash("md5").update(fileBuffer).digest("hex");
}

async function processFolder(
  db,
  folderPath,
  idCliente,
  logger,
  progressCallback,
) {
  try {
    const start = performance.now(); // Start timer
    console.log("DBF connection established.\n");
    // 1. Get all file names in the folder
    let files;
    try {
      files = await fsPromises.readdir(folderPath);
    } catch (readErr) {
      const errorMessage = `Failed to read directory: ${readErr.message}`;
      logger.error(errorMessage);
      throw new Error(errorMessage);
    }

    // 2. Filter for files ending in .dbf (case insensitive)
    const dbfFiles = files.filter((file) => {
      const isDbf = file.toLowerCase().endsWith(".dbf");
      const fileNameOnly = path
        .basename(file, path.extname(file))
        .toLowerCase();
      return isDbf && TableNames.includes(fileNameOnly);
    });

    // 3. Loop through them
    let processedCount = 0;
    for (const file of dbfFiles) {
      let createQuery = null;
      let insertQuery = null;
      let records = null;
      try {
        const fullPath = path.join(folderPath, file);
        const fileName = file.substring(0, file.length - 4);

        processedCount++;
        if (progressCallback)
          progressCallback(`Processando arquivo: ${fileName}`);
        logger.info(`Processando arquivo: ${fileName}`);
        const overallPercentage = (
          (processedCount / dbfFiles.length) *
          100
        ).toFixed(1);

        // Inside your file loop:
        const currentHash = getFileHash(fullPath);
        try {
          const [history] = await db.query(
            "SELECT file_hash FROM sync_history WHERE file_name = ? AND cliente_id = ?",
            [fileName, idCliente],
          );

          if (history.length > 0 && history[0].file_hash === currentHash) {
            console.log(`Skipping ${file} - No changes detected.`);
            if (progressCallback)
              progressCallback(`Skipping ${file} - No changes detected.`);
            continue;
          }
        } catch (hashErr) {
          logger.error(
            `Failed to fetch sync history for ${fileName}: ${hashErr.message}`,
          );
        }

        const uniqueKey = tableKeys[fileName.toLowerCase()] || null;
        createQuery = await createTable(
          db,
          fileName,
          fullPath,
          {},
          uniqueKey,
          logger,
        );

        // Progress callback for individual file records
        const onProgress = (current, total) => {
          const filePercentage =
            total > 0 ? ((current / total) * 100).toFixed(1) : 0;
          process.stdout.write(
            `\r[Overall: ${overallPercentage}%] [File: ${filePercentage}%] Inserting records: ${current}/${total}`,
          );
          if (progressCallback)
            progressCallback(
              `\r[Overall: ${overallPercentage}%] [File: ${filePercentage}%] Inserting records: ${current}/${total}`,
            );
        };

        // Get records and create insert query
        try {
          records = await getDbfRecords(fullPath);
        } catch (recErr) {
          logger.error(`Failed to read records: ${recErr.message}`);
        }
        insertQuery = InsertQuery(fileName, records, idCliente);

        try {
          await insertTable(db, fileName, insertQuery, onProgress, logger);
          // After successful insert, update sync history
          await updateSuccessfulMigration(
            db,
            fileName,
            idCliente,
            currentHash,
          ).catch((updateErr) => {
            logger.error(
              `Failed to update sync history for ${fileName}: ${updateErr.message}`,
            );
            console.error(
              `Failed to update sync history for ${fileName}: ${updateErr.message}`,
            );
            if (progressCallback)
              progressCallback(
                `Failed to update sync history for ${fileName}: ${updateErr.message}`,
              );
          });
          process.stdout.write("\n"); // New line after progress
        } catch (insertError) {
          logger.error(`Inser Error ${fileName}: ${insertError.message}`);
        }
      } catch (tableError) {
        // Log error with queries and continue with next file
        let errorDetails = `Error processing file '${file}': ${tableError.message}`;

        if (createQuery) {
          errorDetails += `\n--- CREATE QUERY ---\n${createQuery}`;
        }

        if (insertQuery && typeof insertQuery === "object" && insertQuery.sql) {
          errorDetails += `\n--- INSERT QUERY ---\n${insertQuery.sql}`;
        }

        // Add columns info if available from InsertTable error
        if (tableError.columns) {
          errorDetails += `\n--- COLUMNS ATTEMPTED ---\n${tableError.columns.join(
            ", ",
          )}`;
        }

        // Add sample values if available from InsertTable error
        if (tableError.sampleValues && tableError.sampleValues.length > 0) {
          errorDetails += `\n--- SAMPLE VALUES (first 3 records) ---\n`;
          tableError.sampleValues.forEach((rowValues, idx) => {
            const rowStr = tableError.columns
              .map((col, colIdx) => `${col}: ${rowValues[colIdx]}`)
              .join(", ");
            errorDetails += `Record ${idx + 1}: ${rowStr}\n`;
          });
        }

        // Add error values if available (batch values that caused the error)
        if (tableError.value && tableError.value.length > 0) {
          errorDetails += `\n--- ERROR BATCH VALUES ---\n`;
          tableError.value.forEach((rowValues, idx) => {
            const rowStr = tableError.columns
              .map((col, colIdx) => `${col}: ${rowValues[colIdx]}`)
              .join(", ");
            errorDetails += `Record ${idx + 1}: ${rowStr}\n`;
          });
        }

        if (records) {
          errorDetails += `\n--- INSERT VALUES COUNT ---\n${records.length} records`;
        }

        if (progressCallback) progressCallback(errorDetails);
        logger.error(errorDetails);
      }
    }
    const end = performance.now(); // End timer
    const seconds = (end - start) / 1000;
    logger.info(`Processo finalizado em: ${seconds.toFixed(2)} segundos.`);
  } catch (err) {
    const errorMessage = `Could not process folder: ${err.message}`;
    logger.error(errorMessage);
    throw new Error(errorMessage);
  }
}

module.exports = { processFolder };
