// ============================================================
// utils/horario.js
// Hora de Luanda, saudação (Bom dia/Boa tarde/Boa noite) e se o
// salão está aberto, a partir de src/data/horario.json.
// ============================================================

const horario = require("../data/horario.json");

const FUSO = "Africa/Luanda";
// Índice do getDay(): 0 = domingo
const DIAS = ["domingo", "segunda", "terca", "quarta", "quinta", "sexta", "sabado"];
const NOMES = ["domingo", "segunda-feira", "terça-feira", "quarta-feira", "quinta-feira", "sexta-feira", "sábado"];

// -------------------------------------------------------
// Data e hora actuais em Luanda (aceita uma data para os testes)
// -------------------------------------------------------
function agora(date = new Date()) {
  const partes = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: FUSO, year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", hourCycle: "h23", weekday: "short",
    }).formatToParts(date).map(p => [p.type, p.value])
  );
  const dia = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(partes.weekday);
  const hora = parseInt(partes.hour, 10);
  const minuto = parseInt(partes.minute, 10);
  return {
    dia,                                   // 0 = domingo
    hora,
    minuto,
    minutos: hora * 60 + minuto,
    data: `${partes.year}-${partes.month}-${partes.day}`,
    texto: `${NOMES[dia]}, ${partes.day}/${partes.month}/${partes.year}, ${partes.hour}:${partes.minute}`,
  };
}

function paraMinutos(hhmm) {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

// "08:00" → "8h", "08:30" → "8h30"
function horaCurta(hhmm) {
  const [h, m] = hhmm.split(":");
  return `${parseInt(h, 10)}h${m === "00" ? "" : m}`;
}

// Data AAAA-MM-DD somando dias (para os feriados)
function somarDias(data, n) {
  const d = new Date(`${data}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function horarioDoDia(diaSemana, data) {
  if ((horario.fechado_em || []).includes(data)) return null;
  return horario.dias[DIAS[diaSemana]] || null;
}

// -------------------------------------------------------
// Bom dia (5h–12h), Boa tarde (12h–19h), Boa noite
// -------------------------------------------------------
function saudacao(t = agora()) {
  if (t.hora >= 5 && t.hora < 12) return "Bom dia";
  if (t.hora >= 12 && t.hora < 19) return "Boa tarde";
  return "Boa noite";
}

// -------------------------------------------------------
// Aberto agora? Se não, quando abre (hoje, amanhã ou dia da semana)
// -------------------------------------------------------
function estado(t = agora()) {
  const hoje = horarioDoDia(t.dia, t.data);
  if (hoje && t.minutos >= paraMinutos(hoje[0]) && t.minutos < paraMinutos(hoje[1])) {
    return { aberto: true, fechaAs: hoje[1] };
  }
  // Ainda abre hoje?
  if (hoje && t.minutos < paraMinutos(hoje[0])) {
    return { aberto: false, abre: { quando: "hoje", as: hoje[0] } };
  }
  for (let n = 1; n <= 7; n++) {
    const dia = (t.dia + n) % 7;
    const h = horarioDoDia(dia, somarDias(t.data, n));
    if (h) return { aberto: false, abre: { quando: n === 1 ? "amanhã" : NOMES[dia], as: h[0] } };
  }
  return { aberto: false, abre: null };
}

// Frase pronta para o cliente
function estadoTexto(t = agora()) {
  const e = estado(t);
  if (e.aberto) return `Estamos abertos até às ${horaCurta(e.fechaAs)}.`;
  if (!e.abre) return "Neste momento estamos fechados.";
  const q = e.abre.quando;
  const quando = q === "hoje" || q === "amanhã" ? q : `${q === "sábado" || q === "domingo" ? "no" : "na"} ${q}`;
  return `Neste momento estamos fechados. Abrimos ${quando} às ${horaCurta(e.abre.as)}.`;
}

module.exports = { agora, saudacao, estado, estadoTexto, horaCurta };
