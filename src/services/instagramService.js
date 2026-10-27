// ============================================================
// services/instagramService.js
// Mensagens directas do Instagram (API do Instagram com login do
// Instagram). O resto do bot não muda: os clientes do Instagram têm
// o número "ig:<id>" e o whatsappService encaminha para aqui.
//
// O Instagram não tem listas nem botões com link: as opções vão como
// respostas rápidas (até 13) e os links vão no texto.
// ============================================================

const config = require("../config/env");
const logger = require("../utils/logger");

const API = `https://graph.instagram.com/${process.env.GRAPH_API_VERSION || "v22.0"}/me/messages`;
const PREFIX = "ig:";
const MAX_TEXT = 1000;

const isInstagram = to => String(to).startsWith(PREFIX);
const igId = to => String(to).slice(PREFIX.length);

async function post(payload) {
  if (!config.instagramToken) throw new Error("INSTAGRAM_TOKEN não definido");
  const res = await fetch(API, {
    method: "POST",
    headers: { Authorization: `Bearer ${config.instagramToken}`, "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) {
    const err = new Error(`Instagram respondeu ${res.status}`);
    err.response = { status: res.status, data: await res.text() };
    throw err;
  }
  return res.json();
}

// Texto, com respostas rápidas opcionais: [{ id, title }]
async function sendText(to, text, quickReplies = []) {
  // O Instagram não tem *negrito* como o WhatsApp: tira os asteriscos
  text = text.replace(/\*([^*\n]+)\*/g, "$1");
  const parts = [];
  for (let rest = text; rest.length; rest = rest.slice(MAX_TEXT)) parts.push(rest.slice(0, MAX_TEXT));
  try {
    for (let i = 0; i < parts.length; i++) {
      const last = i === parts.length - 1;
      await post({
        recipient: { id: igId(to) },
        message: {
          text: parts[i],
          ...(last && quickReplies.length && {
            quick_replies: quickReplies.slice(0, 13).map(q => ({ content_type: "text", title: q.title.slice(0, 20), payload: q.id })),
          }),
        },
      });
    }
    logger.outgoing(to, text);
  } catch (err) {
    logger.error(`Falha ao enviar mensagem do Instagram para ${to}`, err);
    throw err;
  }
}

// "A escrever..." enquanto o bot pensa
async function markSeen(to) {
  try {
    await post({ recipient: { id: igId(to) }, sender_action: "mark_seen" });
    await post({ recipient: { id: igId(to) }, sender_action: "typing_on" });
  } catch (err) {
    logger.warn("Instagram: não foi possível marcar como lida", err.message);
  }
}

// -------------------------------------------------------
// Webhook do Instagram → o mesmo formato do parseIncomingMessage
// -------------------------------------------------------
function parse(body) {
  const entry = body?.entry?.[0];
  const event = entry?.messaging?.[0];
  const message = event?.message;
  if (!message || message.is_echo || event.sender?.id === entry.id) return null;

  const base = {
    messageId: message.mid,
    from: PREFIX + event.sender.id,
    name: "",
    type: "text",
    text: (message.text || "").trim(),
    timestamp: String(Math.floor((event.timestamp || Date.now()) / 1000)),
  };
  if (message.quick_reply?.payload) {
    return { ...base, type: "interactive", interactiveId: message.quick_reply.payload };
  }
  const attachment = message.attachments?.[0];
  if (attachment) {
    const type = { audio: "audio", image: "image", video: "video", file: "document" }[attachment.type] || attachment.type;
    // No Instagram o "mediaId" é o próprio link do ficheiro
    return { ...base, type, mediaId: attachment.payload?.url };
  }
  return base;
}

async function downloadMedia(url) {
  const res = await fetch(url, { signal: AbortSignal.timeout(30000) });
  if (!res.ok) throw new Error(`Instagram: ficheiro indisponível (${res.status})`);
  return { buffer: Buffer.from(await res.arrayBuffer()), mimeType: res.headers.get("content-type") || "audio/mp4" };
}

module.exports = { isInstagram, sendText, markSeen, parse, downloadMedia };
