// ============================================================
// worker.js
// O bot na Cloudflare (Workers + Durable Object), sem depender do PC.
//
// GET  /webhook  → verificação da Meta
// POST /webhook  → responde 200 logo e passa a mensagem ao Durable
//                  Object "Bot", que corre o mesmo código do PC
// GET  /health   → estado
// Tudo o resto   → o site (pasta site/)
//
// Há um só Durable Object: as mensagens são tratadas por ordem e os
// dados (marcações, promoções, estatísticas, conversas a meio) ficam
// no armazenamento dele, em vez de data/.
// ============================================================

import { DurableObject } from "cloudflare:workers";
import store from "./utils/store";
import controller from "./controllers/messageController";
import logger from "./utils/logger";
import horario from "./utils/horario";

// A Meta assina cada POST com o "Segredo da app" (X-Hub-Signature-256).
// Com APP_SECRET definido, pedidos sem assinatura válida são recusados.
async function validSignature(body, header, secret) {
  if (!secret) return true;
  if (!header?.startsWith("sha256=")) return false;
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body)));
  const hex = [...mac].map(b => b.toString(16).padStart(2, "0")).join("");
  const given = header.slice(7);
  // comparação em tempo constante
  let diff = hex.length ^ given.length;
  for (let i = 0; i < hex.length; i++) diff |= hex.charCodeAt(i) ^ given.charCodeAt(i);
  return diff === 0;
}

// Imita o req/res do Express que o controller espera
function fakeRes() {
  const res = { statusCode: 200, body: "" };
  res.status = code => ((res.statusCode = code), res);
  res.send = body => ((res.body = String(body)), res);
  res.json = body => ((res.body = JSON.stringify(body)), res);
  res.sendStatus = code => res.status(code);
  return res;
}

export class Bot extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    // Carrega todos os dados antes da primeira mensagem
    ctx.blockConcurrencyWhile(async () => {
      store.useStorage(ctx.storage, await ctx.storage.list());
    });
  }

  async fetch(request) {
    // GET /estado: para o /health (sem dados de clientes)
    if (request.method === "GET") {
      const t = horario.agora().data;
      const dia = store.readJson("conversas.json", { dias: {} }).dias[t];
      return Response.json({ ...store.readJson("ultima-mensagem.json", {}), mensagensHoje: dia?.mensagens || 0 });
    }
    const body = await request.json();
    if (body?.entry?.[0]?.changes?.[0]?.value?.messages) {
      store.writeJson("ultima-mensagem.json", { ultimaMensagem: new Date().toISOString() });
    }
    try {
      await controller.handleIncomingMessage({ body }, fakeRes());
    } catch (err) {
      logger.error("Erro no Durable Object", err);
    }
    return new Response("ok");
  }
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname === "/webhook" && request.method === "GET") {
      const res = fakeRes();
      controller.verifyWebhook({ query: Object.fromEntries(url.searchParams) }, res);
      return new Response(res.body, { status: res.statusCode });
    }

    if (url.pathname === "/webhook" && request.method === "POST") {
      const body = await request.text();
      if (!(await validSignature(body, request.headers.get("x-hub-signature-256"), env.APP_SECRET))) {
        logger.warn("POST /webhook sem assinatura válida da Meta — ignorado");
        return new Response("Forbidden", { status: 403 });
      }
      // A Meta só quer o 200; a resposta ao cliente segue em segundo plano
      const bot = env.BOT.get(env.BOT.idFromName("marinasc"));
      ctx.waitUntil(bot.fetch("https://bot/mensagem", { method: "POST", body }));
      return new Response("EVENT_RECEIVED");
    }

    if (url.pathname === "/health") {
      const bot = env.BOT.get(env.BOT.idFromName("marinasc"));
      const estado = await (await bot.fetch("https://bot/estado")).json();
      return Response.json({ status: "ok", service: "marinasc-chatbot", runtime: "cloudflare", timestamp: new Date().toISOString(), ...estado });
    }

    return env.ASSETS.fetch(request);
  },
};
