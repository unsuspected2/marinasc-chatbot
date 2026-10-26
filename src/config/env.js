// ============================================================
// config/env.js
// Centraliza e valida todas as variáveis de ambiente.
// Qualquer módulo que precise de configuração importa daqui,
// nunca acessa process.env diretamente.
// ============================================================

require("dotenv").config();

// Função auxiliar: lança erro claro se variável obrigatória faltar
function requireEnv(name) {
  const value = process.env[name];
  if (!value || value.trim() === "") {
    throw new Error(
      `❌  Variável de ambiente obrigatória não definida: ${name}\n` +
        `   Copie .env.example para .env e preencha os valores.`
    );
  }
  return value.trim();
}

const config = {
  // --- Servidor ---
  port: parseInt(process.env.PORT || "3000", 10),

  // --- WhatsApp Cloud API ---
  verifyToken: requireEnv("VERIFY_TOKEN"),
  whatsappToken: requireEnv("WHATSAPP_TOKEN"),
  phoneNumberId: requireEnv("PHONE_NUMBER_ID"),

  // URL base da Graph API (versionada)
  graphApiUrl: "https://graph.facebook.com/v18.0",

  // --- OpenAI ---
  openaiApiKey: process.env.OPENAI_API_KEY || "", // opcional; sem ela o fallback de IA é desabilitado
  openaiModel: process.env.OPENAI_MODEL || "gpt-4o-mini",

  // --- Comportamento ---
  defaultLanguage: process.env.DEFAULT_LANGUAGE || "pt",
  debug: process.env.DEBUG === "true",
};

module.exports = config;
