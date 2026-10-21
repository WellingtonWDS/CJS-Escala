export function diasNoMes(mes, ano) {
  return new Date(ano, mes + 1, 0).getDate();
}

export function isoDate(ano, mes, dia) {
  return `${ano}-${String(mes + 1).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
}

export function dateFromKey(key) {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function fmtHoras(h) {
  const total = Math.round(Number(h || 0) * 60);
  const sign = total < 0 ? "-" : "";
  const abs = Math.abs(total);
  return `${sign}${String(Math.floor(abs / 60)).padStart(2, "0")}:${String(abs % 60).padStart(2, "0")}`;
}

export function minToTime(totalMin) {
  let m = Math.round(totalMin);
  while (m < 0) m += 1440;
  m = m % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

export function timeToMin(value) {
  if (typeof value !== "string" || !/^([01]\d|2[0-3]):[0-5]\d$/.test(value))
    return NaN;
  const [h, m] = value.split(":").map(Number);
  return h * 60 + m;
}

export function normalizarJornada(j) {
  if (!j) return null;
  const entrada = timeToMin(j.entrada),
    inicio = timeToMin(j.intInicio),
    fim = timeToMin(j.intFim),
    saidaRelogio = timeToMin(j.saida);
  if (![entrada, inicio, fim, saidaRelogio].every(Number.isFinite)) return null;
  const depois = (valor, anterior) => {
    while (valor < anterior) valor += 1440;
    return valor;
  };
  const legado = fim === 0 && saidaRelogio === 0 && inicio !== entrada;
  if ((inicio === fim && fim === saidaRelogio) || legado) {
    const saida = depois(legado ? inicio : saidaRelogio, entrada);
    return {
      entrada,
      intInicio: saida,
      intFim: saida,
      saida,
      intervalo: 0,
      turnoUnico: true,
      ...(legado ? { legado: true } : {}),
    };
  }
  const intInicio = depois(inicio, entrada);
  const intFim = depois(fim, intInicio);
  const saida = depois(saidaRelogio, intFim);
  if (saida - entrada > 1440) return null;
  return {
    entrada,
    intInicio,
    intFim,
    saida,
    intervalo: intFim - intInicio,
    turnoUnico: false,
  };
}

export function horarioComDia(totalMin) {
  const dias = Math.floor(totalMin / 1440);
  return minToTime(totalMin) + (dias > 0 ? ` (+${dias}d)` : "");
}

export function intervaloMin(j) {
  const jornada = normalizarJornada(j);
  return jornada ? jornada.intervalo : NaN;
}

export function jornadaValidaEstrutural(j) {
  const jornada = normalizarJornada(j);
  if (!jornada) return false;

  if (jornada.turnoUnico) {
    return (
      jornada.entrada < jornada.saida &&
      jornada.intInicio === jornada.saida &&
      jornada.intFim === jornada.saida
    );
  }

  return (
    jornada.entrada < jornada.intInicio &&
    jornada.intInicio < jornada.intFim &&
    jornada.intFim < jornada.saida
  );
}

export function getMonday(date) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

export function weekKey(date) {
  return getMonday(date).getTime();
}

export function addDays(date, n) {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

export function formatDateBR(date) {
  return `${String(date.getDate()).padStart(2, "0")}/${String(date.getMonth() + 1).padStart(2, "0")}/${date.getFullYear()}`;
}

export function parseHorasTrabalhadas(value) {
  const text = value.trim();
  const match = /^(\d{1,2}):([0-5]\d)$/.exec(text);
  const hours = match
    ? Number(match[1]) + Number(match[2]) / 60
    : /^\d+(?:[.,]\d+)?$/.test(text)
      ? Number(text.replace(",", "."))
      : NaN;
  return Number.isFinite(hours) && hours >= 0 && hours <= 24 ? hours : null;
}
