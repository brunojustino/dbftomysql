function UpsertQuery(tableName, records) {
  const activeRecords = records.filter(
    (rec) => !rec[Symbol.for("DELETED")] && !rec["@deleted"]
  );
  if (activeRecords.length === 0) return null;

  const columns = Object.keys(activeRecords[0]).filter(
    (k) => typeof k === "string"
  );
  const escapedColumns = columns.map((col) => `\`${col}\``).join(", ");

  // Generate the UPDATE part: "col1 = VALUES(col1), col2 = VALUES(col2)..."
  const updatePart = columns
    .map((col) => `\`${col}\` = VALUES(\`${col}\`)`)
    .join(", ");

  const sql = `INSERT INTO \`${tableName}\` (${escapedColumns}) VALUES ? ON DUPLICATE KEY UPDATE ${updatePart}`;

  const values = activeRecords.map((rec) => columns.map((col) => rec[col]));

  return { sql, values };
}

module.exports = UpsertQuery;
