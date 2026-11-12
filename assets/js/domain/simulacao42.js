import { instrumentoValido, distribuicaoTransitoria42 } from "./ec141.js";
/* Regra anterior à liminar: somente ACT/CCT permitia selecionar 42h.
export function permiteSimular42(state, periodo) {
  const i = state.instrumentoColetivo || {};
  if (i.compativelEC141 !== true || !Number.isFinite(Number(i.limiteDiario)) || Number(i.limiteDiario) < 8.4) return false;
  if (state.modeloEscala === "fixa")
    return instrumentoValido(
      state,
      state.dataReferenciaFixa,
      "compensacaoDiaria",
    );
  if (!/^\d{4}-\d{2}$/.test(periodo || "")) return false;
  const [ano, mes] = periodo.split("-").map(Number);
  if (mes < 1 || mes > 12) return false;
  return [
    `${periodo}-01`,
    `${periodo}-${new Date(ano, mes, 0).getDate()}`,
  ].every((d) => instrumentoValido(state, d, "compensacaoDiaria"));
}
*/
export function permiteSimular42(state, periodo) {
  const alvo = { ...state, tipoEscala: "5x2", modoRegime: "simulacao", regimeJornada: "transicao42" };
  const i = state.instrumentoColetivo || {};
  const coletivo = data => i.compativelEC141 === true &&
    Number.isFinite(Number(i.limiteDiario)) && Number(i.limiteDiario) >= 8.4 &&
    instrumentoValido(state, data, "compensacaoDiaria");
  if (state.modeloEscala === "fixa")
    return distribuicaoTransitoria42(alvo, state.dataReferenciaFixa) || coletivo(state.dataReferenciaFixa);
  if (!/^\d{4}-\d{2}$/.test(periodo || "")) return false;
  const [ano, mes] = periodo.split("-").map(Number);
  if (mes < 1 || mes > 12) return false;
  const inicio = `${periodo}-01`;
  const fim = `${periodo}-${new Date(ano, mes, 0).getDate()}`;
  // Nos meses de fronteira, a opção é liberada; o limite diário continua
  // sendo apurado para cada data, sem estender a exceção ao mês inteiro.
  return distribuicaoTransitoria42(alvo, inicio) || distribuicaoTransitoria42(alvo, fim) ||
    (coletivo(inicio) && coletivo(fim));
}
