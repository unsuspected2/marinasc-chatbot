// ============================================================
// services/agendaService.js
// Agenda do salão: marcações, vagas e bloqueios.
//
// Cada marcação ocupa [inicio, inicio + duração) numa área (tranças,
// unhas…). Uma área atende tantas clientes ao mesmo tempo quantos
// profissionais tiver (src/data/agenda.json). As pendentes também
// ocupam a vaga, para duas clientes não ficarem com a mesma hora
// enquanto a equipa não confirma.
//
// Estados: pendente → confirmada | recusada; cancelada (cliente ou equipa);
// faltou (a cliente não apareceu: o sinal fica retido, ver docs/GUIA.md)
//
// Sinal: cada marcação pede 30% do preço da tabela (agenda.json → sinal),
// por transferência. A equipa confirma depois de ver o dinheiro na conta.
// ============================================================

const crypto = require("crypto");
const agenda = require("../data/agenda.json");
const faq = require("../data/faq.json");
const horario = require("../utils/horario");
const store = require("../utils/store");

const FILE = "marcacoes.json";
const BLOCKS_FILE = "bloqueios.json";
const ACTIVE = ["pendente", "confirmada"];
const STEP = agenda.intervalo_min || 30;

const toMin = hhmm => hhmm.split(":").map(Number).reduce((h, m) => h * 60 + m);
const normalize = text => text.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9+-]+/g, " ").trim();

// "às 9h", "às 14h30"
function horaLabel(min) {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${h}h${m ? String(m).padStart(2, "0") : ""}`;
}

// -------------------------------------------------------
// Serviço → área e duração
// -------------------------------------------------------
function areaFor(servico) {
  const n = ` ${normalize(servico || "")} `;
  // Palavras curtas ("pe", "gel") só contam inteiras: "pe" não apanha "pestana"
  const has = p => (p.length < 4 ? new RegExp(` ${p}s? `).test(n) : n.includes(` ${p}`));
  for (const [id, a] of Object.entries(agenda.areas)) {
    if (a.palavras.some(has)) return id;
  }
  return "outros";
}

function durationFor(servico) {
  const exact = Object.entries(agenda.duracoes).find(([nome]) => normalize(nome) === normalize(servico || ""));
  if (exact) return exact[1];
  return agenda.areas[areaFor(servico)]?.duracao_min || 60;
}

// -------------------------------------------------------
// Preço da tabela (linhas "• Nome: 11.000 Kz" do FAQ) e sinal
// -------------------------------------------------------
const PRICES = Object.entries(faq)
  .filter(([k]) => k.startsWith("menu_"))
  .flatMap(([, v]) => v.split("\n"))
  .map(l => /^•\s*([^:]+):(.*)$/.exec(l.trim()))
  .filter(Boolean)
  .map(([, nome, resto]) => {
    const valores = (resto.match(/\d{1,3}(?:\.\d{3})+/g) || []).map(v => +v.replace(/\./g, ""));
    return { nome: normalize(nome), preco: valores.length ? Math.min(...valores) : null, aPartirDe: valores.length > 1 || /a partir/i.test(resto) };
  })
  .filter(p => p.preco);

function priceFor(servico) {
  return PRICES.find(p => p.nome === normalize(servico || "")) || null;
}

// { percentagem, valor, preco, aPartirDe } ou null (preço sob consulta: a equipa diz o valor)
function depositFor(servico) {
  const pct = agenda.sinal?.percentagem;
  const p = priceFor(servico);
  if (!pct || !p) return null;
  return { percentagem: pct, valor: Math.ceil((p.preco * pct) / 100 / 100) * 100, preco: p.preco, aPartirDe: p.aPartirDe };
}

const kz = n => `${String(n).replace(/\B(?=(\d{3})+$)/g, ".")} Kz`;

// Texto com o valor e a conta, para a cliente
function depositText(m) {
  const s = agenda.sinal;
  if (!s?.percentagem) return "";
  const valor = m.sinal?.valor
    ? `*${kz(m.sinal.valor)}* (${s.percentagem}% de ${m.sinal.aPartirDe ? "a partir de " : ""}${kz(m.sinal.preco)})`
    : `${s.percentagem}% do valor do serviço (a equipa diz-lhe o valor exacto)`;
  return `💳 *Sinal para garantir a vaga:* ${valor}\nTransferência para o IBAN:\n${s.iban}\nDepois envie aqui a foto ou o PDF do comprovativo. O resto paga no salão.`;
}

const POLICY = "Se não puder vir, avise com antecedência (escreva *remarcar* ou *cancelar marcação*). "
  + "Se faltar sem avisar, a justificação é tratada presencialmente no salão: com uma justificação válida, a equipa procura uma solução consigo; "
  + "sem justificação válida, o sinal não é devolvido e precisa de fazer uma nova marcação.";

function capacity(area) {
  return agenda.areas[area]?.profissionais || 1;
}

// -------------------------------------------------------
// Horário nesse dia: ["08:00", "21:00"] ou null (fechado).
// Com serviço, usa o horário da área se ela tiver um (barbearia).
// -------------------------------------------------------
function openingHours(iso, servico) {
  const h = require("../data/horario.json");
  if ((h.fechado_em || []).includes(iso)) return null;
  const key = ["domingo", "segunda", "terca", "quarta", "quinta", "sexta", "sabado"][new Date(`${iso}T12:00:00Z`).getUTCDay()];
  const own = servico && agenda.areas[areaFor(servico)]?.horario;
  return (own ? own[key] : h.dias[key]) || null;
}

// -------------------------------------------------------
// Dados
// -------------------------------------------------------
function all() {
  return store.readJson(FILE, []);
}

function saveAll(list) {
  store.writeJson(FILE, list);
}

function blocks() {
  return store.readJson(BLOCKS_FILE, []);
}

function find(codigo) {
  const c = String(codigo || "").replace(/^#/, "").toUpperCase();
  return all().find(m => m.codigo === c) || null;
}

// Marcações activas (pendentes e confirmadas) de um dia
function ofDay(iso) {
  return all()
    .filter(m => m.dia === iso && ACTIVE.includes(m.estado || "pendente") && m.inicio !== undefined)
    .sort((a, b) => a.inicio - b.inicio);
}

// Próximas marcações activas de um cliente
function upcomingOf(cliente) {
  const t = horario.agora();
  return all()
    .filter(m => m.cliente === cliente && ACTIVE.includes(m.estado || "pendente")
      && (m.dia > t.data || (m.dia === t.data && (m.inicio ?? 0) >= t.minutos)))
    .sort((a, b) => (a.dia + String(a.inicio).padStart(4, "0")).localeCompare(b.dia + String(b.inicio).padStart(4, "0")));
}

// -------------------------------------------------------
// Vagas
// -------------------------------------------------------

// Porque é que essa hora não serve (null = está livre)
function whyNot(iso, inicio, servico, { ignore } = {}) {
  const hours = openingHours(iso, servico);
  if (!hours) return "fechado";
  const dur = durationFor(servico);
  if (inicio < toMin(hours[0]) || inicio + dur > toMin(hours[1])) return "fora_do_horario";

  const t = horario.agora();
  if (iso < t.data || (iso === t.data && inicio < t.minutos + (agenda.antecedencia_min ?? 60))) return "passou";

  const fim = inicio + dur;
  const blocked = blocks().some(b => b.dia === iso
    && (b.inicio === undefined || (inicio < b.fim && fim > b.inicio)));
  if (blocked) return "bloqueado";

  const area = areaFor(servico);
  const overlapping = ofDay(iso).filter(m => m.codigo !== ignore && (m.area || areaFor(m.servico)) === area
    && inicio < m.inicio + m.duracao && fim > m.inicio);
  // Cada profissional atende uma cliente de cada vez: conta o máximo de sobreposições
  for (let x = inicio; x < fim; x += STEP) {
    const busy = overlapping.filter(m => x < m.inicio + m.duracao && x + STEP > m.inicio).length;
    if (busy >= capacity(area)) return "ocupado";
  }
  return null;
}

// Horas livres de um dia para um serviço (minutos desde a meia-noite)
function freeSlots(iso, servico, { from = 0, to = 24 * 60 } = {}) {
  const hours = openingHours(iso, servico);
  if (!hours) return [];
  const slots = [];
  for (let m = Math.max(toMin(hours[0]), from); m < Math.min(toMin(hours[1]), to); m += STEP) {
    if (!whyNot(iso, m, servico)) slots.push(m);
  }
  return slots;
}

function addDays(iso, n) {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

// Próximo dia com vaga para o serviço (até 30 dias), a partir de iso
function nextFreeDay(iso, servico) {
  for (let i = 0; i < 30; i++) {
    const d = addDays(iso, i);
    const slots = freeSlots(d, servico);
    if (slots.length) return { dia: d, slots };
  }
  return null;
}

// As n horas livres mais perto da pedida, no mesmo dia
function nearest(iso, inicio, servico, n = 3) {
  return freeSlots(iso, servico)
    .sort((a, b) => Math.abs(a - inicio) - Math.abs(b - inicio) || a - b)
    .slice(0, n)
    .sort((a, b) => a - b);
}

// -------------------------------------------------------
// Criar e mudar marcações
// -------------------------------------------------------
function newCode(existing) {
  const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // sem 0/O, 1/I
  for (;;) {
    const bytes = crypto.randomBytes(4);
    const code = [...bytes].map(b => ALPHABET[b % ALPHABET.length]).join("");
    if (!existing.some(m => m.codigo === code)) return code;
  }
}

// Guarda uma marcação nova. estado: "pendente" (cliente) ou "confirmada" (equipa)
function create({ cliente, nome, servico, dia, inicio, estado = "pendente", origem = "bot", substitui }) {
  const list = all();
  const marcacao = {
    id: crypto.randomUUID(),
    codigo: newCode(list),
    criadaEm: new Date().toISOString(),
    dataPedido: horario.agora().data,
    estado,
    origem,
    cliente,
    nome,
    servico,
    area: areaFor(servico),
    dia,
    inicio,
    duracao: durationFor(servico),
    hora: `às ${horaLabel(inicio)}`,
    ...(estado === "pendente" && depositFor(servico) && { sinal: depositFor(servico) }),
    ...(substitui && { substitui }),
  };
  list.push(marcacao);
  saveAll(list);
  return marcacao;
}

function setState(codigo, estado, extra = {}) {
  const list = all();
  const m = list.find(x => x.codigo === String(codigo).replace(/^#/, "").toUpperCase());
  if (!m) return null;
  Object.assign(m, { estado, [`${estado}Em`]: new Date().toISOString() }, extra);
  saveAll(list);
  return m;
}

// Bloqueia um dia inteiro (sem inicio/fim) ou um intervalo
function block(dia, inicio, fim, motivo) {
  const list = blocks().filter(b => b.dia >= horario.agora().data); // os antigos saem
  list.push({ dia, ...(inicio !== undefined && { inicio, fim }), ...(motivo && { motivo }) });
  store.writeJson(BLOCKS_FILE, list);
}

function unblock(dia) {
  const list = blocks();
  const rest = list.filter(b => b.dia !== dia);
  store.writeJson(BLOCKS_FILE, rest);
  return list.length - rest.length;
}

// -------------------------------------------------------
// Textos
// -------------------------------------------------------
const WEEKDAY_NAMES = ["domingo", "segunda-feira", "terça-feira", "quarta-feira", "quinta-feira", "sexta-feira", "sábado"];

function dayText(iso) {
  const t = horario.agora();
  const [, m, d] = iso.split("-");
  const wd = WEEKDAY_NAMES[new Date(`${iso}T12:00:00Z`).getUTCDay()];
  const prefix = iso === t.data ? "hoje, " : iso === addDays(t.data, 1) ? "amanhã, " : "";
  return `${prefix}${wd}, ${d}/${m}`;
}

const ESTADO_EMOJI = { pendente: "⏳", confirmada: "✅", recusada: "❌", cancelada: "🚫", faltou: "⚠️" };

function describe(m, { withClient = false } = {}) {
  const fim = horaLabel(m.inicio + m.duracao);
  const pago = m.sinalPago ? " · 💳 sinal pago" : m.comprovativoEm ? " · 💳 comprovativo enviado" : "";
  return `${ESTADO_EMOJI[m.estado] || "⏳"} *#${m.codigo}* ${m.servico}, ${dayText(m.dia)}, ${horaLabel(m.inicio)}–${fim}${pago}`
    + (withClient ? `\n   ${m.nome}${m.origem === "equipa" ? " (marcada pela equipa)" : m.cliente.startsWith("ig:") ? " · pelo Instagram" : ` · wa.me/${m.cliente}`}` : "");
}

module.exports = {
  areaFor, durationFor, openingHours, priceFor, depositFor, depositText, kz, POLICY, horaLabel, toMin, addDays, dayText,
  all, find, ofDay, upcomingOf, blocks,
  whyNot, freeSlots, nextFreeDay, nearest,
  create, setState, block, unblock, describe,
};
