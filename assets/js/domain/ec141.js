import { REGIMES } from "../config/regras-jornada.js";
import { dateFromKey, isoDate } from "./datas-horas.js";
export const VERSAO_REGRAS = "ec141-2026-10-22-5";
export const PUBLICACAO = "2026-10-16";
export const PRIMEIRA_FASE = "2026-12-16";
export const SEGUNDA_FASE = "2027-12-16";
export const PRAZO_PUBLICO = "2027-10-16";
export function dataValida(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || "")) return false;
  const d = dateFromKey(value);
  return (
    !Number.isNaN(d.getTime()) &&
    isoDate(d.getFullYear(), d.getMonth(), d.getDate()) === value
  );
}
export function chaveData(value) {
  return typeof value === "string"
    ? value
    : isoDate(value.getFullYear(), value.getMonth(), value.getDate());
}
export function regimeNaData(value) {
  const data = chaveData(value);
  const chave =
    data < PRIMEIRA_FASE
      ? "atual44"
      : data < SEGUNDA_FASE
        ? "transicao42"
        : "definitivo40";
  return { ...REGIMES[chave], chave };
}
export function excecaoArt8(c) {
  const e = c.ec141 || {};
  return (
    e.tipo === "art8" &&
    e.diplomaSuperior === true &&
    !e.empregadoPublico &&
    Number(e.tetoRgps) > 0 &&
    Number(e.remuneracao) >= 2.5 * Number(e.tetoRgps) &&
    !e.jornadaMantida
  );
}
export function referenciaDia(state, value, c = {}) {
  const data = chaveData(value);
  const r =
    state.modoRegime === "simulacao"
      ? {
          ...(REGIMES[state.regimeJornada] || REGIMES.atual44),
          chave: state.regimeJornada,
        }
      : regimeNaData(data);
  const e = state.analiseEnquadramentoAtiva === true ? c.ec141 || {} : {};
  let horas = r.horas;
  if (
    state.modoRegime !== "simulacao" &&
    e.tipo === "contrato_publico" &&
    e.contratoVigente &&
    e.maoDeObraDireta
  ) {
    const aditamento =
      dataValida(e.dataAditamento) && e.dataAditamento >= PUBLICACAO
        ? e.dataAditamento
        : PRAZO_PUBLICO;
    const marco = aditamento < PRAZO_PUBLICO ? aditamento : PRAZO_PUBLICO;
    if (data < marco) horas = 44;
  }
  return {
    ...r,
    horas,
    data,
    semLimiteJornada:
      state.analiseEnquadramentoAtiva === true &&
      data >= PUBLICACAO &&
      excecaoArt8(c),
  };
}
export function referenciaSemana(state, dias, c = {}) {
  const refs = dias.map((d) => referenciaDia(state, d.data, c));
  const limites = refs.filter((r) => !r.semLimiteJornada).map((r) => r.horas);
  const horas = limites.length ? Math.min(...limites) : Infinity;
  const folgas = refs.length ? Math.max(...refs.map((r) => r.folgas)) : 1;
  return {
    horas,
    folgas,
    mista:
      new Set(
        refs.map(
          (r) => `${r.semLimiteJornada ? "dispensado" : r.horas}/${r.folgas}`,
        ),
      ).size > 1,
    alvo: Math.min(Number(c.horasSemana), horas),
    refs,
  };
}
export function instrumentoValido(state, data, uso) {
  const i = state.instrumentoColetivo || {};
  return (
    state.instrumentoCompensacao === "act_cct" &&
    String(i.identificacao || "").trim().length > 0 &&
    dataValida(i.inicio) &&
    dataValida(i.fim) &&
    i.inicio <= data &&
    data <= i.fim &&
    (data < PRIMEIRA_FASE || i.compativelEC141 === true) &&
    i[uso] === true
  );
}
export function limiteDiario(state, data) {
  const i = state.instrumentoColetivo || {};
  const limite = Number(i.limiteDiario);
  return instrumentoValido(state, data, "compensacaoDiaria") &&
    limite >= 8 &&
    limite <= 24
    ? limite
    : 8;
}
export function unirDias(...listas) {
  return [...new Map(listas.flat().map((d) => [d.data, d])).values()].sort(
    (a, b) => a.data.localeCompare(b.data),
  );
}
