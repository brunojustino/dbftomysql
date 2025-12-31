function CreateQuery(tableName, rawString) {
  const fields = rawString.split(", ");
  const columns = fields.map((field) => {
    const [name, type, size, decimals] = field.split("-");

    let mysqlType = "";

    switch (type) {
      case "C": // String
        mysqlType = `VARCHAR(${size})`;
        break;
      case "N": // Numeric
        if (parseInt(decimals) > 0) {
          mysqlType = `DECIMAL(${size}, ${decimals})`;
        } else {
          mysqlType = parseInt(size) > 9 ? `BIGINT` : `INT`;
        }
        break;
      case "D": // Date
        mysqlType = `DATE`;
        break;
      case "T": // DateTime
        mysqlType = `DATETIME`;
        break;
      case "L": // Logical
        mysqlType = `TINYINT(1)`;
        break;
      case "M": // Memo
        mysqlType = `TEXT`;
        break;
      case "F":
      case "B": // Float/Double
        mysqlType = `DOUBLE`;
        break;
      default:
        mysqlType = `TEXT`;
    }

    return `  ${name} ${mysqlType}`;
  });

  return `CREATE TABLE ${tableName} (\n${columns.join(",\n")}\n);`;
}

module.exports = CreateQuery;
