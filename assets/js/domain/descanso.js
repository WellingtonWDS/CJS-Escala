/* Regras de descanso da Portaria MTE nº 2.041/2026 e do Decreto nº 13.173/2026.
 * Centralizadas para que validação, geração e busca de ajustes usem o mesmo critério. */
import { dateFromKey, isoDate } from "./datas-horas.js";

export const PORTARIA = "Portaria MTE nº 2.041/2026";
export const DECRETO = "Decreto nº 13.173/2026";
const DIA = 1440;
export const INTERJORNADA_MIN = 660;

/** Dias que contam como repouso de 24h (folga, folga compensada, feriado não trabalhado). */
export const repousoDoDia = (d) => !!d && ["F", "FC"].includes(d.status);
const trabalha = (d) => !!d && ["T", "FE"].includes(d.status);

/** Descanso mínimo entre duas jornadas: 11h (art. 66 da CLT) somadas às 24h de cada
 * repouso intercalado (art. 4º, § 2º, da Portaria 2.041). No 12×36 vale o ciclo de 36h. */
export function descansoMinimo(config, repousos) {
  if (config?.tipoEscala === "12x36") return 2160;
  return INTERJORNADA_MIN + DIA * Math.max(0, repousos || 0);
}
export function descricaoDescanso(config, repousos) {
  if (config?.tipoEscala === "12x36") return "36h do ciclo 12×36";
  return repousos > 0
    ? `${descansoMinimo(config, repousos) / 60}h (${repousos} repouso${repousos > 1 ? "s" : ""} de 24h + 11h entre jornadas; ${PORTARIA}, art. 4º, § 2º)`
    : "11h do art. 66 da CLT";
}

/** Minutos de descanso entre a saída de `a` e a entrada de `b` (datas ISO distintas). */
export function descansoEntre(a, b) {
  const dist = Math.round((dateFromKey(b.data) - dateFromKey(a.data)) / 86400000);
  return dist * DIA + b.entradaMin - a.saidaMin;
}

/** Confere o descanso entre trabalhos consecutivos de uma sequência ordenada por data.
 * `seq` deve conter os dias intercalados (folgas) para contar os repousos. */
export function conferirDescansos(config, seq) {
  const out = [];
  let anterior = null, repousos = 0;
  for (const d of seq) {
    if (trabalha(d) && Number.isFinite(d.entradaMin) && Number.isFinite(d.saidaMin)) {
      if (anterior) {
        const minimo = descansoMinimo(config, repousos);
        const real = descansoEntre(anterior, d);
        if (real < minimo) out.push({ anterior, dia: d, real, minimo, repousos });
      }
      anterior = d;
      repousos = 0;
    } else if (repousoDoDia(d)) repousos++;
  }
  return out;
}

/** Regras de coincidência do repouso com o domingo aplicáveis ao colaborador. */
export function regrasDomingo(config, colab = {}) {
  const regras = [];
  if (config?.atividadeComercio)
    regras.push({
      tipo: "DOMINGO_COMERCIO", semanas: 3, severidade: "erro",
      fundamento: `Lei nº 10.101/2000, art. 6º, parágrafo único, e ${PORTARIA}, art. 5º, § 4º`,
      texto: "no comércio, o repouso deve coincidir com o domingo ao menos uma vez a cada 3 semanas",
    });
  if (colab.sexo === "feminino")
    regras.push({
      tipo: "DOMINGO_MULHER", semanas: 2, severidade: "alerta",
      fundamento: `art. 386 da CLT e ${PORTARIA}, art. 5º, § 3º`,
      texto: "para empregadas, o revezamento quinzenal deve favorecer o repouso dominical",
    });
  regras.push({
    tipo: "DOMINGO_PREFERENCIAL", semanas: 4, severidade: "alerta",
    fundamento: `${PORTARIA}, art. 5º, § 5º`,
    texto: "o repouso deve coincidir, preferencialmente, com o domingo ao menos uma vez a cada 4 semanas",
  });
  return regras;
}

/** Menor intervalo de semanas exigido para um domingo de repouso (para a geração). */
export function periodoDomingo(config, colab = {}) {
  return Math.min(...regrasDomingo(config, colab).map((r) => r.semanas));
}

/** Sequências de domingos trabalhados que ultrapassam cada regra. Ausências programadas
 * (férias/afastamento) e dias sem contrato interrompem a contagem. */
export function sequenciasDomingo(config, colab, dias) {
  const domingos = dias.filter((d) => d.weekday === 0).sort((a, b) => a.data.localeCompare(b.data));
  const out = [];
  for (const regra of regrasDomingo(config, colab)) {
    let seguidos = 0, anterior = null;
    for (const d of domingos) {
      // Um domingo ausente da lista (semana sem dados) também interrompe a contagem.
      if (anterior && Math.round((dateFromKey(d.data) - dateFromKey(anterior.data)) / 86400000) !== 7) seguidos = 0;
      anterior = d;
      if (trabalha(d)) {
        seguidos++;
        if (seguidos === regra.semanas) out.push({ regra, dia: d });
      } else seguidos = 0;
    }
  }
  return out;
}

/** Semana em que o colaborador deve ter o domingo como repouso na geração dinâmica.
 * Alterna os colaboradores para que os domingos de repouso não coincidam todos. */
export function domingoDevido(config, colab, segunda, idx) {
  const n = periodoDomingo(config, colab);
  const serial = Math.floor(Date.UTC(segunda.getFullYear(), segunda.getMonth(), segunda.getDate()) / 86400000 / 7);
  return ((serial + idx) % n + n) % n === 0;
}

/** Turnos ininterruptos de revezamento: alterna turnos e cobre períodos diurno e noturno. */
export function turnosIninterruptos(dias) {
  const trab = dias.filter((d) => trabalha(d) && Number.isFinite(d.entradaMin) && Number.isFinite(d.saidaMin));
  const turnos = new Set(trab.map((d) => d.turno || "A"));
  if (turnos.size < 2) return false;
  const noturno = (d) => {
    for (let m = d.entradaMin; m < d.saidaMin; m += 15) {
      const h = ((m % DIA) + DIA) % DIA;
      if (h >= 1320 || h < 300) return true;
    }
    return false;
  };
  const diurno = (d) => {
    for (let m = d.entradaMin; m < d.saidaMin; m += 15) {
      const h = ((m % DIA) + DIA) % DIA;
      if (h >= 300 && h < 1320) return true;
    }
    return false;
  };
  return trab.some(noturno) && trab.some(diurno);
}

/** Dias do mês-calendário de uma data, para apurar médias mensais. */
export function diasDoMes(dias, ano, mes) {
  const n = new Date(ano, mes + 1, 0).getDate();
  const inicio = isoDate(ano, mes, 1), fim = isoDate(ano, mes, n);
  return { n, inicio, fim, dias: dias.filter((d) => d.data >= inicio && d.data <= fim) };
}

