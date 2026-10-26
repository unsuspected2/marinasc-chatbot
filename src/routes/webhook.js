// ============================================================
// routes/webhook.js
// Define as rotas do webhook da WhatsApp Cloud API.
//
// GET  /webhook  → Verificação do endpoint pela Meta
// POST /webhook  → Recebimento de mensagens em tempo real
// GET  /health   → Health check para monitoramento/uptime
// ============================================================

const express    = require("express");
const controller = require("../controllers/messageController");

const router = express.Router();

// -------------------------------------------------------
// GET /webhook
// A Meta chama esta rota quando você registra o webhook
// no Meta Developer Dashboard para confirmar que o servidor
// está no ar e que o VERIFY_TOKEN confere.
// -------------------------------------------------------
router.get("/webhook", controller.verifyWebhook);

// -------------------------------------------------------
// POST /webhook
// Recebe todos os eventos do WhatsApp:
//   - Mensagens de texto
//   - Confirmações de leitura
//   - Atualizações de status
// -------------------------------------------------------
router.post("/webhook", controller.handleIncomingMessage);

// -------------------------------------------------------
// GET /health
// Endpoint simples para verificar se o servidor está vivo.
// Útil para monitoramento com UptimeRobot, BetterStack, etc.
// -------------------------------------------------------
router.get("/health", (req, res) => {
  res.status(200).json({
    status: "ok",
    service: "whatsapp-chatbot",
    timestamp: new Date().toISOString(),
    uptime: `${Math.floor(process.uptime())}s`,
  });
});

// -------------------------------------------------------
// GET /
// Rota raiz — só para confirmar que o servidor está rodando
// -------------------------------------------------------
router.get("/", (req, res) => {
  res.status(200).json({
    message: "WhatsApp Chatbot API está no ar! 🤖",
    endpoints: {
      webhook_verify: "GET /webhook",
      webhook_receive: "POST /webhook",
      health: "GET /health",
    },
  });
});

module.exports = router;
