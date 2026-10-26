// ============================================================
// controllers/messageController.js
// Cérebro do chatbot: orquestra todo o fluxo de decisão.
//
// Pipeline de processamento:
//  1. Parse do payload recebido
//  2. Marcar mensagem como lida
//  3. Verificar comandos especiais (/start, /help, /menu)
//  4. Buscar resposta no FAQ
//  5. Verificar keywords para fluxos especiais
//  6. Fallback: enviar para OpenAI
//  7. Enviar resposta ao usuário
// ============================================================

const whatsappService = require("../services/whatsappService");
const faqService      = require("../services/faqService");
const aiService       = require("../services/aiService");
const logger          = require("../utils/logger");

// -------------------------------------------------------
// Mapeamento de keywords → fluxos customizados
// Adicione novas palavras-chave e fluxos aqui facilmente
// -------------------------------------------------------
const KEYWORD_FLOWS = {
  // Palavras que disparam o menu principal
  menuTriggers: ["menu", "opções", "opcoes", "options", "ajuda", "help",
                  "início", "inicio", "start", "oi", "olá", "ola",
                  "hello", "hi", "hey", "bom dia", "boa tarde", "boa noite"],

  // Palavras que indicam interesse em falar com humano
  humanTriggers: ["atendente", "humano", "pessoa", "humana", "real person",
                   "falar com alguém", "falar com alguem", "speak to someone"],

  // Palavras que indicam reclamação
  complaintTriggers: ["reclamação", "reclamacao", "complaint", "problema",
                       "errado", "errada", "errei", "incorreto", "insatisfeito"],
};

// -------------------------------------------------------
// Respostas de menu (PT e EN)
// -------------------------------------------------------
const MENUS = {
  pt: {
    title: "👋 Olá! Bem-vindo à *WawaBusiness*! 🚀\n\nComo posso te ajudar?",
    options: [
      "🎬 Streaming (Netflix / Prime Video)",
      "🖥️ Máquina de Faturamento",
      "🛡️ Segurança Digital",
      "🧹 Manutenção & Formatação",
      "☁️ Armazenamento em Nuvem",
      "🎁 Programa de Indicação",
      "👤 Falar com um atendente",
    ],
    footer: "\nDigite o número ou faça a sua pergunta directamente! 😊",
  },
  en: {
    title: "👋 Hello! Welcome to *WawaBusiness*! 🚀\n\nHow can I help you?",
    options: [
      "🎬 Streaming (Netflix / Prime Video)",
      "🖥️ Billing Software",
      "🛡️ Digital Security",
      "🧹 Maintenance & Formatting",
      "☁️ Cloud Storage",
      "🎁 Referral Program",
      "👤 Talk to an agent",
    ],
    footer: "\nType the number or ask your question directly! 😊",
  },
};

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
  const greeting = lang === "en"
    ? `👋 Welcome, ${name}! I'm here to help. Here are the available options:`
    : `👋 Bem-vindo(a), ${name}! Estou aqui para ajudar. Veja as opções disponíveis:`;

  await sendMenu(to, lang, greeting);
}

async function handleHelp(to, _name, lang) {
  const text = lang === "en"
    ? `ℹ️ *Help*\n\nYou can:\n• Ask questions directly\n• Type a number from the menu\n• Use commands:\n  /start — Restart\n  /menu — Show menu\n  /reset — Clear conversation history\n\nNeed human support? Just ask!`
    : `ℹ️ *Ajuda*\n\nVocê pode:\n• Fazer perguntas diretamente\n• Digitar um número do menu\n• Usar comandos:\n  /start — Reiniciar\n  /menu — Ver menu\n  /reset — Limpar histórico da conversa\n\nPrecisa de atendimento humano? É só pedir!`;

  await whatsappService.sendTextMessage(to, text);
}

async function handleMenuCommand(to, _name, lang) {
  await sendMenu(to, lang);
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
  const keys = Object.keys(faqs).filter((k, i, arr) => arr.indexOf(k) === i);
  const text = lang === "en"
    ? `📚 I can answer questions about:\n${keys.slice(0, 15).join(", ")}`
    : `📚 Posso responder sobre:\n${keys.slice(0, 15).join(", ")}`;

  await whatsappService.sendTextMessage(to, text);
}

// -------------------------------------------------------
// Envia menu principal
// -------------------------------------------------------
async function sendMenu(to, lang, customTitle) {
  const menu = MENUS[lang] || MENUS.pt;
  const title = customTitle || menu.title;
  const fullText = `${title}\n\n${menu.options.map((o, i) => `${i + 1}. ${o}`).join("\n")}${menu.footer}`;
  await whatsappService.sendTextMessage(to, fullText);
}

// -------------------------------------------------------
// Processa seleção numérica do menu (ex: usuário digitou "2")
// -------------------------------------------------------
async function handleMenuSelection(to, number, lang) {
  // Mapeia número → FAQ key ou resposta
  const menuMap = {
    pt: ["streaming", "faturamento", "seguranca", "manutencao", "nuvem", "indicacao", null],
    en: ["streaming", "faturamento", "seguranca", "manutencao", "nuvem", "indicacao", null],
  };

  const map = menuMap[lang] || menuMap.pt;
  const index = parseInt(number) - 1;

  if (index < 0 || index >= map.length) return false;

  const key = map[index];

  if (key === null) {
    // Opção 7: falar com atendente
    const text = lang === "en"
      ? "👤 I'm connecting you with a human agent. Please wait a moment... ⏳\n\nIn the meantime, feel free to ask your question and we'll reply as soon as possible!"
      : "👤 Estou te conectando com um atendente humano. Aguarde um momento... ⏳\n\nEnquanto isso, pode deixar sua dúvida que respondemos assim que possível!";
    await whatsappService.sendTextMessage(to, text);
    return true;
  }

  // Busca no FAQ pela chave do menu
  const answer = faqService.findAnswer(key);
  if (answer) {
    await whatsappService.sendTextMessage(to, answer);
    return true;
  }

  return false;
}

// -------------------------------------------------------
// Normaliza texto para comparação de keywords
// -------------------------------------------------------
function normalizeText(text) {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

// -------------------------------------------------------
// Verifica se texto contém algum trigger de uma lista
// -------------------------------------------------------
function containsTrigger(normalizedText, triggers) {
  return triggers.some(t => normalizedText.includes(normalizeText(t)));
}

// ============================================================
// HANDLER PRINCIPAL — chamado para cada mensagem recebida
// ============================================================
async function handleIncomingMessage(req, res) {
  // Responde 200 imediatamente para a Meta não reenviar o webhook
  res.status(200).json({ status: "ok" });

  try {
    // 1. Parse do payload
    const parsed = whatsappService.parseIncomingMessage(req.body);

    if (!parsed) {
      logger.debug("Payload sem mensagem de texto válida — ignorando.");
      return;
    }

    const { messageId, from, name, text } = parsed;

    // 2. Loga mensagem recebida
    logger.incoming(from, text);

    // 3. Marca como lida (async — não bloqueia o fluxo)
    whatsappService.markAsRead(messageId).catch(() => {});

    // 4. Detecta idioma da mensagem
    const lang = aiService.detectLanguage(text);

    // 5. Normaliza para comparações
    const normalizedText = normalizeText(text);

    // -------- ROTEAMENTO DE MENSAGENS --------

    // A. Comandos especiais (/start, /help, etc.)
    const command = text.toLowerCase().split(" ")[0];
    if (COMMANDS[command]) {
      logger.info(`Comando recebido: ${command}`, { from });
      await COMMANDS[command](from, name, lang);
      return;
    }

    // B. Seleção numérica do menu (usuário digitou "1" a "7")
    const isNumber = /^[1-7]$/.test(text.trim());
    if (isNumber) {
      const handled = await handleMenuSelection(from, text.trim(), lang);
      if (handled) return;
    }

    // C. Keywords que disparam o menu principal
    if (containsTrigger(normalizedText, KEYWORD_FLOWS.menuTriggers)) {
      logger.info("Trigger de menu detectado", { from, text });
      await sendMenu(from, lang, `👋 Olá, ${name}! Como posso ajudar?`);
      return;
    }

    // D. Keywords de solicitação de atendimento humano
    if (containsTrigger(normalizedText, KEYWORD_FLOWS.humanTriggers)) {
      logger.info("Solicitação de humano detectada", { from });
      const humanText = lang === "en"
        ? `👤 Sure! I'm noting your request for human support.\n\nOne of our agents will contact you at *${from}* as soon as possible during business hours. 🕐`
        : `👤 Claro! Estou registrando sua solicitação de atendimento humano.\n\nUm de nossos atendentes irá te contatar no número *${from}* assim que possível, dentro do horário comercial. 🕐`;
      await whatsappService.sendTextMessage(from, humanText);
      return;
    }

    // E. Keywords de reclamação
    if (containsTrigger(normalizedText, KEYWORD_FLOWS.complaintTriggers)) {
      logger.info("Reclamação detectada", { from });
      const complaintText = lang === "en"
        ? `😔 I'm sorry to hear you're having an issue.\n\nPlease describe your problem in detail and a supervisor will review your case with priority. Your feedback is very important to us!`
        : `😔 Lamentamos saber que você está enfrentando um problema.\n\nPor favor, descreva sua situação em detalhes e um supervisor irá analisar seu caso com prioridade. Seu feedback é muito importante para nós!`;
      await whatsappService.sendTextMessage(from, complaintText);
      return;
    }

    // F. Busca no FAQ
    const faqAnswer = faqService.findAnswer(text);
    if (faqAnswer) {
      logger.info("Resposta encontrada no FAQ", { from });
      await whatsappService.sendTextMessage(from, faqAnswer);
      return;
    }

    // G. Fallback: OpenAI
    logger.info("Sem match no FAQ — enviando para OpenAI", { from });
    const aiResponse = await aiService.getAIResponse(from, text);
    await whatsappService.sendTextMessage(from, aiResponse);

  } catch (err) {
    logger.error("Erro crítico ao processar mensagem", err);
    // Não responde novamente pois o 200 já foi enviado.
    // Em produção: salve o erro em um sistema de monitoramento (Sentry, Datadog, etc.)
  }
}

// ============================================================
// VERIFICAÇÃO DO WEBHOOK (GET)
// A Meta chama este endpoint para validar a URL do webhook
// ============================================================
function verifyWebhook(req, res) {
  const mode      = req.query["hub.mode"];
  const token     = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  logger.info("Requisição de verificação do webhook recebida", { mode, token });

  if (mode === "subscribe" && token === require("../config/env").verifyToken) {
    logger.info("✅ Webhook verificado com sucesso!");
    return res.status(200).send(challenge); // retorna o challenge como texto
  }

  logger.warn("❌ Falha na verificação do webhook — token inválido.");
  return res.status(403).json({ error: "Forbidden: token inválido" });
}

module.exports = { handleIncomingMessage, verifyWebhook };