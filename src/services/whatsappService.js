// ============================================================
// services/whatsappService.js
// Toda comunicação com a WhatsApp Cloud API passa por aqui.
//
// Funções disponíveis:
//  - sendTextMessage      → mensagem de texto simples
//  - sendMenuMessage      → menu numerado (quick reply textual)
//  - sendButtons / sendList / sendLinkButton → mensagens interactivas
//  - markAsRead           → marcar como lida + "a escrever..."
//  - downloadMedia        → descarregar áudio/foto recebido
//  - forwardMedia         → reenviar uma foto/PDF recebido (ex.: comprovativo)
//  - parseIncomingMessage → extrai dados do payload do webhook
// ============================================================

const config = require("../config/env");
const logger = require("../utils/logger");
// Clientes do Instagram ("ig:…") são atendidos pelo mesmo código
const instagram = require("./instagramService");

// -------------------------------------------------------
// Pedido à Graph API com fetch (funciona no PC e na Cloudflare).
// Erro com resposta da Meta → err.response = { status, data };
// erro de rede ou tempo esgotado → sem err.response.
// -------------------------------------------------------
async function request(method, url, { body, timeout = 10000, raw = false } = {}) {
  const res = await fetch(url.startsWith("http") ? url : config.graphApiUrl + url, {
    method,
    headers: {
      Authorization: `Bearer ${config.whatsappToken}`,
      ...(body && { "Content-Type": "application/json" }),
    },
    body: body && JSON.stringify(body),
    signal: AbortSignal.timeout(timeout),
  });
  if (raw && res.ok) return { data: await res.arrayBuffer(), headers: res.headers };
  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = text;
  }
  if (!res.ok) {
    const err = new Error(`Graph API respondeu ${res.status}`);
    err.response = { status: res.status, data };
    throw err;
  }
  return { data };
}

const graphApi = {
  get: (url, opts) => request("GET", url, opts),
  post: (url, body, opts) => request("POST", url, { ...opts, body }),
};

// -------------------------------------------------------
// POST com novas tentativas quando a rede falha (sem resposta da Meta).
// Erros com resposta (token, número inválido) não se repetem.
// -------------------------------------------------------
async function postWithRetry(url, payload, attempts = 3) {
  for (let i = 1; ; i++) {
    try {
      return await graphApi.post(url, payload);
    } catch (err) {
      if (err.response || i >= attempts) throw err;
      logger.warn(`Rede falhou ao contactar a Meta (tentativa ${i}/${attempts})`, { erro: err.cause?.code || err.name });
      await new Promise(r => setTimeout(r, 1500 * i));
    }
  }
}

// -------------------------------------------------------
// Envia mensagem de texto simples para um número
// -------------------------------------------------------
async function sendTextMessage(to, text) {
  if (instagram.isInstagram(to)) return instagram.sendText(to, text);
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

    const response = await postWithRetry(`/${config.phoneNumberId}/messages`, payload);

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
// Marca uma mensagem recebida como lida (✓✓ azul) e mostra
// "a escrever..." ao cliente até a resposta seguir (máx. 25 s).
// -------------------------------------------------------
async function markAsRead(messageId, from) {
  if (instagram.isInstagram(from)) return instagram.markSeen(from);
  try {
    await graphApi.post(`/${config.phoneNumberId}/messages`, {
      messaging_product: "whatsapp",
      status: "read",
      message_id: messageId,
      typing_indicator: { type: "text" },
    }, { timeout: 5000 });
    logger.debug("Mensagem marcada como lida", { messageId });
  } catch (err) {
    // Não é crítico — a resposta segue na mesma
    logger.warn("Não foi possível marcar mensagem como lida", err.response?.data?.error?.message || err.message);
  }
}

// -------------------------------------------------------
// Parse do payload do webhook da WhatsApp Cloud API.
// Retorna um objeto normalizado ou null se não houver mensagem
// (por exemplo, actualizações de estado "entregue"/"lida").
//
//  type: "text" | "interactive" | "audio" | "image" | outro tipo da Meta
//  text: texto escrito, título do botão/opção escolhida, ou legenda
//  interactiveId: id do botão ou da opção da lista (ex.: "menu_1")
//  mediaId: id do áudio/foto para descarregar
// -------------------------------------------------------
function parseIncomingMessage(body) {
  if (body?.object === "instagram") return instagram.parse(body);
  try {
    const value = body?.entry?.[0]?.changes?.[0]?.value;

    // Verifica se há mensagens no payload
    if (!value?.messages || value.messages.length === 0) {
      return null;
    }

    const message = value.messages[0];
    const contact = value.contacts?.[0];
    const base = {
      messageId: message.id,
      from: message.from,           // número com código do país: ex "244923000000"
      name: contact?.profile?.name || "",
      type: message.type,
      text: "",
      timestamp: message.timestamp,
      replyTo: message.context?.id, // mensagem do bot a que respondeu (deslizar para responder)
    };

    switch (message.type) {
      case "text":
        return { ...base, text: message.text.body.trim() };
      case "interactive": {
        const reply = message.interactive?.button_reply || message.interactive?.list_reply;
        return { ...base, interactiveId: reply?.id, text: reply?.title || "" };
      }
      case "button": // resposta rápida de um template
        return { ...base, type: "interactive", interactiveId: message.button?.payload, text: message.button?.text || "" };
      case "audio":
        return { ...base, mediaId: message.audio?.id };
      case "image":
      case "video":
      case "document":
      case "sticker":
        return { ...base, mediaId: message[message.type]?.id, text: (message[message.type]?.caption || "").trim() };
      default:
        // location, contacts, reaction, unsupported…
        return base;
    }
  } catch (err) {
    logger.error("Erro ao fazer parse do payload do webhook", err);
    return null;
  }
}

// -------------------------------------------------------
// Envia uma mensagem interactiva; se a Meta a recusar, envia o
// texto alternativo para o cliente nunca ficar sem resposta.
// -------------------------------------------------------
async function sendInteractive(to, interactive, fallbackText) {
  try {
    const response = await postWithRetry(`/${config.phoneNumberId}/messages`, {
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to,
      type: "interactive",
      interactive,
    });
    logger.outgoing(to, `[${interactive.type}] ${interactive.body?.text || ""}`);
    return response.data;
  } catch (err) {
    if (!err.response) throw err; // rede em baixo: o texto também falharia
    logger.warn("Mensagem interactiva recusada — a enviar texto", err.response.data?.error?.message);
    return sendTextMessage(to, fallbackText);
  }
}

// Corta textos aos limites da Meta
const cut = (t, n) => (t.length > n ? t.slice(0, n - 1) + "…" : t);

// -------------------------------------------------------
// Até 3 botões de resposta. buttons: [{ id, title }]
// -------------------------------------------------------
async function sendButtons(to, bodyText, buttons, fallbackText = bodyText) {
  if (instagram.isInstagram(to)) return instagram.sendText(to, bodyText, buttons);
  return sendInteractive(to, {
    type: "button",
    body: { text: cut(bodyText, 1024) },
    action: {
      buttons: buttons.slice(0, 3).map(b => ({ type: "reply", reply: { id: b.id, title: cut(b.title, 20) } })),
    },
  }, fallbackText);
}

// -------------------------------------------------------
// Lista de opções (até 10). sections: [{ title, rows: [{ id, title, description }] }]
// -------------------------------------------------------
async function sendList(to, { header, body, footer, button }, sections, fallbackText) {
  if (instagram.isInstagram(to)) return instagram.sendText(to, body, sections.flatMap(s => s.rows));
  return sendInteractive(to, {
    type: "list",
    ...(header && { header: { type: "text", text: cut(header, 60) } }),
    body: { text: cut(body, 1024) },
    ...(footer && { footer: { text: cut(footer, 60) } }),
    action: {
      button: cut(button, 20),
      sections: sections.map(sec => ({
        title: cut(sec.title, 24),
        rows: sec.rows.map(r => ({
          id: r.id,
          title: cut(r.title, 24),
          ...(r.description && { description: cut(r.description, 72) }),
        })),
      })),
    },
  }, fallbackText);
}

// -------------------------------------------------------
// Botão que abre um link (ex.: WhatsApp da equipa com a marcação)
// -------------------------------------------------------
async function sendLinkButton(to, bodyText, displayText, url) {
  if (instagram.isInstagram(to)) return instagram.sendText(to, `${bodyText}\n\n👉 ${displayText}: ${url}`);
  return sendInteractive(to, {
    type: "cta_url",
    body: { text: cut(bodyText, 1024) },
    action: { name: "cta_url", parameters: { display_text: cut(displayText, 20), url } },
  }, `${bodyText}\n\n👉 ${url}`);
}

// -------------------------------------------------------
// Descarrega um áudio/foto recebido (máx. 16 MB)
// -------------------------------------------------------
async function downloadMedia(mediaId) {
  if (/^https:\/\/[^/]*(cdninstagram|fbcdn|lookaside)/.test(mediaId || "")) return instagram.downloadMedia(mediaId);
  const { data: info } = await graphApi.get(`/${mediaId}`);
  if (info.file_size > 16 * 1024 * 1024) throw new Error(`Ficheiro grande demais (${info.file_size} bytes)`);
  const file = await graphApi.get(info.url, { timeout: 30000, raw: true });
  return { buffer: Buffer.from(file.data), mimeType: info.mime_type };
}

// -------------------------------------------------------
// Reenvia uma foto ou documento recebido (WhatsApp ou Instagram) para
// um número do WhatsApp: descarrega, volta a carregar e envia com legenda
// -------------------------------------------------------
async function forwardMedia(to, mediaId, type, caption) {
  const { buffer, mimeType } = await downloadMedia(mediaId);
  const form = new FormData();
  form.append("messaging_product", "whatsapp");
  form.append("file", new Blob([buffer], { type: mimeType }), type === "image" ? "comprovativo.jpg" : "comprovativo.pdf");
  const res = await fetch(`${config.graphApiUrl}/${config.phoneNumberId}/media`, {
    method: "POST",
    headers: { Authorization: `Bearer ${config.whatsappToken}` },
    body: form,
    signal: AbortSignal.timeout(30000),
  });
  if (!res.ok) throw new Error(`Graph API respondeu ${res.status} ao carregar o ficheiro`);
  const { id } = await res.json();
  const kind = type === "image" ? "image" : "document";
  const sent = await postWithRetry(`/${config.phoneNumberId}/messages`, {
    messaging_product: "whatsapp",
    to,
    type: kind,
    [kind]: { id, caption: cut(caption, 1024), ...(kind === "document" && { filename: "comprovativo.pdf" }) },
  });
  logger.outgoing(to, `[${kind}] ${caption}`);
  return sent.data;
}

module.exports = {
  sendTextMessage,
  sendMenuMessage,
  sendButtons,
  sendList,
  sendLinkButton,
  markAsRead,
  downloadMedia,
  forwardMedia,
  parseIncomingMessage,
};
