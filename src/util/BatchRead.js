const { performance } = require("perf_hooks");
const path = require("path");
const fs = require("fs").promises;
const tableKeys = require("../db/TablesKeys");
const CreateQuery = require("../db/CreateQuery");
const CreateTable = require("../db/CreateTable");
const InsertTable = require("../db/InsertTable");
const InsertQuery = require("../db/InsertQuery");
const { getDbfStructure, getDbfRecords } = require("./DbfFuncs");

async function createTable(
  db,
  tableName,
  fullPath,
  overrides = {},
  uniqueKey = null,
) {
  const structure = await getDbfStructure(fullPath);
  // const overrides = { DESCRICAO: 120 };
  const createQueryString = CreateQuery(
    tableName,
    structure,
    overrides,
    uniqueKey,
  );
  // console.log("Create Table Query:\n" + createQueryString);
  await CreateTable(db, tableName, createQueryString, structure, overrides);
  return createQueryString;
}

async function insertTable(
  db,
  tableName,
  query,
  onProgress = null,
  logError = null,
) {
  try {
    await InsertTable(db, tableName, query, onProgress, logError);
  } catch (err) {
    throw err;
  }
}

async function processFolder(db, folderPath, idCliente, logError = null) {
  try {
    const start = performance.now(); // Start timer
    console.log("DBF connection established.\n");
    // 1. Get all file names in the folder
    const files = await fs.readdir(folderPath);

    // 2. Filter for files ending in .dbf (case insensitive)
    const dbfFiles = files.filter((file) =>
      file.toLowerCase().endsWith(".dbf"),
    );

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
        const overallPercentage = (
          (processedCount / dbfFiles.length) *
          100
        ).toFixed(1);

        const uniqueKey = tableKeys[fileName.toLowerCase()] || null;
        createQuery = await createTable(db, fileName, fullPath, {}, uniqueKey);

        // Progress callback for individual file records
        const onProgress = (current, total) => {
          const filePercentage =
            total > 0 ? ((current / total) * 100).toFixed(1) : 0;
          process.stdout.write(
            `\r[Overall: ${overallPercentage}%] [File: ${filePercentage}%] Inserting records: ${current}/${total}`,
          );
        };

        // Get records and create insert query
        try {
          records = await getDbfRecords(fullPath);
        } catch (recErr) {
          throw new Error(`Failed to read records: ${recErr.message}`);
        }
        insertQuery = InsertQuery(fileName, records, idCliente);

        try {
          await insertTable(db, fileName, insertQuery, onProgress, logError);
        } catch (insertError) {
          throw insertError;
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

        await logError(errorDetails);
      }
    }
    const end = performance.now(); // End timer
    const seconds = (end - start) / 1000;
  } catch (err) {
    const errorMessage = `Could not process folder: ${err.message}`;
    await logError(errorMessage);
  }
}

module.exports = { processFolder };
