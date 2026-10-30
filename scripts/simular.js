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
//   (comprovativo)            → enviar um PDF (ex.: comprovativo do sinal)
//   (áudio) quero marcar…     → enviar um áudio; o texto faz de transcrição
//   (equipa) /stats           → mensagem enviada do 946 397 096 (comandos de admin)
//   (cliente2) …              → mensagem de outra cliente (para testar vagas ocupadas)
//   (instagram) …             → mensagem directa do Instagram (respostas rápidas em vez de botões)
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
// Instagram: passa pelo instagramService a sério (opções numeradas); só o envio é falso
const instagram = require("../src/services/instagramService");
const realFetch = global.fetch;
global.fetch = async (url, opts) => {
  if (!String(url).includes("graph.instagram.com")) return realFetch(url, opts);
  const { message } = JSON.parse(opts.body);
  if (message) show(current, message.text);
  return { ok: true, json: async () => ({}) };
};
require("../src/config/env").instagramToken ||= "simulado";
whatsappService.sendTextMessage = async (to, text) => instagram.isInstagram(to) ? instagram.sendText(to, text) : show(to, text);
whatsappService.sendButtons = async (to, text, buttons) => instagram.isInstagram(to) ? instagram.sendText(to, text, buttons) :
  show(to, `${text}\n${buttons.map(b => `[ ${b.title} ]`).join("  ")}`);
whatsappService.sendList = async (to, { body, button }, sections) => instagram.isInstagram(to) ? instagram.sendText(to, body, sections.flatMap(s => s.rows)) :
  show(to, `${body}\n[ ${button} ▾ ]\n${sections.map(s => `  ${s.title}:\n${s.rows.map(r => `   • ${r.title} (${r.id})`).join("\n")}`).join("\n")}`);
whatsappService.sendLinkButton = async (to, text, label, url) => instagram.isInstagram(to) ? instagram.sendText(to, `${text}\n\n👉 ${label}: ${url}`) :
  show(to, `${text}\n[ ${label} ↗ ${decodeURIComponent(url)} ]`);
whatsappService.forwardMedia = async (to, id, type, caption) => show(to, `[${type} reenviado] ${caption}`);
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
  // Sinal: a cliente envia o comprovativo, a equipa confirma
  "(comprovativo)",
  "(equipa) /confirmar {ultimo}",
  "quanto é o sinal? e se eu faltar?",
  // Serviço genérico: a cliente escolhe na lista (preço e sinal em cada linha)
  "quanto custa natural twists?",
  "quero marcar tranças",
  "[book_mais_9]",
  "[book_serv_7]",
  "cancelar",
  "[btn_marcar]",
  "[book_cat_barbearia]",
  "cancelar",
  // Erro de escrita, comprovativo falso e resposta da equipa (nunca tratada como cliente)
  "(cliente4) Quero tranças cordeletes para amanhã",
  "(cliente4) [book_serv_2]",
  "(cliente4) 12h",
  "(cliente4) Sou a Josefa",
  "(cliente4) (comprovativo)",
  "(equipa) Comprovativo falso",
  "(equipa) [adm_falso_{ultimo}]",
  "(equipa) olá",
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
  "(equipa) /faltou {ultimo}",
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
  "(equipa) /equipa",
  "(equipa) /marcacoes",
  "(equipa) /pausa",
  "Olá",
  "Ainda está aí?",
  "(equipa) /retomar",
  "/stats",
  // Instagram: o mesmo bot, com respostas rápidas
  "(instagram) qt custa as tranças nagô?",
  "(instagram) [btn_marcar]",
  // Instagram no computador: sem respostas rápidas, escolhe pelo número
  "(instagram) se eu quiser marcar, o que faço",
  "(instagram) 1",
  "(instagram) cordoletes",
  "(instagram) onde posso verificar a agenda para escolher a data",
  "(instagram) 2",
  "(instagram) 10",
  "(instagram) 13h",
  "(instagram) Ana",
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
  if (text === "(comprovativo)") return { ...base, type: "document", document: { id: "comprovativo-simulado" } };
  if (text === "(foto)") return { ...base, type: "image", image: { id: "foto-simulada" } };
  if ((m = /^\(áudio\)\s*(.+)$/.exec(text))) return { ...base, type: "audio", audio: { id: m[1] } };
  return { ...base, type: "text", text: { body: text } };
}

function payload(text, id = `simulado-${++contador}`) {
  if (text.startsWith("(instagram) ")) {
    text = text.slice("(instagram) ".length);
    current = "ig:1789000000";
    const m = /^\[(\w+)\]$/.exec(text);
    return { object: "instagram", entry: [{ id: "salao", messaging: [{ sender: { id: "1789000000" }, timestamp: Date.now(),
      message: { mid: id, text, ...(m && { quick_reply: { payload: m[1] } }) } }] }] };
  }
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
