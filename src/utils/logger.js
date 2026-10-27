// ============================================================
// utils/logger.js
// Logger centralizado com níveis de severidade e timestamps.
// Escreve no terminal (com cores) e em logs/bot.log (sem cores).
// Tokens e chaves são sempre tapados antes de escrever.
// ============================================================

const fs = require("fs");
const path = require("path");
const config = require("../config/env");

// Cores ANSI para o terminal (nos logs da Cloudflare ficavam como lixo)
const COLORS = config.runtime === "cloudflare" ? new Proxy({}, { get: () => "" }) : {
  reset: "\x1b[0m",
  gray: "\x1b[90m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  red: "\x1b[31m",
  cyan: "\x1b[36m",
  magenta: "\x1b[35m",
};

// -------------------------------------------------------
// Ficheiro de log: logs/bot.log, roda para bot.log.1 aos 5 MB.
// LOG_FILE=off desliga (o simulador usa isto). Na Cloudflare não há
// ficheiro: os logs ficam no painel (Workers → marinasc → Logs).
// -------------------------------------------------------
const LOG_DIR = typeof __dirname !== "undefined" ? path.join(__dirname, "../../logs") : "logs";
const LOG_PATH = path.join(LOG_DIR, "bot.log");
const MAX_LOG_BYTES = 5 * 1024 * 1024;
const fileEnabled = process.env.LOG_FILE !== "off" && config.runtime === "node";

if (fileEnabled) fs.mkdirSync(LOG_DIR, { recursive: true });

function writeToFile(line) {
  if (!fileEnabled) return;
  try {
    if (fs.existsSync(LOG_PATH) && fs.statSync(LOG_PATH).size > MAX_LOG_BYTES) {
      fs.renameSync(LOG_PATH, `${LOG_PATH}.1`);
    }
    fs.appendFileSync(LOG_PATH, line.replace(/\x1b\[\d+m/g, "") + "\n");
  } catch {
    // Disco cheio ou sem permissão: o terminal continua a mostrar o log
  }
}

// -------------------------------------------------------
// Tapa segredos: os valores do .env e formatos conhecidos de tokens
// -------------------------------------------------------
const SECRETS = [config.whatsappToken, config.verifyToken, config.ai.apiKey]
  .filter(s => s && s.length >= 8);

function redact(text) {
  let out = text;
  for (const s of SECRETS) out = out.split(s).join("[oculto]");
  return out
    .replace(/Bearer\s+[A-Za-z0-9._-]+/g, "Bearer [oculto]")
    .replace(/\bEAA[A-Za-z0-9]{20,}/g, "[oculto]")
    .replace(/\b(sk|gsk)_?-?[A-Za-z0-9_-]{20,}/g, "[oculto]");
}

// Escreve no terminal e no ficheiro
function emit(stream, line) {
  const safe = redact(line);
  stream(safe);
  writeToFile(safe);
}

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
    emit(console.log,
      `${COLORS.gray}[${timestamp()}]${COLORS.reset} ${COLORS.green}INFO${COLORS.reset}  ${message}${formatData(data)}`
    );
  },

  // Mensagens recebidas do WhatsApp
  incoming(from, message) {
    emit(console.log,
      `${COLORS.gray}[${timestamp()}]${COLORS.reset} ${COLORS.cyan}RECV${COLORS.reset}  De: ${from} | Msg: "${message}"`
    );
  },

  // Respostas enviadas ao usuário
  outgoing(to, message) {
    emit(console.log,
      `${COLORS.gray}[${timestamp()}]${COLORS.reset} ${COLORS.magenta}SENT${COLORS.reset}  Para: ${to} | Resp: "${message.substring(0, 80)}${message.length > 80 ? "..." : ""}"`
    );
  },

  // Alertas não críticos
  warn(message, data) {
    emit(console.warn,
      `${COLORS.gray}[${timestamp()}]${COLORS.reset} ${COLORS.yellow}WARN${COLORS.reset}  ${message}${formatData(data)}`
    );
  },

  // Erros: uma linha com o essencial (status HTTP e mensagem da API, ou stack)
  error(message, err) {
    let detail = "";
    if (err) {
      if (err.response) {
        // Erro de resposta HTTP (Axios / fetch)
        detail = `\n  → Status: ${err.response.status} | Body: ${formatData(err.response.data).slice(3)}`;
      } else if (err.stack) {
        detail = `\n  → ${err.stack}`;
      } else {
        detail = `\n  → ${typeof err === "string" ? err : formatData(err).slice(3)}`;
      }
    }
    emit(console.error,
      `${COLORS.gray}[${timestamp()}]${COLORS.reset} ${COLORS.red}ERROR${COLORS.reset} ${message}${COLORS.red}${detail}${COLORS.reset}`
    );
  },

  // Logs de debug — só aparecem se DEBUG=true no .env
  debug(message, data) {
    if (config.debug) {
      emit(console.log,
        `${COLORS.gray}[${timestamp()}] DEBUG ${message}${formatData(data)}${COLORS.reset}`
      );
    }
  },
};

module.exports = logger;
