/**
 * @param {string} tableName
 * @param {string} rawString - The DBF structure string
 * @param {Object} overrides - Optional size overrides { FIELD_NAME: newSize }
 * @param {string|string[]|null} uniqueKey - Pass an array for composite keys
 */
function CreateQuery(tableName, rawString, overrides = {}, uniqueKey = null) {
  const fields = rawString.split(", ");

  // Management fields for your multi-tenant setup
  const columns = [
    "  `id` BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY",
    "  `cliente_id` INT NOT NULL",
  ];

  fields.forEach((field) => {
    let [name, type, size, decimals] = field.split("-");

    // Check if there is an override for this specific field name
    // We use uppercase to match your DBF string convention
    if (overrides[name]) {
      size = overrides[name];
      // console.log(`-> Override applied for ${name}: New size = ${size}`);
    }
    // console.log(
    //   `-> Processing field ${name}: Type=${type}, Size=${size}, Decimals=${decimals}`
    // );
    let mysqlType = "";
    switch (type) {
      case "C":
        mysqlType = `VARCHAR(${size})`;
        break;
      case "N":
        mysqlType =
          parseInt(decimals) > 0
            ? `DECIMAL(${size}, ${decimals})`
            : parseInt(size) > 9
            ? `BIGINT`
            : `INT`;
        break;
      case "D":
        mysqlType = `DATE`;
        break;
      case "L":
        mysqlType = `TINYINT(1)`;
        break;
      case "M":
        mysqlType = `TEXT`;
        break;
      default:
        mysqlType = `TEXT`;
    }

    columns.push(`  \`${name}\` ${mysqlType}`);
  });

  // Composite Unique Key (client_id + business code)
  // columns.push("  UNIQUE KEY `idx_client_product` (`cliente_id`, `CODIGO`) ");
  if (uniqueKey) {
    // Handle both single string "CODIGO" or array ["NCP", "PARC"]
    const keyArray = Array.isArray(uniqueKey) ? uniqueKey : [uniqueKey];

    // Combine cliente_id with the provided keys
    const keyColumns = ["cliente_id", ...keyArray]
      .map((k) => `\`${k}\``)
      .join(", ");

    columns.push(`  UNIQUE KEY \`idx_${tableName}_unique\` (${keyColumns})`);
  }

  // Add timestamp fields
  columns.push("  `createdAt` TIMESTAMP DEFAULT CURRENT_TIMESTAMP");
  columns.push(
    "  `updatedAt` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP"
  );

  return `CREATE TABLE IF NOT EXISTS \`${tableName}\` (\n${columns.join(
    ",\n"
  )}\n) ENGINE=InnoDB;`;
}

module.exports = CreateQuery;
