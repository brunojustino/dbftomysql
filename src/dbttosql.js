// const path = require("path");
const connectToDatabase = require("./db/db");
const { processFolder } = require("./util/BatchRead");
const { CreateSyncHistoryTable } = require("./db/SyncHistory");

// const dbfFolderPath = path.join("C:", "siv");
// const dbfFilePath = path.join("C:", "siv", "produtos.dbf");

const logger = require("./util/logger");

// F - Y - T - decimals

async function run(folderPath, clientId, progressCallback) {
  let db;
  try {
    db = await connectToDatabase(logger);
    // const [rows] = await db.execute('SELECT * FROM users WHERE id = ?', [1]);
    if (progressCallback) progressCallback("Conectado ao banco de dados...");
    await CreateSyncHistoryTable(db, logger);
    const clientIdNum = parseInt(clientId, 10);
    await processFolder(db, folderPath, clientIdNum, logger, progressCallback);
    if (progressCallback) progressCallback("Processo concluído!");
    console.log("Done");
  } catch (err) {
    console.error("Migration Error:", err.message);
    logger.error(`Migration Error: ${err.message}`);
  } finally {
    if (db) await db.release();
  }
}

module.exports = { runMigration: run };

// Example usasssge:
// exportProdutosEstoque(1, "./produtos_estoque.txt");

// const structure =
//   "LOJA-N-2-0, CODIGO-N-7-0, DV-N-1-0, CODEAN-N-14-0, SECAO-N-3-0, LINHA-N-5-0, DESCRICAO-C-40-0, REFER-C-20-0, UND_COMP-C-3-0, FAT_COMP-N-9-3, UND_VEND-C-3-0, PESO_LIQ-C-8-0, SIMILAR-N-6-0, FORN-N-5-0, FABR-N-5-0, VLULT_COMP-N-12-2, DTULT_COMP-D-8-0, QTULT_COMP-N-12-3, DTULT_VEND-D-8-0, LOCALIZ-C-6-0, PR_CONT-C-1-0, VEN_CONT-C-1-0, QTD_PED-N-12-3, PTO_PED-N-12-3, EST_MAX-N-12-3, EST_MIN-N-12-3, QTD_RESERV-N-12-3, QTD_ESTOQ-N-12-3, QTD_AVAR-N-12-3, CUST_MED-N-12-4, CONS_MED-N-12-5, MARG_LUCRO-N-7-3, MARG_PRAZO-N-7-3, MARG_DESC-N-7-3, MARG_PR4-N-7-3, PR_AVISTA-N-12-2, PR_PRAZO-N-12-2, PR_DESC-N-12-2, PRECO4-N-12-3, DESC_MAX-N-5-2, COMIS_MAX-N-6-3, DTALT_PRE-D-8-0, DTALT_DESC-D-8-0, DTALT_PRAZ-D-8-0, DTALT_PR4-D-8-0, PRE_ANT-N-12-2, DTPRE_ANT-D-8-0, PR_CUSTO-N-14-4, DT_CUSTO-D-8-0, ORIG_CUSTO-C-1-0, CUSTO_ANT-N-14-4, DTCUS_ANT-D-8-0, COD_TRIB-N-3-0, NUM_MESES-N-3-0, PERC_IPI-N-6-3, QTDULT_PED-N-12-3, PR_CUSICM-N-14-4, VLULT_PED-N-12-2, DTULT_PED-D-8-0, ULT_DESC-N-5-2, PR1_ATA-N-12-2, PR2_ATA-N-12-2, PR3_ATA-N-12-2, PR4_ATA-N-12-2, QT1_ATA-N-4-0, QT2_ATA-N-4-0, QT3_ATA-N-4-0, QT4_ATA-N-4-0, FAIXA_QT-C-1-0, FAIXA_VL-C-1-0, DTALT_CAD-D-8-0, MARGVAR-N-5-2, STATUS-C-1-0, QTDIAS-N-5-0, QTVENDIDO-N-15-3, QTCOMPRAS-N-11-3, QTPEDIDOS-N-11-3, QTVENDAS-N-11-3, QTORCAM-N-11-3, DIAS_VALID-N-5-0, GARANTIA-C-8-0, PISCONFINS-C-1-0, DTINI_PRM-D-8-0, DTFIM_PRM-D-8-0, PRV1_PRM-N-12-2, PRV2_PRM-N-12-2, PRV3_PRM-N-12-2, PRV4_PRM-N-12-2, PRA1_PRM-N-12-2, PRA2_PRM-N-12-2, PRA3_PRM-N-12-2, PRA4_PRM-N-12-2, NCM-C-8-0, GENERO-C-2-0, MODBASCALC-C-1-0, MATPRIMA-C-1-0, GENERICO-C-1-0, VERESTOQ-C-1-0, TPPRECO-C-1-0, TABPRECO-N-3-0, ABREV-C-20-0, CUSMEDFIN-N-12-2, CUSFIN-N-12-2, DTULTINV-D-8-0, TPLSTMED-C-1-0, ORIGEM-C-1-0, GTIN-C-14-0, IPPT-C-1-0, ULBICMRCMP-N-12-2, ULVICMRCMP-N-12-2, ULDICMRCMP-D-8-0, IAT-C-1-0, CTRALT-C-6-0, DTESTOQ-D-8-0, TIPO-C-2-0, CODLST-C-5-0, VLFRETE-N-12-2, ALTURA-N-6-0, LARGURA-N-6-0, COMPRIMENT-N-6-0, CUSULENT-N-14-4, CUSMDENT-N-14-4, DTULENT-D-8-0, PERCIPI-N-5-2, DESCULTENT-N-10-2, FRETEMED-N-10-2, PERCIMPOST-N-5-2, DESPMED-N-10-2, DTCOTACAO-D-8-0, VLCOTACAO-N-10-2, PESO_BRT-N-10-3, PESO_LQ-N-10-3, FAT_UND-C-1-0, EST_LOJAS-N-15-3, CEST-C-7-0, DTCAD-D-8-0, NATREC-C-3-0, BALANCA-C-1-0";
