const createSyncQuery = `
  CREATE TABLE IF NOT EXISTS sync_history (
    id INT AUTO_INCREMENT PRIMARY KEY,
    file_name VARCHAR(255) NOT NULL,
    cliente_id INT NOT NULL,
    file_hash VARCHAR(32) NOT NULL,
    last_processed DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY \`idx_file_client\` (\`file_name\`, \`cliente_id\`)
  ) ENGINE=InnoDB;
`;

async function CreateSyncHistoryTable(db, logger) {
  try {
    // 1. Check if table exists in the current database
    const [tables] = await db.execute(`SHOW TABLES LIKE 'sync_history'`);
    const tableExists = tables.length > 0;

    if (!tableExists) {
      // 2. If it doesn't exist, create it
      await db.execute(createSyncQuery);
      console.log(`Table "sync_history" created successfully!`);
    } else {
      // 3. If it DOES exist, run the structure update logic
      console.log(`Table "sync_history" already exists.`);
    }
  } catch (err) {
    console.error("Critical error in CreateTable:", err.message);
    logger.error(`Critical error in CreateTable: ${err.message}`);
  }
}

// sync process:

// ... Run your CreateTable and InsertQuery logic ...

// Update the hash after successful migration
async function updateSuccessfulMigration(db, file, clientId, currentHash) {
  try {
    await db.query(
      `INSERT INTO sync_history (file_name, cliente_id, file_hash, last_processed) 
        VALUES (?, ?, ?, NOW()) ON DUPLICATE KEY UPDATE file_hash = VALUES(file_hash), last_processed = NOW()`,
      [file, clientId, currentHash],
    );
  } catch (err) {
    console.error("Failed to update sync history:", err.message);
    logger.error(`Failed to update sync history: ${err.message}`);
  }
}

module.exports = { CreateSyncHistoryTable, updateSuccessfulMigration };
