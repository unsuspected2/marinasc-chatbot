// ============================================================
// services/adminService.js
// Comandos da equipa, só aceites dos números em ADMIN_NUMBERS
// (por omissão o WhatsApp do salão, 946 397 096):
//   /stats            conversas e pré-marcações de hoje e da semana
//   /marcacoes        as últimas 10 pré-marcações
//   /promo texto      define a promoção activa (/promo off desliga)
//   /pausa, /retomar  desliga e volta a ligar o bot para os clientes
//   /admin            lista estes comandos
// ============================================================

const config = require("../config/env");
const store = require("../utils/store");
const promoService = require("./promoService");
const statsService = require("./statsService");
const logger = require("../utils/logger");

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

const HELP = "🛠️ *Comandos da equipa*\n\n/stats: conversas e pré-marcações\n/marcacoes: as últimas 10 pré-marcações\n/promo texto: define a promoção (ex.: /promo 10% nas tranças até sexta)\n/promo off: desliga as promoções\n/promo: mostra a promoção actual\n/pausa: o bot deixa de atender clientes\n/retomar: o bot volta a atender";

// -------------------------------------------------------
// Devolve o texto da resposta, ou null se não for comando de admin
// -------------------------------------------------------
function handleCommand(from, text) {
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
        + `🤖 Bot: ${isPaused() ? "⏸️ em pausa (/retomar para ligar)" : "✅ a atender"}\n`
        + `🎉 Promoção: ${promo ? promo.replace(/^🎉 /gm, "") : "nenhuma"}`;
    }

    case "/marcacoes":
    case "/marcações": {
      const ultimas = store.readJson("marcacoes.json", []).slice(-10).reverse();
      if (!ultimas.length) return "Ainda não há pré-marcações.";
      return `📅 *Últimas pré-marcações*\n\n${ultimas.map(m =>
        `• ${m.nome}: ${m.servico}, ${m.dia.split("-").reverse().join("/")} ${m.hora}\n   wa.me/${m.cliente} (pedido a ${m.dataPedido.split("-").reverse().join("/")})`).join("\n")}`;
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
