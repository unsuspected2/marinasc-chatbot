// ============================================================
// scripts/simular.js
// Testa as respostas do bot no terminal, sem WhatsApp nem Meta.
//
// Uso:
//   npm run simular                      → corre as perguntas de exemplo
//   npm run simular -- "quanto custa bobes?"   → testa uma mensagem
//
// A OpenAI só é chamada se OPENAI_API_KEY estiver no .env.
// ============================================================

// Valores fictícios para o config/env.js não falhar sem .env
process.env.VERIFY_TOKEN ||= "simulacao";
process.env.WHATSAPP_TOKEN ||= "simulacao";
process.env.PHONE_NUMBER_ID ||= "simulacao";
process.env.LOG_FILE = "off"; // a simulação não suja o logs/bot.log

const whatsappService = require("../src/services/whatsappService");

// Em vez de enviar para a Graph API, mostra a resposta no terminal
whatsappService.sendTextMessage = async (_to, text) => {
  console.log(`🤖 ${text.replace(/\n/g, "\n   ")}\n`);
};
whatsappService.markAsRead = async () => {};

const { handleIncomingMessage } = require("../src/controllers/messageController");

const EXEMPLOS = [
  "Olá",
  "1",
  "quanto custa cordoletes com cachos?",
  "oi, qual é o preço das sobrancelhas?",
  "Qual é o horário de domingo?",
  "onde fica o salão?",
  "quero marcar unhas de gel para sábado",
  "fazem box braids?",
  "quero falar com uma pessoa",
];

let contador = 0;

function payload(text, id = `simulado-${++contador}`) {
  return {
    entry: [{
      changes: [{
        value: {
          messages: [{ id, from: "244900000000", type: "text", text: { body: text } }],
          contacts: [{ profile: { name: "Cliente" } }],
        },
      }],
    }],
  };
}

const fakeRes = { status: () => ({ json: () => {} }) };

(async () => {
  const mensagens = process.argv.length > 2 ? [process.argv.slice(2).join(" ")] : EXEMPLOS;
  for (const text of mensagens) {
    console.log(`👩🏾 ${text}`);
    await handleIncomingMessage({ body: payload(text) }, fakeRes);
  }

  // A Meta às vezes reenvia o mesmo evento: o bot não deve responder outra vez
  if (mensagens === EXEMPLOS) {
    console.log("👩🏾 Olá  (reenvio da Meta com o mesmo id; não deve haver resposta)");
    await handleIncomingMessage({ body: payload("Olá", "simulado-1") }, fakeRes);
  }
})();
