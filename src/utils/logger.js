// ============================================================
// utils/logger.js
// Logger centralizado com níveis de severidade e timestamps.
// Substitua por winston/pino em produção conforme necessário.
// ============================================================

const config = require("../config/env");

// Cores ANSI para o terminal
const COLORS = {
  reset: "\x1b[0m",
  gray: "\x1b[90m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  red: "\x1b[31m",
  cyan: "\x1b[36m",
  magenta: "\x1b[35m",
};

// Formata timestamp no padrão ISO local
function timestamp() {
  return new Date().toISOString();
}

// Formata objeto ou string para exibição
function formatData(data) {
  if (!data) return "";
  if (typeof data === "string") return ` | ${data}`;
  try {
    return ` | ${JSON.stringify(data)}`;
  } catch {
    return ` | [objeto não serializável]`;
  }
}

const logger = {
  // Informações gerais de fluxo
  info(message, data) {
    console.log(
      `${COLORS.gray}[${timestamp()}]${COLORS.reset} ${COLORS.green}INFO${COLORS.reset}  ${message}${formatData(data)}`
    );
  },

  // Mensagens recebidas do WhatsApp
  incoming(from, message) {
    console.log(
      `${COLORS.gray}[${timestamp()}]${COLORS.reset} ${COLORS.cyan}RECV${COLORS.reset}  De: ${from} | Msg: "${message}"`
    );
  },

  // Respostas enviadas ao usuário
  outgoing(to, message) {
    console.log(
      `${COLORS.gray}[${timestamp()}]${COLORS.reset} ${COLORS.magenta}SENT${COLORS.reset}  Para: ${to} | Resp: "${message.substring(0, 80)}${message.length > 80 ? "..." : ""}"`
    );
  },

  // Alertas não críticos
  warn(message, data) {
    console.warn(
      `${COLORS.gray}[${timestamp()}]${COLORS.reset} ${COLORS.yellow}WARN${COLORS.reset}  ${message}${formatData(data)}`
    );
  },

  // Erros — sempre loga stack se disponível
  error(message, err) {
    console.error(
      `${COLORS.gray}[${timestamp()}]${COLORS.reset} ${COLORS.red}ERROR${COLORS.reset} ${message}`
    );
    if (err) {
      if (err.response) {
        // Erro de resposta HTTP (Axios / fetch)
        console.error(
          `${COLORS.red}  → Status: ${err.response.status} | Body:${COLORS.reset}`,
          err.response.data
        );
      } else if (err.stack) {
        console.error(`${COLORS.red}  → ${err.stack}${COLORS.reset}`);
      } else {
        console.error(`${COLORS.red}  → ${err}${COLORS.reset}`);
      }
    }
  },

  // Logs de debug — só aparecem se DEBUG=true no .env
  debug(message, data) {
    if (config.debug) {
      console.log(
        `${COLORS.gray}[${timestamp()}] DEBUG ${message}${formatData(data)}${COLORS.reset}`
      );
    }
  },
};

module.exports = logger;
