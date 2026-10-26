// ============================================================
// services/faqService.js
// Responsável por buscar respostas na base de FAQ (faq.json).
//
// Estratégia de matching em 3 camadas:
//  1. Correspondência exata (chave = mensagem inteira)
//  2. Correspondência parcial (chave contida na mensagem)
//  3. Correspondência por sinônimos embutida nas chaves do JSON
// ============================================================

const path = require("path");
const logger = require("../utils/logger");

// Carrega o FAQ uma única vez em memória ao iniciar o servidor.
// Para produção com MongoDB: substitua este require por uma query ao banco.
let faqData = {};

try {
  faqData = require(path.join(__dirname, "../data/faq.json"));
  logger.info(`FAQ carregado com ${Object.keys(faqData).length} entradas.`);
} catch (err) {
  logger.error("Falha ao carregar faq.json", err);
}

// -------------------------------------------------------
// Normaliza texto: minúsculas, sem acentos, sem pontuação
// Isso torna o matching tolerante a variações de digitação
// -------------------------------------------------------
function normalize(text) {
  return text
    .toLowerCase()
    .normalize("NFD")                        // decompõe acentos
    .replace(/[\u0300-\u036f]/g, "")         // remove diacríticos
    .replace(/[^\w\s]/g, "")                 // remove pontuação
    .trim();
}

// -------------------------------------------------------
// Busca resposta no FAQ para a mensagem recebida.
// Retorna: string com a resposta | null se não encontrado
// -------------------------------------------------------
function findAnswer(message) {
  if (!message || typeof message !== "string") return null;

  const normalizedMessage = normalize(message);
  logger.debug("FAQ lookup", { original: message, normalized: normalizedMessage });

  // --- Camada 1: correspondência exata da chave ---
  for (const [key, answer] of Object.entries(faqData)) {
    if (normalize(key) === normalizedMessage) {
      logger.debug("FAQ match (exato)", { key });
      return answer;
    }
  }

  // --- Camada 2: mensagem contém a chave ---
  // Ex: usuário digita "qual o horário de atendimento?" → chave "horario" está dentro
  for (const [key, answer] of Object.entries(faqData)) {
    const normalizedKey = normalize(key);
    if (normalizedKey.length >= 4 && normalizedMessage.includes(normalizedKey)) {
      logger.debug("FAQ match (parcial)", { key });
      return answer;
    }
  }

  // --- Camada 3: alguma palavra da mensagem bate com alguma chave ---
  const words = normalizedMessage.split(/\s+/);
  for (const word of words) {
    if (word.length < 4) continue; // ignora palavras curtas demais
    for (const [key, answer] of Object.entries(faqData)) {
      if (normalize(key) === word) {
        logger.debug("FAQ match (palavra)", { word, key });
        return answer;
      }
    }
  }

  return null; // Nenhuma correspondência encontrada
}

// -------------------------------------------------------
// Retorna todas as entradas do FAQ (útil para admin/debug)
// -------------------------------------------------------
function getAllFaqs() {
  return faqData;
}

// -------------------------------------------------------
// Recarrega o FAQ em tempo de execução (hot reload)
// Útil quando o arquivo for atualizado sem reiniciar o servidor
// -------------------------------------------------------
function reloadFaq() {
  try {
    // Limpa o cache do require para forçar releitura
    const faqPath = require.resolve(path.join(__dirname, "../data/faq.json"));
    delete require.cache[faqPath];
    faqData = require(faqPath);
    logger.info(`FAQ recarregado com ${Object.keys(faqData).length} entradas.`);
    return true;
  } catch (err) {
    logger.error("Falha ao recarregar FAQ", err);
    return false;
  }
}

module.exports = { findAnswer, getAllFaqs, reloadFaq };
