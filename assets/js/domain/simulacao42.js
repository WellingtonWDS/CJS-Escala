import { instrumentoValido } from "./ec141.js";
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
