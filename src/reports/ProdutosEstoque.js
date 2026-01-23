const ListaToTxt = require("../util/ListaToTxt");

async function ListaProdutosEstoque(db, clienteId) {
  const [rows] = await db.execute(
    `SELECT p.CODIGO, p.DESCRICAO, p.PR_AVISTA, p.QTD_ESTOQ 
       FROM PRODUTOS AS p
       WHERE cliente_id = ? AND p.QTD_ESTOQ > 0
       ORDER BY p.DESCRICAO ASC`,
    [clienteId],
  );
  db.end();
  return rows;
}

async function exportProdutosEstoque(db, clienteId, outputPath) {
  const rows = await ListaProdutosEstoque(db, clienteId);
  await ListaToTxt(rows, outputPath);
}

module.exports = { ListaProdutosEstoque, exportProdutosEstoque };
