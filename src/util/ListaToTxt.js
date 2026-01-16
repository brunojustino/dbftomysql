async function ListaToTxt(rows, filePath = "./output.txt") {
  const fs = require("fs").promises;
  let lines = [];
  for (let row of rows) {
    // Format each row as needed, e.g., CSV format
    let line = `${row.CODIGO}\t${row.DESCRICAO}\t${row.PR_AVISTA}\t${row.QTD_ESTOQ}`;
    lines.push(line);
  }
  const fileContent = lines.join("\n");
  await fs.writeFile(filePath, fileContent, "utf8");
}

module.exports = ListaToTxt;
