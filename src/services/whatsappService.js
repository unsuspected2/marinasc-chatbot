// ============================================================
// services/whatsappService.js
// Toda comunicação com a WhatsApp Cloud API passa por aqui.
//
// Funções disponíveis:
//  - sendTextMessage      → mensagem de texto simples
//  - sendMenuMessage      → menu numerado (quick reply textual)
//  - sendTypingIndicator  → indicador "digitando..." (read receipt)
//  - markAsRead           → marcar mensagem como lida
//  - parseIncomingMessage → extrai dados do payload do webhook
// ============================================================

const axios = require("axios");
const config = require("../config/env");
const logger = require("../utils/logger");

// -------------------------------------------------------
// Cliente Axios pré-configurado para a Graph API
// -------------------------------------------------------
const graphApi = axios.create({
  baseURL: config.graphApiUrl,
  headers: {
    "Content-Type": "application/json",
    Authorization: `Bearer ${config.whatsappToken}`,
  },
  timeout: 10000, // 10 segundos de timeout
});

// -------------------------------------------------------
// Envia mensagem de texto simples para um número
// -------------------------------------------------------
async function sendTextMessage(to, text) {
  try {
    const payload = {
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to,
      type: "text",
      text: {
        preview_url: false,
        body: text,
      },
    };

    const response = await graphApi.post(
      `/${config.phoneNumberId}/messages`,
      payload
    );

    logger.outgoing(to, text);
    logger.debug("WhatsApp API response", response.data);

    return response.data;
  } catch (err) {
    logger.error(`Falha ao enviar mensagem para ${to}`, err);
    throw err; // Propaga para o controller decidir o que fazer
  }
}

// -------------------------------------------------------
// Envia menu numerado de opções (quick reply textual)
// Exemplo de saída:
//   "Olá! Escolha uma opção:
//    1. Serviços
//    2. Preços
//    3. Localização"
// -------------------------------------------------------
async function sendMenuMessage(to, title, options) {
  const optionsText = options
    .map((opt, i) => `${i + 1}. ${opt}`)
    .join("\n");

  const fullText = `${title}\n\n${optionsText}`;
  return sendTextMessage(to, fullText);
}

// -------------------------------------------------------
// Marca uma mensagem recebida como lida (✓✓ azul)
// -------------------------------------------------------
async function markAsRead(messageId) {
  try {
    await graphApi.post(`/${config.phoneNumberId}/messages`, {
      messaging_product: "whatsapp",
      status: "read",
      message_id: messageId,
    });
    logger.debug("Mensagem marcada como lida", { messageId });
  } catch (err) {
    // Não é crítico — falha silenciosa
    logger.warn("Não foi possível marcar mensagem como lida", err.message);
  }
}

// -------------------------------------------------------
// Parse do payload do webhook da WhatsApp Cloud API.
// Retorna um objeto normalizado ou null se não for mensagem de texto.
//
// Estrutura do payload (simplificada):
// {
//   object: "whatsapp_business_account",
//   entry: [{
//     changes: [{
//       value: {
//         messages: [{ from, id, type, text: { body } }],
//         contacts: [{ profile: { name } }]
//       }
//     }]
//   }]
// }
// -------------------------------------------------------
function parseIncomingMessage(body) {
  try {
    const entry = body?.entry?.[0];
    const change = entry?.changes?.[0];
    const value = change?.value;

    // Verifica se há mensagens no payload
    if (!value?.messages || value.messages.length === 0) {
      return null;
    }

    const message = value.messages[0];
    const contact = value.contacts?.[0];

    // Só processa mensagens de texto por enquanto
    // Futuramente: adicione suporte a 'image', 'audio', 'document'
    if (message.type !== "text") {
      logger.info(`Tipo de mensagem não suportado: ${message.type}`);
      return null;
    }

    return {
      messageId: message.id,
      from: message.from,           // número com código do país: ex "5511999999999"
      name: contact?.profile?.name || "Usuário",
      text: message.text.body.trim(),
      timestamp: message.timestamp,
    };
  } catch (err) {
    logger.error("Erro ao fazer parse do payload do webhook", err);
    return null;
  }
}

module.exports = {
  sendTextMessage,
  sendMenuMessage,
  markAsRead,
  parseIncomingMessage,
};
