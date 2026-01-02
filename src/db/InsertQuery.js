/**
 * @param {string} tableName
 * @param {Array} records - DBF records
 * @param {number} clienteId - The ID of the client folder being processed
 */
function InsertQuery(tableName, records, clienteId) {
  if (!records || records.length === 0) return null;

  // 1. Process records: Inject clientId and handle Soft Deletes
  const processedRecords = records.map((rec) => {
    // Check if the record is marked as deleted in DBF
    const isDeleted = rec[Symbol.for("DELETED")] || rec["@deleted"];

    // Create a new object to avoid mutating the original data
    const newRec = { ...rec };

    // Inject the client identifier
    newRec["cliente_id"] = clienteId;

    // If deleted in DBF, set MySQL STATUS to 'I', otherwise keep as is or set 'A'
    if (isDeleted) {
      newRec["STATUS"] = "I";
    }

    return newRec;
  });

  // 2. Extract column names from the first record
  // We filter out any internal parser keys (starting with @ or symbols)
  const columns = Object.keys(processedRecords[0]).filter(
    (key) => typeof key === "string" && !key.startsWith("@")
  );

  // 3. Prepare the SQL template
  const escapedColumns = columns.map((col) => `\`${col}\``).join(", ");

  // Generate the UPSERT part so it updates existing records for that client
  const updatePart = columns
    .map((col) => `\`${col}\` = VALUES(\`${col}\`)`)
    .join(", ");

  const sql = `INSERT INTO \`${tableName}\` (${escapedColumns}) 
               VALUES ? 
               ON DUPLICATE KEY UPDATE ${updatePart}`;

  // 4. Prepare the data array for mysql2 bulk insert [[val1, val2], [val1, val2]]
  const values = processedRecords.map((rec) =>
    columns.map((col) => {
      const val = rec[col];
      return val instanceof Date ? val : val;
    })
  );

  return { sql, values };
}

module.exports = InsertQuery;
