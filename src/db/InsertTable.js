async function InsertTable(
  db,
  tableName,
  query,
  onProgress = null,
  logError = null
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

    // Process in batches
    for (let i = 0; i < totalRecords; i += batchSize) {
      const batchValues = values.slice(i, i + batchSize);
      currentIndex = i;
      try {
        const [info] = await db.query(sql, [batchValues]);
        insertedTotal += info.affectedRows;
      } catch (batchErr) {
        // Batch failed - test each row individually to find the bad one
        // Binary search to find bad row quickly

        let left = 0;
        let right = batchValues.length - 1;
        let badRowIndex = -1;

        while (left <= right) {
          const mid = Math.floor((left + right) / 2);
          const testBatch = batchValues.slice(left, mid + 1);

          try {
            await db.query(sql, [testBatch]);
            left = mid + 1;
          } catch (e) {
            badRowIndex = mid;
            right = mid - 1;
          }
        }

        throw batchErr;
      }

      // Report progress after each batch
      if (onProgress) {
        onProgress(Math.min(i + batchSize, totalRecords), totalRecords);
      }
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

    if (logError) {
      await logError(errorMessage);
    }
    throw error;
  }
}

module.exports = InsertTable;
