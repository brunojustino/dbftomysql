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
            `Invalid clienteId: ${clienteId} (type: ${typeof clienteId})`
          );
        }
        newRec["cliente_id"] = clienteId;

        // If deleted in DBF, set MySQL STATUS to 'I', otherwise keep as is or set 'A'
        if (isDeleted) {
          newRec["STATUS"] = "I";
        }

        return newRec;
      } catch (recordErr) {
        throw new Error(
          `Error processing record ${idx}: ${
            recordErr.message
          } record=${JSON.stringify(rec)}`
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
        typeof key === "string" && !key.startsWith("@") && key.trim() !== ""
    );

    if (columns.length === 0) {
      throw new Error(
        `No valid columns found in records. All keys: ${allKeys.join(", ")}`
      );
    }

    // 3. Prepare the SQL template
    const escapedColumns = columns.map((col) => `\`${col}\``).join(", ");

    // Check if NaN snuck into the SQL
    if (escapedColumns.includes("NaN")) {
      throw new Error(
        `NaN found in escapedColumns! columns=${JSON.stringify(columns)}`
      );
    }

    // Generate the UPSERT part so it updates existing records for that client
    // Don't include createdAt in updates, but ensure updatedAt is set to NOW() in Brasilia timezone
    const updatePart = columns
      .filter((col) => col !== "createdAt") // Exclude createdAt from updates
      .map((col) => {
        if (col === "updatedAt") {
          return "`updatedAt` = CONVERT_TZ(NOW(), '+00:00', '-03:00')";
        }
        return `\`${col}\` = VALUES(\`${col}\`)`;
      })
      .join(", ");

    // For new inserts, also set createdAt and updatedAt with timezone conversion
    const insertColumnsList = [...columns, "createdAt", "updatedAt"];
    const insertColumnsStr = insertColumnsList.map((col) => `\`${col}\``).join(", ");

    const sql = `INSERT INTO \`${tableName}\` (${insertColumnsStr}) 
                 VALUES ? 
                 ON DUPLICATE KEY UPDATE ${updatePart}`;

    // 4. Prepare the data array for mysql2 bulk insert [[val1, val2], [val1, val2]]
    // Get current Brasilia time for timestamps
    const getBrasiliaTimestamp = () => {
      const formatter = new Intl.DateTimeFormat("pt-BR", {
        timeZone: "America/Sao_Paulo",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      });
      const parts = formatter.formatToParts(new Date());
      const date = parts.find(p => p.type === "year").value + "-" +
                   parts.find(p => p.type === "month").value + "-" +
                   parts.find(p => p.type === "day").value;
      const time = parts.find(p => p.type === "hour").value + ":" +
                   parts.find(p => p.type === "minute").value + ":" +
                   parts.find(p => p.type === "second").value;
      return date + " " + time;
    };

    const brasiliaNow = getBrasiliaTimestamp();

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

        // Add createdAt and updatedAt with Brasilia timezone
        rowValues.push(brasiliaNow);
        rowValues.push(brasiliaNow);

        return rowValues;
      } catch (valErr) {
        throw new Error(
          `Error extracting values from record ${idx}: ${valErr.message}`
        );
      }
    });

    // Validate: ensure all rows have the correct number of values
    if (values.length > 0) {
      const expectedLength = insertColumnsList.length; // Now includes createdAt and updatedAt
      for (let i = 0; i < Math.min(values.length, 3); i++) {
        if (values[i].length !== expectedLength) {
          throw new Error(
            `Row ${i} has ${
              values[i].length
            } values but expected ${expectedLength}. Columns: ${insertColumnsList.join(
              ", "
            )}`
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
      `InsertQuery error for table '${tableName}': ${err.message}`
    );
  }
}

module.exports = InsertQuery;
