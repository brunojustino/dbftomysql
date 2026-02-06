/**
 * @param {string} tableName
 * @param {Array} records - DBF records
 * @param {number} clienteId - The ID of the client folder being processed
 */
function InsertQuery(tableName, records, clienteId) {
  if (!records || records.length === 0) return null;

  try {
    // 1. Process records: Inject clientId and handle Soft Deletes
    const processedRecords = records.map((rec, idx) => {
      try {
        // Check if the record is marked as deleted in DBF
        const isDeleted = rec[Symbol.for("DELETED")] || rec["@deleted"];

        // Create a new object to avoid mutating the original data
        const newRec = { ...rec };

        // Inject the client identifier
        if (isNaN(clienteId) || clienteId === null || clienteId === undefined) {
          throw new Error(
            `Invalid clienteId: ${clienteId} (type: ${typeof clienteId})`,
          );
        }
        newRec["cliente_id"] = clienteId;
        newRec["last_sync"] = new Date();

        // If deleted in DBF, set MySQL STATUS to 'I', otherwise keep as is or set 'A'
        if (isDeleted) {
          newRec["status"] = "I";
        }

        return newRec;
      } catch (recordErr) {
        throw new Error(
          `Error processing record ${idx}: ${
            recordErr.message
          } record=${JSON.stringify(rec)}`,
        );
      }
    });

    // 2. Extract column names from the first record
    // We filter out any internal parser keys (starting with @ or symbols)
    // and ensure we only have valid string column names
    if (!processedRecords[0]) {
      throw new Error("No records available to extract columns");
    }

    const allKeys = Object.keys(processedRecords[0]);

    // Extract valid columns (string keys, not internal @ keys, not empty)
    const columns = allKeys.filter(
      (key) =>
        typeof key === "string" && !key.startsWith("@") && key.trim() !== "",
    );

    if (columns.length === 0) {
      throw new Error(
        `No valid columns found in records. All keys: ${allKeys.join(", ")}`,
      );
    }

    // 3. Prepare the SQL template
    const escapedColumns = columns.map((col) => `\`${col}\``).join(", ");

    // Check if NaN snuck into the SQL
    if (escapedColumns.includes("NaN")) {
      throw new Error(
        `NaN found in escapedColumns! columns=${JSON.stringify(columns)}`,
      );
    }

    // Generate the UPSERT part so it updates existing records for that client
    // Don't include createdAt in updates, but ensure updatedAt is set to NOW()
    // const updatePart = columns
    //   .filter((col) => col !== "createdAt") // Exclude createdAt from updates
    //   .map((col) => {
    //     if (col === "updatedAt") {
    //       return "`updatedAt` = NOW()";
    //     }
    //     return `\`${col}\` = VALUES(\`${col}\`)`;
    //   })
    //   .join(", ");
    const updatePart = columns
      .filter(
        (col) => col !== "createdAt" && col !== "id" && col !== "cliente_id",
      )
      .map((col) => {
        if (col === "updatedAt") {
          // 1. Identify all "data" columns (exclude keys and timestamps)
          const dataCols = columns.filter(
            (c) =>
              ![
                "id",
                "cliente_id",
                "createdAt",
                "updatedAt",
                "last_sync",
              ].includes(c),
          );

          // 2. Create a comparison string: (`col1` <> VALUES(`col1`) OR `col2` <> VALUES(`col2`)...)
          const comparison = dataCols
            .map((c) => `\`${c}\` <=> VALUES(\`${c}\`) = 0`) // <=> is the NULL-safe equality operator
            .join(" OR ");

          // 3. Only set NOW() if something in the comparison is true
          return `\`updatedAt\` = IF(${comparison}, NOW(), \`updatedAt\`)`;
        }
        if (col === "last_sync") {
          return "`last_sync` = NOW()";
        }

        // Standard column update
        return `\`${col}\` = VALUES(\`${col}\`)`;
      })
      .join(", ");

    const sql = `INSERT INTO \`${tableName}\` (${escapedColumns}) 
                 VALUES ? 
                 ON DUPLICATE KEY UPDATE ${updatePart}`;

    // 4. Prepare the data array for mysql2 bulk insert [[val1, val2], [val1, val2]]
    const values = processedRecords.map((rec, idx) => {
      try {
        const rowValues = columns.map((col) => {
          const val = rec[col];
          // Convert NaN to null for MySQL compatibility
          if (typeof val === "number" && Number.isNaN(val)) {
            return null;
          }
          return val instanceof Date ? val : val;
        });

        return rowValues;
      } catch (valErr) {
        throw new Error(
          `Error extracting values from record ${idx}: ${valErr.message}`,
        );
      }
    });

    // Validate: ensure all rows have the correct number of values
    if (values.length > 0) {
      const expectedLength = columns.length;
      for (let i = 0; i < Math.min(values.length, 3); i++) {
        if (values[i].length !== expectedLength) {
          throw new Error(
            `Row ${i} has ${
              values[i].length
            } values but expected ${expectedLength}. Columns: ${columns.join(
              ", ",
            )}`,
          );
        }
      }
    }

    return {
      sql,
      columns,
      values,
      records: processedRecords,
    };
  } catch (err) {
    throw new Error(
      `InsertQuery error for table '${tableName}': ${err.message}`,
    );
  }
}

module.exports = InsertQuery;
