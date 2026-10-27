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
  // Poucas tentativas: o cliente está à espera da resposta no WhatsApp
  openai = new OpenAI({ apiKey: config.openaiApiKey, maxRetries: 1, timeout: 15000 });
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
let aiPausedUntil = 0; // quando a OpenAI fica sem créditos, o bot usa só o FAQ por uns minutos
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

COMO FALAR
- Português de Angola, simpático e próximo, como uma recepcionista do salão a escrever no WhatsApp. Trata a pessoa por "você" ou pelo nome.
- Mensagens curtas: 1 a 4 frases. Responde primeiro ao que perguntaram e depois, se fizer sentido, faz UMA pergunta para avançar a conversa (ex.: "É para si ou para outra pessoa?", "Prefere com ou sem cachos?", "Para que dia estava a pensar?").
- Lembra-te do que já foi dito na conversa e não repitas listas inteiras de preços. Se a pessoa já disse o serviço, fala só desse serviço.
- Não uses linguagem de robô nem "digite 1". Podes usar 1 emoji por mensagem, no máximo.
- Se a mensagem for só um cumprimento, cumprimenta e pergunta em que podes ajudar (tranças, unhas, sobrancelhas, cabelo).
- Não presumas o género de quem escreve: evita "bem-vinda/obrigada por ter vindo" dirigido à pessoa.

O QUE PODES DIZER
- Usa só a informação abaixo. Nunca inventes preços, promoções, disponibilidade, duração ou serviços que não estejam na lista.
- Se o serviço estiver "sob consulta" ou não constar, diz que a equipa confirma o valor e sugere enviar uma foto do resultado desejado.

MARCAÇÕES, RECLAMAÇÕES E FALAR COM UMA PESSOA
- Nunca confirmes tu uma marcação nem digas que há vaga.
- Quando a pessoa quiser marcar, ajuda a juntar: serviço, dia e hora preferida. Quando tiveres o serviço (o resto pode faltar), dá o link da equipa já com o pedido escrito, assim: https://wa.me/244946397096?text=<pedido com espaços trocados por %20>, por exemplo https://wa.me/244946397096?text=Ol%C3%A1!%20Quero%20marcar%20cordoletes%20para%20s%C3%A1bado%20de%20manh%C3%A3. Diz que a equipa confirma a vaga.
- Reclamações ou pedidos para falar com uma pessoa: mostra empatia numa frase e encaminha para a equipa no WhatsApp 946 397 096 (https://wa.me/244946397096).
- Se não souberes a resposta, encaminha para esse WhatsApp.

INFORMAÇÃO DO SALÃO:
${SALON_INFO}`;

const SYSTEM_PROMPT_EN = `You are the virtual assistant of MARINASC Beauty Salon (hair, nails and spa) in Centralidade do Kilamba, Luanda, Angola.
Always reply in English, warm and short (max 4 sentences), WhatsApp style. Prices are in Angolan Kwanza (Kz).
Only use the information below (it is in Portuguese; translate it). Never make up prices, promotions, availability or services.
If a service is "sob consulta" (on request) or not listed, say the team will confirm the price.
This number is only the automated assistant. To book, talk to the team or complain, always send them to the salon WhatsApp +244 946 397 096 (https://wa.me/244946397096). Never confirm a booking yourself.

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
  // Sem IA devolve null: o controller responde com o FAQ
  if (!openai || Date.now() < aiPausedUntil) return null;

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
      temperature: 0.5,          // natural, mas fiel à tabela de preços
    });

    const assistantMessage = completion.choices[0].message.content.trim();

    // Salva resposta do assistente no histórico
    addToHistory(userId, "assistant", assistantMessage);

    logger.debug("OpenAI respondeu", { userId, tokens: completion.usage });

    return assistantMessage;
  } catch (err) {
    logger.error("Erro ao chamar OpenAI", err);

    // Sem créditos: não vale a pena tentar a cada mensagem
    if (err.type === "insufficient_quota" || err.code === "insufficient_quota") {
      aiPausedUntil = Date.now() + 10 * 60 * 1000;
      logger.warn("OpenAI sem créditos — IA em pausa durante 10 minutos.");
    }

    // Remove a última mensagem do usuário se a chamada falhou
    // (evita contexto corrompido na próxima tentativa)
    const history = getHistory(userId);
    if (history.length > 0 && history[history.length - 1].role === "user") {
      history.pop();
    }

    // O controller responde com o FAQ
    return null;
  }
}

module.exports = {
  getAIResponse,
  addToHistory,
  clearMemory,
  getLastMessage,
  detectLanguage,
};
