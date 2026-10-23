import { normalizarFuncao, habilitadoPara, funcaoDoDia } from "./funcoes.js";
export { normalizarFuncao } from "./funcoes.js";
import { diasNoMes, isoDate, timeToMin } from "./datas-horas.js";
import { createFeriados } from "./feriados.js";

const DIA = 1440;
const minutoData = (key) => {
  const [ano, mes, dia] = key.split("-").map(Number);
  return Date.UTC(ano, mes - 1, dia) / 60000;
};
const chaveData = (minuto) =>
  new Date(minuto * 60000).toISOString().slice(0, 10);
const horarioValido = (v) => /^([01]\d|2[0-3]):[0-5]\d$/.test(v);

export function validarDemanda(demanda) {
  if (
    !demanda ||
    typeof demanda.funcao !== "string" ||
    !normalizarFuncao(demanda.funcao)
  )
    return "Informe a função necessária.";
  if (
    !horarioValido(demanda.inicio) ||
    !horarioValido(demanda.fim) ||
    demanda.inicio === demanda.fim
  )
    return "Informe horários válidos e diferentes para início e fim.";
  if (
    !Number.isInteger(demanda.minimo) ||
    demanda.minimo < 1 ||
    demanda.minimo > 999
  )
    return "O mínimo deve ser um número inteiro entre 1 e 999.";
  if (
    !Array.isArray(demanda.diasSemana) ||
    !demanda.diasSemana.length ||
    demanda.diasSemana.some((d) => !Number.isInteger(d) || d < 0 || d > 6)
  )
    return "Selecione ao menos um dia da semana válido.";
  return null;
}

// A pausa mantém a distância relativa à entrada configurada, inclusive no Turno B.
// Se a jornada individual for menor, a pausa é antecipada para caber no plantão.
export function calcularPausaEfetiva(dia, jornada) {
  const pausa = Number(dia.intervaloMin);
  if (!Number.isFinite(pausa) || pausa <= 0) return null;
  const distancia =
    (((timeToMin(jornada.intInicio) - timeToMin(jornada.entrada)) % DIA) +
      DIA) %
    DIA;
  if (!Number.isFinite(distancia)) return null;
  const inicio = Math.max(
    dia.entradaMin,
    Math.min(dia.entradaMin + distancia, dia.saidaMin - pausa),
  );
  return { inicio, fim: inicio + pausa };
}

function segmentosTrabalho(dia, jornada) {
  if (!["T", "FE"].includes(dia.status) || !(dia.horas > 0)) return [];
  const { entradaMin: entrada, saidaMin: saida, intervaloMin: pausa } = dia;
  if (
    ![entrada, saida, pausa].every(Number.isFinite) ||
    entrada < 0 ||
    entrada >= DIA ||
    saida <= entrada ||
    saida - entrada > 2 * DIA ||
    pausa < 0 ||
    pausa >= saida - entrada
  )
    return null;
  const explicito =
    Number.isFinite(dia.intervaloInicioMin) &&
    Number.isFinite(dia.intervaloFimMin);
  const intervalo =
    pausa > 0
      ? explicito
        ? { inicio: dia.intervaloInicioMin, fim: dia.intervaloFimMin }
        : calcularPausaEfetiva(dia, jornada)
      : null;
  if (
    intervalo &&
    (intervalo.inicio < entrada ||
      intervalo.fim > saida ||
      Math.abs(intervalo.fim - intervalo.inicio - pausa) > 0.01)
  )
    return null;
  if (pausa > 0 && !intervalo) return null;
  const partes = intervalo
    ? [
        [entrada, intervalo.inicio],
        [intervalo.fim, saida],
      ]
    : [[entrada, saida]];
  return partes
    .map(([a, b]) => [Math.round(a), Math.round(b)])
    .filter(([a, b]) => b > a);
}

/** Demandas recorrentes são explícitas: dias selecionados valem mesmo se a operação
 * estiver configurada como fechada. Sobreposições da mesma função usam o maior
 * mínimo, e não somam a mesma necessidade duas vezes. Intervalos são [início, fim). */
export function analisarCobertura(config, resultado) {
  const { feriadoDaData } = createFeriados(config);
  const demandas = config.demandasCobertura ?? [];
  const relatorio = {
    configurada: demandas.length > 0,
    periodos: [],
    lacunas: [],
    avisos: [],
  };
  if (config.coberturaAtiva === false)
    return { ...relatorio, configurada: false };
  if (!demandas.length) return relatorio;
  const inicio = minutoData(isoDate(config.ano, config.mes, config.diaInicio));
  const fim =
    minutoData(
      isoDate(config.ano, config.mes, diasNoMes(config.mes, config.ano)),
    ) + DIA;
  const grupos = new Map();
  const grupo = (nome) => {
    const key = normalizarFuncao(nome);
    if (!grupos.has(key))
      grupos.set(key, { funcao: nome.trim(), demandas: [], trabalho: [] });
    return grupos.get(key);
  };
  for (const demanda of demandas) {
    const erro = validarDemanda(demanda);
    if (erro) {
      relatorio.avisos.push(`Demanda inválida: ${erro}`);
      continue;
    }
    const g = grupo(demanda.funcao);
    for (let data = inicio - DIA; data < fim; data += DIA) {
      const date = new Date(data * 60000);
      const feriado = feriadoDaData(chaveData(data));
      if (
        !demanda.diasSemana.includes(date.getUTCDay()) ||
        (feriado && !demanda.incluirFeriados)
      )
        continue;
      const a = data + timeToMin(demanda.inicio);
      const b =
        data +
        timeToMin(demanda.fim) +
        (timeToMin(demanda.fim) < timeToMin(demanda.inicio) ? DIA : 0);
      if (b > inicio && a < fim)
        g.demandas.push({
          inicio: Math.max(a, inicio),
          fim: Math.min(b, fim),
          minimo: demanda.minimo,
        });
    }
  }
  resultado.forEach((r, indice) => {
    // O dia anterior é necessário para o plantão que atravessa a meia-noite.
    const dias = new Map(
      [...(r.diasContexto ?? []), ...r.dias].map((d) => [d.data, d]),
    );
    for (const d of dias.values()) {
      if (
        ["T", "FE"].includes(d.status) &&
        !habilitadoPara(r.colaborador, funcaoDoDia(r.colaborador, d))
      ) {
        relatorio.avisos.push(
          `${r.colaborador.nome || "(sem nome)"} · ${d.data}: função alocada sem habilitação cadastrada; não contabilizado na cobertura.`,
        );
        continue;
      }
      const g = grupos.get(normalizarFuncao(funcaoDoDia(r.colaborador, d)));
      if (!g) continue;
      const base = minutoData(d.data);
      if (base + 2 * DIA <= inicio || base >= fim) continue;
      const jornada =
        config.tipoEscala !== "12x36" &&
        config.horarioPorDia &&
        config.jornadaPorDia?.[d.weekday]
          ? config.jornadaPorDia[d.weekday]
          : config.jornada;
      const partes = segmentosTrabalho(d, d.jornadaAplicada || jornada);
      if (partes === null) {
        relatorio.avisos.push(
          `${r.colaborador.nome || "(sem nome)"} · ${d.data}: horário incompleto ou inválido; não contabilizado na cobertura.`,
        );
        continue;
      }
      for (const [a, b] of partes)
        g.trabalho.push({
          inicio: base + a,
          fim: base + b,
          pessoa: r.colaborador.id ?? `linha-${indice}`,
        });
    }
  });
  for (const g of grupos.values()) {
    const pontos = new Set([inicio, fim]);
    for (let d = inicio + DIA; d < fim; d += DIA) pontos.add(d);
    for (const faixa of [...g.demandas, ...g.trabalho]) {
      if (faixa.inicio > inicio && faixa.inicio < fim) pontos.add(faixa.inicio);
      if (faixa.fim > inicio && faixa.fim < fim) pontos.add(faixa.fim);
    }
    const ordenados = [...pontos].sort((a, b) => a - b);
    for (let i = 0; i < ordenados.length - 1; i++) {
      const a = ordenados[i],
        b = ordenados[i + 1];
      const necessarios = Math.max(
        0,
        ...g.demandas
          .filter((f) => f.inicio <= a && f.fim >= b)
          .map((f) => f.minimo),
      );
      if (!necessarios) continue;
      const presentes = new Set(
        g.trabalho
          .filter((f) => f.inicio <= a && f.fim >= b)
          .map((f) => f.pessoa),
      ).size;
      const data = chaveData(a),
        base = minutoData(data);
      const atual = {
        data,
        funcao: g.funcao,
        inicioMin: a - base,
        fimMin: b - base,
        necessarios,
        presentes,
        faltantes: Math.max(0, necessarios - presentes),
      };
      const anterior = relatorio.periodos.at(-1);
      if (
        anterior &&
        anterior.data === data &&
        anterior.funcao === atual.funcao &&
        anterior.fimMin === atual.inicioMin &&
        anterior.necessarios === necessarios &&
        anterior.presentes === presentes
      )
        anterior.fimMin = atual.fimMin;
      else relatorio.periodos.push(atual);
    }
  }
  relatorio.periodos.sort(
    (a, b) =>
      a.data.localeCompare(b.data) ||
      a.inicioMin - b.inicioMin ||
      a.funcao.localeCompare(b.funcao),
  );
  relatorio.lacunas = relatorio.periodos.filter((f) => f.faltantes > 0);
  return relatorio;
}
