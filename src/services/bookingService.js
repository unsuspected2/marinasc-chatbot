// ============================================================
// services/bookingService.js
// Pré-marcação: pergunta serviço, dia, hora e nome, gera o link
// wa.me da equipa com o pedido escrito e guarda o pedido em
// data/marcacoes.json (para as estatísticas).
//
// O bot nunca confirma a vaga: quem confirma é a equipa no 946.
// ============================================================

const crypto = require("crypto");
const faq = require("../data/faq.json");
const store = require("../utils/store");
const horario = require("../utils/horario");

const TEAM_NUMBER = "244946397096";
const FLOW_TTL_MS = 2 * 60 * 60 * 1000; // uma pré-marcação parada 2 h recomeça

// Conversas a meio de uma pré-marcação: número → { step, servico, dia, hora, nome, updatedAt }
const flows = new Map();

// -------------------------------------------------------
// Catálogo de serviços: as linhas "• Nome: preço" do FAQ e mais
// os serviços "sob consulta"
// -------------------------------------------------------
const EXTRA_SERVICES = ["Box braids", "Knotless", "Manicure", "Pedicure", "Lavagem", "Escova",
  "Tratamento", "Hidratação", "Corte", "Alisamento", "Coloração", "Penteado", "Peruca", "Unhas de gel"];

const SERVICES = [...new Set([
  ...Object.entries(faq)
    .filter(([k]) => k.startsWith("menu_"))
    .flatMap(([, v]) => v.split("\n"))
    .map(l => /^•\s*([^:]+):/.exec(l.trim())?.[1].trim())
    .filter(Boolean),
  ...EXTRA_SERVICES,
])];

function normalize(text) {
  return text.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9:/\s-]/g, " ").replace(/\s+/g, " ").trim();
}

// Serviço do catálogo mencionado no texto (o nome mais comprido ganha)
function findService(text) {
  const n = ` ${normalize(text)} `;
  return SERVICES
    .filter(s => n.includes(` ${normalize(s)} `) || n.includes(` ${normalize(s).replace(/s$/, "")} `))
    .sort((a, b) => b.length - a.length)[0] || null;
}

// -------------------------------------------------------
// Dia: hoje, amanhã, dia da semana, "15/11" ou "dia 15"
// Devolve { label, data } ou null
// -------------------------------------------------------
const WEEKDAYS = [["domingo"], ["segunda"], ["terca"], ["quarta"], ["quinta"], ["sexta"], ["sabado"]];
const WEEKDAY_NAMES = ["domingo", "segunda-feira", "terça-feira", "quarta-feira", "quinta-feira", "sexta-feira", "sábado"];

function addDays(iso, n) {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function dayLabel(iso, prefix) {
  const d = new Date(`${iso}T12:00:00Z`);
  const [, m, day] = iso.split("-");
  return `${prefix ? `${prefix}, ` : ""}${WEEKDAY_NAMES[d.getUTCDay()]}, ${day}/${m}`;
}

function parseDay(text) {
  const n = normalize(text);
  const t = horario.agora();
  if (/\bhoje\b/.test(n)) return { label: dayLabel(t.data, "hoje"), data: t.data };
  if (/\b(amanha|amnh|amanh)\b/.test(n)) {
    const data = addDays(t.data, 1);
    return { label: dayLabel(data, "amanhã"), data };
  }
  for (let i = 0; i < 7; i++) {
    if (WEEKDAYS[i].some(w => new RegExp(`\\b${w}\\b`).test(n))) {
      const ahead = (i - t.dia + 7) % 7 || 7; // "sábado" no sábado = o próximo
      const data = addDays(t.data, ahead);
      return { label: dayLabel(data), data };
    }
  }
  const m = /\b(\d{1,2})\s*[/-]\s*(\d{1,2})\b/.exec(n) || /\bdia\s+(\d{1,2})\b/.exec(n);
  if (m) {
    const [year, month] = t.data.split("-").map(Number);
    const day = parseInt(m[1], 10);
    let mon = m[2] ? parseInt(m[2], 10) : month;
    let yr = year;
    if (!m[2] && day < parseInt(t.data.slice(8), 10)) mon++; // "dia 3" já passou → mês seguinte
    if (mon > 12) { mon = 1; yr++; }
    const iso = `${yr}-${String(mon).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    if (day < 1 || day > 31 || mon < 1 || iso < t.data) return null;
    if (Number.isNaN(new Date(`${iso}T12:00:00Z`).getTime())) return null;
    return { label: dayLabel(iso), data: iso };
  }
  return null;
}

// -------------------------------------------------------
// Hora: "10h", "14:30", "às 9", ou período (manhã, tarde, fim da tarde)
// Devolve { label, minutos? } ou null
// -------------------------------------------------------
function parseTime(text) {
  const n = normalize(text);
  const m = /\b(\d{1,2})\s*(?:h|:|horas?)\s*(\d{2})?\b/.exec(n) || /\bas\s+(\d{1,2})\b/.exec(n) || /^(\d{1,2})$/.exec(n);
  if (m) {
    let h = parseInt(m[1], 10);
    const min = m[2] ? parseInt(m[2], 10) : 0;
    if (h >= 1 && h <= 8 && /\btarde\b/.test(n)) h += 12; // "3h da tarde"
    if (h > 23 || min > 59) return null;
    return { label: `às ${h}h${min ? String(min).padStart(2, "0") : ""}`, minutos: h * 60 + min };
  }
  if (/\bfim (da|de) tarde\b/.test(n)) return { label: "ao fim da tarde" };
  if (/\bmanha\b/.test(n)) return { label: "de manhã" };
  if (/\btarde\b/.test(n)) return { label: "à tarde" };
  if (/\bnoite\b/.test(n)) return { label: "à noite" };
  return null;
}

// Horário do salão nesse dia, para validar a hora pedida
function openingHours(iso) {
  const h = require("../data/horario.json");
  if ((h.fechado_em || []).includes(iso)) return null;
  const key = ["domingo", "segunda", "terca", "quarta", "quinta", "sexta", "sabado"][new Date(`${iso}T12:00:00Z`).getUTCDay()];
  return h.dias[key] || null;
}

const toMin = hhmm => hhmm.split(":").map(Number).reduce((h, m) => h * 60 + m);

// -------------------------------------------------------
// Estado da conversa
// -------------------------------------------------------
function getFlow(from) {
  const f = flows.get(from);
  if (f && Date.now() - f.updatedAt < FLOW_TTL_MS) return f;
  flows.delete(from);
  return null;
}

function isActive(from) {
  return Boolean(getFlow(from));
}

function cancel(from) {
  flows.delete(from);
}

// Próximo passo em falta
function nextStep(f) {
  if (!f.servico) return "servico";
  if (!f.dia) return "dia";
  if (!f.hora) return "hora";
  if (!f.nome) return "nome";
  return "fim";
}

// -------------------------------------------------------
// Pergunta do passo actual: { text, buttons? }
// -------------------------------------------------------
function prompt(f, profileName) {
  switch (nextStep(f)) {
    case "servico":
      return { text: "📅 Vamos preparar a sua marcação! Que serviço deseja? (ex.: cordoletes com cachos, unhas de gel, sobrancelhas)" };
    case "dia":
      return {
        text: `${f.servico}, óptimo! Para que dia? Pode escrever o dia (ex.: sábado, 15/11).`,
        buttons: [{ id: "book_dia_hoje", title: "Hoje" }, { id: "book_dia_amanha", title: "Amanhã" }],
      };
    case "hora":
      return {
        text: `${capitalize(f.dia.label)}. A que horas prefere? Pode escrever a hora (ex.: 10h) ou escolher:`,
        buttons: [{ id: "book_hora_manha", title: "De manhã" }, { id: "book_hora_tarde", title: "À tarde" }, { id: "book_hora_fim", title: "Fim da tarde" }],
      };
    case "nome":
      return {
        text: "Por fim, em que nome fica a marcação?",
        ...(profileName && { buttons: [{ id: "book_nome_perfil", title: `Sou ${profileName}`.slice(0, 20) }] }),
      };
    default:
      return null;
  }
}

function capitalize(s) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// -------------------------------------------------------
// Começa uma pré-marcação, aproveitando o que já vem na mensagem
// ("quero marcar cordoletes para sábado às 10h")
// -------------------------------------------------------
function start(from, text = "") {
  const f = { servico: findService(text), dia: parseDay(text), hora: null, nome: null, updatedAt: Date.now() };
  const hora = parseTime(text);
  if (hora && f.dia) f.hora = hora;
  flows.set(from, f);
  return f;
}

// -------------------------------------------------------
// Resposta do cliente ao passo actual. Devolve:
//   { reply: { text, buttons? } }                 → perguntar o passo seguinte
//   { done: { resumo, url, mensagem, marcacao } } → pedido pronto
// interactiveId: botão tocado (book_dia_hoje, book_nome_perfil…)
// -------------------------------------------------------
function answer(from, text, { interactiveId, profileName } = {}) {
  const f = getFlow(from);
  if (!f) return null;
  f.updatedAt = Date.now();
  const value = (text || "").trim();

  switch (nextStep(f)) {
    case "servico":
      f.servico = findService(value) || capitalize(value.slice(0, 60));
      // "unhas de gel para sábado" → aproveita o dia também
      if (!f.dia) f.dia = parseDay(value);
      break;

    case "dia": {
      const dia = interactiveId === "book_dia_hoje" ? parseDay("hoje")
        : interactiveId === "book_dia_amanha" ? parseDay("amanhã")
        : parseDay(value);
      if (!dia) return { reply: { text: "Não percebi o dia 🙈 Pode escrever, por exemplo, *sábado*, *amanhã* ou *15/11*?" } };
      const hours = openingHours(dia.data);
      if (!hours) return { reply: { text: `Nesse dia (${dia.label}) o salão está fechado. Escolha outro dia, por favor.` } };
      f.dia = dia;
      const hora = parseTime(value);
      if (hora) f.hora = hora;
      break;
    }

    case "hora": {
      const hora = { book_hora_manha: { label: "de manhã" }, book_hora_tarde: { label: "à tarde" }, book_hora_fim: { label: "ao fim da tarde" } }[interactiveId]
        || parseTime(value);
      if (!hora) return { reply: { text: "Não percebi a hora 🙈 Pode escrever, por exemplo, *10h*, *14:30* ou *de manhã*?" } };
      const hours = openingHours(f.dia.data);
      if (hora.minutos !== undefined && hours && (hora.minutos < toMin(hours[0]) || hora.minutos >= toMin(hours[1]))) {
        return { reply: { text: `Nesse dia abrimos das ${horario.horaCurta(hours[0])} às ${horario.horaCurta(hours[1])}. Que hora prefere dentro desse horário?` } };
      }
      f.hora = hora;
      break;
    }

    case "nome":
      f.nome = interactiveId === "book_nome_perfil" && profileName ? profileName : capitalize(value.slice(0, 40));
      if (!f.nome) return { reply: prompt(f, profileName) };
      break;
  }

  if (nextStep(f) !== "fim") return { reply: prompt(f, profileName) };

  // Pedido pronto
  flows.delete(from);
  const diaTexto = f.dia.label.replace(/^(hoje|amanhã), /, "$1, ");
  const mensagem = `Olá, sou ${f.nome}, quero marcar ${f.servico} para ${diaTexto}, ${f.hora.label}.`;
  const url = `https://wa.me/${TEAM_NUMBER}?text=${encodeURIComponent(mensagem)}`;
  const marcacao = save({ from, ...f });
  return { done: { resumo: `• Serviço: ${f.servico}\n• Dia: ${capitalize(f.dia.label)}\n• Hora: ${f.hora.label.replace(/^às /, "")}\n• Nome: ${f.nome}`, url, mensagem, marcacao } };
}

// -------------------------------------------------------
// Guarda a pré-marcação em data/marcacoes.json
// -------------------------------------------------------
function save({ from, servico, dia, hora, nome }) {
  const t = horario.agora();
  const marcacao = {
    id: crypto.randomUUID(),
    criadaEm: new Date().toISOString(),
    dataPedido: t.data,
    cliente: from,
    nome,
    servico,
    dia: dia.data,
    hora: hora.label,
  };
  const all = store.readJson("marcacoes.json", []);
  all.push(marcacao);
  store.writeJson("marcacoes.json", all);
  return marcacao;
}

module.exports = { start, answer, prompt, isActive, cancel, getFlow, findService, parseDay, parseTime };
