import { configDaEscala } from "./contexto-escala.js";
import { diagnosticarEquipe } from "./diagnostico-equipe.js";
import { aplicarRestricoesDia, validarRestricoes } from "./restricoes.js";
import { apurarComputoCCT } from "./computo-cct.js";
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
  limiteDiario,
  VERSAO_REGRAS,
  dataValida,
} from "./ec141.js";
import { apurarSemana } from "./resumo-semanal.js";
import {
  configDoPerfil,
  perfilAtivo,
  verificarPerfil,
} from "./perfil-dominio.js";

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
  const instrumento = config.instrumentoColetivo || {};
  const inicioMes = isoDate(config.ano, config.mes, 1);
  const fimMes = isoDate(
    config.ano,
    config.mes,
    diasNoMes(config.mes, config.ano),
  );
  // Um instrumento de outro período não autoriza a referência atual.
  if (
    config.instrumentoCompensacao === "act_cct" &&
    dataValida(instrumento.inicio) &&
    dataValida(instrumento.fim) &&
    instrumento.inicio <= instrumento.fim &&
    (instrumento.inicio > fimMes || instrumento.fim < inicioMes)
  )
    config.instrumentoCompensacao = "nenhuma";
  config.adiarRestricoes = true;
  const domain = createDomain(config);
  const escala = domain.gerarDadosEscala();
  delete config.adiarRestricoes;
  for (const r of escala.resultado)
    for (const d of new Set([
      ...r.dias,
      ...r.diasContexto,
      ...r.diasApuracao,
    ])) {
      const proprio = perfilAtivo(r.colaborador)
        ? createDomain(configDoPerfil(config, r.colaborador) || config)
        : domain;
      const j = normalizarJornada(
        d.jornadaAplicada || proprio.obterJornadaDoDia(d.weekday),
      );
      const horas = j ? (j.saida - j.entrada - j.intervalo) / 60 : 0;
      d.horas = ["T", "FE"].includes(d.status) ? horas : 0;
      d.horasPrevistas = d.previstoOriginal ? horas : 0;
      domain.atualizarHorarioEfetivo(d);
      aplicarRestricoesDia(
        r.colaborador,
        d,
        configDoPerfil(config, r.colaborador) || config,
        (dia) =>
          Object.assign(
            dia,
            apurarComputoCCT(
              configDoPerfil(config, r.colaborador) || config,
              dia,
            ),
          ),
      );
    }
  escala.referenciaAtual44 = true;
  escala.instrumentoReferencia = {
    base: config.instrumentoCompensacao,
    condicoes: structuredClone(config.instrumentoColetivo),
  };
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
  for (const c of state.colaboradores) {
    const erros = validarRestricoes(c);
    if (erros.length) throw new Error(`${c.nome}: ${erros.join(" ")}`);
  }
  for (const c of state.colaboradores)
    if (perfilAtivo(c)) {
      verificarPerfil(c);
      if (c.quadroDominio.tipo === "ciclo" || c.quadroDominio.modelo !== "6x1")
        throw new Error(
          "A conversão atual atende à origem 6×1. O quadro importado contém jornadas semanais ou ciclos diferentes; preserve esses regimes na prévia e revise o grupo a converter.",
        );
    }
  if (
    state.tipoEscala !== "6x1" &&
    !state.colaboradores.every(
      (c) => perfilAtivo(c) && c.quadroDominio.modelo === "6x1",
    )
  )
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
        config: copiarConfig(configDaEscala(state)),
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
  config.horariosOrigemCobertura = {
    jornada: structuredClone(state.jornada),
    jornadaPorDia: structuredClone(state.jornadaPorDia),
    horarioPorDia: state.horarioPorDia,
    turnosRevezamento: state.turnosRevezamento,
    entradaTurnoB: state.entradaTurnoB,
  };
  config.folgasFixasOrigemCobertura =
    state.folgaTipo === "fixa"
      ? (state.folgaDiasPermitidos || [])
          .filter((d) => state.diasTrabalho.includes(d))
          .slice(0, Math.max(0, state.diasTrabalho.length - 6))
      : [];
  config.tipoEscala = "5x2";
  config.aplicarProposta5x2 = true;
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
  const diagnostico = diagnosticarEquipe(config, escala.resultado, cobertura);
  const grupos = new Map(
    diagnostico.funcoes.map((f) => [normalizarFuncao(f.funcao), f]),
  );
  const pessoas = escala.resultado.map((r) => {
    const dias = diasPeriodo(config, r.dias);
    const original = conversao.referencia.escala.resultado.find(
      (a) => a.colaborador.id === r.colaborador.id,
    );
    const anteriores = diasPeriodo(config, original?.dias || []);
    const soma = (list) => list.reduce((s, d) => s + d.horas, 0);
    const trabalho = (list) =>
      list.filter((d) => ["T", "FE"].includes(d.status)).length;
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
      folgasAntes: anteriores.filter(
        (d) => !["T", "FE", "NC"].includes(d.status),
      ).length,
      folgasDepois: dias.filter((d) => !["T", "FE", "NC"].includes(d.status))
        .length,
      deficits: deficits.length,
    };
  });
  const erros = escala.validacoes.flatMap((v) =>
    v.issues.filter((i) => i.severidade === "erro"),
  );
  const pendencias = escala.validacoes.flatMap((v) =>
    v.issues.filter((i) => ["pendencia", "alerta"].includes(i.severidade)),
  );
  const dadosIncompletos = pendencias.some(
    (i) => i.tipo === "DADOS_DOMINIO" || i.tipo === "ADMISSAO_PARCIAL",
  );
  const capacidadeInsuficiente = [...grupos.values()].some(
    (g) => g.insuficiencias.length,
  );
  const naoAvaliada =
    !cobertura.configurada ||
    !cobertura.periodos.length ||
    diagnostico.avisos.length > 0;
  const status = naoAvaliada
    ? "nao_avaliada"
    : cobertura.lacunas.length
      ? capacidadeInsuficiente
        ? "insuficiente"
        : "ajustes"
      : erros.length
        ? "incompativel"
        : dadosIncompletos || pessoas.some((p) => p.deficits)
          ? "ajustes"
          : "suficiente";
  return {
    status,
    funcoes: [...grupos.values()],
    pessoas,
    erros: erros.length,
    pendencias: pendencias.length,
    avisos: diagnostico.avisos,
    diagnostico,
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
