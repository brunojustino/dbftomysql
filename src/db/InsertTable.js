async function InsertTable(db, tableName, query) {
  if (!query) {
    console.log("No active records to insert.");
    return;
  }

  try {
    // Use .query for bulk inserts as .execute doesn't always support the 2D array syntax
    const [info] = await db.query(query.sql, [query.values]);
    console.log(
      `Successfully inserted ${info.affectedRows} records into ${tableName}.`
    );
  } catch (err) {
    console.error("Migration failed:", err.message);
  }
}

module.exports = InsertTable;
