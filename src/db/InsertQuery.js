function InsertQuery(tableName, records) {
  // 1. Filter out records marked as deleted
  // We assume [DELETED] is a symbol or a string key based on your library
  const activeRecords = records.filter(
    (rec) => !rec[Symbol.for("DELETED")] && !rec["@deleted"]
  );

  if (activeRecords.length === 0) return null;

  // 2. Extract column names from the first record
  // We exclude any internal library keys (like those starting with @ or symbols)
  const columns = Object.keys(activeRecords[0]).filter(
    (key) => typeof key === "string"
  );

  // 3. Prepare the SQL template
  // Using backticks for table and column names to avoid reserved word errors
  const escapedColumns = columns.map((col) => `\`${col}\``).join(", ");
  const sql = `INSERT INTO \`${tableName}\` (${escapedColumns}) VALUES ?`;

  // 4. Prepare the data array for mysql2 bulk insert
  // mysql2 expects an array of arrays: [[val1, val2], [val1, val2]]
  const values = activeRecords.map((rec) =>
    columns.map((col) => {
      const val = rec[col];
      // Handle Date objects specifically if needed, otherwise return value
      return val instanceof Date ? val : val;
    })
  );

  return { sql, values };
}

module.exports = InsertQuery;
