async function ListaProdutosEstoque(db, clienteId) {
  const [rows] = await db.execute(
    `SELECT p.CODIGO, p.DESCRICAO, p.PR_AVISTA, p.QTD_ESTOQ 
       FROM PRODUTOS AS p
       WHERE cliente_id = ? AND p.QTD_ESTOQ > 0
       ORDER BY p.DESCRICAO ASC`,
    [clienteId]
  );
  db.end();
  return rows;
}

module.exports = ListaProdutosEstoque;
