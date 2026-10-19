import {
  minToTime,
  timeToMin,
  normalizarJornada,
  intervaloMin,
} from "./datas-horas.js";
import { REGIMES } from "../config/regras-jornada.js";
export function createJornada(state) {
  function obterTurno(date, indice) {
    if (!state.turnosRevezamento || state.tipoEscala === "12x36") return "A";
    const segunda = new Date(
      date.getFullYear(),
      date.getMonth(),
      date.getDate(),
    );
    segunda.setDate(segunda.getDate() - ((segunda.getDay() + 6) % 7));
    const semana = Math.floor(
      (Date.UTC(segunda.getFullYear(), segunda.getMonth(), segunda.getDate()) -
        Date.UTC(2026, 0, 5)) /
        604800000,
    );
    return (((semana + indice) % 2) + 2) % 2 === 0 ? "A" : "B";
  }

  function calcHorasDia(weekday) {
    let j = state.jornada;
    if (
      state.horarioPorDia &&
      weekday != null &&
      state.jornadaPorDia[weekday]
    ) {
      j = state.jornadaPorDia[weekday];
    }
    const jornada = normalizarJornada(j);
    if (!jornada) return 0;

    let bruto = jornada.saida - jornada.entrada;
    if (bruto < 0) bruto += 1440;
    return Math.max(0, bruto - Math.max(0, jornada.intervalo)) / 60;
  }

  function obterJornadaDoDia(weekday) {
    return state.tipoEscala !== "12x36" &&
      state.horarioPorDia &&
      state.jornadaPorDia[weekday]
      ? state.jornadaPorDia[weekday]
      : state.jornada;
  }

  function regimeAtual() {
    return REGIMES[state.regimeJornada] || REGIMES.atual44;
  }

  function limiteSemanal() {
    return regimeAtual().horas;
  }

  function folgasMinimas() {
    if (state.tipoEscala === "12x36") return null;
    return regimeAtual().folgas;
  }

  function totalHorasSemanaConfigurada() {
    if (state.tipoEscala === "12x36") return null;
    if (state.tipoEscala === "custom") {
      return state.diasTrabalho.reduce((sum, d) => sum + calcHorasDia(d), 0);
    }
    return state.diasTrabalho.reduce((sum, d) => sum + calcHorasDia(d), 0);
  }

  function calcularSaidaSimulada(horasSemana, diasSemana) {
    const horasDia = horasSemana / diasSemana;
    const entrada = timeToMin(state.jornada.entrada);
    const intervalo = Math.max(0, intervaloMin(state.jornada) || 0);
    return {
      horasDia,
      saida: minToTime(entrada + horasDia * 60 + intervalo),
    };
  }

  return {
    obterTurno,
    calcHorasDia,
    obterJornadaDoDia,
    regimeAtual,
    limiteSemanal,
    folgasMinimas,
    totalHorasSemanaConfigurada,
    calcularSaidaSimulada,
  };
}
