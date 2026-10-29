import { minToTime } from "./datas-horas.js";

// Product policy for shifts near eight effective hours (7h through 9h).
// All offsets are absolute minutes, including shifts crossing midnight.
export function faixaInicioIntervalo(d) {
  const proximaDeOito = d.horas >= 7 && d.horas <= 9;
  return {
    inicio: Math.max(d.entradaMin + (proximaDeOito ? 180 : 60), d.saidaMin - d.intervaloMin - 360),
    fim: Math.min(d.entradaMin + (proximaDeOito ? 300 : 240), d.saidaMin - d.intervaloMin - 60),
  };
}

/** Adjust only newly generated proposals; actual schedules and manual edits remain authoritative. */
export function ajustarIntervaloDaProposta(d) {
  if (!["T", "FE"].includes(d.status) || d.ajusteManual || d.horas < 7 || d.horas > 9 ||
      d.intervaloMin < 60 || d.intervaloMin > 120 || d.creditoIntervaloCCT || d.creditoNoturnoCCT) return;
  const {inicio, fim} = faixaInicioIntervalo(d);
  if (!Number.isFinite(d.intervaloInicioMin) || inicio > fim) return;
  const pausa = Math.max(inicio, Math.min(d.intervaloInicioMin, fim));
  if (pausa === d.intervaloInicioMin) return;
  d.intervaloInicioMin = pausa;
  d.intervaloFimMin = pausa + d.intervaloMin;
  d.intervaloAjustadoPolitica = true;
  d.jornadaAplicada = {entrada:minToTime(d.entradaMin), intInicio:minToTime(pausa), intFim:minToTime(d.intervaloFimMin), saida:minToTime(d.saidaMin)};
}
