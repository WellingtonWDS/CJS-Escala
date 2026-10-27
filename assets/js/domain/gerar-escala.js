import { apurarSemana } from "./resumo-semanal.js";
import {
  aplicarRestricoesDia,
  validarRestricoes,
  bloqueioNaData,
} from "./restricoes.js";
import {
  apurarComputoCCT,
  politicaPlantaoDeclarada,
  computoDaJornada,
} from "./computo-cct.js";
import {
  referenciaDia,
  limiteDiario,
  referenciaSemana,
  instrumentoValido,
  VERSAO_REGRAS,
} from "./ec141.js";
import { createPlanejadorFolgas } from "./folgas-semana.js";
import { createDomain } from "./index.js";
import {
  configDoPerfil,
  verificarPerfil,
  diaDoCiclo,
} from "./perfil-dominio.js";
import { distribuirCargaComAbonos } from "./distribuicao-horas.js";
import { calcularPausaEfetiva, analisarCobertura } from "./cobertura.js";
import {
  jornadaValidaEstrutural,
  diasNoMes,
  isoDate,
  dateFromKey,
  timeToMin,
  minToTime,
  intervaloMin,
  getMonday,
  weekKey,
  addDays,
  normalizarJornada,
} from "./datas-horas.js";

export function createGerador(state, jornada, feriados, validacao) {
  const { obterJornadaDoDia, obterTurno } = jornada;
  const { feriadosNacionais } = feriados;
  const { validarCobertura, validarLegal } = validacao;
  function diasDaSemanaDaEscala(date, idx) {
    /*
     * state.diasTrabalho = dias operacionais da empresa.
     * A escala determina quantos desses dias o colaborador trabalha.
     * Dias não operacionais já são folga e não entram como dias trabalhados.
     */
    const operacionais = [
      ...new Set((state.diasTrabalho || []).filter((d) => d >= 0 && d <= 6)),
    ].sort((a, b) => a - b);
    if (state.tipoEscala === "12x36") return [];
    if (state.tipoEscala === "5x2" && state.folgasFimSemana) {
      return operacionais.filter((d) => d === 0 || d === 6);
    }

    const alvo =
      state.tipoEscala === "5x2"
        ? 5
        : state.tipoEscala === "6x1"
          ? referenciaDia(state, addDays(getMonday(date), 6)).folgas === 2 &&
            !instrumentoValido(
              state,
              isoDate(date.getFullYear(), date.getMonth(), date.getDate()),
              "repousoMensal",
            )
            ? 5
            : 6
          : operacionais.length;

    const quantidadeFolgasOperacionais = Math.max(
      0,
      operacionais.length - alvo,
    );
    const planoConversao =
      state.planoFolgasConversao?.[state.colaboradores[idx]?.id];
    if (Array.isArray(planoConversao))
      return planoConversao
        .filter((d) => operacionais.includes(d))
        .slice(0, quantidadeFolgasOperacionais);
    if (quantidadeFolgasOperacionais === 0) return [];

    const permitidos = (state.folgaDiasPermitidos || []).filter((d) =>
      operacionais.includes(d),
    );
    const candidatos = permitidos.length ? permitidos : operacionais;

    if (!candidatos.length) return [];

    if (state.folgaTipo === "fixa") {
      return candidatos.slice(0, quantidadeFolgasOperacionais);
    }

    const monday = getMonday(date);
    const rotacionar = (segunda) => {
      const serial =
        Date.UTC(segunda.getFullYear(), segunda.getMonth(), segunda.getDate()) /
        86400000;
      const desloc = (Math.abs(Math.floor(serial)) + idx) % candidatos.length;
      return candidatos
        .slice(desloc)
        .concat(candidatos.slice(0, desloc))
        .slice(0, quantidadeFolgasOperacionais);
    };
    const folgas = rotacionar(monday);
    if (quantidadeFolgasOperacionais === 2 && folgas.length === 2) {
      // Segunda=0 ... domingo=6. Preservar a última folga nominal torna a
      // decisão estável entre meses, sem depender do início da geração.
      const ordem = (dia) => (dia + 6) % 7;
      const anteriores = rotacionar(addDays(monday, -7));
      const ultimaAnterior = anteriores.reduce((a, b) =>
        ordem(a) > ordem(b) ? a : b,
      );
      const primeira = ordem(folgas[0]) < ordem(folgas[1]) ? 0 : 1;
      if (ordem(folgas[primeira]) > ordem(ultimaAnterior)) {
        // Antecipar uma das duas folgas evita sete dias consecutivos sem
        // acrescentar um terceiro repouso. O dia já pertence aos permitidos.
        folgas[primeira] = ultimaAnterior;
      }
    }
    return folgas;
  }

  function escolherFolgasSemana(date, idx) {
    return diasDaSemanaDaEscala(date, idx);
  }

  function gerarEscalaColaborador(
    colab,
    idx,
    dataInicio,
    dataFim,
    feriadosMap,
  ) {
    verificarPerfil(colab);
    const errosRestricoes = validarRestricoes(colab);
    if (errosRestricoes.length)
      throw new Error(`${colab.nome}: ${errosRestricoes.join(" ")}`);
    const individual = configDoPerfil(state, colab);
    if (individual)
      return createDomain(individual).gerarEscalaColaborador(
        colab,
        idx,
        dataInicio,
        dataFim,
        feriadosMap,
      );
    dataInicio = new Date(
      dataInicio.getFullYear(),
      dataInicio.getMonth(),
      dataInicio.getDate(),
    );
    dataFim = new Date(
      dataFim.getFullYear(),
      dataFim.getMonth(),
      dataFim.getDate(),
    );
    const dias = [];
    const planejarFolgas = createPlanejadorFolgas(
      state,
      escolherFolgasSemana,
      feriadosMap,
      idx,
      colab,
    );
    // Contexto anterior mantém as folgas consistentes ao gerar meses adjacentes.
    let cursor = addDays(dataInicio, -14);

    while (cursor <= dataFim) {
      const date = new Date(cursor.getTime());
      const weekday = date.getDay();
      let status = "F";
      const key = isoDate(date.getFullYear(), date.getMonth(), date.getDate());
      const feriado = feriadosMap[key] || null;
      let plano;

      if (state.cicloQuadro) {
        const h = diaDoCiclo(state, date);
        status = h.status === "trabalho" ? "T" : "F";
      } else if (state.tipoEscala === "12x36") {
        const grupo = idx % 2;
        // Alternância contínua, independente das viradas de mês e ano.
        const anchor = dateFromKey(state.ancora12x36);
        const serial = (d) =>
          Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 86400000;
        const offset = serial(date) - serial(anchor);
        status = ((offset % 2) + 2) % 2 === grupo ? "T" : "F";
      } else {
        const operacional = state.diasTrabalho.includes(weekday);
        if (!operacional) {
          status = "F";
        } else {
          plano = planejarFolgas(date);
          status = plano.opcionais.includes(weekday) ? "F" : "T";
        }
      }

      if (state.sabadoCompensado && weekday === 6) status = "F";
      const bloqueio = bloqueioNaData(colab, key);
      if (bloqueio && ["folga", "indisponivel"].includes(bloqueio.tipo))
        status = "F";
      let repousoSeguranca = false;
      if (
        state.tipoEscala !== "12x36" &&
        status === "T" &&
        !(bloqueio && ["ferias", "afastamento"].includes(bloqueio.tipo)) &&
        !(feriado && !feriado.trabalhado)
      ) {
        let seguidos = 0;
        for (
          let i = dias.length - 1;
          i >= 0 &&
          ["T", "FE"].includes(dias[i].status) &&
          !bloqueioNaData(colab, dias[i].data);
          i--
        )
          seguidos++;
        if (seguidos >= 6) {
          status = "F";
          repousoSeguranca = true;
        }
      }
      const previsto =
        feriado && !feriado.trabalhado && plano
          ? !plano.base.includes(weekday)
          : status === "T";
      if (feriado) {
        if (feriado.trabalhado && status === "T") status = "FE";
        else if (!feriado.trabalhado) status = "F";
      }
      if (
        colab.quadroDominio?.admissaoIso &&
        key < colab.quadroDominio.admissaoIso
      )
        status = "NC";

      dias.push({
        colaboradorId: colab.id,
        dia: date.getDate(),
        data: key,
        weekday,
        status,
        horas: 0,
        feriado,
        previsto: status === "NC" ? false : previsto,
        previstoOriginal:
          status === "NC" || (state.sabadoCompensado && weekday === 6)
            ? false
            : state.tipoEscala === "12x36" || state.cicloQuadro
              ? previsto
              : state.diasTrabalho.includes(weekday) &&
                !plano.base.includes(weekday) &&
                !repousoSeguranca,
        repousoSeguranca,
        turno: obterTurno(date, idx),
        ...(state.perfilDominioId
          ? {
              colaboradorId: colab.id,
              jornadaAplicada: state.cicloQuadro
                ? diaDoCiclo(state, date).jornada || state.jornada
                : obterJornadaDoDia(weekday),
            }
          : {}),
      });

      cursor.setDate(cursor.getDate() + 1);
    }

    const periodo = dias.filter((d) => dateFromKey(d.data) >= dataInicio);
    distribuirHorasIndividuais(colab, periodo);
    if (!state.adiarRestricoes)
      for (const d of periodo)
        aplicarRestricoesDia(colab, d, state, (dia) =>
          Object.assign(dia, apurarComputoCCT(state, dia)),
        );
    ajustarSabadoCompensado(colab, periodo);
    return periodo;
  }

  function ajustarSabadoCompensado(colab, dias) {
    if (state.sabadoCompensado) {
      const semanas = new Map();
      for (const d of dias) {
        const k = weekKey(dateFromKey(d.data));
        if (!semanas.has(k)) semanas.set(k, []);
        semanas.get(k).push(d);
      }
      for (const semana of semanas.values()) {
        const sabado = semana.find((d) => d.weekday === 6);
        if (
          !sabado ||
          !(
            sabado.status === "F" ||
            sabado.sabadoCompensado ||
            sabado.reposicaoSabado
          ) ||
          sabado.restricao ||
          bloqueioNaData(colab, sabado.data) ||
          sabado.feriado
        )
          continue;
        sabado.status = "FC";
        sabado.horas = 0;
        sabado.previsto = false;
        sabado.previstoOriginal = false;
        sabado.horasPrevistas = 0;
        sabado.reposicaoSabado = false;
        atualizarHorarioEfetivo(sabado);
        const a = apurarSemana(colab, semana, state),
          falta = Math.max(0, a.alvo - a.computadas);
        sabado.sabadoCompensado = true;
        sabado.status = "FC";
        const j = normalizarJornada(state.jornadaPorDia[6]);
        if (
          falta > 0.001 &&
          j &&
          jornadaValidaEstrutural(state.jornadaPorDia[6])
        ) {
          const minutoData = (data) => Date.parse(`${data}T00:00:00Z`) / 60000;
          const base = minutoData(sabado.data);
          const trabalhos = dias.filter(
            (d) =>
              d !== sabado &&
              ["T", "FE"].includes(d.status) &&
              Number.isFinite(d.entradaMin) &&
              Number.isFinite(d.saidaMin),
          );
          const anterior = Math.max(
            -Infinity,
            ...trabalhos
              .filter((d) => d.data < sabado.data)
              .map((d) => minutoData(d.data) + d.saidaMin),
          );
          const proximo = Math.min(
            Infinity,
            ...trabalhos
              .filter((d) => d.data > sabado.data)
              .map((d) => minutoData(d.data) + d.entradaMin),
          );
          const inicio = Math.max(j.entrada, anterior + 660 - base),
            fim = Math.min(j.saida, proximo - 660 - base);
          const capacidade = (fim - inicio - j.intervalo) / 60;
          const ordem = dias
              .slice()
              .sort((a, b) => a.data.localeCompare(b.data)),
            idx = ordem.indexOf(sabado);
          let seguidos = 0;
          for (
            let i = idx - 1;
            i >= 0 && ["T", "FE"].includes(ordem[i].status);
            i--
          )
            seguidos++;
          for (
            let i = idx + 1;
            i < ordem.length && ["T", "FE"].includes(ordem[i].status);
            i++
          )
            seguidos++;
          if (capacidade <= 0 || seguidos >= 6) continue;
          const margem = Math.min(15, capacidade * 30);
          const pausa = j.intervalo
            ? Math.max(
                inicio + margem,
                Math.min(j.intInicio, fim - j.intervalo - margem),
              )
            : fim;
          sabado.jornadaAplicada = {
            entrada: minToTime(inicio),
            intInicio: minToTime(pausa),
            intFim: minToTime(j.intervalo ? pausa + j.intervalo : fim),
            saida: minToTime(fim),
          };
          sabado.status = "T";
          sabado.reposicaoSabado = true;
          sabado.sabadoCompensado = false;
          sabado.horas = Math.min(
            falta,
            capacidade,
            limiteDiario(state, sabado.data),
            j.intervalo < 15 ? 4 : j.intervalo < 60 ? 6 : Infinity,
          );
          sabado.previsto = true;
          sabado.previstoOriginal = true;
          sabado.horasPrevistas = sabado.horas;
          atualizarHorarioEfetivo(sabado);
          if (!state.adiarRestricoes)
            aplicarRestricoesDia(colab, sabado, state, (d) =>
              Object.assign(d, apurarComputoCCT(state, d)),
            );
        }
      }
    }
  }

  function atualizarHorarioEfetivo(d) {
    const c = state.colaboradores.find((c) => c.id === d.colaboradorId);
    const individual = c && configDoPerfil(state, c);
    if (individual) return createDomain(individual).atualizarHorarioEfetivo(d);
    const j =
      d.jornadaAplicada ||
      (state.tipoEscala === "12x36"
        ? state.jornada
        : obterJornadaDoDia(d.weekday));
    const pausa = Math.max(0, intervaloMin(j) || 0);
    d.entradaMin = timeToMin(d.turno === "B" ? state.entradaTurnoB : j.entrada);
    d.intervaloMin = pausa;
    d.saidaMin = d.entradaMin + d.horas * 60 + pausa;
    const intervalo = calcularPausaEfetiva(d, j);
    d.intervaloInicioMin = intervalo?.inicio ?? null;
    d.intervaloFimMin = intervalo?.fim ?? null;
    Object.assign(d, apurarComputoCCT(state, d));
  }

  function distribuirHorasIndividuais(colab, dias) {
    const porSemana = new Map();
    dias.forEach((d) => {
      const key = weekKey(dateFromKey(d.data));
      if (!porSemana.has(key)) porSemana.set(key, []);
      porSemana.get(key).push(d);
    });
    porSemana.forEach((semana) => {
      if (
        state.usarHorasQuadro ||
        (state.tipoEscala === "12x36" && politicaPlantaoDeclarada(state))
      ) {
        const ref = referenciaSemana(state, semana, colab);
        for (const d of semana) {
          const j = d.jornadaAplicada || obterJornadaDoDia(d.weekday);
          const h = j ? jornada.calcHorasDia(d.weekday) : 0;
          const normal = j ? normalizarJornada(j) : null;
          const horas = normal
            ? (normal.saida - normal.entrada - normal.intervalo) / 60
            : h;
          d.horas = ["T", "FE"].includes(d.status) ? horas : 0;
          d.horasPrevistas = d.previstoOriginal ? horas : 0;
          d.alvoSemana = ref.alvo;
          d.limiteSemanal = ref.horas;
          d.regimeAplicado = referenciaDia(state, d.data, colab).chave;
          atualizarHorarioEfetivo(d);
          if (d.previstoOriginal && politicaPlantaoDeclarada(state))
            d.horasPrevistas =
              computoDaJornada(state, j, d.data)?.horasComputadasCCT ?? horas;
        }
        return;
      }
      // Feriado dispensado preserva sua parcela da carga semanal.
      const referencia = referenciaSemana(state, semana, colab);
      const cargaPrevista = distribuirCargaComAbonos(
        { ...colab, horasSemana: referencia.alvo },
        semana,
        state,
      );
      semana.forEach((d) => {
        d.alvoSemana = referencia.alvo;
        d.limiteSemanal =
          referencia.horas === Infinity ? null : referencia.horas;
        d.regimeAplicado = referenciaDia(state, d.data, colab).chave;
        const trabalho = d.status === "T" || d.status === "FE";
        d.horasPrevistas = d.previsto
          ? state.tipoEscala === "12x36"
            ? Math.max(
                0,
                12 - Math.max(0, intervaloMin(state.jornada) || 0) / 60,
              )
            : (cargaPrevista.get(d.data) ?? 0)
          : 0;
        d.horas = trabalho
          ? state.tipoEscala === "12x36"
            ? Math.max(
                0,
                12 - Math.max(0, intervaloMin(state.jornada) || 0) / 60,
              )
            : (cargaPrevista.get(d.data) ?? 0)
          : 0;
        atualizarHorarioEfetivo(d);
      });
    });
  }

  function gerarDadosEscala() {
    const diasMes = diasNoMes(state.mes, state.ano);
    const primeiroDia = new Date(state.ano, state.mes, state.diaInicio);
    const ultimoDia = new Date(state.ano, state.mes, diasMes);
    const dataInicio = getMonday(primeiroDia);
    const dataFim = addDays(getMonday(ultimoDia), 6);

    /* A escala passa a conter a semana civil completa, inclusive os
     dias que pertencem ao mês anterior/posterior. */
    const feriadosMap = {};
    feriadosNacionais(state.ano).forEach((f) => {
      const key = isoDate(
        f.data.getFullYear(),
        f.data.getMonth(),
        f.data.getDate(),
      );
      feriadosMap[key] = { ...f, dia: f.data.getDate(), trabalhado: false };
    });
    feriadosNacionais(state.ano - 1).forEach((f) => {
      const key = isoDate(
        f.data.getFullYear(),
        f.data.getMonth(),
        f.data.getDate(),
      );
      feriadosMap[key] = { ...f, dia: f.data.getDate(), trabalhado: false };
    });
    feriadosNacionais(state.ano + 1).forEach((f) => {
      const key = isoDate(
        f.data.getFullYear(),
        f.data.getMonth(),
        f.data.getDate(),
      );
      feriadosMap[key] = { ...f, dia: f.data.getDate(), trabalhado: false };
    });
    // Também respeitar feriados locais anteriores em plantões que cruzam o mês.
    [
      ...(state.feriadosConfigurados ?? []),
      ...(state.feriadosLocais ?? []),
    ].forEach((f) => {
      if (Number.isInteger(f.ano) && Number.isInteger(f.mes)) {
        feriadosMap[isoDate(f.ano, f.mes, Number(f.dia))] = { ...f };
      }
    });
    (state.feriadosExcluidos || []).forEach((key) => delete feriadosMap[key]);
    state.feriados.forEach((f) => {
      const key = isoDate(state.ano, state.mes, Number(f.dia));
      feriadosMap[key] = { ...f };
    });

    const resultado = state.colaboradores.map((c, idx) => {
      const inicioMes = getMonday(new Date(state.ano, state.mes, 1));
      const todos = gerarEscalaColaborador(
        c,
        idx,
        addDays(inicioMes, -7),
        dataFim,
        feriadosMap,
      );
      return {
        colaborador: { ...c },
        diasContexto: todos
          .filter((d) => dateFromKey(d.data) < dataInicio)
          .slice(-7),
        diasApuracao: todos.filter((d) => dateFromKey(d.data) >= inicioMes),
        dias: todos.filter((d) => dateFromKey(d.data) >= dataInicio),
      };
    });

    const cobertura = validarCobertura(resultado);
    const validacoes = resultado.map((r) => ({
      colaborador: r.colaborador,
      issues: validarLegal(
        r.colaborador,
        r.dias,
        r.diasContexto,
        r.diasApuracao,
      ),
    }));

    return {
      versaoRegras: VERSAO_REGRAS,
      modoRegime: state.modoRegime,
      diasMes,
      dataInicio: isoDate(
        dataInicio.getFullYear(),
        dataInicio.getMonth(),
        dataInicio.getDate(),
      ),
      dataFim: isoDate(
        dataFim.getFullYear(),
        dataFim.getMonth(),
        dataFim.getDate(),
      ),
      resultado,
      avisosCobertura: cobertura,
      coberturaOperacional: analisarCobertura(state, resultado),
      validacoes,
      geradoEm: new Date().toISOString(),
    };
  }
  return {
    gerarDadosEscala,
    diasDaSemanaDaEscala,
    escolherFolgasSemana,
    gerarEscalaColaborador,
    atualizarHorarioEfetivo,
    distribuirHorasIndividuais,
    ajustarSabadoCompensado,
  };
}
