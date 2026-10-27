// ============================================================
// utils/store.js
// Ficheiros JSON em data/ (marcações, promoções, estatísticas,
// estado do bot). A escrita é atómica: grava num ficheiro
// temporário e troca, para um corte de luz não estragar o JSON.
// ============================================================

const fs = require("fs");
const path = require("path");

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, "../../data");

function filePath(name) {
  return path.join(DATA_DIR, name);
}

function readJson(name, fallback) {
  try {
    return JSON.parse(fs.readFileSync(filePath(name), "utf8"));
  } catch {
    return fallback;
  }
}

function writeJson(name, data) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const target = filePath(name);
  const tmp = `${target}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2) + "\n");
  fs.renameSync(tmp, target);
}

module.exports = { readJson, writeJson, filePath };
