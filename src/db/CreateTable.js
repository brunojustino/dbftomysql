async function CreateTable(
  db,
  name,
  sql,
  rawStructure,
  overrides = {},
  logger,
) {
  // SECURITY: Validate table name against whitelist
  const TableNames = require("./TableNames.js");
  const isValidTableName = TableNames.some(
    (t) => t.toLowerCase() === name.toLowerCase(),
  );

  if (!isValidTableName) {
    const errorMsg = `SECURITY: Invalid table name "${name}" - not in whitelist`;
    logger.error(errorMsg);
    throw new Error(errorMsg);
  }

  try {
    // 1. Check if table exists in the current database
    const [tables] = await db.query(`SHOW TABLES LIKE ?`, [name]);
    const tableExists = tables.length > 0;

    if (!tableExists) {
      // 2. If it doesn't exist, create it
      await db.query(sql);
      logger.info(`Table "${name}" created successfully!`);
    } else {
      // 3. If it DOES exist, run the structure update logic
      logger.info(`Table "${name}" already exists. Syncing structure...`);
      await updateTableStructure(db, name, rawStructure, overrides, logger);
    }
  } catch (err) {
    logger.error(
      `Critical error in CreateTable for table "${name}": ${err.message}`,
      {
        operation: "CreateTable",
        tableName: name,
        errorStack: err.stack,
      },
    );
    throw err;
  }
}

async function updateTableStructure(
  db,
  tableName,
  rawStructure,
  overrides = {},
  logger,
) {
  // 1. Get detailed column info (Field, Type, Null, Key, etc.)
  // Using backticks to safely quote the table name
  const [existingColumns] = await db.query(`DESCRIBE \`${tableName}\``);

  // Create a map for easy lookup: { 'descricao': 'varchar(40)', 'loja': 'int' }
  const currentStructure = new Map(
    existingColumns.map((col) => [
      col.Field.toLowerCase(),
      col.Type.toLowerCase(),
    ]),
  );

  const fields = rawStructure.split(", ");

  for (const field of fields) {
    let [name, type, size, decimals] = field.split("-");
    const lowerName = name.toLowerCase();

    // SECURITY: Validate column name format (alphanumeric + underscore)
    if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name)) {
      logger.warn(`Skipping column with invalid name: "${name}"`);
      continue;
    }

    // Apply overrides
    if (overrides[name]) {
      size = overrides[name];
    }

    // Determine what the MySQL type SHOULD be
    let targetType = "";
    switch (type) {
      case "C":
        targetType = `varchar(${size})`;
        break;
      case "N":
        targetType =
          parseInt(decimals) > 0
            ? `decimal(${size},${decimals})`
            : parseInt(size) > 9
              ? `bigint`
              : `int`;
        break;
      case "D":
        targetType = `date`;
        break;
      case "L":
        targetType = `tinyint(1)`;
        break;
      case "M":
        targetType = `text`;
        break;
      default:
        targetType = `text`;
    }

    if (!currentStructure.has(lowerName)) {
      // CASE 1: Column is totally missing
      logger.info(`-> Sync: Adding column [${name}] as ${targetType}`);
      await db.query(
        `ALTER TABLE \`${tableName}\` ADD COLUMN \`${name}\` ${targetType.toUpperCase()}`,
      );
    } else {
      // CASE 2: Column exists, but check if the type/size changed
      const currentType = currentStructure.get(lowerName);

      if (currentType !== targetType) {
        logger.info(
          `-> Sync: Updating column [${name}] from ${currentType} to ${targetType}`,
        );
        // We use MODIFY to change the type/size without losing data
        await db.query(
          `ALTER TABLE \`${tableName}\` MODIFY COLUMN \`${name}\` ${targetType.toUpperCase()}`,
        );
      }
    }
  }
  logger.info(`Structure sync for "${tableName}" complete.`);
}
module.exports = CreateTable;
