// ============================================================
// scripts/simular.js
// Testa as respostas do bot no terminal, sem WhatsApp nem Meta.
//
// Uso:
//   npm run simular                            → corre as mensagens de exemplo
//   npm run simular -- "quanto custa bobes?"   → testa uma mensagem
//
// Formatos especiais (para simular o que não é texto):
//   [menu_1] / [btn_marcar]   → tocar numa opção da lista ou num botão
//   (foto)                    → enviar uma foto
//   (áudio) quero marcar…     → enviar um áudio; o texto faz de transcrição
//
// A OpenAI só é chamada se OPENAI_API_KEY estiver no .env.
// ============================================================

// Valores fictícios para o config/env.js não falhar sem .env
process.env.VERIFY_TOKEN ||= "simulacao";
process.env.WHATSAPP_TOKEN ||= "simulacao";
process.env.PHONE_NUMBER_ID ||= "simulacao";
process.env.LOG_FILE = "off"; // a simulação não suja o logs/bot.log

const whatsappService = require("../src/services/whatsappService");
const aiService = require("../src/services/aiService");

// Em vez de enviar para a Graph API, mostra a resposta no terminal
const show = text => console.log(`🤖 ${text.replace(/\n/g, "\n   ")}\n`);
whatsappService.sendTextMessage = async (_to, text) => show(text);
whatsappService.sendButtons = async (_to, text, buttons) =>
  show(`${text}\n${buttons.map(b => `[ ${b.title} ]`).join("  ")}`);
whatsappService.sendList = async (_to, { body, button }, sections) =>
  show(`${body}\n[ ${button} ▾ ]\n${sections.map(s => `  ${s.title}:\n${s.rows.map(r => `   • ${r.title} (${r.id})`).join("\n")}`).join("\n")}`);
whatsappService.sendLinkButton = async (_to, text, label, url) =>
  show(`${text}\n[ ${label} ↗ ${decodeURIComponent(url)} ]`);
whatsappService.markAsRead = async () => {};
// Áudio simulado: o "ficheiro" é o próprio texto e a "transcrição" devolve-o
whatsappService.downloadMedia = async id => ({ buffer: Buffer.from(id), mimeType: "audio/ogg" });
aiService.transcribeAudio = async buffer => buffer.toString();

const { handleIncomingMessage } = require("../src/controllers/messageController");

const EXEMPLOS = [
  "Olá",
  "[menu_1]",
  "quanto custa cordoletes com cachos?",
  "oi, qual é o preço das sobrancelhas?",
  "Qual é o horário de domingo?",
  "qt custa sobrancelas?",
  "[btn_equipa]",
  "fazem box braids?",
  "quanto fica um corte degradê?",
  "(foto)",
  "(áudio) quanto custa as unhas de gel?",
  "quero falar com uma pessoa",
];

let contador = 0;

// Converte a mensagem de teste no payload que a Meta enviaria
function message(text, id) {
  const base = { id, from: "244900000000" };
  let m;
  if ((m = /^\[(\w+)\]$/.exec(text))) {
    const reply = { id: m[1], title: m[1] };
    return { ...base, type: "interactive", interactive: m[1].startsWith("menu_") ? { type: "list_reply", list_reply: reply } : { type: "button_reply", button_reply: reply } };
  }
  if (text === "(foto)") return { ...base, type: "image", image: { id: "foto-simulada" } };
  if ((m = /^\(áudio\)\s*(.+)$/.exec(text))) return { ...base, type: "audio", audio: { id: m[1] } };
  return { ...base, type: "text", text: { body: text } };
}

function payload(text, id = `simulado-${++contador}`) {
  return {
    entry: [{
      changes: [{
        value: {
          messages: [message(text, id)],
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
