async function InsertTable(
  db,
  tableName,
  query,
  onProgress = null,
  logger = null,
) {
  if (!query) {
    return;
  }
  let currentIndex = 0;

  try {
    const { sql, columns, values, records } = query;

    const totalRecords = values.length;
    const batchSize = 500;
    let insertedTotal = 0;

    // Report initial progress
    if (onProgress) {
      onProgress(0, totalRecords);
    }

    // SECURITY: Wrap all batch operations in a transaction for data consistency
    await db.query("START TRANSACTION");

    try {
      // Process in batches
      for (let i = 0; i < totalRecords; i += batchSize) {
        const batchValues = values.slice(i, i + batchSize);
        currentIndex = i;
        try {
          const [info] = await db.query(sql, [batchValues]);
          insertedTotal += info.affectedRows;
        } catch (batchErr) {
          // Batch failed - log detailed error context
          logger?.error(
            `Batch insert failed at index ${i}, rolling back transaction`,
            {
              operation: "InsertTable",
              tableName,
              batchStart: i,
              batchSize: batchValues.length,
              totalProcessed: insertedTotal,
              error: batchErr.message,
            },
          );
          throw batchErr;
        }

        // Report progress after each batch
        if (onProgress) {
          onProgress(Math.min(i + batchSize, totalRecords), totalRecords);
        }
      }

      // All batches succeeded - commit the transaction
      await db.query("COMMIT");
      logger?.info(`InsertTable committed: ${insertedTotal} rows inserted`, {
        operation: "InsertTable",
        tableName,
        rowsInserted: insertedTotal,
      });
    } catch (err) {
      // Rollback on any error
      try {
        await db.query("ROLLBACK");
        logger?.info(`Transaction rolled back for table ${tableName}`, {
          operation: "InsertTable",
          tableName,
        });
      } catch (rollbackErr) {
        logger?.error(`Rollback failed: ${rollbackErr.message}`, {
          operation: "InsertTable",
          tableName,
          error: rollbackErr.message,
        });
      }
      throw err;
    }
  } catch (err) {
    const errorMessage = `InsertTable failed: ${err.message}`;

    // Create a custom error that includes the columns and sample values
    const error = new Error(errorMessage);
    error.columns = query.columns;
    error.totalRecords = query.values.length;
    error.value = query.values.slice(currentIndex - 1, currentIndex + 1);
    error.query = query.sql;
    error.values = query.values;
    error.records = query.records;

    if (logger) {
      if (typeof logger.error === "function") {
        logger.error(errorMessage, {
          operation: "InsertTable",
          tableName,
          totalRecords: query.values.length,
          errorStack: err.stack,
        });
      } else if (typeof logger === "function") {
        await logger(errorMessage);
      }
    }
    throw error;
  }
}

module.exports = InsertTable;
