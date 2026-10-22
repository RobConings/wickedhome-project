/**
 * Built-in bill senders: common Belgian utilities, telecom and insurers. Seeded per household when someone
 * turns on Gmail bill suggestions; people can edit or switch them off (and add their own) under
 * Integrations → Google → Senders. `key` stays stable so re-seeding never duplicates a rule.
 * `category` is an expense category (src/features/expenses/types/expenses.ts).
 */
export const DEFAULT_MAIL_BILL_RULES: { key: string; payee: string; senders: string[]; category: string }[] = [
  { key: "fluvius", payee: "Fluvius", senders: ["fluvius.be"], category: "energy" },
  { key: "luminus", payee: "Luminus", senders: ["luminus.be"], category: "energy" },
  { key: "engie", payee: "Engie", senders: ["engie.be", "engie-electrabel.be"], category: "energy" },
  { key: "totalenergies", payee: "TotalEnergies", senders: ["totalenergies.be"], category: "energy" },
  { key: "eneco", payee: "Eneco", senders: ["eneco.be"], category: "energy" },
  { key: "mega", payee: "Mega", senders: ["mega.be"], category: "energy" },
  { key: "telenet", payee: "Telenet", senders: ["telenet.be"], category: "internet_phone" },
  { key: "proximus", payee: "Proximus", senders: ["proximus.be", "proximus.com"], category: "internet_phone" },
  { key: "orange", payee: "Orange", senders: ["orange.be"], category: "internet_phone" },
  { key: "base", payee: "BASE", senders: ["base.be"], category: "internet_phone" },
  { key: "scarlet", payee: "Scarlet", senders: ["scarlet.be"], category: "internet_phone" },
  { key: "dewatergroep", payee: "De Watergroep", senders: ["dewatergroep.be"], category: "water" },
  { key: "water-link", payee: "Water-link", senders: ["water-link.be"], category: "water" },
  { key: "farys", payee: "Farys", senders: ["farys.be"], category: "water" },
  { key: "pidpa", payee: "Pidpa", senders: ["pidpa.be"], category: "water" },
  { key: "ag-insurance", payee: "AG Insurance", senders: ["aginsurance.be"], category: "insurance" },
  { key: "ethias", payee: "Ethias", senders: ["ethias.be"], category: "insurance" },
  { key: "pv-belgium", payee: "P&V", senders: ["pv.be"], category: "insurance" },
];
