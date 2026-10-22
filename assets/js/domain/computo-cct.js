import { normalizarJornada } from "./datas-horas.js";
import { instrumentoValido } from "./ec141.js";

export function politicaPlantaoDeclarada(state) {
  const i = state.instrumentoColetivo || {};
  return (
    state.instrumentoCompensacao === "act_cct" &&
    i.regime12x36 === true &&
    (i.intervaloComputado === true || i.creditoNoturnoUmaHora === true)
  );
}
export function temTrabalhoNoturno(dia) {
  const partes =
    Number.isFinite(dia.intervaloInicioMin) &&
    Number.isFinite(dia.intervaloFimMin)
      ? [
          [dia.entradaMin, dia.intervaloInicioMin],
          [dia.intervaloFimMin, dia.saidaMin],
        ]
      : [[dia.entradaMin, dia.saidaMin]];
  return partes.some(([inicio, fim]) => {
    if (!Number.isFinite(inicio) || !Number.isFinite(fim) || fim <= inicio)
      return false;
    for (let base = Math.floor(inicio / 1440) * 1440; base <= fim; base += 1440)
      if (
        Math.min(fim, base + 300) > Math.max(inicio, base) ||
        Math.min(fim, base + 1440) > Math.max(inicio, base + 1320)
      )
        return true;
    return false;
  });
}
// Créditos de jornada não prolongam saída, intervalo ou presença operacional.
export function apurarComputoCCT(state, dia, declarado = false) {
  const i = state.instrumentoColetivo || {};
  const aplica =
    state.tipoEscala === "12x36" &&
    politicaPlantaoDeclarada(state) &&
    ["T", "FE"].includes(dia.status);
  const valido = (uso) =>
    aplica &&
    (declarado
      ? i[uso] === true
      : instrumentoValido(state, dia.data, uso) &&
        instrumentoValido(state, dia.data, "regime12x36"));
  const creditoIntervaloCCT = valido("intervaloComputado")
    ? Math.max(0, dia.intervaloMin || 0) / 60
    : 0;
  const creditoNoturnoCCT =
    valido("creditoNoturnoUmaHora") && temTrabalhoNoturno(dia) ? 1 : 0;
  return {
    creditoIntervaloCCT,
    creditoNoturnoCCT,
    horasComputadasCCT:
      (dia.horas || 0) + creditoIntervaloCCT + creditoNoturnoCCT,
  };
}
export function ciclo12x36(state, perfil) {
  if (
    perfil.tipo !== "ciclo" ||
    Object.keys(perfil.ciclo).length !== 2 ||
    perfil.ciclo[1]?.status !== "trabalho" ||
    perfil.ciclo[2]?.status !== "folga"
  )
    return false;
  const j = normalizarJornada(perfil.ciclo[1].jornada);
  if (!j) return false;
  if (j.saida - j.entrada === 720) return true;
  if (!politicaPlantaoDeclarada(state)) return false;
  const d = {
    status: "T",
    entradaMin: j.entrada,
    saidaMin: j.saida,
    intervaloInicioMin: j.intInicio,
    intervaloFimMin: j.intFim,
    intervaloMin: j.intervalo,
    horas: (j.saida - j.entrada - j.intervalo) / 60,
  };
  const total = apurarComputoCCT(
    { ...state, tipoEscala: "12x36" },
    d,
    true,
  ).horasComputadasCCT;
  return Math.abs(total - 12) < 0.001 && j.saida - j.entrada <= 720;
}

export function computoDaJornada(state, jornada, data, declarado = false) {
  const j = normalizarJornada(jornada);
  if (!j) return null;
  const dia = {
    data,
    status: "T",
    entradaMin: j.entrada,
    saidaMin: j.saida,
    intervaloInicioMin: j.intInicio,
    intervaloFimMin: j.intFim,
    intervaloMin: j.intervalo,
    horas: (j.saida - j.entrada - j.intervalo) / 60,
  };
  return { ...dia, ...apurarComputoCCT(state, dia, declarado) };
}
