import { dataValida, referenciaSemana, instrumentoValido } from "./ec141.js";
import {
  timeToMin,
  dateFromKey,
  addDays,
  isoDate,
  fmtHoras,
  weekKey,
} from "./datas-horas.js";

export const TIPOS_RESTRICAO = {
  ferias: "Férias",
  afastamento: "Afastamento",
  indisponivel: "Indisponibilidade",
  folga: "Folga obrigatória",
};
export const ausenciaProgramada = (d) => ["VA", "AF"].includes(d.status);
/** Meta operacional, sem cálculo salarial ou rateio de repouso. */
export function metaComAusencias(dias, alvoOriginal) {
  const dispensadas = dias.reduce(
    (s, d) =>
      s + (ausenciaProgramada(d) ? d.horasDispensadasRestricao || 0 : 0),
    0,
  );
  const semDiasAlocaveis =
    dias.some(ausenciaProgramada) &&
    dias.every(
      (d) =>
        ausenciaProgramada(d) ||
        (["F", "FC"].includes(d.status) && !d.previsto && !d.previstoOriginal),
    );
  return {
    dispensadas,
    semDiasAlocaveis,
    alvo: semDiasAlocaveis ? 0 : Math.max(0, alvoOriginal - dispensadas),
  };
}
const trabalha = (d) => ["T", "FE"].includes(d.status);
const chave = (date) =>
  isoDate(date.getFullYear(), date.getMonth(), date.getDate());
export function validarRestricoes(c) {
  const r = c.restricoes;
  if (r == null) return [];
  if (typeof r !== "object" || Array.isArray(r))
    return ["Configuração de restrições inválida."];
  const erros = [];
  for (const campo of [
    "periodos",
    "diasIndisponiveis",
    "folgasObrigatorias",
    "horariosPermitidos",
  ])
    if (r[campo] !== undefined && !Array.isArray(r[campo]))
      erros.push(`Lista de ${campo} inválida.`);
  if (erros.length) return erros;
  for (const p of r.periodos || []) {
    if (
      !p ||
      !Object.hasOwn(TIPOS_RESTRICAO, p.tipo) ||
      !dataValida(p.inicio) ||
      !dataValida(p.fim) ||
      p.fim < p.inicio
    )
      erros.push(
        "Informe tipo, início e fim válidos para cada período de restrição.",
      );
  }
  for (const campo of ["diasIndisponiveis", "folgasObrigatorias"])
    if ((r[campo] || []).some((d) => !Number.isInteger(d) || d < 0 || d > 6))
      erros.push("Selecione dias da semana válidos nas restrições.");
  const dias = new Set();
  for (const h of r.horariosPermitidos || []) {
    if (
      !h ||
      !Number.isInteger(h.dia) ||
      h.dia < 0 ||
      h.dia > 6 ||
      !Number.isFinite(timeToMin(h.entrada)) ||
      !Number.isFinite(timeToMin(h.saida)) ||
      h.entrada === h.saida ||
      dias.has(h.dia)
    )
      erros.push(
        "Informe uma janela de horário válida por dia da semana, com entrada diferente da saída.",
      );
    dias.add(h?.dia);
  }
  const periodos = (r.periodos || []).filter(
    (p) => p && ["ferias", "afastamento"].includes(p.tipo),
  );
  if (
    periodos.some((p, i) =>
      periodos
        .slice(i + 1)
        .some(
          (q) => p.tipo !== q.tipo && p.inicio <= q.fim && q.inicio <= p.fim,
        ),
    )
  )
    erros.push(
      "Férias e afastamento não podem ocupar o mesmo período. Revise as datas sobrepostas.",
    );
  return [...new Set(erros)];
}
export function bloqueioNaData(c, data) {
  const r = c.restricoes || {},
    wd = dateFromKey(data).getDay();
  const periodos = (r.periodos || []).filter(
    (p) => p.inicio <= data && data <= p.fim,
  );
  const p = ["ferias", "afastamento", "folga", "indisponivel"]
    .map((tipo) => periodos.find((p) => p.tipo === tipo))
    .find(Boolean);
  const tipo =
    p?.tipo ||
    ((r.folgasObrigatorias || []).includes(wd)
      ? "folga"
      : (r.diasIndisponiveis || []).includes(wd)
        ? "indisponivel"
        : null);
  return tipo ? { tipo, descricao: TIPOS_RESTRICAO[tipo], data } : null;
}
export function folgaIndividual(c, data) {
  const b = bloqueioNaData(c, data);
  return b && ["folga", "indisponivel"].includes(b.tipo);
}
export function janelaPermitida(c, d) {
  const h = c.restricoes?.horariosPermitidos?.find((h) => h.dia === d.weekday);
  if (!h) return null;
  const inicio = timeToMin(h.entrada);
  let fim = timeToMin(h.saida);
  if (fim <= inicio) fim += 1440;
  return { inicio, fim };
}
export function bloqueioDoTurno(c, d) {
  const atual = bloqueioNaData(c, d.data);
  if (atual) return atual;
  if (trabalha(d) && d.saidaMin > 1440) {
    const fim = Math.ceil(d.saidaMin / 1440) - 1;
    for (let offset = 1; offset <= fim; offset++) {
      const b = bloqueioNaData(c, chave(addDays(dateFromKey(d.data), offset)));
      if (b)
        return {
          ...b,
          descricao: `${b.descricao} em ${b.data} (plantão atravessa a meia-noite)`,
        };
    }
  }
  return null;
}
function zerarTrabalho(d) {
  d.horas = 0;
  d.intervaloMin = 0;
  d.intervaloInicioMin = null;
  d.intervaloFimMin = null;
  d.creditoIntervaloCCT = 0;
  d.creditoNoturnoCCT = 0;
  d.horasComputadasCCT = 0;
}
/** Recorta a presença na janela permitida, sem estender o expediente ou mover a pausa.
 * Plantões 12×36 incompatíveis são retirados inteiros, preservando a âncora do ciclo. */
export function aplicarRestricoesDia(
  c,
  d,
  config,
  recalcularCreditos = () => {},
) {
  if (d.status === "NC" || !c.restricoes) return;
  const bloqueio = bloqueioDoTurno(c, d);
  if (bloqueio) {
    const eraTrabalho = trabalha(d);
    if (["ferias", "afastamento"].includes(bloqueio.tipo)) {
      d.horasDispensadasRestricao = Math.max(
        0,
        ausenciaProgramada(d)
          ? d.horasDispensadasRestricao || 0
          : eraTrabalho
            ? (d.horasComputadasCCT ?? d.horas)
            : d.previsto
              ? d.horasPrevistas || 0
              : 0,
      );
      d.status = bloqueio.tipo === "ferias" ? "VA" : "AF";
      d.previsto = false;
      d.horasPrevistas = 0;
    } else d.status = bloqueio.tipo === "folga" ? "F" : "I";
    d.restricao = { ...bloqueio, retirouTrabalho: eraTrabalho };
    zerarTrabalho(d);
    return;
  }
  if (!trabalha(d)) return;
  const janela = janelaPermitida(c, d);
  if (!janela || (d.entradaMin >= janela.inicio && d.saidaMin <= janela.fim))
    return;
  const inicio = Math.max(d.entradaMin, janela.inicio),
    fim = Math.min(d.saidaMin, janela.fim);
  const pInicio = d.intervaloInicioMin,
    pFim = d.intervaloFimMin;
  const pausa =
    pInicio == null
      ? 0
      : Math.max(0, Math.min(fim, pFim) - Math.max(inicio, pInicio));
  const horas = Math.max(0, fim - inicio - pausa) / 60;
  const antes = d.horas;
  d.ajusteRestricao = `Horário permitido ${c.restricoes.horariosPermitidos.find((h) => h.dia === d.weekday).entrada}–${c.restricoes.horariosPermitidos.find((h) => h.dia === d.weekday).saida}: ${fmtHoras(antes)} previstas; ${fmtHoras(config.tipoEscala === "12x36" ? 0 : horas)} mantidas, sem ampliar o expediente.`;
  if (config.tipoEscala === "12x36" || horas <= 0) {
    d.status = "I";
    d.restricao = {
      tipo: "horario",
      descricao:
        config.tipoEscala === "12x36"
          ? "Janela incompatível com o plantão 12×36"
          : "Sem horário de trabalho permitido",
      retirouTrabalho: true,
    };
    zerarTrabalho(d);
    return;
  }
  d.entradaMin = inicio;
  d.saidaMin = fim;
  d.horas = horas;
  d.intervaloMin = pausa;
  d.intervaloInicioMin = pausa ? Math.max(inicio, pInicio) : null;
  d.intervaloFimMin = pausa ? Math.min(fim, pFim) : null;
  recalcularCreditos(d);
}
/** Usado também antes de aceitar uma edição manual. Não transforma ajuste manual em exceção. */
export function violacoesDia(c, d) {
  if (!trabalha(d)) return [];
  const out = [];
  const b = bloqueioDoTurno(c, d);
  if (b)
    out.push(
      `${d.data}: trabalho incompatível com ${b.descricao.toLowerCase()}. Altere a restrição no cadastro antes de alocar trabalho nesta data.`,
    );
  const j = janelaPermitida(c, d);
  if (j && (d.entradaMin < j.inicio || d.saidaMin > j.fim))
    out.push(
      `${d.data}: o horário de trabalho ultrapassa a janela permitida do colaborador. Revise os horários ou a restrição no cadastro.`,
    );
  return out;
}
export function validarRestricoesEscala(c, dias, config) {
  const out = [];
  const add = (tipo, severidade, mensagem, data = null) =>
    out.push({ tipo, severidade, mensagem, data });
  for (const erro of validarRestricoes(c))
    add("RESTRICAO_INVALIDA", "erro", erro);
  if (out.length) return out;
  for (const d of dias) {
    for (const erro of violacoesDia(c, d))
      add("RESTRICAO_VIOLADA", "erro", erro, d.data);
    if (d.ajusteRestricao)
      add(
        "HORARIO_RESTRITO",
        d.status === "I" ? "erro" : "info",
        `${d.data}: ${d.ajusteRestricao}${d.status === "I" ? " Plantão não alocado. Revise a janela ou providencie substituição." : ""}`,
        d.data,
      );
    if (
      d.restricao?.data &&
      d.restricao.data !== d.data &&
      d.restricao?.retirouTrabalho
    )
      add(
        "RESTRICAO_VIRADA",
        "alerta",
        `${d.data}: ${d.restricao.descricao}. Plantão retirado integralmente para respeitar o período; revise a cobertura.`,
        d.data,
      );
  }
  if (!c.restricoes) return out;
  const semanas = new Map();
  for (const d of dias) {
    const k = weekKey(dateFromKey(d.data));
    if (!semanas.has(k)) semanas.set(k, []);
    semanas.get(k).push(d);
  }
  for (const semana of semanas.values()) {
    if (semana.length !== 7 || semana.some((d) => d.status === "NC")) continue;
    const afetados = semana.filter((d) => d.restricao || d.ajusteRestricao);
    if (!afetados.length) continue;
    const alvoModelo =
      config.tipoEscala === "5x2" ? 2 : config.tipoEscala === "6x1" ? 1 : null;
    const alvoFolgas =
      alvoModelo == null
        ? null
        : instrumentoValido(config, semana[0].data, "repousoMensal")
          ? alvoModelo
          : Math.max(alvoModelo, referenciaSemana(config, semana, c).folgas);
    const semAusencias = !semana.some(ausenciaProgramada);
    const repousos = semana.filter((d) =>
      ["F", "FC", "I"].includes(d.status),
    ).length;
    if (alvoFolgas && semAusencias && repousos > alvoFolgas)
      add(
        "RESTRICOES_INVIAVEIS",
        "erro",
        `${semana[0].data}: as restrições individuais e os dias sem expediente exigem ${repousos} dias sem trabalho, acima dos ${alvoFolgas} repousos do modelo ${config.tipoEscala}. Não é possível manter esse padrão nesta semana com as condições atuais. Revise as restrições ou o modelo; os bloqueios foram preservados.`,
        semana[0].data,
      );
    const efetivas = semana.reduce(
      (s, d) =>
        s +
        (trabalha(d)
          ? d.horas + (d.creditoIntervaloCCT || 0) + (d.creditoNoturnoCCT || 0)
          : 0) +
        (d.previsto && d.status === "F" && d.feriado && !d.feriado.trabalhado
          ? d.horasPrevistas || 0
          : 0),
      0,
    );
    const { alvo } = metaComAusencias(
      semana,
      semana[0].alvoSemana ?? Number(c.horasSemana),
    );
    if (efetivas < alvo - 0.01 && afetados.some((d) => !ausenciaProgramada(d)))
      add(
        "RESTRICAO_CARGA",
        "alerta",
        `${semana[0].data}: com as restrições informadas, a escala gerada oferece ${fmtHoras(efetivas)} para um alvo de ${fmtHoras(alvo)} (${fmtHoras(alvo - efetivas)} não alocadas). Revise a distribuição de horários ou o quadro de pessoal; as restrições não foram ultrapassadas.`,
        semana[0].data,
      );
  }
  return out;
}
