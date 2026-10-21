import { createDomain } from "./index.js";
import {
  analisarCobertura,
  normalizarFuncao,
  validarDemanda,
} from "./cobertura.js";
import {
  normalizarJornada,
  jornadaValidaEstrutural,
  isoDate,
  dateFromKey,
  getMonday,
  diasNoMes,
  minToTime,
  timeToMin,
} from "./datas-horas.js";
import {
  PRIMEIRA_FASE,
  referenciaSemana,
  limiteDiario,
  VERSAO_REGRAS,
} from "./ec141.js";
import { apurarSemana } from "./resumo-semanal.js";

function copiarConfig(state) {
  const { conversao, escalaGerada, ...config } = state;
  return structuredClone(config);
}
function periodo(config) {
  return `${config.ano}-${String(config.mes + 1).padStart(2, "0")}`;
}
function diasPeriodo(config, dias) {
  const prefix = periodo(config);
  return dias.filter(
    (d) => d.data.startsWith(prefix) && d.dia >= config.diaInicio,
  );
}
function semanas(dias) {
  const map = new Map();
  for (const d of dias) {
    const date = getMonday(dateFromKey(d.data));
    const key = isoDate(date.getFullYear(), date.getMonth(), date.getDate());
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(d);
  }
  return map;
}
function recalcular(config, escala) {
  const domain = createDomain(config);
  escala.validacoes = escala.resultado.map((r) => ({
    colaborador: r.colaborador,
    issues: domain.validarLegal(
      r.colaborador,
      r.dias,
      r.diasContexto,
      r.diasApuracao,
    ),
  }));
  escala.coberturaOperacional = analisarCobertura(config, escala.resultado);
  return escala;
}

/** A referência descreve os horários atuais, sem reduzi-los para o limite futuro. */
export function gerarReferenciaAtual(state) {
  const config = copiarConfig(state);
  config.tipoEscala = "6x1";
  config.modoRegime = "simulacao";
  config.regimeJornada = "atual44";
  config.planoFolgasConversao = {};
  config.folgasFimSemana = false;
  config.instrumentoCompensacao = "nenhuma";
  const domain = createDomain(config);
  const escala = domain.gerarDadosEscala();
  for (const r of escala.resultado)
    for (const d of [...r.dias, ...r.diasContexto, ...r.diasApuracao]) {
      const j = normalizarJornada(domain.obterJornadaDoDia(d.weekday));
      const horas = j ? (j.saida - j.entrada - j.intervalo) / 60 : 0;
      d.horas = ["T", "FE"].includes(d.status) ? horas : 0;
      d.horasPrevistas = d.previstoOriginal ? horas : 0;
      domain.atualizarHorarioEfetivo(d);
    }
  return { config, escala: recalcular(config, escala) };
}

function planosPossiveis(config, origem) {
  if (config.folgasFimSemana) return [[0, 6]];
  const operacionais = [...new Set(config.diasTrabalho)];
  const quantidade = Math.max(0, operacionais.length - 5);
  if (!quantidade) return [[]];
  const permitidos = origem.folgaDiasPermitidos?.filter((d) =>
    operacionais.includes(d),
  );
  const atuais = permitidos?.length ? permitidos : operacionais;
  // Dias fixos descrevem o repouso atual, não restringem o novo segundo repouso.
  const candidatos =
    origem.folgaTipo === "fixa"
      ? operacionais
      : origem.folgaDiasPermitidos?.length
        ? permitidos
        : operacionais;
  const obrigatorias =
    origem.folgaTipo === "fixa"
      ? atuais.slice(0, Math.max(0, operacionais.length - 6))
      : [];
  const planos = [];
  for (let a = 0; a < candidatos.length; a++) {
    if (quantidade === 1) planos.push([candidatos[a]]);
    else
      for (let b = a + 1; b < candidatos.length; b++)
        planos.push([candidatos[a], candidatos[b]]);
  }
  return planos.filter((p) => obrigatorias.every((d) => p.includes(d)));
}

function feriadosDaEscala(escala) {
  const map = {};
  for (const r of escala.resultado)
    for (const d of [...r.diasContexto, ...r.diasApuracao, ...r.dias])
      if (d.feriado) map[d.data] = d.feriado;
  return map;
}
function gerarPessoa(config, escala, indice, feriados) {
  const domain = createDomain(config);
  const inicio = dateFromKey(escala.dataInicio);
  const mes = getMonday(new Date(config.ano, config.mes, 1));
  const inicioContexto = new Date(mes);
  inicioContexto.setDate(inicioContexto.getDate() - 7);
  const todos = domain.gerarEscalaColaborador(
    config.colaboradores[indice],
    indice,
    inicioContexto,
    dateFromKey(escala.dataFim),
    feriados,
  );
  return {
    colaborador: structuredClone(config.colaboradores[indice]),
    dias: todos.filter((d) => d.data >= escala.dataInicio),
    diasContexto: todos.filter((d) => dateFromKey(d.data) < inicio).slice(-7),
    diasApuracao: todos.filter((d) => dateFromKey(d.data) >= mes),
  };
}
function pontuacao(config, escala) {
  const cobertura = analisarCobertura(config, escala.resultado);
  const faltantes = cobertura.lacunas.reduce(
    (sum, l) => sum + (l.fimMin - l.inicioMin) * l.faltantes,
    0,
  );
  const domain = createDomain(config);
  const erros = escala.resultado.reduce(
    (sum, r) =>
      sum +
      domain
        .validarLegal(r.colaborador, r.dias, r.diasContexto, r.diasApuracao)
        .filter((i) => i.severidade === "erro").length,
    0,
  );
  return [erros, faltantes];
}
const melhor = (a, b) => a[0] < b[0] || (a[0] === b[0] && a[1] < b[1]);

export function converterEscala(state, opcoes = {}) {
  if (state.tipoEscala !== "6x1")
    throw new Error(
      "Preencha a escala atual no modelo 6×1 antes de converter.",
    );
  if (!state.colaboradores.length)
    throw new Error("Cadastre ao menos um colaborador.");
  if (!state.diasTrabalho.length)
    throw new Error("Informe os dias de funcionamento da empresa.");
  if (!/^\d{4}-\d{2}$/.test(opcoes.periodo || ""))
    throw new Error("Informe o mês e o ano da proposta.");
  const [ano, mes] = opcoes.periodo.split("-").map(Number);
  if (mes < 1 || mes > 12 || ano < 2026 || ano > 2100)
    throw new Error("Período da proposta inválido.");
  if (!["automatico", "transicao42", "definitivo40"].includes(opcoes.fase))
    throw new Error("Escolha uma fase válida para a conversão.");
  if (
    opcoes.fase === "automatico" &&
    `${opcoes.periodo}-01` < PRIMEIRA_FASE.slice(0, 7) + "-01"
  )
    throw new Error(
      "A exigência do segundo repouso começa em dezembro de 2026. Escolha um período dessa fase ou uma simulação explícita.",
    );
  if (!["distribuir", "fim_semana"].includes(opcoes.folgas))
    throw new Error("Escolha como distribuir as folgas da proposta.");
  for (const c of state.colaboradores)
    if (
      !String(c.nome).trim() ||
      !String(c.cargo).trim() ||
      !Number.isFinite(Number(c.horasSemana)) ||
      c.horasSemana <= 0 ||
      c.horasSemana > 60
    )
      throw new Error(
        "Confira nome, função e carga contratual de todos os colaboradores.",
      );
  for (const dia of state.diasTrabalho)
    if (
      !jornadaValidaEstrutural(
        state.horarioPorDia
          ? state.jornadaPorDia[dia] || state.jornada
          : state.jornada,
      )
    )
      throw new Error(
        "Corrija os horários da escala atual antes de converter.",
      );
  if (state.coberturaAtiva)
    for (const d of state.demandasCobertura) {
      const erro = validarDemanda(d);
      if (erro) throw new Error(`Cobertura: ${erro}`);
    }
  const origem = state.escalaGerada
    ? {
        config: copiarConfig(state),
        escala: structuredClone(state.escalaGerada),
      }
    : gerarReferenciaAtual(state);
  const config = copiarConfig(state);
  config.ano = ano;
  config.mes = mes - 1;
  config.diaInicio = 1;
  // Datas explícitas impedem que feriados locais da origem mudem de mês.
  config.feriados = [];
  config.feriadosConfigurados = [
    ...(config.feriadosConfigurados || []),
    ...state.feriados.map((f) => ({
      ...f,
      ano: f.ano ?? state.ano,
      mes: f.mes ?? state.mes,
    })),
  ];
  createDomain(config).inicializarFeriadosDoMes();
  const referencia = gerarReferenciaAtual(config);
  config.tipoEscala = "5x2";
  config.modoRegime = opcoes.fase === "automatico" ? "automatico" : "simulacao";
  if (opcoes.fase !== "automatico") config.regimeJornada = opcoes.fase;
  config.folgasFimSemana = opcoes.folgas === "fim_semana";
  config.folgaTipo = "fixa";
  config.planoFolgasConversao = {};
  // A disponibilidade atual é um teto; não estender saídas nem presumir ACT/CCT.
  config.horarioPorDia = true;
  config.jornadaPorDia = {};
  const limite = Math.min(
    ...Array.from({ length: diasNoMes(config.mes, ano) }, (_, i) =>
      limiteDiario(config, isoDate(ano, config.mes, i + 1)),
    ),
  );
  for (let dia = 0; dia < 7; dia++) {
    const fonte = state.horarioPorDia
      ? state.jornadaPorDia[dia] || state.jornada
      : state.jornada;
    const j = normalizarJornada(fonte);
    if (!j) {
      config.jornadaPorDia[dia] = structuredClone(fonte);
      continue;
    }
    const horas = Math.min(limite, (j.saida - j.entrada - j.intervalo) / 60);
    const fim = j.entrada + horas * 60 + j.intervalo;
    const inicioPausa = Math.min(j.intInicio, fim - j.intervalo);
    config.jornadaPorDia[dia] = {
      ...fonte,
      intInicio: minToTime(j.turnoUnico ? fim : inicioPausa),
      intFim: minToTime(j.turnoUnico ? fim : inicioPausa + j.intervalo),
      saida: minToTime(fim),
    };
  }
  const planos = planosPossiveis(config, state);
  if (!planos.length)
    throw new Error(
      "Os dias permitidos para folga não comportam o 5×2. Revise as restrições de folga.",
    );
  config.colaboradores.forEach(
    (c, i) => (config.planoFolgasConversao[c.id] = planos[i % planos.length]),
  );
  const escala = createDomain(config).gerarDadosEscala();
  const feriados = feriadosDaEscala(escala);
  let score = pontuacao(config, escala),
    tentativas = 0;
  // Busca limitada e determinística. Lacunas remanescentes não provam inviabilidade.
  const limiteBusca = 120;
  if (config.coberturaAtiva && config.demandasCobertura.length)
    for (let rodada = 0; rodada < 2; rodada++) {
      let mudou = false;
      for (
        let i = 0;
        i < config.colaboradores.length && tentativas < limiteBusca;
        i++
      ) {
        const c = config.colaboradores[i],
          anterior = escala.resultado[i];
        let escolhido = anterior,
          planoEscolhido = config.planoFolgasConversao[c.id];
        for (const plano of planos) {
          if (tentativas >= limiteBusca) break;
          tentativas++;
          config.planoFolgasConversao[c.id] = plano;
          escala.resultado[i] = gerarPessoa(config, escala, i, feriados);
          const atual = pontuacao(config, escala);
          if (melhor(atual, score)) {
            score = atual;
            escolhido = escala.resultado[i];
            planoEscolhido = plano;
            mudou = true;
          }
        }
        config.planoFolgasConversao[c.id] = planoEscolhido;
        escala.resultado[i] = escolhido;
      }
      if (
        !mudou ||
        tentativas >= limiteBusca ||
        (score[0] === 0 && score[1] === 0)
      )
        break;
    }
  config.escalaGerada = recalcular(config, escala);
  const conversao = {
    versaoRegras: VERSAO_REGRAS,
    origem,
    referencia,
    proposta: { config },
    opcoes: structuredClone(opcoes),
    tentativas,
    limiteBusca,
  };
  conversao.comparacao = compararConversao(conversao);
  return conversao;
}

export function compararConversao(conversao) {
  const { config } = conversao.proposta;
  const escala = config.escalaGerada;
  recalcular(config, escala);
  const cobertura = escala.coberturaOperacional;
  const antes = analisarCobertura(
    { ...config, tipoEscala: "6x1" },
    conversao.referencia.escala.resultado,
  );
  const grupos = new Map();
  for (const p of cobertura.periodos) {
    const key = normalizarFuncao(p.funcao);
    if (!grupos.has(key))
      grupos.set(key, {
        funcao: p.funcao,
        necessarias: 0,
        faltantes: 0,
        pico: 0,
        disponiveis: 0,
        limiteCapacidade: 0,
        insuficiencias: [],
        diasNecessarios: {},
        diasDisponiveis: {},
      });
    const g = grupos.get(key);
    g.necessarias += ((p.fimMin - p.inicioMin) * p.necessarios) / 60;
    g.faltantes += ((p.fimMin - p.inicioMin) * p.faltantes) / 60;
    g.pico = Math.max(g.pico, p.faltantes);
    g.diasNecessarios[p.data] = Math.max(
      g.diasNecessarios[p.data] || 0,
      p.necessarios,
    );
  }
  const pessoas = escala.resultado.map((r) => {
    const dias = diasPeriodo(config, r.dias);
    const original = conversao.referencia.escala.resultado.find(
      (a) => a.colaborador.id === r.colaborador.id,
    );
    const anteriores = diasPeriodo(config, original?.dias || []);
    const soma = (list) => list.reduce((s, d) => s + d.horas, 0);
    const trabalho = (list) =>
      list.filter((d) => ["T", "FE"].includes(d.status)).length;
    const g = grupos.get(normalizarFuncao(r.colaborador.cargo));
    if (g) {
      g.disponiveis += soma(dias);
      for (const semana of semanas(dias).values()) {
        const ref = referenciaSemana(config, semana, r.colaborador);
        const capacidade = semana
          .filter(
            (d) =>
              config.diasTrabalho.includes(d.weekday) &&
              (!d.feriado || d.feriado.trabalhado),
          )
          .map((d) => {
            const j = normalizarJornada(config.jornadaPorDia[d.weekday]);
            return j
              ? Math.max(0, (j.saida - j.entrada - j.intervalo) / 60)
              : 0;
          })
          .sort((a, b) => b - a)
          .slice(0, 5)
          .reduce((a, b) => a + b, 0);
        g.limiteCapacidade += Math.min(ref.alvo, capacidade);
        const week = [...semanas(semana).keys()][0];
        g.diasDisponiveis[week] =
          (g.diasDisponiveis[week] || 0) +
          Math.min(
            5,
            semana.filter(
              (d) =>
                config.diasTrabalho.includes(d.weekday) &&
                (!d.feriado || d.feriado.trabalhado),
            ).length,
          );
      }
    }
    const deficits = [...semanas(r.dias).values()]
      .map((s) => apurarSemana(r.colaborador, s, config))
      .filter((s) => s.completa && s.estado === "abaixo");
    return {
      id: r.colaborador.id,
      nome: r.colaborador.nome,
      funcao: r.colaborador.cargo,
      horasAntes: soma(anteriores),
      horasDepois: soma(dias),
      diasAntes: trabalho(anteriores),
      diasDepois: trabalho(dias),
      folgasAntes: anteriores.length - trabalho(anteriores),
      folgasDepois: dias.length - trabalho(dias),
      deficits: deficits.length,
    };
  });
  for (const g of grupos.values()) {
    if (g.necessarias > g.limiteCapacidade + 0.01)
      g.insuficiencias.push(
        `A demanda exige ${g.necessarias.toFixed(1)}h-pessoa no período, acima do teto estimado de ${g.limiteCapacidade.toFixed(1)}h da equipe dessa função, respeitando contratos, dias disponíveis e até cinco dias por semana.`,
      );
    if (
      !config.colaboradores.some(
        (c) => normalizarFuncao(c.cargo) === normalizarFuncao(g.funcao),
      )
    )
      g.insuficiencias.push(
        "Nenhum colaborador possui essa função cadastrada.",
      );
    const noturna = Object.values(config.jornadaPorDia).some((f) => {
      const j = normalizarJornada(f);
      return (
        j &&
        (j.saida > 1440 ||
          (config.turnosRevezamento &&
            timeToMin(config.entradaTurnoB) + j.saida - j.entrada > 1440))
      );
    });
    if (!noturna) {
      const necessidade = {};
      for (const [data, minimo] of Object.entries(g.diasNecessarios)) {
        const week = [...semanas([{ data }]).keys()][0];
        necessidade[week] = (necessidade[week] || 0) + minimo;
      }
      for (const [week, minimo] of Object.entries(necessidade))
        if (minimo > (g.diasDisponiveis[week] || 0))
          g.insuficiencias.push(
            `Semana de ${week}: a demanda exige pelo menos ${minimo} dias-pessoa de presença, mas esta equipe pode oferecer no máximo ${g.diasDisponiveis[week] || 0} em 5×2. Mesmo havendo saldo de horas, faltam pessoas para cobrir os dias.`,
          );
    }
  }
  const erros = escala.validacoes.flatMap((v) =>
    v.issues.filter((i) => i.severidade === "erro"),
  );
  const pendencias = escala.validacoes.flatMap((v) =>
    v.issues.filter((i) => ["pendencia", "alerta"].includes(i.severidade)),
  );
  const capacidadeInsuficiente = [...grupos.values()].some(
    (g) => g.insuficiencias.length,
  );
  const naoAvaliada =
    !cobertura.configurada ||
    !cobertura.periodos.length ||
    cobertura.avisos.length > 0;
  const status = naoAvaliada
    ? "nao_avaliada"
    : cobertura.lacunas.length
      ? capacidadeInsuficiente
        ? "insuficiente"
        : "ajustes"
      : erros.length
        ? "incompativel"
        : pessoas.some((p) => p.deficits)
          ? "ajustes"
          : "suficiente";
  return {
    status,
    funcoes: [...grupos.values()],
    pessoas,
    erros: erros.length,
    pendencias: pendencias.length,
    avisos: cobertura.avisos,
    lacunas: cobertura.lacunas,
    faltantesAntes: antes.lacunas.reduce(
      (s, l) => s + ((l.fimMin - l.inicioMin) * l.faltantes) / 60,
      0,
    ),
    faltantesDepois: cobertura.lacunas.reduce(
      (s, l) => s + ((l.fimMin - l.inicioMin) * l.faltantes) / 60,
      0,
    ),
  };
}
