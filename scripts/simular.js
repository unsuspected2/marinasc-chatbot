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
//   (equipa) /stats           → mensagem enviada do 946 397 096 (comandos de admin)
//   (cliente2) …              → mensagem de outra cliente (para testar vagas ocupadas)
//   {ultimo}                  → código da última marcação criada (ex.: /confirmar {ultimo})
//
// As marcações e estatísticas da simulação ficam numa pasta temporária,
// não em data/ (as promoções reais são copiadas para lá).
//
// A OpenAI só é chamada se OPENAI_API_KEY estiver no .env.
// ============================================================

// Valores fictícios para o config/env.js não falhar sem .env
process.env.VERIFY_TOKEN ||= "simulacao";
process.env.WHATSAPP_TOKEN ||= "simulacao";
process.env.PHONE_NUMBER_ID ||= "simulacao";
process.env.LOG_FILE = "off"; // a simulação não suja o logs/bot.log

const fs = require("fs");
const os = require("os");
const path = require("path");
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "marinasc-simulacao-"));
const promos = path.join(__dirname, "../data/promocoes.json");
if (fs.existsSync(promos)) fs.copyFileSync(promos, path.join(process.env.DATA_DIR, "promocoes.json"));

const whatsappService = require("../src/services/whatsappService");
const aiService = require("../src/services/aiService");

// Em vez de enviar para a Graph API, mostra a resposta no terminal
// (com o destinatário quando não é quem escreveu: aviso à equipa ou a outro cliente)
let current = null;
const show = (to, text) => console.log(`🤖${to !== current ? ` → ${to}` : ""} ${text.replace(/\n/g, "\n   ")}\n`);
whatsappService.sendTextMessage = async (to, text) => show(to, text);
whatsappService.sendButtons = async (to, text, buttons) =>
  show(to, `${text}\n${buttons.map(b => `[ ${b.title} ]`).join("  ")}`);
whatsappService.sendList = async (to, { body, button }, sections) =>
  show(to, `${body}\n[ ${button} ▾ ]\n${sections.map(s => `  ${s.title}:\n${s.rows.map(r => `   • ${r.title} (${r.id})`).join("\n")}`).join("\n")}`);
whatsappService.sendLinkButton = async (to, text, label, url) =>
  show(to, `${text}\n[ ${label} ↗ ${decodeURIComponent(url)} ]`);
whatsappService.markAsRead = async () => {};
// Áudio simulado: o "ficheiro" é o próprio texto e a "transcrição" devolve-o
whatsappService.downloadMedia = async id => ({ buffer: Buffer.from(id), mimeType: "audio/ogg" });
aiService.transcribeAudio = async buffer => buffer.toString();

const { handleIncomingMessage } = require("../src/controllers/messageController");

const EXEMPLOS = [
  "Olá",
  "[menu_1]",
  "quanto custa cordoletes com cachos?",
  "qt custa sobrancelas?",
  "quanto fica um corte degradê?",
  "(foto)",
  "(áudio) quanto custa as unhas de gel?",
  // Pré-marcação completa
  "[btn_marcar]",
  "cordoletes com cachos",
  "[book_dia_amanha]",
  "22h",
  "10h",
  "[book_nome_perfil]",
  // Marcação já com serviço e dia na mensagem; cancelada a meio
  "quero marcar unhas de gel para sábado",
  "cancelar",
  // Agenda: a mesma hora para várias clientes (tranças: 2 profissionais)
  "quero marcar cordoletes para sábado às 10h",
  "[book_nome_perfil]",
  "(cliente2) quero marcar bobes sábado às 10h",
  "(cliente2) [book_nome_perfil]",
  "(cliente3) quero marcar twists para sábado",
  "(cliente3) 10h",
  "(cliente3) [book_hora_840]",
  "(cliente3) Ana",
  "(equipa) /agenda sábado",
  "(equipa) /confirmar {ultimo}",
  "(equipa) /ocupar sábado 15h unhas de gel Joana",
  "(equipa) /bloquear domingo",
  "quero marcar sobrancelhas para domingo",
  "cancelar",
  // A cliente vê e cancela a sua marcação
  "minhas marcações",
  "cancelar marcação",
  // Comandos da equipa (só do 946)
  "(equipa) /promo 10% de desconto nas tranças até sexta",
  "tem promoção?",
  "(equipa) /stats",
  "(equipa) /marcacoes",
  "(equipa) /pausa",
  "Olá",
  "Ainda está aí?",
  "(equipa) /retomar",
  "/stats",
];

let contador = 0;

// Código da última marcação guardada (para /confirmar {ultimo})
function ultimoCodigo() {
  const all = require("../src/services/agendaService").all().filter(m => m.codigo);
  return all.length ? all[all.length - 1].codigo : "XXXX";
}

// Converte a mensagem de teste no payload que a Meta enviaria
function message(text, id) {
  const fromTeam = text.startsWith("(equipa) ");
  if (fromTeam) text = text.slice("(equipa) ".length);
  const other = /^\(cliente(\d)\) /.exec(text);
  if (other) text = text.slice(other[0].length);
  const from = fromTeam ? "244946397096" : other ? `24490000000${other[1]}` : "244900000000";
  current = from;
  text = text.replace("{ultimo}", ultimoCodigo());
  const base = { id, from };
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
