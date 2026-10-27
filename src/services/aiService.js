// ============================================================
// services/aiService.js
// Conversa com IA (Groq gratuito ou OpenAI; mesma API) e transcrição de áudios.
//
// Recursos implementados:
//  - Memória de conversa por cliente (últimas 10 mensagens, 24 h)
//  - Detecção de idioma (PT / EN)
//  - Prompt de sistema com a hora de Luanda e se o salão está aberto
//  - Transcrição de áudios (Whisper, no Groq ou na OpenAI)
//  - Graceful degradation: se a API falhar, devolve null e o controller usa o FAQ
// ============================================================

const OpenAI = require("openai");
const { toFile } = require("openai");
const config = require("../config/env");
const logger = require("../utils/logger");
const horario = require("../utils/horario");
const store = require("../utils/store");

// -------------------------------------------------------
// Inicialização do cliente (o SDK da OpenAI também fala com o Groq)
// -------------------------------------------------------
let openai = null;

if (config.ai.apiKey) {
  // Poucas tentativas: o cliente está à espera da resposta no WhatsApp
  openai = new OpenAI({ apiKey: config.ai.apiKey, baseURL: config.ai.baseURL, maxRetries: 1, timeout: 15000 });
  logger.info(`IA: ${config.ai.provider} (${config.ai.model}, áudios com ${config.ai.transcribeModel}).`);
} else {
  logger.warn("Sem GROQ_API_KEY nem OPENAI_API_KEY: o bot responde só com o FAQ.");
}

// -------------------------------------------------------
// Memória de conversa: número → { messages, updatedAt }
// Guarda as últimas MAX_HISTORY mensagens; esquece ao fim de 24 h
// sem conversa.
// -------------------------------------------------------
let aiPausedUntil = 0; // sem créditos ou limite diário esgotado: o bot usa só o FAQ por uns minutos
const MAX_HISTORY = 10; // mensagens (cliente + bot) guardadas por cliente
const MEMORY_TTL_MS = 24 * 60 * 60 * 1000;
const conversationMemory = store.persistentMap("memoria.json", MEMORY_TTL_MS);

// -------------------------------------------------------
// Prompt do sistema — define a "personalidade" do bot
// -------------------------------------------------------
// Informação do salão: vem do faq.json para não haver dois sítios com preços
const faq = require("../data/faq.json");
const SALON_INFO = ["menu_trancas", "menu_unhas", "menu_rosto", "menu_cabelo", "menu_spa", "menu_barbearia", "menu_horario"]
  .map(k => faq[k].replace(/\*/g, ""))
  .join("\n\n");

const SYSTEM_PROMPT_PT = `És a assistente virtual do MARINASC Salão de Beleza (Cabeleireiro, Manicure e Spa), na Centralidade do Kilamba, Luanda. Lema: Beleza · Cuidado · Confiança.

COMO FALAR
- Português de Angola, simpático e próximo, como uma recepcionista do salão a escrever no WhatsApp. Trata a pessoa por "você" ou pelo nome.
- Percebe a escrita do dia a dia em Angola: erros de escrita, abreviaturas (qt/qto = quanto, pfv = por favor, tb = também, q = que, vcs = vocês, amnh = amanhã, dps = depois) e expressões (bué = muito, mambo = coisa, kumbu = dinheiro, ya = sim). Não corrijas a pessoa.
- Mensagens curtas: 1 a 4 frases. Responde primeiro ao que perguntaram e termina SEMPRE com um próximo passo: UMA pergunta para avançar (ex.: "É para si ou para outra pessoa?", "Prefere com ou sem cachos?", "Quer que eu prepare a marcação?") ou o link da equipa.
- Lembra-te do que já foi dito na conversa e não repitas listas inteiras de preços. Se a pessoa já disse o serviço, fala só desse serviço.
- Não uses linguagem de robô nem "digite 1". Podes usar 1 emoji por mensagem, no máximo.
- Se a mensagem for só um cumprimento, cumprimenta e pergunta em que podes ajudar (tranças, unhas, sobrancelhas, cabelo).
- Não presumas o género de quem escreve: evita "bem-vinda/obrigada por ter vindo" dirigido à pessoa.

O QUE PODES DIZER
- Usa só a informação abaixo. Nunca inventes preços, promoções, disponibilidade, duração ou serviços que não estejam na lista.
- Se o serviço estiver "sob consulta" ou não constar da lista, diz exactamente que o preço depende e que a pessoa deve confirmar com a equipa, com o link https://wa.me/244946397096, e sugere enviar lá uma foto do resultado desejado.
- Se o salão estiver fechado agora (ver AGORA EM LUANDA), diz isso com simpatia, quando abre, e que pode deixar já o pedido de marcação.

MARCAÇÕES, RECLAMAÇÕES E FALAR COM UMA PESSOA
- Nunca confirmes tu uma marcação nem digas que há vaga.
- Quando a pessoa quiser marcar, diz-lhe para escrever *marcar*: o assistente pergunta o serviço, o dia, a hora e o nome e prepara o pedido para a equipa, que confirma a vaga.
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
// Contexto que muda a cada mensagem: hora, nome, promoções…
// -------------------------------------------------------
function buildSystemPrompt(lang, { name, extra } = {}) {
  const t = horario.agora();
  const parts = [
    lang === "en" ? SYSTEM_PROMPT_EN : SYSTEM_PROMPT_PT,
    `AGORA EM LUANDA: ${t.texto}. ${horario.estadoTexto(t)}`,
  ];
  if (name) parts.push(`NOME NO PERFIL DO WHATSAPP: ${name} (usa só o primeiro nome, se fizer sentido)`);
  if (extra) parts.push(extra);
  return parts.join("\n\n");
}

// -------------------------------------------------------
// Detecta o idioma predominante da mensagem.
// Heurística simples por palavras inteiras (o "hi" de "filha" não conta).
// -------------------------------------------------------
function detectLanguage(text) {
  const ptWords = ["olá", "ola", "oi", "bom", "boa", "obrigado", "obrigada", "preciso", "quero",
                   "por favor", "pode", "qual", "como", "quando", "onde", "quanto", "custa",
                   "minha", "meu", "fazem", "tem", "vocês", "voces", "é", "e", "de", "para"];
  const enWords = ["hello", "hi", "good", "thanks", "thank", "need", "want",
                   "please", "can", "what", "how", "when", "where", "much", "the", "you", "is", "do"];

  const words = new Set(text.toLowerCase().split(/[^a-zà-ú]+/).filter(Boolean));
  const has = w => (w.includes(" ") ? text.toLowerCase().includes(w) : words.has(w));

  const ptScore = ptWords.filter(has).length;
  const enScore = enWords.filter(has).length;

  if (enScore > ptScore) return "en";
  return config.defaultLanguage; // padrão: pt
}

// -------------------------------------------------------
// Recupera o histórico do cliente (vazio se passaram 24 h)
// -------------------------------------------------------
function getHistory(userId) {
  const entry = conversationMemory.get(userId);
  if (entry) return entry.messages;

  // (as conversas com mais de 24 h desaparecem ao gravar)
  const fresh = { messages: [], updatedAt: Date.now() };
  conversationMemory.set(userId, fresh);
  return fresh.messages;
}

// -------------------------------------------------------
// Adiciona mensagem ao histórico e aplica limite de tamanho
// -------------------------------------------------------
function addToHistory(userId, role, content) {
  const history = getHistory(userId);
  history.push({ role, content });
  conversationMemory.get(userId).updatedAt = Date.now();

  // Mantém somente as últimas MAX_HISTORY mensagens
  while (history.length > MAX_HISTORY) {
    history.shift();
  }
  // A conversa enviada à OpenAI começa sempre por uma mensagem do cliente
  while (history.length && history[0].role !== "user") history.shift();
  conversationMemory.save();
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
// Sem créditos (OpenAI) ou limite gratuito esgotado (Groq, 429):
// não vale a pena tentar a cada mensagem
// -------------------------------------------------------
function pauseIfOutOfQuota(err) {
  if (err.type === "insufficient_quota" || err.code === "insufficient_quota" || err.status === 429) {
    aiPausedUntil = Date.now() + 10 * 60 * 1000;
    logger.warn(`${config.ai.provider}: sem créditos ou limite atingido; IA em pausa durante 10 minutos.`);
  }
}

// -------------------------------------------------------
// Função principal: envia a mensagem à IA e devolve a resposta
// -------------------------------------------------------
async function getAIResponse(userId, userMessage, context = {}) {
  // Sem IA devolve null: o controller responde com o FAQ
  if (!openai || Date.now() < aiPausedUntil) return null;

  try {
    // Detecta idioma e escolhe prompt adequado
    const lang = detectLanguage(userMessage);
    const systemPrompt = buildSystemPrompt(lang, context);

    // Adiciona mensagem do usuário ao histórico
    addToHistory(userId, "user", userMessage);

    // Monta array de mensagens para a API (sistema + histórico)
    const messages = [
      { role: "system", content: systemPrompt },
      ...getHistory(userId),
    ];

    logger.debug("Enviando para a IA", {
      userId,
      lang,
      historyLength: messages.length - 1,
    });

    const completion = await openai.chat.completions.create({
      model: config.ai.model,
      messages,
      max_tokens: 300,           // resposta curta e objetiva
      temperature: 0.5,          // natural, mas fiel à tabela de preços
      // Os gpt-oss pensam antes de responder: pouco, para ser rápido e caber nos 300
      ...(config.ai.model.includes("gpt-oss") && { reasoning_effort: "low" }),
    });

    const assistantMessage = completion.choices[0].message.content.trim();

    // Salva resposta do assistente no histórico
    addToHistory(userId, "assistant", assistantMessage);

    logger.debug("IA respondeu", { userId, tokens: completion.usage });

    return assistantMessage;
  } catch (err) {
    logger.error(`Erro ao chamar a IA (${config.ai.provider})`, err);
    pauseIfOutOfQuota(err);

    // Remove a última mensagem do usuário se a chamada falhou
    // (evita contexto corrompido na próxima tentativa)
    const history = getHistory(userId);
    if (history.length > 0 && history[history.length - 1].role === "user") {
      history.pop();
      conversationMemory.save();
    }

    // O controller responde com o FAQ
    return null;
  }
}

// -------------------------------------------------------
// Transcreve um áudio do WhatsApp (ogg/opus) com o Whisper.
// Devolve o texto, ou null sem IA / em caso de erro.
// -------------------------------------------------------
async function transcribeAudio(buffer, mimeType = "audio/ogg") {
  if (!openai || Date.now() < aiPausedUntil) return null;
  try {
    const ext = mimeType.includes("mpeg") ? "mp3" : mimeType.includes("mp4") ? "m4a" : "ogg";
    const result = await openai.audio.transcriptions.create({
      file: await toFile(buffer, `audio.${ext}`, { type: mimeType.split(";")[0] }),
      model: config.ai.transcribeModel,
      language: "pt",
    });
    return result.text?.trim() || null;
  } catch (err) {
    logger.error("Erro ao transcrever áudio", err);
    pauseIfOutOfQuota(err);
    return null;
  }
}

module.exports = {
  getAIResponse,
  transcribeAudio,
  addToHistory,
  clearMemory,
  getLastMessage,
  detectLanguage,
};
