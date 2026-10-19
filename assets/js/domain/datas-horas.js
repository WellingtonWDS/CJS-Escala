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
  if (!value || !/^\d{2}:\d{2}$/.test(value)) return NaN;
  const [h, m] = value.split(":").map(Number);
  return h * 60 + m;
}

export function normalizarJornada(j) {
  const entrada = timeToMin(j.entrada);
  const intInicio = timeToMin(j.intInicio);
  const intFim = timeToMin(j.intFim);
  const saida = timeToMin(j.saida);

  if ([entrada, intInicio, intFim, saida].some((x) => !Number.isFinite(x)))
    return null;

  /* Turno único: int. início = int. fim = saída. */
  if (intInicio === intFim && intFim === saida) {
    return {
      entrada,
      intInicio,
      intFim,
      saida,
      intervalo: 0,
      turnoUnico: true,
    };
  }

  /* Compatibilidade com o preenchimento legado 08:00/12:00/00:00/00:00. */
  if (intFim === 0 && saida === 0 && intInicio > entrada) {
    return {
      entrada,
      intInicio,
      intFim: intInicio,
      saida: intInicio,
      intervalo: 0,
      turnoUnico: true,
      legado: true,
    };
  }

  return {
    entrada,
    intInicio,
    intFim,
    saida,
    intervalo: intFim - intInicio,
    turnoUnico: false,
  };
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
