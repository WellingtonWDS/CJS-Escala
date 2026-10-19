import { calcularPausaEfetiva, analisarCobertura } from "./cobertura.js";
import {
  diasNoMes,
  isoDate,
  dateFromKey,
  timeToMin,
  intervaloMin,
  getMonday,
  weekKey,
  addDays,
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

    const alvo =
      state.tipoEscala === "5x2"
        ? 5
        : state.tipoEscala === "6x1"
          ? 6
          : operacionais.length;

    const quantidadeFolgasOperacionais = Math.max(
      0,
      operacionais.length - alvo,
    );
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
    const weekSeed = Math.abs(Math.floor(monday.getTime() / 86400000)) + idx;
    const rotacionados = [...candidatos];
    const desloc = weekSeed % rotacionados.length;
    const ordenados = rotacionados
      .slice(desloc)
      .concat(rotacionados.slice(0, desloc));
    return ordenados.slice(0, quantidadeFolgasOperacionais);
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
    const dias = [];
    // Contexto anterior mantém as folgas consistentes ao gerar meses adjacentes.
    let cursor = addDays(dataInicio, -14);

    while (cursor <= dataFim) {
      const date = new Date(cursor.getTime());
      const weekday = date.getDay();
      let status = "F";

      if (state.tipoEscala === "12x36") {
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
          const folgas = escolherFolgasSemana(date, idx);
          status = folgas.includes(weekday) ? "F" : "T";
        }
      }

      const key = isoDate(date.getFullYear(), date.getMonth(), date.getDate());
      const feriado = feriadosMap[key] || null;
      let repousoSeguranca = false;
      if (state.tipoEscala !== "12x36" && status === "T") {
        let seguidos = 0;
        for (
          let i = dias.length - 1;
          i >= 0 && ["T", "FE"].includes(dias[i].status);
          i--
        )
          seguidos++;
        if (seguidos >= 6) {
          status = "F";
          repousoSeguranca = true;
        }
      }
      const previsto = status === "T";
      if (feriado) {
        if (feriado.trabalhado && status === "T") status = "FE";
        else if (!feriado.trabalhado) status = "F";
      }

      dias.push({
        dia: date.getDate(),
        data: key,
        weekday,
        status,
        horas: 0,
        feriado,
        previsto,
        repousoSeguranca,
        turno: obterTurno(date, idx),
      });

      cursor.setDate(cursor.getDate() + 1);
    }

    const periodo = dias.filter((d) => dateFromKey(d.data) >= dataInicio);
    distribuirHorasIndividuais(colab, periodo);
    return periodo;
  }

  function atualizarHorarioEfetivo(d) {
    const j =
      state.tipoEscala === "12x36"
        ? state.jornada
        : obterJornadaDoDia(d.weekday);
    const pausa = Math.max(0, intervaloMin(j) || 0);
    d.entradaMin = timeToMin(d.turno === "B" ? state.entradaTurnoB : j.entrada);
    d.intervaloMin = pausa;
    d.saidaMin = d.entradaMin + d.horas * 60 + pausa;
    const intervalo = calcularPausaEfetiva(d, j);
    d.intervaloInicioMin = intervalo?.inicio ?? null;
    d.intervaloFimMin = intervalo?.fim ?? null;
  }

  function distribuirHorasIndividuais(colab, dias) {
    const porSemana = new Map();
    dias.forEach((d) => {
      const key = weekKey(dateFromKey(d.data));
      if (!porSemana.has(key)) porSemana.set(key, []);
      porSemana.get(key).push(d);
    });
    porSemana.forEach((semana) => {
      // Feriado dispensado preserva sua parcela da carga semanal.
      const previstos = semana.filter((d) => d.previsto).length;
      const horas = Number(colab.horasSemana) / Math.max(1, previstos);
      semana.forEach((d) => {
        const trabalho = d.status === "T" || d.status === "FE";
        d.horasPrevistas = d.previsto
          ? state.tipoEscala === "12x36"
            ? Math.max(
                0,
                12 - Math.max(0, intervaloMin(state.jornada) || 0) / 60,
              )
            : horas
          : 0;
        d.horas = trabalho
          ? state.tipoEscala === "12x36"
            ? Math.max(
                0,
                12 - Math.max(0, intervaloMin(state.jornada) || 0) / 60,
              )
            : horas
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
    (state.feriadosLocais ?? []).forEach((f) => {
      if (Number.isInteger(f.ano) && Number.isInteger(f.mes)) {
        feriadosMap[isoDate(f.ano, f.mes, Number(f.dia))] = { ...f };
      }
    });
    state.feriados.forEach((f) => {
      const key = isoDate(state.ano, state.mes, Number(f.dia));
      feriadosMap[key] = { ...f };
    });

    const resultado = state.colaboradores.map((c, idx) => ({
      colaborador: { ...c },
      diasContexto: gerarEscalaColaborador(
        c,
        idx,
        addDays(dataInicio, -7),
        addDays(dataInicio, -1),
        feriadosMap,
      ),
      dias: gerarEscalaColaborador(c, idx, dataInicio, dataFim, feriadosMap),
    }));

    const cobertura = validarCobertura(resultado);
    const validacoes = resultado.map((r) => ({
      colaborador: r.colaborador,
      issues: validarLegal(r.colaborador, r.dias),
    }));

    return {
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
  };
}
