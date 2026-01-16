const tableKeys = {
  produtos: "codigo",
  clientes: "codigo",
  fornece: "codigo",
  ncp: ["fornece", "ncp", "parc"],
  mvncp: ["fornece", "ncp", "parc"],
  ncr: ["cliente", "ncr", "parc"],
  mvncr: ["cliente", "ncr", "parc"],
  empresa: "codigo",
};

module.exports = tableKeys;
