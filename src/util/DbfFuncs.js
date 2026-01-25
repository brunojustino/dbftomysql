const { DBFFile } = require("dbffile");

async function getDbfStructure(filePath) {
  let dbf = await DBFFile.open(filePath);
  let fieldsInfo = `${dbf.fields
    .map((f) => f.name + "-" + f.type + "-" + f.size + "-" + f.decimalPlaces)
    .join(", ")}`;
  return fieldsInfo;
}

async function getDbfRecords(filePath) {
  let dbf = await DBFFile.open(filePath);
  let records = await dbf.readRecords();
  return records;
}

module.exports = { getDbfStructure, getDbfRecords };
