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

// Os dois fornecedores usam a mesma API (formato OpenAI); muda só o endereço e os modelos
function aiConfig() {
  const groqKey = (process.env.GROQ_API_KEY || "").trim();
  const base = groqKey
    ? {
        provider: "Groq",
        apiKey: groqKey,
        baseURL: "https://api.groq.com/openai/v1",
        model: "llama-3.3-70b-versatile",
        transcribeModel: "whisper-large-v3-turbo",
      }
    : {
        provider: "OpenAI",
        apiKey: (process.env.OPENAI_API_KEY || "").trim(),
        baseURL: undefined,
        model: process.env.OPENAI_MODEL || "gpt-4o-mini",
        transcribeModel: "whisper-1",
      };
  return {
    ...base,
    model: process.env.AI_MODEL || base.model,
    transcribeModel: process.env.AI_TRANSCRIBE_MODEL || base.transcribeModel,
  };
}

const config = {
  // --- Servidor ---
  port: parseInt(process.env.PORT || "3000", 10),

  // --- WhatsApp Cloud API ---
  verifyToken: requireEnv("VERIFY_TOKEN"),
  whatsappToken: requireEnv("WHATSAPP_TOKEN"),
  phoneNumberId: requireEnv("PHONE_NUMBER_ID"),

  // URL base da Graph API (versionada)
  // A v18.0 já não é suportada pela Meta; a versão pode mudar-se no .env
  graphApiUrl: `https://graph.facebook.com/${process.env.GRAPH_API_VERSION || "v22.0"}`,

  // --- IA ---
  // Groq (gratuito) se GROQ_API_KEY estiver definida; senão OpenAI (pago).
  // Sem nenhuma chave o bot responde só com o FAQ.
  ai: aiConfig(),

  // --- Admin ---
  // Números que podem usar /stats, /promo, /pausa e /retomar (separados por vírgula)
  adminNumbers: (process.env.ADMIN_NUMBERS || "244946397096").split(",").map(n => n.replace(/\D/g, "")).filter(Boolean),

  // --- Comportamento ---
  defaultLanguage: process.env.DEFAULT_LANGUAGE || "pt",
  debug: process.env.DEBUG === "true",
};

module.exports = config;
