/**
 * @param {string} tableName
 * @param {string} rawString - The DBF structure string
 * @param {Object} overrides - Optional size overrides { FIELD_NAME: newSize }
 */
function CreateQuery(tableName, rawString, overrides = {}) {
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
  columns.push("  UNIQUE KEY `idx_client_product` (`cliente_id`, `CODIGO`) ");

  return `CREATE TABLE IF NOT EXISTS \`${tableName}\` (\n${columns.join(
    ",\n"
  )}\n) ENGINE=InnoDB;`;
}

module.exports = CreateQuery;
