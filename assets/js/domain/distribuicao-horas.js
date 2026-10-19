import { normalizarJornada } from "./datas-horas.js";

/** O horário por dia limita a capacidade individual. O turno único, inclusive
 * 08:00/12:00/00:00/00:00, também tem limite mesmo no horário padrão. */
export function limiteHorasDia(config, weekday) {
  if (config.tipoEscala === "12x36") return Infinity;
  const fonte =
    config.horarioPorDia && config.jornadaPorDia?.[weekday]
      ? config.jornadaPorDia[weekday]
      : config.jornada;
  if (!fonte && !config.horarioPorDia) return Infinity;
  const j = fonte ? normalizarJornada(fonte) : null;
  if (!j) return 0;
  if (!config.horarioPorDia && !j.turnoUnico) return Infinity;
  let duracao = j.saida - j.entrada;
  if (duracao < 0) duracao += 1440;
  return Math.max(0, duracao - Math.max(0, j.intervalo)) / 60;
}

/** Divide a carga somente entre dias originalmente previstos, inclusive feriados.
 * Satura os dias curtos e redistribui o restante sem exceder as demais janelas. */
export function distribuirCargaPrevista(colaborador, dias, config) {
  const previstos = dias.filter((d) => d.previsto);
  const horas = Math.max(0, Number(colaborador.horasSemana) || 0);
  const limites = previstos.map((d) => limiteHorasDia(config, d.weekday));
  if (limites.every((l) => l === Infinity))
    return new Map(previstos.map((d) => [d.data, horas / previstos.length]));
  const capacidades = limites.map((l) => Math.max(0, Math.round(l * 60)));
  const alocadas = previstos.map(() => 0);
  let restantes = Math.min(
    Math.round(horas * 60),
    capacidades.reduce((s, c) => s + c, 0),
  );
  let pendentes = previstos.map((_, i) => i);
  while (pendentes.length && restantes > 0) {
    const parcela = Math.floor(restantes / pendentes.length);
    const limitados = pendentes.filter((i) => capacidades[i] <= parcela);
    if (limitados.length) {
      for (const i of limitados) {
        alocadas[i] = capacidades[i];
        restantes -= capacidades[i];
      }
      pendentes = pendentes.filter((i) => !limitados.includes(i));
    } else {
      const sobra = restantes % pendentes.length;
      pendentes.forEach(
        (i, pos) => (alocadas[i] = parcela + (pos < sobra ? 1 : 0)),
      );
      restantes = 0;
    }
  }
  return new Map(previstos.map((d, i) => [d.data, alocadas[i] / 60]));
}

/** Preserva o abono da jornada original antes de liberar outra folga para
 * trabalho. Só o saldo contratual é distribuído entre os dias efetivos. */
export function distribuirCargaComAbonos(colaborador, dias, config) {
  if (
    !dias.some((d) => typeof d.previstoOriginal === "boolean") ||
    config.tipoEscala === "12x36"
  ) {
    return distribuirCargaPrevista(colaborador, dias, config);
  }
  const original = distribuirCargaPrevista(
    colaborador,
    dias.map((d) => ({
      ...d,
      previsto: d.previstoOriginal ?? d.previsto,
    })),
    config,
  );
  const dispensado = (d) => d.previsto && d.feriado && !d.feriado.trabalhado;
  const abonadas = dias
    .filter(dispensado)
    .reduce((s, d) => s + (original.get(d.data) ?? 0), 0);
  const carga = distribuirCargaPrevista(
    {
      ...colaborador,
      horasSemana: Math.max(0, Number(colaborador.horasSemana) - abonadas),
    },
    dias.map((d) => ({ ...d, previsto: d.previsto && !dispensado(d) })),
    config,
  );
  for (const d of dias.filter(dispensado))
    carga.set(d.data, original.get(d.data) ?? 0);
  return carga;
}
