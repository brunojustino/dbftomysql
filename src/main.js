const { DBFFile } = require("dbffile");
const path = require("path");
const connectToDatabase = require("./db");
const CreateQuery = require("./db/CreateQuery");
const InsertQuery = require("./db/InsertQuery");
const UpsertQuery = require("./db/UpsertQuery");
const CreateTable = require("./db/CreateTable");
const InsertTable = require("./db/InsertTable");

console.log("DBF Reader2 module loaded.");

const dbfFilePath = path.join("C:", "siv", "produtos.dbf");

// F - Y - T - decimals

async function batchRead() {
  let dbf = await DBFFile.open(dbfFilePath);
  console.log(`DBF file contains ${dbf.recordCount} records.`);
  // console.log(
  //   `Field names: ${dbf.fields
  //     .map((f) => f.name + "-" + f.type + "-" + f.size + "-" + f.decimalPlaces)
  //     .join(", ")}`
  // );
  let fieldsInfo = `${dbf.fields
    .map((f) => f.name + "-" + f.type + "-" + f.size + "-" + f.decimalPlaces)
    .join(", ")}`;

  // console.log(fieldsInfo);
  // const createQueryString = CreateQuery("produtos", fieldsInfo);
  // console.log("Created query: " + createQueryString);
  // let records = await dbf.readRecords(2); // batch-reads up to 100 records, returned as an array

  // const a = InsertQuery("produtos", records);
  // console.log(a.sql);
  // console.log(a.values);
  // migrateData("produtos", records);
  // for (let record of records) console.log(record);
}

async function getDbfStructure(filePath) {
  let dbf = await DBFFile.open(filePath);
  let fieldsInfo = `${dbf.fields
    .map((f) => f.name + "-" + f.type + "-" + f.size + "-" + f.decimalPlaces)
    .join(", ")}`;
  return fieldsInfo;
}

async function getDbfRecords(filePath) {
  let dbf = await DBFFile.open(filePath);
  let records = await dbf.readRecords(10); // batch-reads up to 100 records, returned as an array
  return records;
}

async function run() {
  const db = await connectToDatabase();
  console.log("DBF connection established.");

  const structure = await getDbfStructure(dbfFilePath);
  const overrides = { DESCRICAO: 120 };
  const createQueryString = CreateQuery("produtos", structure, overrides);
  await CreateTable(db, "produtos", createQueryString, structure, overrides);

  const records = await getDbfRecords(dbfFilePath);
  const insertQuery = InsertQuery("produtos", records, 16); // Example clientId = 1
  await InsertTable(db, "produtos", insertQuery);

  // Simple SELECT query
  // const [rows] = await db.execute('SELECT * FROM users WHERE id = ?', [1]);

  // console.log(rows);
  db.end();
}

// const structure =
//   "LOJA-N-2-0, CODIGO-N-7-0, DV-N-1-0, CODEAN-N-14-0, SECAO-N-3-0, LINHA-N-5-0, DESCRICAO-C-40-0, REFER-C-20-0, UND_COMP-C-3-0, FAT_COMP-N-9-3, UND_VEND-C-3-0, PESO_LIQ-C-8-0, SIMILAR-N-6-0, FORN-N-5-0, FABR-N-5-0, VLULT_COMP-N-12-2, DTULT_COMP-D-8-0, QTULT_COMP-N-12-3, DTULT_VEND-D-8-0, LOCALIZ-C-6-0, PR_CONT-C-1-0, VEN_CONT-C-1-0, QTD_PED-N-12-3, PTO_PED-N-12-3, EST_MAX-N-12-3, EST_MIN-N-12-3, QTD_RESERV-N-12-3, QTD_ESTOQ-N-12-3, QTD_AVAR-N-12-3, CUST_MED-N-12-4, CONS_MED-N-12-5, MARG_LUCRO-N-7-3, MARG_PRAZO-N-7-3, MARG_DESC-N-7-3, MARG_PR4-N-7-3, PR_AVISTA-N-12-2, PR_PRAZO-N-12-2, PR_DESC-N-12-2, PRECO4-N-12-3, DESC_MAX-N-5-2, COMIS_MAX-N-6-3, DTALT_PRE-D-8-0, DTALT_DESC-D-8-0, DTALT_PRAZ-D-8-0, DTALT_PR4-D-8-0, PRE_ANT-N-12-2, DTPRE_ANT-D-8-0, PR_CUSTO-N-14-4, DT_CUSTO-D-8-0, ORIG_CUSTO-C-1-0, CUSTO_ANT-N-14-4, DTCUS_ANT-D-8-0, COD_TRIB-N-3-0, NUM_MESES-N-3-0, PERC_IPI-N-6-3, QTDULT_PED-N-12-3, PR_CUSICM-N-14-4, VLULT_PED-N-12-2, DTULT_PED-D-8-0, ULT_DESC-N-5-2, PR1_ATA-N-12-2, PR2_ATA-N-12-2, PR3_ATA-N-12-2, PR4_ATA-N-12-2, QT1_ATA-N-4-0, QT2_ATA-N-4-0, QT3_ATA-N-4-0, QT4_ATA-N-4-0, FAIXA_QT-C-1-0, FAIXA_VL-C-1-0, DTALT_CAD-D-8-0, MARGVAR-N-5-2, STATUS-C-1-0, QTDIAS-N-5-0, QTVENDIDO-N-15-3, QTCOMPRAS-N-11-3, QTPEDIDOS-N-11-3, QTVENDAS-N-11-3, QTORCAM-N-11-3, DIAS_VALID-N-5-0, GARANTIA-C-8-0, PISCONFINS-C-1-0, DTINI_PRM-D-8-0, DTFIM_PRM-D-8-0, PRV1_PRM-N-12-2, PRV2_PRM-N-12-2, PRV3_PRM-N-12-2, PRV4_PRM-N-12-2, PRA1_PRM-N-12-2, PRA2_PRM-N-12-2, PRA3_PRM-N-12-2, PRA4_PRM-N-12-2, NCM-C-8-0, GENERO-C-2-0, MODBASCALC-C-1-0, MATPRIMA-C-1-0, GENERICO-C-1-0, VERESTOQ-C-1-0, TPPRECO-C-1-0, TABPRECO-N-3-0, ABREV-C-20-0, CUSMEDFIN-N-12-2, CUSFIN-N-12-2, DTULTINV-D-8-0, TPLSTMED-C-1-0, ORIGEM-C-1-0, GTIN-C-14-0, IPPT-C-1-0, ULBICMRCMP-N-12-2, ULVICMRCMP-N-12-2, ULDICMRCMP-D-8-0, IAT-C-1-0, CTRALT-C-6-0, DTESTOQ-D-8-0, TIPO-C-2-0, CODLST-C-5-0, VLFRETE-N-12-2, ALTURA-N-6-0, LARGURA-N-6-0, COMPRIMENT-N-6-0, CUSULENT-N-14-4, CUSMDENT-N-14-4, DTULENT-D-8-0, PERCIPI-N-5-2, DESCULTENT-N-10-2, FRETEMED-N-10-2, PERCIMPOST-N-5-2, DESPMED-N-10-2, DTCOTACAO-D-8-0, VLCOTACAO-N-10-2, PESO_BRT-N-10-3, PESO_LQ-N-10-3, FAT_UND-C-1-0, EST_LOJAS-N-15-3, CEST-C-7-0, DTCAD-D-8-0, NATREC-C-3-0, BALANCA-C-1-0";

run();
// batchRead();

// createTable("produtos");
// console.log(generateCreateQuery('produtos', structure));
