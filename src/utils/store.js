// ============================================================
// utils/store.js
// Dados do bot (marcações, promoções, estatísticas, estado,
// conversas a meio). Dois sítios possíveis:
//  - no PC: ficheiros JSON em data/, com escrita atómica (grava num
//    ficheiro temporário e troca, para um corte de luz não estragar o JSON);
//  - na Cloudflare: o armazenamento do Durable Object (src/worker.js
//    chama useStorage ao arrancar).
// Em ambos os casos a leitura é síncrona, a partir de uma cópia em memória.
// ============================================================

const fs = require("fs");
const path = require("path");

// (na Cloudflare não há __dirname nem ficheiros)
const DATA_DIR = process.env.DATA_DIR || (typeof __dirname !== "undefined" ? path.join(__dirname, "../../data") : "data");

// Cloudflare: nome → valor, carregado de uma vez no arranque
let cloud = null; // { cache: Map, storage }
const maps = []; // persistentMap criados, para recarregar depois de useStorage

function useStorage(storage, entries) {
  cloud = { cache: new Map(entries), storage };
  for (const m of maps) m.reload();
}

function filePath(name) {
  return path.join(DATA_DIR, name);
}

function readJson(name, fallback) {
  if (cloud) {
    return cloud.cache.has(name) ? structuredClone(cloud.cache.get(name)) : fallback;
  }
  try {
    return JSON.parse(fs.readFileSync(filePath(name), "utf8"));
  } catch {
    return fallback;
  }
}

function writeJson(name, data) {
  if (cloud) {
    cloud.cache.set(name, structuredClone(data));
    // Sem await: o Durable Object só deixa sair a resposta depois de gravar
    cloud.storage.put(name, data);
    return;
  }
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const target = filePath(name);
  const tmp = `${target}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2) + "\n");
  fs.renameSync(tmp, target);
}

// -------------------------------------------------------
// Map guardado em data/ (ou na Cloudflare) que esquece entradas
// com mais de ttlMs. Cada valor tem de ter updatedAt (ms).
// Depois de alterar um valor que já lá estava, chamar save().
// Só lê os dados no primeiro uso (na Cloudflare, depois de useStorage).
// -------------------------------------------------------
function persistentMap(name, ttlMs) {
  let loaded = null;
  const map = () => (loaded ||= new Map(Object.entries(readJson(name, {}))));
  const fresh = v => !ttlMs || Date.now() - v.updatedAt < ttlMs;

  function save() {
    const obj = {};
    for (const [k, v] of map()) if (fresh(v)) obj[k] = v;
    writeJson(name, obj);
  }

  const pmap = {
    get: key => {
      const v = map().get(key);
      return v && fresh(v) ? v : undefined;
    },
    has(key) {
      return this.get(key) !== undefined;
    },
    set(key, value) {
      map().set(key, value);
      save();
    },
    delete(key) {
      if (map().delete(key)) save();
    },
    clear() {
      if (map().size) {
        map().clear();
        save();
      }
    },
    save,
    reload: () => {
      loaded = null;
    },
  };
  maps.push(pmap);
  return pmap;
}

module.exports = { readJson, writeJson, filePath, persistentMap, useStorage };
