// ============================================================
// controllers/messageController.js
// Cérebro do chatbot: orquestra todo o fluxo de decisão.
//
// Pipeline de processamento:
//  1. Parse do payload recebido e descarte de repetidos
//  2. Marcar mensagem como lida + "a escrever..."
//  3. Áudio → transcrição; comprovativo do sinal → equipa; foto/vídeo → equipa
//  4. Comandos da equipa (/stats, /promo, /pausa…) e bot em pausa
//  5. Pré-marcação (serviço → dia → hora → nome → link para a equipa)
//  6. Botões e listas interactivas, números do menu (1 a 9), comandos
//  7. Cumprimento simples → menu com saudação pela hora de Luanda
//  8. Conversa livre: OpenAI, com o histórico da conversa
//  9. Sem IA: keywords de fluxos especiais e FAQ
// ============================================================

const config          = require("../config/env");
const whatsappService = require("../services/whatsappService");
const faqService      = require("../services/faqService");
const aiService       = require("../services/aiService");
const bookingService  = require("../services/bookingService");
const agendaService   = require("../services/agendaService");
const promoService    = require("../services/promoService");
const statsService    = require("../services/statsService");
const adminService    = require("../services/adminService");
const horario         = require("../utils/horario");
const logger          = require("../utils/logger");
const store           = require("../utils/store");

const TEAM_URL = "https://wa.me/244946397096";

// -------------------------------------------------------
// Mapeamento de keywords → fluxos customizados
// Adicione novas palavras-chave e fluxos aqui facilmente
// -------------------------------------------------------
const KEYWORD_FLOWS = {
  // Palavras que disparam o menu principal
  menuTriggers: ["menu", "opções", "opcoes", "options", "ajuda", "help",
                  "início", "inicio", "start", "oi", "olá", "ola", "boas",
                  "hello", "hi", "hey", "bom dia", "boa tarde", "boa noite"],

  // Palavras que indicam interesse em falar com humano
  humanTriggers: ["atendente", "humano", "pessoa", "humana", "real person",
                   "falar com alguém", "falar com alguem", "speak to someone",
                   "cabeleireira", "gerente"],

  // Palavras que indicam reclamação
  complaintTriggers: ["reclamação", "reclamacao", "complaint", "problema",
                       "errado", "errada", "incorreto", "insatisfeito", "insatisfeita",
                       "chateado", "chateada", "mal atendido", "mal atendida"],

  // Perguntas de preço (sem resposta no FAQ → "o preço depende")
  priceTriggers: ["quanto", "qt", "qto", "preço", "preco", "custa", "valor", "price", "cost"],

  // Pedidos de marcação → fluxo de pré-marcação
  bookingTriggers: ["marcar", "marcacao", "marcação", "agendar", "reservar", "fazer uma marcacao", "book", "appointment"],

  // Ver, cancelar ou mudar marcações já feitas
  myBookingsTriggers: ["minhas marcacoes", "minha marcacao", "minhas marcações", "minha marcação", "ver marcacao", "ver marcação", "tenho marcacao", "tenho marcação"],
  cancelBookingTriggers: ["cancelar marcacao", "cancelar marcação", "cancelar a marcacao", "cancelar a marcação", "desmarcar", "cancelar o pedido", "nao vou poder ir", "não vou poder ir"],
  rescheduleTriggers: ["remarcar", "mudar a marcacao", "mudar a marcação", "mudar marcacao", "mudar marcação", "trocar a hora", "mudar a hora", "mudar o dia", "adiar"],

  // Sair da pré-marcação
  cancelTriggers: ["cancelar", "cancela", "sair", "parar", "desistir", "menu", "cancel"],

  // Promoções
  promoTriggers: ["promo", "promocao", "promoção", "promoções", "promocoes", "desconto", "descontos", "campanha"],
};

// Palavras de cortesia que não mudam um cumprimento ("olá, tudo bem?")
const GREETING_FILLER = ["tudo bem", "td bem", "tudo bom", "como esta", "como estao",
                          "boas", "bom", "boa", "dia", "tarde", "noite", "e ai", "ei"];

// -------------------------------------------------------
// Opções do menu principal (lista interactiva e menu em texto)
// O número de cada opção continua a funcionar escrito ("1" a "9").
// As novas vão para o fim, para os números antigos não mudarem.
// -------------------------------------------------------
const MENU_OPTIONS = {
  pt: [
    { title: "Tranças e twists", description: "Bobes, cordoletes, twists, dreads…", text: "💇🏾‍♀️ Tranças e twists (preços)" },
    { title: "Unhas", description: "Gelinho, gel, porcelana, pedicure", text: "💅🏾 Unhas (preços)" },
    { title: "Sobrancelhas e pestanas", description: "Sobrancelhas, pestanas e henna", text: "✨ Sobrancelhas, pestanas e henna" },
    { title: "Cabelo e aplicação", description: "Aplicação, tratamentos, perucas", text: "💆🏾‍♀️ Cabelo e aplicação" },
    { title: "Horário e localização", description: "Kilamba, Edifício C19", text: "📍 Horário e localização" },
    { title: "Fazer uma marcação", description: "Preparamos o pedido para a equipa", text: "📅 Fazer uma marcação" },
    { title: "Falar com a equipa", description: "WhatsApp do salão 946 397 096", text: "👤 Falar com a nossa equipa" },
    { title: "Spa e estética", description: "Massagens, limpeza facial, depilação", text: "🌸 Spa e estética (preços)" },
    { title: "Barbearia", description: "Corte, degradê, barba", text: "💈 Barbearia (preços)" },
  ],
  en: [
    { title: "Braids and twists", description: "Prices", text: "💇🏾‍♀️ Braids and twists (prices)" },
    { title: "Nails", description: "Prices", text: "💅🏾 Nails (prices)" },
    { title: "Brows and lashes", description: "Brows, lashes and henna", text: "✨ Brows, lashes and henna" },
    { title: "Hair and extensions", description: "Prices", text: "💆🏾‍♀️ Hair and extensions" },
    { title: "Hours and location", description: "Kilamba, Building C19", text: "📍 Opening hours and location" },
    { title: "Book an appointment", description: "We prepare the request for the team", text: "📅 Book an appointment" },
    { title: "Talk to our team", description: "Salon WhatsApp +244 946 397 096", text: "👤 Talk to our team" },
    { title: "Spa and beauty", description: "Massages, facials, waxing", text: "🌸 Spa and beauty (prices)" },
    { title: "Barber shop", description: "Cuts, fades, beard", text: "💈 Barber shop (prices)" },
  ],
};

// Opção do menu → chave do FAQ (null = falar com a equipa)
const MENU_FAQ_KEYS = ["menu_trancas", "menu_unhas", "menu_rosto", "menu_cabelo", "menu_horario", "menu_marcar", null, "menu_spa", "menu_barbearia"];
// Ordem em que aparecem: preços primeiro, depois o salão
const MENU_ORDER = [0, 1, 2, 3, 7, 8, 4, 5, 6];

// Botões que seguem as respostas de preços: o próximo passo
const NEXT_STEP_BUTTONS = {
  pt: [{ id: "btn_marcar", title: "📅 Marcar" }, { id: "btn_menu", title: "📋 Ver opções" }, { id: "btn_equipa", title: "👤 Falar c/ equipa" }],
  en: [{ id: "btn_marcar", title: "📅 Book" }, { id: "btn_menu", title: "📋 Options" }, { id: "btn_equipa", title: "👤 Talk to team" }],
};

// -------------------------------------------------------
// Este número é só do bot: a equipa atende no WhatsApp do salão
// -------------------------------------------------------
const TEAM_CONTACT = {
  pt: "👤 A nossa equipa atende no WhatsApp do salão, *946 397 096*. Toque no botão para falar connosco. 💖",
  en: "👤 Our team answers on the salon WhatsApp, *+244 946 397 096*. Tap the button to talk to us. 💖",
};

// -------------------------------------------------------
// Resposta quando algo falha (Meta, OpenAI ou o próprio bot)
// -------------------------------------------------------
const FALLBACK = {
  pt: `Desculpe, tive um problema. Fale connosco: ${TEAM_URL}`,
  en: `Sorry, something went wrong. Talk to us: ${TEAM_URL}`,
};

// -------------------------------------------------------
// Mensagens já tratadas (message.id → hora). A Meta pode reenviar
// o mesmo evento; assim o cliente nunca recebe a resposta duas vezes.
// -------------------------------------------------------
const SEEN_TTL_MS = 24 * 60 * 60 * 1000;
const seenMessages = store.persistentMap("mensagens-vistas.json", SEEN_TTL_MS);

function isDuplicate(messageId) {
  if (seenMessages.has(messageId)) return true;
  seenMessages.set(messageId, { updatedAt: Date.now() });
  return false;
}

// Clientes que já receberam o aviso de pausa (limpa quando o bot retoma)
const pausedNotified = store.persistentMap("aviso-pausa.json");

// -------------------------------------------------------
// Comandos especiais do sistema
// -------------------------------------------------------
const COMMANDS = {
  "/start": handleStart,
  "/help":  handleHelp,
  "/menu":  handleMenuCommand,
  "/reset": handleReset,
  "/faq":   handleFaqList,
};

// -------------------------------------------------------
// Handlers de comandos especiais
// -------------------------------------------------------

async function handleStart(to, name, lang) {
  aiService.clearMemory(to);
  await sendMenu(to, lang, name);
}

async function handleHelp(to, _name, lang) {
  const text = lang === "en"
    ? `ℹ️ *Help*\n\nYou can:\n• Ask questions directly\n• Tap the options or type a number from the menu\n• Send a voice note\n• Use commands:\n  /start — Restart\n  /menu — Show menu\n  /reset — Clear conversation history\n\nNeed human support? Just ask!`
    : `ℹ️ *Ajuda*\n\nPode:\n• Fazer perguntas directamente (ex.: "quanto custa cordoletes?")\n• Tocar nas opções ou escrever um número do menu\n• Enviar um áudio\n• Usar comandos:\n  /start — Recomeçar\n  /menu — Ver menu\n  /reset — Apagar o histórico da conversa\n\nPrefere falar com a nossa equipa? É só pedir!`;

  await whatsappService.sendTextMessage(to, text);
}

async function handleMenuCommand(to, name, lang) {
  await sendMenu(to, lang, name);
}

async function handleReset(to, _name, lang) {
  aiService.clearMemory(to);
  const text = lang === "en"
    ? "🔄 Conversation history cleared. Let's start fresh! How can I help you?"
    : "🔄 Histórico da conversa apagado. Vamos começar do zero! Como posso ajudar?";

  await whatsappService.sendTextMessage(to, text);
}

async function handleFaqList(to, _name, lang) {
  const faqs = faqService.getAllFaqs();
  const keys = Object.keys(faqs).filter(k => !k.startsWith("menu_"));
  const text = lang === "en"
    ? `📚 I can answer questions about:\n${keys.slice(0, 15).join(", ")}`
    : `📚 Posso responder sobre:\n${keys.slice(0, 15).join(", ")}`;

  await whatsappService.sendTextMessage(to, text);
}

// Primeiro nome do perfil do WhatsApp ("Josaid do Nascimento" → "Josaid")
function firstName(name) {
  const first = (name || "").trim().split(/\s+/)[0] || "";
  return /\p{L}/u.test(first) ? first : "";
}

// -------------------------------------------------------
// Envia menu principal: lista interactiva com saudação pela hora
// de Luanda e aviso se o salão estiver fechado.
// -------------------------------------------------------
async function sendMenu(to, lang, name) {
  const t = horario.agora();
  const nome = firstName(name);
  const status = horario.estado(t);

  let body;
  if (lang === "en") {
    const hello = t.hora >= 5 && t.hora < 12 ? "Good morning" : t.hora < 19 && t.hora >= 12 ? "Good afternoon" : "Good evening";
    body = `💖 ${hello}${nome ? `, ${nome}` : ""}! Welcome to *MARINASC Beauty Salon*.`
      + (status.aberto ? "" : `\n\nWe're closed right now (${horario.estadoTexto(t).replace(/^Neste momento estamos fechados\.\s*/, "")}). You can still leave your booking request and the team confirms when we open.`)
      + "\n\nHow can we help?";
  } else {
    body = `💖 ${horario.saudacao(t)}${nome ? `, ${nome}` : ""}! Boas-vindas ao *MARINASC Salão de Beleza*.\n${horario.estadoTexto(t)}`
      + (status.aberto ? "" : "\nPode deixar já o seu pedido de marcação e a equipa confirma quando abrirmos. 📅")
      + "\n\nComo podemos ajudar?";
  }

  const promo = promoService.promoText();
  if (promo) body = body.replace(/\n\n(Como podemos ajudar\?|How can we help\?)$/, `\n\n${promo}\n\n$1`);

  const options = MENU_OPTIONS[lang] || MENU_OPTIONS.pt;
  const rows = options.map((o, i) => ({ id: `menu_${i + 1}`, title: o.title, description: o.description }));
  const textMenu = `${body}\n\n${MENU_ORDER.map(i => `${i + 1}. ${options[i].text}`).join("\n")}`
    + (lang === "en" ? "\n\nType a number or ask your question. 😊" : "\n\nEscreva o número ou a sua pergunta. 😊");

  await whatsappService.sendList(to, {
    header: "MARINASC",
    body,
    footer: lang === "en" ? "You can also type your question" : "Também pode escrever a sua pergunta",
    button: lang === "en" ? "See options" : "Ver opções",
  }, [
    { title: lang === "en" ? "Prices" : "Preços", rows: MENU_ORDER.slice(0, 6).map(i => rows[i]) },
    { title: lang === "en" ? "Salon" : "Salão", rows: MENU_ORDER.slice(6).map(i => rows[i]) },
  ], textMenu);

  aiService.addToHistory(to, "assistant", textMenu);
}

// -------------------------------------------------------
// Resposta com os botões do próximo passo (marcar, menu, equipa)
// -------------------------------------------------------
async function sendWithNextStep(to, text, lang) {
  // Os botões só levam 1024 caracteres; textos maiores seguem antes
  if (text.length > 1000) {
    await whatsappService.sendTextMessage(to, text);
    text = lang === "en" ? "What would you like to do next?" : "O que deseja fazer a seguir?";
  }
  await whatsappService.sendButtons(to, text, NEXT_STEP_BUTTONS[lang] || NEXT_STEP_BUTTONS.pt);
}

// Botão que abre o WhatsApp da equipa
async function sendTeamContact(to, lang, message = TEAM_CONTACT[lang] || TEAM_CONTACT.pt) {
  await whatsappService.sendLinkButton(to, message, lang === "en" ? "Open WhatsApp" : "Abrir WhatsApp", TEAM_URL);
}

// -------------------------------------------------------
// Processa uma opção do menu (1 a 9), escrita ou tocada na lista
// -------------------------------------------------------
async function handleMenuSelection(to, number, lang) {
  const index = parseInt(number, 10) - 1;
  if (!(index >= 0 && index < MENU_FAQ_KEYS.length)) return false;

  const key = MENU_FAQ_KEYS[index];
  const options = MENU_OPTIONS[lang] || MENU_OPTIONS.pt;
  let answer;

  if (key === null) {
    // Opção 7: falar com a equipa
    answer = TEAM_CONTACT[lang] || TEAM_CONTACT.pt;
    await sendTeamContact(to, lang);
  } else if (key === "menu_marcar") {
    // Opção 6: pré-marcação guiada
    await startBooking(to, "", null);
    return true;
  } else {
    answer = faqService.findAnswer(key);
    if (!answer) return false;
    await sendWithNextStep(to, answer, lang);
  }

  // A IA fica a saber o que a pessoa escolheu, para a conversa continuar daí
  aiService.addToHistory(to, "user", options[index].title);
  aiService.addToHistory(to, "assistant", answer);
  return true;
}

// -------------------------------------------------------
// Botões e listas interactivas
// -------------------------------------------------------
async function handleInteractive(to, name, id, lang, title) {
  if ((id || "").startsWith("bk_")) {
    await handleBookingAction(to, name, id);
    return true;
  }
  if ((id || "").startsWith("book_")) {
    if (!bookingService.isActive(to)) return startBooking(to, "", name).then(() => true);
    await continueBooking(to, title, name, id);
    return true;
  }

  const menuMatch = /^menu_(\d)$/.exec(id || "");
  if (menuMatch) return handleMenuSelection(to, menuMatch[1], lang);

  switch (id) {
    case "btn_menu":   await sendMenu(to, lang, name); return true;
    case "btn_marcar": return handleMenuSelection(to, "6", lang);
    case "btn_equipa": return handleMenuSelection(to, "7", lang);
    default:           return false;
  }
}

// -------------------------------------------------------
// Normaliza texto para comparação de keywords
// -------------------------------------------------------
function normalizeText(text) {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim();
}

// -------------------------------------------------------
// Verifica se texto contém algum trigger de uma lista
// -------------------------------------------------------
function containsTrigger(normalizedText, triggers) {
  // Palavra inteira: evita que "oi" dispare dentro de "noite" ou "depois"
  return triggers.some(t => {
    const escaped = normalizeText(t).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`).test(normalizedText);
  });
}

// -------------------------------------------------------
// É só um cumprimento? ("olá", "bom dia, tudo bem?", "oi Marinasc")
// Se sobrar uma pergunta ("oi, quanto custa bobes?") não é.
// -------------------------------------------------------
function isGreetingOnly(normalizedText) {
  if (!containsTrigger(normalizedText, KEYWORD_FLOWS.menuTriggers)) return false;
  let rest = ` ${normalizedText.replace(/[^a-z0-9\s]/g, " ")} `;
  for (const w of [...KEYWORD_FLOWS.menuTriggers, ...GREETING_FILLER, "marinasc"].map(normalizeText)) {
    rest = rest.split(` ${w} `).join(" ");
  }
  return rest.trim().split(/\s+/).filter(Boolean).length <= 1;
}

// -------------------------------------------------------
// Pré-marcação: envia a pergunta do passo actual ou o pedido pronto
// -------------------------------------------------------
async function sendBookingStep(to, result, name) {
  if (!result) return;
  if (result.reply) {
    const { text, buttons, list } = result.reply;
    const rows = list?.sections.flatMap(sec => sec.rows) || [];
    if (rows.length) {
      await whatsappService.sendList(to, { body: text, button: list.button }, list.sections,
        `${text}\n\nHoras livres: ${rows.map(r => r.title).join(", ")}`);
    } else if (buttons?.length) {
      await whatsappService.sendButtons(to, text, buttons);
    } else {
      await whatsappService.sendTextMessage(to, text);
    }
    aiService.addToHistory(to, "assistant", text);
    return;
  }

  const { resumo, url, marcacao, substituida } = result.done;
  const status = horario.estado();
  const pago = marcacao.sinalPago || marcacao.comprovativoEm;
  const text = `✅ Pedido de marcação registado!\n\n${resumo}\n\n`
    + (pago
      ? `💳 O sinal da marcação anterior (#${substituida.codigo}) passa para esta. A equipa confirma a nova hora aqui.`
      : `${agendaService.depositText(marcacao)}\n\nA vaga fica reservada para si e a equipa confirma aqui assim que o sinal entrar na conta.`)
    + (substituida ? `\n\nA marcação anterior (#${substituida.codigo}) foi cancelada.` : "")
    + (status.aberto ? "" : `\n\n🕘 ${horario.estadoTexto()} A equipa confirma assim que abrirmos.`)
    + "\n\nDúvidas? Toque em *Enviar à equipa* (946 397 096). 💖";
  await whatsappService.sendLinkButton(to, text, "Enviar à equipa", url);
  // As regras das faltas vão à parte (o botão só aceita 1024 caracteres)
  await whatsappService.sendTextMessage(to, `ℹ️ ${agendaService.POLICY}`);
  aiService.addToHistory(to, "assistant", `${text}\n\n${agendaService.POLICY}`);
  logger.info("📅 Pré-marcação registada", { from: to, codigo: marcacao.codigo, servico: marcacao.servico, dia: marcacao.dia });
  await notifyTeam(`📅 *${substituida ? "Remarcação" : "Novo pedido de marcação"}*\n\n${agendaService.describe(marcacao, { withClient: true })}`
    + (substituida ? `\n   (substitui #${substituida.codigo})` : "")
    + (marcacao.sinal && !pago ? `\n   💳 Sinal pedido: ${agendaService.kz(marcacao.sinal.valor)}` : !marcacao.sinal ? "\n   💳 Preço sob consulta: diga à cliente o valor do sinal (30%)" : "")
    + `\n\nQuando o sinal entrar na conta: /confirmar ${marcacao.codigo}\nPara recusar: /recusar ${marcacao.codigo} motivo`);
}

// -------------------------------------------------------
// Avisa a equipa (946) pelo bot. A Meta só entrega se a equipa tiver
// escrito ao bot nas últimas 24 h; senão o pedido continua na agenda
// (/agenda) e no link "Enviar à equipa" do cliente.
// -------------------------------------------------------
async function notifyTeam(text) {
  for (const admin of config.adminNumbers) {
    try {
      await whatsappService.sendTextMessage(admin, text);
    } catch {
      logger.warn("Não foi possível avisar a equipa pelo bot (janela de 24 h?)", { admin });
    }
  }
}

// -------------------------------------------------------
// Cliente: ver, cancelar e remarcar marcações já feitas
// -------------------------------------------------------
async function sendMyBookings(to, intent = "ver") {
  const mine = agendaService.upcomingOf(to);
  if (!mine.length) {
    await sendWithNextStep(to, "Não encontrei marcações futuras neste número. Quer fazer uma? Toque em *Marcar*. 😊", "pt");
    return;
  }
  const list = mine.map(m => agendaService.describe(m)).join("\n");
  const semSinal = mine.find(m => m.estado === "pendente" && !m.sinalPago && !m.comprovativoEm);
  const legenda = "\n\n⏳ à espera da confirmação da equipa · ✅ confirmada"
    + (semSinal ? `\n\nFalta o sinal de #${semSinal.codigo}.\n${agendaService.depositText(semSinal)}` : "");
  if (mine.length === 1) {
    const m = mine[0];
    const pergunta = intent === "cancelar" ? "Quer mesmo cancelar?" : intent === "remarcar" ? "Quer mudar para outro dia ou hora?" : "O que deseja fazer?";
    const buttons = intent === "cancelar"
      ? [{ id: `bk_cancelar_${m.codigo}`, title: "Sim, cancelar" }, { id: "btn_menu", title: "Não, manter" }]
      : [{ id: `bk_remarcar_${m.codigo}`, title: "Mudar dia/hora" }, { id: `bk_cancelar_${m.codigo}`, title: "Cancelar" }, { id: "btn_menu", title: "Ver opções" }];
    await whatsappService.sendButtons(to, `📅 A sua marcação:\n${list}${legenda}\n\n${pergunta}`, buttons);
    return;
  }
  const rows = mine.slice(0, 10).map(m => ({
    id: `bk_escolher_${m.codigo}`,
    title: `#${m.codigo} ${agendaService.horaLabel(m.inicio)}`,
    description: `${m.servico}, ${agendaService.dayText(m.dia)}`,
  }));
  await whatsappService.sendList(to, { body: `📅 As suas marcações:\n${list}${legenda}\n\nEscolha uma para mudar ou cancelar.`, button: "Escolher" },
    [{ title: "Marcações", rows }], `📅 As suas marcações:\n${list}${legenda}\n\nPara cancelar, escreva *cancelar #CÓDIGO*.`);
}

async function handleBookingAction(to, name, id) {
  const [, action, codigo] = /^bk_(\w+?)_(\w+)$/.exec(id) || [];
  const m = agendaService.find(codigo);
  if (!m || m.cliente !== to || !["pendente", "confirmada"].includes(m.estado || "pendente")) {
    await sendWithNextStep(to, "Essa marcação já não está activa. Quer fazer uma nova? Toque em *Marcar*.", "pt");
    return;
  }
  if (action === "escolher") {
    await whatsappService.sendButtons(to, `${agendaService.describe(m)}\n\nO que deseja fazer?`,
      [{ id: `bk_remarcar_${m.codigo}`, title: "Mudar dia/hora" }, { id: `bk_cancelar_${m.codigo}`, title: "Cancelar" }, { id: "btn_menu", title: "Manter" }]);
    return;
  }
  if (action === "cancelar") {
    agendaService.setState(m.codigo, "cancelada", { motivo: "cancelada pelo cliente" });
    const sinal = m.sinalPago || m.comprovativoEm ? " Sobre o sinal que já pagou, a equipa fala consigo." : "";
    await sendWithNextStep(to, `🚫 Marcação #${m.codigo} cancelada. Obrigada por avisar!${sinal} Quando quiser, marcamos outra. 💖`, "pt");
    logger.info("Marcação cancelada pelo cliente", { from: to, codigo: m.codigo });
    await notifyTeam(`🚫 *Cliente cancelou*\n\n${agendaService.describe({ ...m, estado: "cancelada" }, { withClient: true })}\n\nA vaga ficou livre.`);
    return;
  }
  if (action === "remarcar") {
    bookingService.startReschedule(to, m);
    await sendBookingStep(to, { reply: bookingService.prompt(bookingService.getFlow(to), firstName(name)) }, name);
  }
}

async function startBooking(to, text, name) {
  bookingService.start(to, text);
  await sendBookingStep(to, { reply: bookingService.prompt(bookingService.getFlow(to), firstName(name)) }, name);
}

async function continueBooking(to, text, name, interactiveId) {
  const profileName = firstName(name);
  await sendBookingStep(to, bookingService.answer(to, text, { interactiveId, profileName }), name);
}

// -------------------------------------------------------
// Áudio: transcreve com o Whisper e trata como texto escrito
// -------------------------------------------------------
async function transcribeIncomingAudio(mediaId) {
  try {
    const { buffer, mimeType } = await whatsappService.downloadMedia(mediaId);
    return await aiService.transcribeAudio(buffer, mimeType);
  } catch (err) {
    logger.error("Não foi possível descarregar o áudio", err);
    return null;
  }
}

// -------------------------------------------------------
// Comprovativo do sinal: foto ou PDF de quem tem uma marcação à espera
// do sinal. Fica registado na marcação e vai para a equipa verificar.
// -------------------------------------------------------
async function handleReceipt(to, type, mediaId) {
  if (!["image", "document"].includes(type)) return false;
  const hoje = horario.agora().data;
  // O pedido à espera do sinal; senão, um que expirou há pouco (comprovativo fora do prazo)
  const m = agendaService.upcomingOf(to).find(agendaService.semSinal)
    || agendaService.all().filter(x => x.cliente === to && x.dia >= hoje && !x.comprovativoEm
      && (x.estado === "expirada" || agendaService.semSinal(x))).pop();
  if (!m) return false;
  const atrasado = m.estado === "expirada" || !agendaService.upcomingOf(to).some(x => x.codigo === m.codigo);
  const c = agendaService.setState(m.codigo, m.estado || "pendente", { comprovativoEm: new Date().toISOString() });
  const legenda = `💳 Comprovativo do sinal de #${c.codigo}${c.sinal ? ` (${agendaService.kz(c.sinal.valor)})` : ""}${atrasado ? " ⌛ chegou depois do prazo" : ""}\n${agendaService.describe(c, { withClient: true })}\n\nVerifique a transferência na conta e depois: /confirmar ${c.codigo}`
    + (atrasado ? " (o bot avisa se a hora já tiver sido ocupada)" : "");
  let enviado = false;
  for (const admin of config.adminNumbers) {
    try {
      await whatsappService.forwardMedia(admin, mediaId, type, legenda);
      enviado = true;
    } catch (err) {
      logger.warn("Não foi possível reenviar o comprovativo à equipa", { admin, erro: err.message });
    }
  }
  if (!enviado) await notifyTeam(legenda.replace("Comprovativo", "Chegou o comprovativo"));
  const text = atrasado
    ? `💳 Recebemos o comprovativo da marcação #${c.codigo}, obrigada! Chegou depois do prazo e a vaga já tinha sido libertada: a equipa verifica a transferência e, se a hora continuar livre, confirma-a aqui; se não, combina outra hora consigo.`
    : `💳 Recebemos o comprovativo da marcação #${c.codigo}, obrigada! A equipa verifica a transferência e confirma a sua marcação aqui.`;
  if (enviado) {
    await whatsappService.sendTextMessage(to, text);
  } else {
    const url = `${TEAM_URL}?text=${encodeURIComponent(`Olá! Envio o comprovativo do sinal da marcação #${c.codigo}.`)}`;
    await whatsappService.sendLinkButton(to, `${text}\n\nPara ser mais rápido, envie também o comprovativo à equipa.`, "Enviar à equipa", url);
  }
  aiService.addToHistory(to, "user", "[enviou o comprovativo do sinal]");
  aiService.addToHistory(to, "assistant", text);
  logger.info("💳 Comprovativo do sinal recebido", { from: to, codigo: c.codigo, reenviado: enviado });
  return true;
}

// -------------------------------------------------------
// Foto, vídeo ou documento: a equipa é que avalia
// -------------------------------------------------------
async function handleMedia(to, type, lang) {
  const what = { image: "a sua foto 📸", video: "o seu vídeo 🎬", document: "o seu documento 📄" }[type];
  const text = lang === "en"
    ? "We received your file! 📸 For our team to see it and confirm the price, please send it to the salon WhatsApp too."
    : `Recebemos ${what}! Para a equipa ver e confirmar o preço, envie-a também para o WhatsApp do salão, 946 397 096.`
      .replace("envie-a", type === "image" ? "envie-a" : "envie-o");
  const url = `${TEAM_URL}?text=${encodeURIComponent("Olá! Enviei uma foto ao assistente e queria saber o preço.")}`;
  await whatsappService.sendLinkButton(to, text, lang === "en" ? "Send to the team" : "Enviar à equipa", url);
  aiService.addToHistory(to, "user", `[enviou ${type === "image" ? "uma foto" : type === "video" ? "um vídeo" : "um documento"}]`);
  aiService.addToHistory(to, "assistant", text);
}

// ============================================================
// HANDLER PRINCIPAL — chamado para cada mensagem recebida
// ============================================================
async function handleIncomingMessage(req, res) {
  // Responde 200 imediatamente para a Meta não reenviar o webhook
  res.status(200).json({ status: "ok" });

  let from = null;
  let lang = "pt";

  try {
    // 1. Parse do payload
    const parsed = whatsappService.parseIncomingMessage(req.body);

    if (!parsed) {
      logger.debug("Payload sem mensagem — ignorando (ex.: estado de entrega).");
      return;
    }

    const { messageId, name, type } = parsed;
    from = parsed.from;
    let text = parsed.text;

    if (isDuplicate(messageId)) {
      logger.info("Mensagem repetida pela Meta — ignorada", { messageId });
      return;
    }

    // Reacções (👍 numa mensagem) não pedem resposta
    if (type === "reaction") return;

    // 2. Loga mensagem recebida
    logger.incoming(from, type === "text" ? text : `[${type}] ${text}`.trim());

    // 3. Marca como lida e mostra "a escrever..." enquanto o bot pensa
    await whatsappService.markAsRead(messageId, from);

    // 4. Comandos da equipa (só do 946 397 096 / ADMIN_NUMBERS)
    if (type === "text" && text.startsWith("/")) {
      const adminReply = await adminService.handleCommand(from, text);
      if (adminReply) {
        await whatsappService.sendTextMessage(from, adminReply);
        return;
      }
    }

    if (!adminService.isAdmin(from)) statsService.recordMessage(from);
    await expireBookings();

    // Bot em pausa (/pausa): só o link da equipa, uma vez por cliente
    if (adminService.isPaused() && !adminService.isAdmin(from)) {
      if (!pausedNotified.has(from)) {
        pausedNotified.set(from, { updatedAt: Date.now() });
        await sendTeamContact(from, "pt", "💖 Olá! Fale connosco directamente no WhatsApp do salão, 946 397 096.");
      }
      return;
    }
    pausedNotified.clear();

    // 4. Tipos que não são texto
    if (type === "audio") {
      text = await transcribeIncomingAudio(parsed.mediaId);
      if (!text) {
        await whatsappService.sendButtons(from,
          "Recebi o seu áudio 🎤, mas de momento não consigo ouvi-lo. Pode escrever a sua pergunta?",
          [NEXT_STEP_BUTTONS.pt[1], NEXT_STEP_BUTTONS.pt[2]]);
        return;
      }
      logger.info(`🎤 Áudio transcrito: "${text}"`, { from });
    } else if (["image", "video", "document"].includes(type)) {
      if (await handleReceipt(from, type, parsed.mediaId)) return;
      await handleMedia(from, type, aiService.detectLanguage(text || "olá"));
      return;
    } else if (type === "location") {
      await sendWithNextStep(from, faqService.findAnswer("menu_horario"), "pt");
      return;
    } else if (type === "sticker") {
      await sendMenu(from, "pt", name);
      return;
    } else if (type !== "text" && type !== "interactive") {
      await whatsappService.sendTextMessage(from,
        "De momento só consigo ler texto e áudios. 😊 Escreva a sua pergunta ou toque em *menu*.");
      return;
    }

    // 5. Detecta idioma da mensagem
    lang = aiService.detectLanguage(text);

    // 6. Botões e listas interactivas
    if (type === "interactive") {
      const handled = await handleInteractive(from, name, parsed.interactiveId, lang, text);
      if (handled) return;
    }

    await handleText(from, name, text, lang);
  } catch (err) {
    logger.error("Erro ao processar mensagem", err);
    // O cliente não fica sem resposta: tenta enviar a mensagem de recurso
    if (from) {
      await whatsappService.sendTextMessage(from, FALLBACK[lang] || FALLBACK.pt)
        .catch(() => logger.error("Também falhou o envio da mensagem de recurso", { from }));
    }
  }
}

// -------------------------------------------------------
// Texto escrito (ou áudio transcrito)
// -------------------------------------------------------
async function handleText(from, name, text, lang) {
  // Normaliza para comparações
  const normalizedText = normalizeText(text);

  // -------- ROTEAMENTO DE MENSAGENS --------

  // A. Comandos especiais (/start, /help, etc.)
  const command = text.toLowerCase().split(" ")[0];
  if (COMMANDS[command]) {
    logger.info(`Comando recebido: ${command}`, { from });
    await COMMANDS[command](from, name, lang);
    return;
  }

  // B. Pré-marcação a decorrer: a mensagem é a resposta ao passo actual
  // (antes dos números: "3" a meio da marcação pode ser a hora)
  if (bookingService.isActive(from)) {
    if (containsTrigger(normalizedText, KEYWORD_FLOWS.cancelTriggers) && normalizedText.split(/\s+/).length <= 3) {
      bookingService.cancel(from);
      await sendWithNextStep(from, "Pedido de marcação cancelado. Em que mais posso ajudar? 😊", lang);
      return;
    }
    // Uma pergunta a meio ("quanto custa?") responde-se e depois retoma-se
    if (!text.includes("?")) {
      await continueBooking(from, text, name);
      return;
    }
  }

  // C. Seleção numérica do menu (usuário digitou "1" a "9")
  if (/^[1-9]$/.test(text.trim())) {
    const handled = await handleMenuSelection(from, text.trim(), lang);
    if (handled) return;
  }

  // D0. Marcações já feitas: ver, cancelar ("cancelar #K7Q2" também) ou mudar
  const codeMatch = /#?\b([A-HJ-NP-Z2-9]{4})\b/.exec(text.toUpperCase());
  if (containsTrigger(normalizedText, KEYWORD_FLOWS.cancelBookingTriggers)) {
    if (codeMatch && agendaService.find(codeMatch[1])?.cliente === from) return handleBookingAction(from, name, `bk_cancelar_${codeMatch[1]}`);
    return sendMyBookings(from, "cancelar");
  }
  if (containsTrigger(normalizedText, KEYWORD_FLOWS.rescheduleTriggers)) return sendMyBookings(from, "remarcar");
  if (containsTrigger(normalizedText, KEYWORD_FLOWS.myBookingsTriggers)) return sendMyBookings(from, "ver");

  // D. Pedido de marcação → pré-marcação guiada
  if (containsTrigger(normalizedText, KEYWORD_FLOWS.bookingTriggers) && !bookingService.isActive(from)) {
    logger.info("Início de pré-marcação", { from });
    aiService.addToHistory(from, "user", text);
    await startBooking(from, text, name);
    return;
  }

  await answerFreeText(from, name, text, lang, normalizedText);

  // Lembra o passo da marcação depois de responder a uma pergunta
  if (bookingService.isActive(from)) {
    const step = bookingService.prompt(bookingService.getFlow(from), firstName(name));
    if (step) await sendBookingStep(from, { reply: { ...step, text: `Continuando a sua marcação: ${step.text}` } }, name);
  }
}

// -------------------------------------------------------
// Pergunta livre: IA, ou FAQ e palavras-chave se a IA falhar
// -------------------------------------------------------
async function answerFreeText(from, name, text, lang, normalizedText) {
  // 1. Só um cumprimento ("olá", "bom dia", "menu") → menu principal.
  // Mensagens com mais conteúdo ("oi, quanto custa bobes?") seguem para a IA.
  if (isGreetingOnly(normalizedText)) {
    logger.info("Trigger de menu detectado", { from, text });
    await sendMenu(from, lang, name);
    return;
  }

  // 2. Conversa livre: a IA responde com o contexto da conversa
  const promo = promoService.promoText();
  const aiResponse = await aiService.getAIResponse(from, text, {
    name: firstName(name),
    extra: promo ? `PROMOÇÕES ACTIVAS (podes mencioná-las quando fizer sentido):\n${promo}` : "PROMOÇÕES ACTIVAS: nenhuma de momento. Não prometas descontos.",
  });
  if (aiResponse) {
    logger.info("Resposta da IA", { from });
    await whatsappService.sendTextMessage(from, aiResponse);
    return;
  }

  // Sem IA (sem chave ou erro): respostas prontas por palavra-chave
  logger.info("IA indisponível — a usar o FAQ", { from });

  // 3. Keywords de solicitação de atendimento humano
  if (containsTrigger(normalizedText, KEYWORD_FLOWS.humanTriggers)) {
    await sendTeamContact(from, lang);
    return;
  }

  // 4. Keywords de reclamação
  if (containsTrigger(normalizedText, KEYWORD_FLOWS.complaintTriggers)) {
    await sendTeamContact(from, lang, lang === "en"
      ? "😔 We're sorry about that. Please tell the salon manager what happened; we'll handle it with priority. 💖"
      : "😔 Lamentamos muito pelo sucedido. Conte à responsável do salão o que aconteceu, com o dia e o serviço; vamos tratar do seu caso com prioridade. 💖");
    return;
  }

  // 5. Promoções
  if (containsTrigger(normalizedText, KEYWORD_FLOWS.promoTriggers)) {
    const promo = promoService.promoText();
    await sendWithNextStep(from, promo
      ? `${promo}\n\nQuer aproveitar? Toque em *Marcar*. 💖`
      : "De momento não temos promoções activas, mas fique atento! 💖 Posso ajudar com preços ou com uma marcação?", lang);
    return;
  }

  // 6. Busca no FAQ
  const faqAnswer = faqService.findAnswer(text);
  if (faqAnswer) {
    await sendWithNextStep(from, faqAnswer, lang);
    aiService.addToHistory(from, "user", text);
    aiService.addToHistory(from, "assistant", faqAnswer);
    return;
  }

  // 7. Pergunta de preço sem resposta: nunca inventar
  if (containsTrigger(normalizedText, KEYWORD_FLOWS.priceTriggers)) {
    await sendTeamContact(from, lang, lang === "en"
      ? "💖 The price depends on the service and style. Please confirm with our team (you can send a photo of the look you want)."
      : "💖 O preço depende do serviço e do estilo. Confirme com a equipa; pode enviar lá uma foto do resultado que deseja.");
    return;
  }

  // 8. Nada encaixou: pede para reformular e mostra o próximo passo
  await sendWithNextStep(from, lang === "en"
    ? "I'm not sure I understood 🙈 Could you write it another way? You can also see the options or talk to our team."
    : "Não tenho a certeza de ter percebido 🙈 Pode escrever de outra forma? Também pode ver as opções ou falar com a equipa.", lang);
}

// ============================================================
// VERIFICAÇÃO DO WEBHOOK (GET)
// A Meta chama este endpoint para validar a URL do webhook
// ============================================================
function verifyWebhook(req, res) {
  const mode      = req.query["hub.mode"];
  const token     = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  logger.info("Requisição de verificação do webhook recebida", { mode });

  if (mode === "subscribe" && token === config.verifyToken) {
    logger.info("✅ Webhook verificado com sucesso!");
    return res.status(200).send(challenge); // retorna o challenge como texto
  }

  logger.warn("❌ Falha na verificação do webhook — token inválido.");
  return res.status(403).json({ error: "Forbidden: token inválido" });
}

// -------------------------------------------------------
// Pedidos sem comprovativo dentro do prazo: liberta a vaga e avisa a
// cliente e a equipa. Corre de 15 em 15 minutos (cron da Cloudflare)
// e antes de cada mensagem.
// -------------------------------------------------------
async function expireBookings() {
  for (const m of agendaService.expireOverdue()) {
    logger.info("⌛ Pedido expirado sem sinal", { codigo: m.codigo, cliente: m.cliente });
    await whatsappService.sendTextMessage(m.cliente,
      `⌛ O prazo para enviar o comprovativo do sinal da marcação #${m.codigo} (${m.servico}, ${agendaService.dayText(m.dia)}, às ${agendaService.horaLabel(m.inicio)}) terminou e a vaga foi libertada.\n\n`
      + "Se já fez a transferência, envie aqui o comprovativo e a equipa vê se a hora continua livre. Para escolher outra hora, escreva *marcar*. 💖")
      .catch(() => logger.warn("Não foi possível avisar a cliente da marcação expirada (janela de 24 h?)", { codigo: m.codigo }));
    await notifyTeam(`⌛ *Pedido expirado (sem comprovativo do sinal)*\n\n${agendaService.describe(m, { withClient: true })}\n\nA vaga ficou livre.`);
  }
}

module.exports = { handleIncomingMessage, verifyWebhook, expireBookings };
