// ============================================================
// services/aiService.js
// Integração com a API da OpenAI como fallback inteligente.
//
// Recursos implementados:
//  - Memória de conversa por usuário (últimas N mensagens)
//  - Detecção de idioma (PT / EN)
//  - Prompt de sistema configurável
//  - Graceful degradation: se a API falhar, retorna mensagem amigável
// ============================================================

const OpenAI = require("openai");
const config = require("../config/env");
const logger = require("../utils/logger");

// -------------------------------------------------------
// Inicialização do cliente OpenAI
// -------------------------------------------------------
let openai = null;

if (config.openaiApiKey) {
  openai = new OpenAI({ apiKey: config.openaiApiKey });
  logger.info("OpenAI inicializado com sucesso.");
} else {
  logger.warn("OPENAI_API_KEY não definida. Fallback de IA desabilitado.");
}

// -------------------------------------------------------
// Memória de conversa: Map<phoneNumber → Array<Message>>
// Armazena as últimas MAX_HISTORY mensagens por usuário.
// Para produção: mova para Redis ou MongoDB com TTL.
// -------------------------------------------------------
const conversationMemory = new Map();
const MAX_HISTORY = 10; // máximo de pares usuário/assistente na memória

// -------------------------------------------------------
// Prompt do sistema — define a "personalidade" do bot
// -------------------------------------------------------
// Informação do salão: vem do faq.json para não haver dois sítios com preços
const faq = require("../data/faq.json");
const SALON_INFO = ["menu_trancas", "menu_unhas", "menu_rosto", "menu_cabelo", "menu_horario"]
  .map(k => faq[k].replace(/\*/g, ""))
  .join("\n\n");

const SYSTEM_PROMPT_PT = `És a assistente virtual do MARINASC Salão de Beleza (Cabeleireiro, Manicure e Spa), na Centralidade do Kilamba, Luanda. Lema: Beleza · Cuidado · Confiança.
Responde sempre em português de Angola, de forma simpática, próxima e curta (no máximo 4 frases), como no WhatsApp.
Usa só a informação abaixo. Nunca inventes preços, promoções, disponibilidade ou serviços que não estejam na lista.
Se o serviço estiver "sob consulta" ou não constar, diz que a equipa confirma o valor e pede uma foto do resultado desejado.
Para marcar: pede o serviço, o dia e a hora, e diz que a equipa confirma a vaga por aqui. Nunca confirmes tu a marcação.
Se não souberes a resposta, diz que a equipa vai responder em breve.

INFORMAÇÃO DO SALÃO:
${SALON_INFO}`;

const SYSTEM_PROMPT_EN = `You are the virtual assistant of MARINASC Beauty Salon (hair, nails and spa) in Centralidade do Kilamba, Luanda, Angola.
Always reply in English, warm and short (max 4 sentences), WhatsApp style. Prices are in Angolan Kwanza (Kz).
Only use the information below (it is in Portuguese; translate it). Never make up prices, promotions, availability or services.
If a service is "sob consulta" (on request) or not listed, say the team will confirm the price.
To book: ask for the service, day and time, and say the team will confirm here. Never confirm a booking yourself.

SALON INFORMATION:
${SALON_INFO}`;

// -------------------------------------------------------
// Detecta o idioma predominante da mensagem.
// Heurística simples por palavras-chave.
// -------------------------------------------------------
function detectLanguage(text) {
  const ptWords = ["olá", "oi", "bom", "obrigado", "obrigada", "preciso", "quero",
                   "por favor", "pode", "qual", "como", "quando", "onde", "quanto"];
  const enWords = ["hello", "hi", "good", "thanks", "thank", "need", "want",
                   "please", "can", "what", "how", "when", "where", "much"];

  const lower = text.toLowerCase();

  let ptScore = ptWords.filter(w => lower.includes(w)).length;
  let enScore = enWords.filter(w => lower.includes(w)).length;

  if (enScore > ptScore) return "en";
  return config.defaultLanguage; // padrão: pt
}

// -------------------------------------------------------
// Recupera ou cria histórico de conversa do usuário
// -------------------------------------------------------
function getHistory(userId) {
  if (!conversationMemory.has(userId)) {
    conversationMemory.set(userId, []);
  }
  return conversationMemory.get(userId);
}

// -------------------------------------------------------
// Adiciona mensagem ao histórico e aplica limite de tamanho
// -------------------------------------------------------
function addToHistory(userId, role, content) {
  const history = getHistory(userId);
  history.push({ role, content });

  // Mantém somente as últimas MAX_HISTORY mensagens
  // Remove sempre aos pares (user + assistant) para não quebrar o contexto
  while (history.length > MAX_HISTORY) {
    history.splice(0, 2);
  }
}

// -------------------------------------------------------
// Limpa memória de um usuário (após /start, por exemplo)
// -------------------------------------------------------
function clearMemory(userId) {
  conversationMemory.delete(userId);
  logger.debug("Memória apagada", { userId });
}

// -------------------------------------------------------
// Retorna a última mensagem do usuário (para contexto externo)
// -------------------------------------------------------
function getLastMessage(userId) {
  const history = getHistory(userId);
  const userMessages = history.filter(m => m.role === "user");
  return userMessages.length > 0 ? userMessages[userMessages.length - 1].content : null;
}

// -------------------------------------------------------
// Função principal: envia mensagem para OpenAI e retorna resposta
// -------------------------------------------------------
async function getAIResponse(userId, userMessage) {
  // Verifica se OpenAI está configurado
  if (!openai) {
    return config.defaultLanguage === "en"
      ? "I'm sorry, I couldn't process your request right now. Please contact us directly."
      : "Obrigada pela mensagem! 💖 A nossa equipa vai responder-lhe aqui em breve. Para ver as opções, escreva *menu*.";
  }

  try {
    // Detecta idioma e escolhe prompt adequado
    const lang = detectLanguage(userMessage);
    const systemPrompt = lang === "en" ? SYSTEM_PROMPT_EN : SYSTEM_PROMPT_PT;

    // Adiciona mensagem do usuário ao histórico
    addToHistory(userId, "user", userMessage);

    // Monta array de mensagens para a API (sistema + histórico)
    const messages = [
      { role: "system", content: systemPrompt },
      ...getHistory(userId),
    ];

    logger.debug("Enviando para OpenAI", {
      userId,
      lang,
      historyLength: messages.length - 1,
    });

    // Chamada à API da OpenAI
    const completion = await openai.chat.completions.create({
      model: config.openaiModel,
      messages,
      max_tokens: 300,           // resposta curta e objetiva
      temperature: 0.3,          // baixa: respostas fiéis à tabela de preços
    });

    const assistantMessage = completion.choices[0].message.content.trim();

    // Salva resposta do assistente no histórico
    addToHistory(userId, "assistant", assistantMessage);

    logger.debug("OpenAI respondeu", { userId, tokens: completion.usage });

    return assistantMessage;
  } catch (err) {
    logger.error("Erro ao chamar OpenAI", err);

    // Remove a última mensagem do usuário se a chamada falhou
    // (evita contexto corrompido na próxima tentativa)
    const history = getHistory(userId);
    if (history.length > 0 && history[history.length - 1].role === "user") {
      history.pop();
    }

    // Mensagem de fallback amigável
    return config.defaultLanguage === "en"
      ? "Sorry, I'm having trouble responding right now. Please try again in a moment or contact us directly. 🙏"
      : "Obrigada pela mensagem! 💖 A nossa equipa vai responder-lhe aqui em breve. Para ver as opções, escreva *menu*.";
  }
}

module.exports = {
  getAIResponse,
  clearMemory,
  getLastMessage,
  detectLanguage,
};
