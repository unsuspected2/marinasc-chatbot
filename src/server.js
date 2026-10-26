// ============================================================
// server.js — Ponto de entrada da aplicação
//
// Responsabilidades:
//  1. Carregar variáveis de ambiente
//  2. Configurar o Express com middlewares de segurança
//  3. Registrar as rotas
//  4. Tratar erros globais
//  5. Iniciar o servidor HTTP
// ============================================================

// Carrega o .env ANTES de qualquer outro módulo
const config = require("./config/env");
const logger = require("./utils/logger");
const routes = require("./routes/webhook");

const express = require("express");

const app = express();

// ============================================================
// MIDDLEWARES GLOBAIS
// ============================================================

// Parse de JSON — necessário para receber o payload da Meta
app.use(express.json());

// Parse de URL-encoded (formulários) — boa prática incluir
app.use(express.urlencoded({ extended: true }));

// -------------------------------------------------------
// Middleware de logging de requisições HTTP
// Loga método, URL e IP de cada request recebido
// -------------------------------------------------------
app.use((req, res, next) => {
  const ip = req.headers["x-forwarded-for"] || req.socket.remoteAddress;
  logger.debug(`${req.method} ${req.url}`, { ip });
  next();
});

// -------------------------------------------------------
// Middleware de CORS básico
// Permite apenas requisições da Meta (em produção, restrinja mais)
// -------------------------------------------------------
app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  next();
});

// ============================================================
// SITE DO SALÃO (pasta site/) — servido na raiz "/"
// ============================================================
app.use(express.static(require("path").join(__dirname, "../site")));

// ============================================================
// ROTAS
// ============================================================
app.use("/", routes);

// ============================================================
// HANDLER DE ROTA NÃO ENCONTRADA (404)
// ============================================================
app.use((req, res) => {
  logger.warn(`Rota não encontrada: ${req.method} ${req.url}`);
  res.status(404).json({
    error: "Rota não encontrada",
    path: req.url,
  });
});

// ============================================================
// HANDLER GLOBAL DE ERROS (500)
// Captura qualquer erro não tratado nas rotas
// ============================================================
app.use((err, req, res, _next) => {
  logger.error("Erro não tratado na aplicação", err);
  res.status(500).json({
    error: "Erro interno do servidor",
    message: config.debug ? err.message : "Algo deu errado. Tente novamente.",
  });
});

// ============================================================
// TRATAMENTO DE ERROS ASSÍNCRONOS NÃO CAPTURADOS
// Evita que o processo Node.js seja encerrado inesperadamente
// ============================================================
process.on("unhandledRejection", (reason, promise) => {
  logger.error("Promise rejeitada não tratada", { reason, promise });
});

process.on("uncaughtException", (err) => {
  logger.error("Exceção não capturada — o servidor continuará rodando", err);
  // Em produção: considere reiniciar via PM2 ou similar após logar
});

// ============================================================
// INICIALIZAÇÃO DO SERVIDOR
// ============================================================
const server = app.listen(config.port, () => {
  logger.info("=".repeat(55));
  logger.info(`💖 Chatbot MARINASC iniciado com sucesso!`);
  logger.info(`📡 Servidor rodando na porta: ${config.port}`);
  logger.info(`🔗 URL local: http://localhost:${config.port}`);
  logger.info(`✅ Webhook: http://localhost:${config.port}/webhook`);
  logger.info(`❤️  Health:  http://localhost:${config.port}/health`);
  logger.info("=".repeat(55));

  if (!process.env.OPENAI_API_KEY) {
    logger.warn("⚠️  OPENAI_API_KEY não definida — fallback de IA desativado.");
  }
});

// Graceful shutdown
process.on("SIGTERM", () => {
  logger.info("SIGTERM recebido — encerrando servidor graciosamente...");
  server.close(() => {
    logger.info("Servidor encerrado.");
    process.exit(0);
  });
});

module.exports = app; // exporta para testes
