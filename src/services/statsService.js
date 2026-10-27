// ============================================================
// services/statsService.js
// Conta conversas por dia (clientes diferentes e mensagens) em
// data/conversas.json e lê as pré-marcações de data/marcacoes.json.
// ============================================================

const store = require("../utils/store");
const horario = require("../utils/horario");

const FILE = "conversas.json";
const KEEP_DAYS = 90;

// Regista uma mensagem recebida de um cliente
function recordMessage(from) {
  const data = store.readJson(FILE, { dias: {} });
  const hoje = horario.agora().data;
  const dia = data.dias[hoje] || (data.dias[hoje] = { clientes: [], mensagens: 0 });
  dia.mensagens++;
  if (!dia.clientes.includes(from)) dia.clientes.push(from);

  // Guarda só os últimos 90 dias
  const dias = Object.keys(data.dias).sort();
  for (const d of dias.slice(0, Math.max(0, dias.length - KEEP_DAYS))) delete data.dias[d];

  store.writeJson(FILE, data);
}

// Datas AAAA-MM-DD dos últimos n dias (hoje incluído), em Luanda
function lastDays(n) {
  const hoje = horario.agora().data;
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(`${hoje}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() - i);
    return d.toISOString().slice(0, 10);
  });
}

// Resumo de um período: conversas, mensagens, pré-marcações, serviços mais pedidos
function summary(days) {
  const conversas = store.readJson(FILE, { dias: {} }).dias;
  const marcacoes = store.readJson("marcacoes.json", []);
  const clientes = new Set();
  let mensagens = 0;
  for (const d of days) {
    const dia = conversas[d];
    if (!dia) continue;
    mensagens += dia.mensagens;
    dia.clientes.forEach(c => clientes.add(c));
  }
  const doPeriodo = marcacoes.filter(m => days.includes(m.dataPedido));
  const servicos = {};
  for (const m of doPeriodo) servicos[m.servico] = (servicos[m.servico] || 0) + 1;
  const top = Object.entries(servicos).sort((a, b) => b[1] - a[1]).slice(0, 3);
  return { conversas: clientes.size, mensagens, marcacoes: doPeriodo.length, top };
}

module.exports = { recordMessage, summary, lastDays };
