// ============================================================
// services/promoService.js
// Promoções activas, a partir de data/promocoes.json.
// O ficheiro é lido a cada pedido: editar não obriga a reiniciar.
// ============================================================

const store = require("../utils/store");
const horario = require("../utils/horario");

const FILE = "promocoes.json";

function load() {
  return store.readJson(FILE, { promocoes: [] });
}

// Promoções ligadas e dentro do prazo (hoje em Luanda)
function getActive() {
  const hoje = horario.agora().data;
  return (load().promocoes || []).filter(p =>
    p.texto && p.activa !== false && (!p.ate || hoje <= p.ate) && (!p.desde || hoje >= p.desde)
  );
}

// /promo texto: passa a ser a única promoção activa (as outras desligam-se)
function setPromo(texto, ate) {
  const data = load();
  data.promocoes = (data.promocoes || []).map(p => ({ ...p, activa: false }));
  data.promocoes.unshift({ texto, activa: true, ...(ate && { ate }), criada: new Date().toISOString() });
  store.writeJson(FILE, data);
}

// /promo off
function clearPromos() {
  const data = load();
  data.promocoes = (data.promocoes || []).map(p => ({ ...p, activa: false }));
  store.writeJson(FILE, data);
}

// Texto para o cliente (ou null se não houver promoções)
function promoText() {
  const active = getActive();
  if (!active.length) return null;
  return active.map(p => `🎉 ${p.texto}${p.ate ? ` (até ${p.ate.split("-").reverse().join("/")})` : ""}`).join("\n");
}

module.exports = { getActive, setPromo, clearPromos, promoText };
