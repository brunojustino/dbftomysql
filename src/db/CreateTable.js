async function CreateTable(db, name, sql) {
  try {
    await db.execute(sql);
    console.log(`Table "${name}" created successfully!`);
  } catch (err) {
    if (err.errno === 1050) {
      console.log("Table already exists. Skipping creation.");
    } else {
      console.error("Error creating table:", err.message);
    }
  } finally {
    // Close the pool when finished
    await db.end();
  }
}

module.exports = CreateTable;
