// ============================================================
// services/bookingService.js
// Pré-marcação: pergunta serviço, dia, hora e nome. Só oferece horas
// livres na agenda (agendaService), guarda o pedido como pendente
// (a vaga fica reservada) e gera o link wa.me da equipa.
//
// O bot nunca confirma a vaga: quem confirma é a equipa (/confirmar),
// depois de receber o sinal (30%, agendaService.depositFor).
// ============================================================

const faq = require("../data/faq.json");
const store = require("../utils/store");
const horario = require("../utils/horario");
const agenda = require("./agendaService");

const TEAM_NUMBER = "244946397096";
const FLOW_TTL_MS = 2 * 60 * 60 * 1000; // uma pré-marcação parada 2 h recomeça

// Conversas a meio de uma pré-marcação: número → { step, servico, dia, hora, nome, updatedAt }
const flows = store.persistentMap("marcacoes-a-meio.json", FLOW_TTL_MS);

// -------------------------------------------------------
// Catálogo de serviços: as linhas "• Nome: preço" do FAQ e mais
// os serviços "sob consulta"
// -------------------------------------------------------
// Sem preço na tabela: a equipa diz o valor
const SOB_CONSULTA = ["Box braids", "Knotless", "Penteado", "Peruca"];
const EXTRA_SERVICES = [...SOB_CONSULTA, "Manicure", "Pedicure", "Lavagem", "Escova",
  "Tratamento", "Hidratação", "Corte", "Alisamento", "Coloração", "Unhas de gel"];

const SERVICES = [...new Set([
  ...Object.entries(faq)
    .filter(([k]) => k.startsWith("menu_"))
    .flatMap(([, v]) => v.split("\n"))
    .map(l => /^•\s*([^:]+):/.exec(l.trim())?.[1].trim())
    .filter(Boolean),
  ...EXTRA_SERVICES,
])];

function normalize(text) {
  return text.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9:/\s-]/g, " ").replace(/\s+/g, " ").trim();
}

// Serviço do catálogo mencionado no texto (o nome mais comprido ganha)
function findService(text) {
  const n = ` ${normalize(text)} `;
  return SERVICES
    .filter(s => n.includes(` ${normalize(s)} `) || n.includes(` ${normalize(s).replace(/s$/, "")} `))
    .sort((a, b) => b.length - a.length)[0] || null;
}

// -------------------------------------------------------
// Escolha do serviço com preço: a cliente toca num serviço da tabela
// e o bot já sabe o preço e o sinal (sem "a equipa diz-lhe o valor")
// -------------------------------------------------------
const PRICED = SERVICES.filter(s => agenda.priceFor(s));

// Grupos da tabela (menu_trancas, menu_unhas…), pela ordem do FAQ
const CATEGORIES = Object.entries(faq)
  .filter(([k, v]) => k.startsWith("menu_") && /^•/m.test(v))
  .map(([k, v]) => ({
    id: k.slice(5),
    title: (/\*([^*]+)\*/.exec(v)?.[1] || k.slice(5)).trim(),
    servicos: v.split("\n").map(l => /^•\s*([^:]+):/.exec(l.trim())?.[1].trim()).filter(s => s && PRICED.includes(s)),
  }));

const STOP = new Set(["com", "sem", "para", "uma", "uns", "das", "dos", "que", "por", "mais", "quero", "queria", "fazer", "marcar", "marcacao", "favor"]);

// Serviços com preço que se parecem com o texto ("corte", "unhas de gel", "tranças"):
// { opcoes, porArea } (porArea: nenhum nome bate, só a área)
function candidates(text) {
  const words = normalize(text).split(" ").filter(w => w.length >= 3 && !STOP.has(w)).map(w => w.replace(/s$/, ""));
  const scored = PRICED
    .map(s => ({ s, score: words.filter(w => ` ${normalize(s)}`.includes(` ${w}`)).length }))
    .filter(c => c.score);
  const top = Math.max(0, ...scored.map(c => c.score));
  const found = scored.filter(c => c.score === top).map(c => c.s);
  if (found.length) return { opcoes: found };
  // Só a área ("tranças", "spa"): o grupo da tabela com o mesmo nome
  const area = agenda.areaFor(text);
  return { opcoes: CATEGORIES.find(c => c.id === area)?.servicos || [], porArea: true };
}

function serviceRow(s) {
  const d = agenda.depositFor(s);
  return {
    id: `book_serv_${PRICED.indexOf(s)}`,
    title: s,
    description: `${d.aPartirDe ? "desde " : ""}${agenda.kz(d.preco)} · sinal ${agenda.kz(d.valor)}`,
  };
}

// Lista de até 10 linhas; com mais serviços, a última é "Ver mais"
function servicePicker(opcoes, offset = 0, intro = "Qual destes serviços?") {
  const page = opcoes.length - offset > 10 ? opcoes.slice(offset, offset + 9) : opcoes.slice(offset, offset + 10);
  const rows = page.map(serviceRow);
  if (offset + page.length < opcoes.length) rows.push({ id: `book_mais_${offset + page.length}`, title: "Ver mais ➡️", description: `Mais ${opcoes.length - offset - page.length} serviços` });
  return {
    text: `${intro} Toque em *Escolher serviço*: em cada um vê o preço e o sinal de ${agenda.sinalPercent()}% a transferir.`,
    list: { button: "Escolher serviço", sections: [{ title: "Serviços", rows }] },
  };
}

function categoryPicker(intro = "📅 Vamos preparar a sua marcação! Que serviço deseja?") {
  return {
    text: `${intro} Escolha a área na lista, ou escreva o nome do serviço (ex.: cordoletes com cachos, gel na unha).`,
    list: {
      button: "Ver áreas",
      sections: [{ title: "Áreas", rows: CATEGORIES.map(c => ({ id: `book_cat_${c.id}`, title: c.title, description: `${c.servicos.length} serviços com preço` })) }],
    },
  };
}

// O que a cliente escreveu → serviço escolhido, ou lista para escolher
// { servico } | { opcoes } | {}
function resolveService(text) {
  const found = findService(text);
  const { opcoes, porArea } = candidates(text);
  // "natural twists" bate em "Twists", mas há nomes que batem melhor
  if (found && agenda.priceFor(found) && opcoes.includes(found)) return { servico: found };
  // Serviço sob consulta (box braids, knotless…): a equipa diz o valor
  if (SOB_CONSULTA.includes(found) && porArea) return { servico: found };
  if (opcoes.length === 1) return { servico: opcoes[0] };
  if (opcoes.length) return { opcoes };
  return found ? { servico: found } : {};
}

// -------------------------------------------------------
// Dia: hoje, amanhã, dia da semana, "15/11" ou "dia 15"
// Devolve { label, data } ou null
// -------------------------------------------------------
const WEEKDAYS = [["domingo"], ["segunda"], ["terca"], ["quarta"], ["quinta"], ["sexta"], ["sabado"]];
const WEEKDAY_NAMES = ["domingo", "segunda-feira", "terça-feira", "quarta-feira", "quinta-feira", "sexta-feira", "sábado"];

function addDays(iso, n) {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function dayLabel(iso, prefix) {
  const d = new Date(`${iso}T12:00:00Z`);
  const [, m, day] = iso.split("-");
  return `${prefix ? `${prefix}, ` : ""}${WEEKDAY_NAMES[d.getUTCDay()]}, ${day}/${m}`;
}

function dayFromIso(iso) {
  const t = horario.agora();
  const prefix = iso === t.data ? "hoje" : iso === addDays(t.data, 1) ? "amanhã" : null;
  return { label: dayLabel(iso, prefix), data: iso };
}

function parseDay(text) {
  const n = normalize(text);
  const t = horario.agora();
  if (/\bhoje\b/.test(n)) return { label: dayLabel(t.data, "hoje"), data: t.data };
  if (/\b(amanha|amnh|amanh)\b/.test(n)) {
    const data = addDays(t.data, 1);
    return { label: dayLabel(data, "amanhã"), data };
  }
  for (let i = 0; i < 7; i++) {
    if (WEEKDAYS[i].some(w => new RegExp(`\\b${w}\\b`).test(n))) {
      const ahead = (i - t.dia + 7) % 7 || 7; // "sábado" no sábado = o próximo
      const data = addDays(t.data, ahead);
      return { label: dayLabel(data), data };
    }
  }
  const m = /\b(\d{1,2})\s*[/-]\s*(\d{1,2})\b/.exec(n) || /\bdia\s+(\d{1,2})\b/.exec(n);
  if (m) {
    const [year, month] = t.data.split("-").map(Number);
    const day = parseInt(m[1], 10);
    let mon = m[2] ? parseInt(m[2], 10) : month;
    let yr = year;
    if (!m[2] && day < parseInt(t.data.slice(8), 10)) mon++; // "dia 3" já passou → mês seguinte
    if (mon > 12) { mon = 1; yr++; }
    const iso = `${yr}-${String(mon).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    if (day < 1 || day > 31 || mon < 1 || iso < t.data) return null;
    if (Number.isNaN(new Date(`${iso}T12:00:00Z`).getTime())) return null;
    return { label: dayLabel(iso), data: iso };
  }
  return null;
}

// -------------------------------------------------------
// Hora: "10h", "14:30", "às 9", ou período (manhã, tarde, fim da tarde)
// Devolve { label, minutos? } ou null
// -------------------------------------------------------
function parseTime(text) {
  const n = normalize(text);
  const m = /\b(\d{1,2})\s*(?:h|:|horas?)\s*(\d{2})?\b/.exec(n) || /\bas\s+(\d{1,2})\b/.exec(n) || /^(\d{1,2})$/.exec(n);
  if (m) {
    let h = parseInt(m[1], 10);
    const min = m[2] ? parseInt(m[2], 10) : 0;
    if (h >= 1 && h <= 8 && /\btarde\b/.test(n)) h += 12; // "3h da tarde"
    if (h > 23 || min > 59) return null;
    return { label: `às ${h}h${min ? String(min).padStart(2, "0") : ""}`, minutos: h * 60 + min };
  }
  if (/\bfim (da|de) tarde\b/.test(n)) return { label: "ao fim da tarde" };
  if (/\bmanha\b/.test(n)) return { label: "de manhã" };
  if (/\btarde\b/.test(n)) return { label: "à tarde" };
  if (/\bnoite\b/.test(n)) return { label: "à noite" };
  return null;
}


// -------------------------------------------------------
// Estado da conversa
// -------------------------------------------------------
function getFlow(from) {
  const f = flows.get(from);
  if (f) return f;
  flows.delete(from);
  return null;
}

function isActive(from) {
  return Boolean(getFlow(from));
}

function cancel(from) {
  flows.delete(from);
}

// Próximo passo em falta
function nextStep(f) {
  if (!f.servico) return "servico";
  if (!f.dia) return "dia";
  if (!f.hora) return "hora";
  if (!f.nome) return "nome";
  return "fim";
}

// -------------------------------------------------------
// Pergunta do passo actual: { text, buttons? }
// -------------------------------------------------------
function prompt(f, profileName) {
  switch (nextStep(f)) {
    case "servico":
      return f.opcoes ? servicePicker(f.opcoes, 0, "📅 Vamos preparar a sua marcação!") : categoryPicker();
    case "dia": {
      // Os 3 próximos dias com vaga para este serviço
      const dias = [];
      let from = horario.agora().data;
      while (dias.length < 3) {
        const n = agenda.nextFreeDay(from, f.servico);
        if (!n) break;
        dias.push(n.dia);
        from = agenda.addDays(n.dia, 1);
      }
      const antes = f.semVaga ? `Para ${f.semVaga} já não há vagas para ${f.servico}. ` : `${f.servico}, óptimo! `;
      return {
        text: `${antes}Para que dia? Escolha um dia com vaga ou escreva outro (ex.: sábado, 15/11).`,
        buttons: dias.map(d => ({ id: `book_dia_${d}`, title: shortDay(d) })),
      };
    }
    case "hora":
      return hourPrompt(f);
    case "nome":
      return {
        text: "Por fim, em que nome fica a marcação?",
        ...(profileName && { buttons: [{ id: "book_nome_perfil", title: `Sou ${profileName}`.slice(0, 20) }] }),
      };
    default:
      return null;
  }
}

function capitalize(s) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// -------------------------------------------------------
// Começa uma pré-marcação, aproveitando o que já vem na mensagem
// ("quero marcar cordoletes para sábado às 10h")
// -------------------------------------------------------
function start(from, text = "") {
  const { servico = null, opcoes } = resolveService(text);
  const f = { servico, ...(opcoes && { opcoes }), dia: parseDay(text), hora: null, nome: null, updatedAt: Date.now() };
  const hora = parseTime(text);
  // Só fica com a hora se estiver livre; senão o passo "hora" mostra as livres
  if (f.servico && f.dia && hora?.minutos !== undefined && !agenda.whyNot(f.dia.data, hora.minutos, f.servico)) f.hora = hora;
  if (f.dia && (!agenda.openingHours(f.dia.data, f.servico) || (f.servico && !agenda.freeSlots(f.dia.data, f.servico).length))) {
    f.semVaga = f.dia.label; // o passo "dia" explica porquê
    f.dia = null;
  }
  flows.set(from, f);
  return f;
}

// Remarcação: novo pedido para o mesmo serviço; a marcação antiga é
// cancelada quando o novo pedido fica pronto
function startReschedule(from, marcacao) {
  const f = { servico: marcacao.servico, dia: null, hora: null, nome: marcacao.nome, substitui: marcacao.codigo, updatedAt: Date.now() };
  flows.set(from, f);
  return f;
}

// -------------------------------------------------------
// Passo "hora": lista as horas livres desse dia (máx. 10, espalhadas)
// -------------------------------------------------------
const PERIODS = {
  manha: { label: "de manhã", from: 0, to: 12 * 60 },
  tarde: { label: "à tarde", from: 12 * 60, to: 17 * 60 },
  fim: { label: "ao fim da tarde", from: 17 * 60, to: 24 * 60 },
  noite: { label: "à noite", from: 18 * 60, to: 24 * 60 },
};

function spread(list, n) {
  if (list.length <= n) return list;
  return Array.from({ length: n }, (_, i) => list[Math.round(i * (list.length - 1) / (n - 1))]);
}

function slotList(slots) {
  const rows = spread(slots, 10).map(m => ({ id: `book_hora_${m}`, title: agenda.horaLabel(m) }));
  const sections = [
    { title: "Manhã", rows: rows.filter(r => +r.id.slice(10) < 12 * 60) },
    { title: "Tarde", rows: rows.filter(r => +r.id.slice(10) >= 12 * 60 && +r.id.slice(10) < 17 * 60) },
    { title: "Fim da tarde", rows: rows.filter(r => +r.id.slice(10) >= 17 * 60) },
  ].filter(sec => sec.rows.length);
  return { button: "Ver horas livres", sections };
}

function durationText(servico) {
  const d = agenda.durationFor(servico);
  return d >= 60 ? `cerca de ${Math.floor(d / 60)}h${d % 60 ? String(d % 60).padStart(2, "0") : ""}` : `cerca de ${d} min`;
}

function hourPrompt(f, intro = "") {
  const slots = agenda.freeSlots(f.dia.data, f.servico);
  return {
    text: `${intro}${capitalize(f.dia.label)}. Estas são as horas livres para ${f.servico} (${durationText(f.servico)}). `
      + "Escolha uma na lista ou escreva a hora que prefere (ex.: 10h).",
    list: slotList(slots),
  };
}

// Botões com as horas livres mais perto (quando a pedida não dá)
function nearestButtons(f, minutos) {
  return agenda.nearest(f.dia.data, minutos, f.servico, 3)
    .map(m => ({ id: `book_hora_${m}`, title: agenda.horaLabel(m) }));
}

// Dia sem vagas: sugere os próximos dias com vaga
function noSlotsReply(f, dia) {
  const next = [];
  let from = agenda.addDays(dia.data, 1);
  while (next.length < 3) {
    const n = agenda.nextFreeDay(from, f.servico);
    if (!n) break;
    next.push(n.dia);
    from = agenda.addDays(n.dia, 1);
  }
  const why = agenda.openingHours(dia.data, f.servico) ? `já não há vagas para ${f.servico}` : "o salão está fechado";
  return {
    reply: {
      text: `Nesse dia (${dia.label}) ${why} 😕 ${next.length ? "Tenho vaga nestes dias:" : "Escolha outro dia, por favor."}`,
      buttons: next.map(d => ({ id: `book_dia_${d}`, title: shortDay(d) })),
    },
  };
}

function shortDay(iso) {
  const t = horario.agora().data;
  if (iso === t) return "Hoje";
  if (iso === addDays(t, 1)) return "Amanhã";
  const [, m, d] = iso.split("-");
  const wd = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"][new Date(`${iso}T12:00:00Z`).getUTCDay()];
  return `${wd} ${d}/${m}`;
}

// -------------------------------------------------------
// Resposta do cliente ao passo actual. Devolve:
//   { reply: { text, buttons? } }                 → perguntar o passo seguinte
//   { done: { resumo, url, mensagem, marcacao } } → pedido pronto
// interactiveId: botão tocado (book_dia_hoje, book_nome_perfil…)
// -------------------------------------------------------
function answer(from, text, { interactiveId, profileName } = {}) {
  const f = getFlow(from);
  if (!f) return null;
  f.updatedAt = Date.now();
  flows.save(); // o passo seguinte pode chegar daqui a minutos, noutro arranque
  const value = (text || "").trim();

  switch (nextStep(f)) {
    case "servico": {
      const escolha = /^book_serv_(\d+)$/.exec(interactiveId || "");
      const mais = /^book_mais_(\d+)$/.exec(interactiveId || "");
      const cat = CATEGORIES.find(c => interactiveId === `book_cat_${c.id}`);
      if (mais && f.opcoes) return { reply: servicePicker(f.opcoes, +mais[1]) };
      if (cat) {
        f.opcoes = cat.servicos;
        flows.save();
        return { reply: servicePicker(f.opcoes, 0, `${cat.title}:`) };
      }
      const r = escolha ? { servico: PRICED[+escolha[1]] } : resolveService(value);
      if (!r.servico && r.opcoes) {
        f.opcoes = r.opcoes;
        flows.save();
        return { reply: servicePicker(f.opcoes) };
      }
      if (!r.servico && !f.tentouServico) {
        // Primeira vez sem perceber: mostra as áreas; à segunda aceita o que escreveu
        f.tentouServico = true;
        flows.save();
        return { reply: categoryPicker("Não encontrei esse serviço na tabela 🙈") };
      }
      f.servico = r.servico || capitalize(value.slice(0, 60));
      delete f.opcoes;
      delete f.tentouServico;
      // "unhas de gel para sábado" → aproveita o dia também
      if (!f.dia) f.dia = parseDay(value);
      break;
    }

    case "dia": {
      const dia = interactiveId === "book_dia_hoje" ? parseDay("hoje")
        : interactiveId === "book_dia_amanha" ? parseDay("amanhã")
        : /^book_dia_\d{4}-\d{2}-\d{2}$/.test(interactiveId || "") ? dayFromIso(interactiveId.slice(9))
        : parseDay(value);
      if (!dia) return { reply: { text: "Não percebi o dia 🙈 Pode escrever, por exemplo, *sábado*, *amanhã* ou *15/11*?" } };
      if (!agenda.freeSlots(dia.data, f.servico).length) return noSlotsReply(f, dia);
      f.dia = dia;
      delete f.semVaga;
      const hora = parseTime(value);
      if (hora?.minutos !== undefined && !agenda.whyNot(dia.data, hora.minutos, f.servico)) f.hora = hora;
      break;
    }

    case "hora": {
      const period = PERIODS[interactiveId?.slice(10)] || (!/\d/.test(value) && Object.values(PERIODS).find(p => parseTime(value)?.label === p.label));
      if (period) {
        const slots = agenda.freeSlots(f.dia.data, f.servico, period);
        if (!slots.length) return { reply: { ...hourPrompt(f, `${capitalize(period.label)} já não há vagas. `) } };
        return { reply: { text: `Horas livres ${period.label}:`, list: slotList(slots) } };
      }
      const fromList = /^book_hora_(\d+)$/.exec(interactiveId || "");
      const hora = fromList ? { minutos: +fromList[1] } : parseTime(value);
      if (hora?.minutos === undefined) return { reply: { text: "Não percebi a hora 🙈 Pode escrever, por exemplo, *10h* ou *14:30*, ou escolher na lista.", list: slotList(agenda.freeSlots(f.dia.data, f.servico)) } };
      const why = agenda.whyNot(f.dia.data, hora.minutos, f.servico);
      if (why) return { reply: busyReply(f, hora.minutos, why) };
      f.hora = { minutos: hora.minutos, label: `às ${agenda.horaLabel(hora.minutos)}` };
      break;
    }

    case "nome":
      f.nome = interactiveId === "book_nome_perfil" && profileName ? profileName : capitalize(value.slice(0, 40));
      if (!f.nome) return { reply: prompt(f, profileName) };
      break;
  }

  // Serviço escolhido depois do dia ("marcar para sábado" → "tranças"): esse dia ainda tem vaga?
  if (f.dia && !f.hora && f.servico && !agenda.freeSlots(f.dia.data, f.servico).length) {
    const cheio = f.dia;
    f.dia = null;
    flows.save();
    return noSlotsReply(f, cheio);
  }

  if (nextStep(f) !== "fim") {
    flows.save();
    return { reply: prompt(f, profileName) };
  }

  // Pedido pronto: confirma outra vez que a vaga continua livre
  // (outra cliente pode ter ficado com ela entretanto)
  const why = agenda.whyNot(f.dia.data, f.hora.minutos, f.servico);
  if (why) {
    const pedido = f.hora.minutos;
    f.hora = null;
    flows.save();
    return { reply: busyReply(f, pedido, why) };
  }
  flows.delete(from);
  const marcacao = agenda.create({ cliente: from, nome: f.nome, servico: f.servico, dia: f.dia.data, inicio: f.hora.minutos, substitui: f.substitui });
  const substituida = f.substitui ? agenda.setState(f.substitui, "cancelada", { motivo: `remarcada para #${marcacao.codigo}` }) : null;
  // O sinal já pago passa para a nova marcação
  if (substituida?.sinalPago || substituida?.comprovativoEm) {
    Object.assign(marcacao, agenda.setState(marcacao.codigo, "pendente", {
      sinalPago: substituida.sinalPago, comprovativoEm: substituida.comprovativoEm, sinalDe: substituida.codigo,
    }));
  }
  const diaTexto = f.dia.label.replace(/^(hoje|amanhã), /, "$1, ");
  const mensagem = `Olá, sou ${f.nome}, quero marcar ${f.servico} para ${diaTexto}, ${f.hora.label}. (pedido #${marcacao.codigo})`;
  const url = `https://wa.me/${TEAM_NUMBER}?text=${encodeURIComponent(mensagem)}`;
  return { done: { resumo: `• Serviço: ${f.servico}\n• Dia: ${capitalize(f.dia.label)}\n• Hora: ${f.hora.label.replace(/^às /, "")} (${durationText(f.servico)})\n• Nome: ${f.nome}\n• Código: #${marcacao.codigo}`
    + (marcacao.sinal ? `\n${agenda.paymentLines(marcacao.sinal)}` : ""), url, mensagem, marcacao, substituida } };
}

// A hora pedida não dá: explica porquê e mostra as livres mais perto
function busyReply(f, minutos, why) {
  const hours = agenda.openingHours(f.dia.data, f.servico);
  const buttons = nearestButtons(f, minutos);
  const pedido = minutos ? `Às ${agenda.horaLabel(minutos)}` : "Essa hora";
  const text = {
    fora_do_horario: `${pedido} não dá: nesse dia abrimos das ${horario.horaCurta(hours?.[0] || "00:00")} às ${horario.horaCurta(hours?.[1] || "00:00")} e ${f.servico} leva ${durationText(f.servico)}.`,
    passou: `${pedido} já passou ou está muito em cima da hora.`,
    ocupado: `${pedido} já não temos vaga para ${f.servico} 😕`,
    bloqueado: `${pedido} o salão não está disponível.`,
    fechado: "Nesse dia o salão está fechado.",
  }[why];
  if (!buttons.length) return noSlotsReply(f, f.dia).reply;
  return { text: `${text} Horas livres mais perto:`, buttons };
}

// "book_serv_12" (botão ou lista) → nome do serviço
function serviceFromId(id) {
  const m = /^book_serv_(\d+)$/.exec(id || "");
  return m ? PRICED[+m[1]] || null : null;
}

// Preço, sinal e resto para uma pergunta ("quanto custa cordoletes?"):
// { servico, texto } quando há um só serviço, { opcoes } quando há vários
function priceAnswer(text) {
  const { servico, opcoes } = resolveService(text);
  const d = servico && agenda.depositFor(servico);
  if (d) {
    return {
      servico,
      id: `book_serv_${PRICED.indexOf(servico)}`,
      texto: `💖 *${servico}*\n\n${agenda.paymentLines(d)}\n• Duração: ${agenda.areaFor(servico) === "trancas" && agenda.durationFor(servico) >= 180 ? "de 1h30 a 3h, conforme o estilo" : durationText(servico)}\n\n`
        + "O sinal é por transferência e garante a vaga; o resto paga no salão. Quer marcar?",
    };
  }
  return opcoes ? { opcoes } : null;
}

// Contas já feitas, para a IA não ter de calcular o sinal
function priceContext(opcoes) {
  return opcoes.slice(0, 20).map(s => {
    const d = agenda.depositFor(s);
    return `${s}: preço ${d.aPartirDe ? "desde " : ""}${agenda.kz(d.preco)}, sinal ${d.percentagem}% = ${agenda.kz(d.valor)}, no salão ${agenda.kz(d.preco - d.valor)}`;
  }).join("\n");
}

module.exports = { start, startReschedule, answer, prompt, isActive, cancel, getFlow, findService, resolveService, serviceFromId, priceAnswer, priceContext, parseDay, parseTime };
