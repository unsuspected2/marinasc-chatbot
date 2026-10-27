// ============================================================
// services/adminService.js
// Comandos da equipa, só aceites dos números em ADMIN_NUMBERS
// (por omissão o WhatsApp do salão, 946 397 096):
//   /stats            conversas e pré-marcações de hoje e da semana
//   /marcacoes        as últimas 10 pré-marcações
//   /agenda [dia]     marcações de um dia (hoje por omissão)
//   /confirmar, /recusar, /cancelar CÓDIGO   e avisa o cliente
//   /ocupar dia hora serviço nome            marcação feita pela equipa
//   /bloquear dia [10h-13h], /desbloquear dia
//   /promo texto      define a promoção activa (/promo off desliga)
//   /pausa, /retomar  desliga e volta a ligar o bot para os clientes
//   /admin            lista estes comandos
// ============================================================

const config = require("../config/env");
const store = require("../utils/store");
const promoService = require("./promoService");
const statsService = require("./statsService");
const logger = require("../utils/logger");
const agenda = require("./agendaService");
const booking = require("./bookingService");
const whatsappService = require("./whatsappService");

const STATE_FILE = "estado.json";

function isAdmin(from) {
  return config.adminNumbers.includes(String(from).replace(/\D/g, ""));
}

function isPaused() {
  return Boolean(store.readJson(STATE_FILE, {}).pausado);
}

function setPaused(pausado, por) {
  store.writeJson(STATE_FILE, { pausado, desde: new Date().toISOString(), por });
}

function formatSummary(title, s) {
  const top = s.top.length ? `\n   Mais pedidos: ${s.top.map(([nome, n]) => `${nome} (${n})`).join(", ")}` : "";
  return `*${title}*\n   💬 ${s.conversas} conversa(s), ${s.mensagens} mensagem(ns)\n   📅 ${s.marcacoes} pré-marcação(ões)${top}`;
}

const HELP = "🛠️ *Comandos da equipa*\n\n*Agenda*\n/agenda: marcações de hoje (/agenda amanhã, /agenda sábado, /agenda 15/11)\n/confirmar K7Q2: confirma e avisa o cliente\n/recusar K7Q2 motivo: recusa, liberta a vaga e avisa o cliente\n/cancelar K7Q2 motivo: cancela uma marcação confirmada\n/ocupar sábado 10h cordoletes Maria: regista uma marcação feita no 946 ou ao telefone\n/bloquear 25/12 ou /bloquear sábado 14h-17h: o bot não marca nesse período\n/desbloquear 25/12\n\n*Outros*\n/stats: conversas e pré-marcações\n/marcacoes: os últimos 10 pedidos\n/promo texto: define a promoção (ex.: /promo 10% nas tranças até sexta)\n/promo off: desliga as promoções\n/promo: mostra a promoção actual\n/pausa: o bot deixa de atender clientes\n/retomar: o bot volta a atender";

// -------------------------------------------------------
// Devolve o texto da resposta, ou null se não for comando de admin
// -------------------------------------------------------
// Avisa o cliente; devolve uma nota para a equipa se não for possível
async function tellClient(m, text) {
  if (m.origem === "equipa" || !m.cliente) return "";
  try {
    await whatsappService.sendTextMessage(m.cliente, text);
    return "\nO cliente foi avisado. ✔️";
  } catch {
    return `\n⚠️ Não consegui avisar o cliente (a WhatsApp só deixa responder até 24 h depois da última mensagem dele). ${m.cliente.startsWith("ig:") ? "Responda-lhe no Instagram do salão." : `Avise-o pelo 946: wa.me/${m.cliente}`}`;
  }
}

// "10h-13h" / "10h às 13h" → { inicio, fim } em minutos
function parseRange(text) {
  const m = /(\d{1,2})(?:[h:](\d{2})?)?\s*(?:-|a|às|as|até|ate)\s*(\d{1,2})(?:[h:](\d{2})?)?/.exec(text);
  if (!m) return null;
  return { inicio: +m[1] * 60 + (+m[2] || 0), fim: +m[3] * 60 + (+m[4] || 0) };
}

async function handleCommand(from, text) {
  if (!isAdmin(from)) return null;
  const [cmd, ...rest] = text.trim().split(/\s+/);
  const arg = rest.join(" ").trim();

  switch (cmd.toLowerCase()) {
    case "/admin":
      return HELP;

    case "/stats": {
      const hoje = statsService.summary(statsService.lastDays(1));
      const semana = statsService.summary(statsService.lastDays(7));
      const promo = promoService.promoText();
      return `📊 *Estatísticas do bot*\n\n${formatSummary("Hoje", hoje)}\n\n${formatSummary("Últimos 7 dias", semana)}\n\n`
        + `⏳ Por confirmar: ${agenda.all().filter(m => m.estado === "pendente" && m.dia >= statsService.lastDays(1)[0]).length} (ver /agenda)\n`
        + `🤖 Bot: ${isPaused() ? "⏸️ em pausa (/retomar para ligar)" : "✅ a atender"}\n`
        + `🎉 Promoção: ${promo ? promo.replace(/^🎉 /gm, "") : "nenhuma"}`;
    }

    case "/agenda": {
      const dia = arg ? booking.parseDay(arg) : booking.parseDay("hoje");
      if (!dia) return "Não percebi o dia. Exemplos: /agenda, /agenda amanhã, /agenda sábado, /agenda 15/11";
      const lista = agenda.ofDay(dia.data);
      const bloqueios = agenda.blocks().filter(b => b.dia === dia.data);
      const hours = agenda.openingHours(dia.data);
      const cab = `📅 *Agenda de ${agenda.dayText(dia.data)}*${hours ? ` (${hours[0]}–${hours[1]})` : " (fechado)"}`;
      const linhas = lista.length ? lista.map(m => agenda.describe(m, { withClient: true })).join("\n") : "Sem marcações.";
      const bl = bloqueios.map(b => `⛔ Bloqueado ${b.inicio === undefined ? "o dia todo" : `${agenda.horaLabel(b.inicio)}–${agenda.horaLabel(b.fim)}`}${b.motivo ? ` (${b.motivo})` : ""}`).join("\n");
      const pend = lista.filter(m => (m.estado || "pendente") === "pendente").length;
      return `${cab}\n\n${linhas}${bl ? `\n${bl}` : ""}${pend ? `\n\n⏳ ${pend} por confirmar: /confirmar CÓDIGO` : ""}`;
    }

    case "/confirmar":
    case "/recusar":
    case "/cancelar": {
      const [codigo, ...motivoParts] = rest;
      const motivo = motivoParts.join(" ").trim();
      const m = agenda.find(codigo);
      if (!m) return `Não encontrei a marcação ${codigo || ""}. Veja os códigos com /agenda.`;
      const estado = (m.estado || "pendente");
      if (!["pendente", "confirmada"].includes(estado)) return `A marcação #${m.codigo} já está ${estado}.`;
      if (cmd.toLowerCase() === "/confirmar") {
        if (estado === "confirmada") return `A marcação #${m.codigo} já estava confirmada.`;
        const c = agenda.setState(m.codigo, "confirmada", { por: from });
        const nota = await tellClient(c, `✅ *Marcação confirmada!*\n\n${c.servico}, ${agenda.dayText(c.dia)}, às ${agenda.horaLabel(c.inicio)} (#${c.codigo}).\n📍 Centralidade do Kilamba, Edifício C19, Apt. 41.\n\nSe precisar de mudar, escreva *remarcar*; para cancelar, *cancelar marcação*. Até lá! 💖`);
        logger.info("Marcação confirmada pela equipa", { codigo: c.codigo });
        return `✅ #${c.codigo} confirmada.${nota}`;
      }
      const novo = cmd.toLowerCase() === "/recusar" ? "recusada" : "cancelada";
      const c = agenda.setState(m.codigo, novo, { por: from, ...(motivo && { motivo }) });
      const nota = await tellClient(c, `😔 Lamentamos, a sua marcação de ${c.servico} para ${agenda.dayText(c.dia)}, às ${agenda.horaLabel(c.inicio)} (#${c.codigo}) não pode ser ${novo === "recusada" ? "confirmada" : "mantida"}.`
        + (motivo ? `\nMotivo: ${motivo}` : "") + "\n\nQuer escolher outro dia ou hora? Escreva *marcar*. 💖");
      logger.info(`Marcação ${novo} pela equipa`, { codigo: c.codigo });
      return `${novo === "recusada" ? "❌" : "🚫"} #${c.codigo} ${novo}; a vaga ficou livre.${nota}`;
    }

    case "/ocupar": {
      const dia = booking.parseDay(arg);
      const hora = booking.parseTime(arg.replace(/\b\d{1,2}\s*[/-]\s*\d{1,2}\b/, " "));
      const servico = booking.findService(arg);
      if (!dia || hora?.minutos === undefined || !servico) {
        return "Formato: /ocupar dia hora serviço nome\nEx.: /ocupar sábado 10h cordoletes Maria\n     /ocupar 15/11 14h30 unhas de gel Ana";
      }
      const why = agenda.whyNot(dia.data, hora.minutos, servico);
      const aviso = why === "ocupado" ? "\n⚠️ Atenção: já estava cheio nesse horário (registei na mesma)."
        : why === "fora_do_horario" ? "\n⚠️ Atenção: fica fora do horário de abertura (registei na mesma)." : "";
      const nome = arg.replace(/.*\b\d{1,2}(?:\s*h(?:\d{2})?|:\d{2})\b/i, "").replace(new RegExp(servico.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"), "").replace(/^\s*(de|com cachos)\s+/i, "").trim() || "Cliente da equipa";
      const m = agenda.create({ cliente: "", nome, servico, dia: dia.data, inicio: hora.minutos, estado: "confirmada", origem: "equipa" });
      return `✅ Registado: ${agenda.describe(m, { withClient: true })}${aviso}\nPara apagar: /cancelar ${m.codigo}`;
    }

    case "/bloquear": {
      const dia = booking.parseDay(arg);
      if (!dia) return "Formato: /bloquear dia [das-até]\nEx.: /bloquear 25/12 · /bloquear sábado 14h-17h";
      const range = parseRange(arg.replace(/\b\d{1,2}\s*\/\s*\d{1,2}\b/, " "));
      agenda.block(dia.data, range?.inicio, range?.fim);
      const afectadas = agenda.ofDay(dia.data).filter(m => !range || (m.inicio < range.fim && m.inicio + m.duracao > range.inicio));
      return `⛔ ${agenda.dayText(dia.data)} bloqueado ${range ? `das ${agenda.horaLabel(range.inicio)} às ${agenda.horaLabel(range.fim)}` : "o dia todo"}. O bot não marca nesse período.`
        + (afectadas.length ? `\n\n⚠️ Já há marcações nesse período:\n${afectadas.map(m => agenda.describe(m, { withClient: true })).join("\n")}\nUse /cancelar CÓDIGO motivo para as cancelar e avisar.` : "");
    }

    case "/desbloquear": {
      const dia = booking.parseDay(arg);
      if (!dia) return "Formato: /desbloquear 25/12";
      const n = agenda.unblock(dia.data);
      return n ? `✅ ${agenda.dayText(dia.data)} desbloqueado.` : "Esse dia não tinha bloqueios.";
    }

    case "/marcacoes":
    case "/marcações": {
      const ultimas = agenda.all().filter(m => m.codigo).slice(-10).reverse();
      if (!ultimas.length) return "Ainda não há pedidos de marcação.";
      return `📅 *Últimos pedidos*\n\n${ultimas.map(m => agenda.describe(m, { withClient: true })).join("\n")}\n\n⏳ pendente · ✅ confirmada · ❌ recusada · 🚫 cancelada`;
    }

    case "/promo": {
      if (!arg) {
        const promo = promoService.promoText();
        return promo ? `Promoção activa:\n${promo}\n\nPara mudar: /promo novo texto · Para desligar: /promo off` : "Não há promoções activas. Para criar: /promo texto da promoção";
      }
      if (/^(off|desligar|nenhuma|remover)$/i.test(arg)) {
        promoService.clearPromos();
        logger.info("Promoções desligadas pelo admin", { from });
        return "✅ Promoções desligadas. O bot deixa de as mostrar.";
      }
      promoService.setPromo(arg.slice(0, 300));
      logger.info("Promoção definida pelo admin", { from });
      return `✅ Promoção activa:\n🎉 ${arg}\n\nO bot passa a mostrá-la no menu e nas respostas. Para desligar: /promo off`;
    }

    case "/pausa":
      setPaused(true, from);
      logger.warn("Bot em pausa (pedido do admin)", { from });
      return "⏸️ Bot em pausa. Os clientes que escreverem recebem só o link do 946 397 096. Para voltar: /retomar";

    case "/retomar":
      setPaused(false, from);
      logger.info("Bot retomado (pedido do admin)", { from });
      return "▶️ Bot a atender outra vez.";

    default:
      return null;
  }
}

module.exports = { isAdmin, isPaused, handleCommand };
